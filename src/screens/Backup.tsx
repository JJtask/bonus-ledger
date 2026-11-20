import { useRef, useState } from 'react';
import { describeProject, updateSettings } from '../engine/actions';
import { BONUS_SCHEDULE_LABEL, TERM_OPTIONS, periodOptions, projectSummary, wan } from '../engine/engine';
import type { BonusSchedule, EffRule, Ledger, Project, Tier } from '../engine/types';
import { makeBackupFile, shareOrDownload } from '../lib/backup';
import { BackupError, cryptoReady, decryptBackup, hashPin, verifyPin } from '../lib/crypto';
import { toLedger, useStore } from '../lib/store';
import { ConfirmInline, Header, Icon, MoneyInput, NumInput, Seg, Sheet, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';
import { TopActions } from '../ui/TopActions';

const fmtTime = (iso?: string) => {
  if (!iso) return '從未備份';
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const Backup = () => {
  const { ledger, meta, setMeta, replaceLedger, wipeAll, commit } = useStore();
  const nav = useNav();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rpw, setRpw] = useState('');
  const [restored, setRestored] = useState<Ledger | null>(null);
  const [rerr, setRerr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const first = !meta.lastBackupAt;
  const pwOk = pw.length >= 6 && (!first || pw === pw2) && !/^\d{4}$/.test(pw);

  const doBackup = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const f = await makeBackupFile(ledger, pw);
      const r = await shareOrDownload(f);
      if (r === 'cancelled') setMsg('已取消分享，這次沒有備份。');
      else {
        setMeta({ dirty: 0, lastBackupAt: new Date().toISOString() });
        commit({ ...ledger, audit: [...ledger.audit, { at: new Date().toISOString(), action: '加密備份', detail: `${f.name}（${r === 'shared' ? '已分享' : '已下載'}）` }] });
        setMeta({ dirty: 0 });
        setPw(''); setPw2('');
        toast(r === 'shared' ? '備份完成' : '備份檔已下載');
      }
    } catch {
      setMsg('備份失敗。請確認是用 https 網址開啟這個 App。');
    }
    setBusy(false);
  };

  const doDecrypt = async () => {
    if (!file) return;
    setBusy(true);
    setRerr(null);
    try {
      const data = (await decryptBackup(await file.text(), rpw)) as { ledger?: unknown };
      const l = toLedger(data?.ledger);
      if (!l) throw new BackupError('format');
      setRestored(l);
    } catch (e) {
      setRerr(e instanceof BackupError && e.reason === 'password' ? '密碼錯誤，或檔案內容被改過，無法還原。' : '這不是本系統的備份檔。');
    }
    setBusy(false);
  };

  return (
    <>
      <div className="hdr"><div className="hdr-bar"><h1 className="hdr-title">資安備份</h1><TopActions /></div></div>
      <div className="page">
        <div className="hero" style={{ paddingBottom: 52 }}>
          <p className="hero-label">上次備份</p>
          <div className="hero-amt"><span className="num" style={{ fontSize: 26 }}>{fmtTime(meta.lastBackupAt)}</span></div>
          <p className="hero-note">{meta.dirty > 0 ? `之後有 ${meta.dirty} 筆異動還沒備份` : '目前資料都已備份'}</p>
        </div>

        <section className="card raised lift pad stack-14" aria-labelledby="bk-h">
          <h2 id="bk-h" className="section-title">加密備份到雲端硬碟</h2>
          {!cryptoReady() && <div className="inset-danger small">這個網址不是 https，無法加密。請用 App 的正式網址開啟。</div>}
          <div>
            <label className="label" htmlFor="pw">備份密碼（至少 6 碼，不要跟 PIN 碼一樣）</label>
            <input id="pw" className="fld" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            {first && (
              <>
                <label className="label" htmlFor="pw2" style={{ marginTop: 10 }}>再輸入一次</label>
                <input id="pw2" className="fld" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} aria-invalid={pw2 && pw !== pw2 ? true : undefined} />
                {pw2 && pw !== pw2 && <p className="err">兩次輸入的密碼不一樣。</p>}
              </>
            )}
            <p className="hint">忘記這組密碼就無法還原，請抄寫下來放在安全的地方。</p>
          </div>
          <button type="button" className="btn btn-pri btn-block" disabled={!pwOk || busy || !cryptoReady()} onClick={doBackup}>
            <Icon n="share" size={20} />{busy ? '加密中…' : '加密備份並分享'}
          </button>
          <p className="xs muted" style={{ lineHeight: 1.6 }}>按下後手機會跳出分享選單，選「雲端硬碟」（Google Drive）就存好了。電腦上會直接下載檔案。</p>
          {msg && <p className="err">{msg}</p>}
        </section>

        <section className="section card pad stack-14" aria-labelledby="rs-h">
          <h2 id="rs-h" className="section-title">從備份檔還原</h2>
          <p className="small muted">換手機、或資料被清掉時使用。選擇雲端硬碟裡的備份檔，輸入當時的備份密碼。</p>
          <input ref={fileRef} type="file" accept=".txt,text/plain,application/json" style={{ display: 'none' }} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRestored(null); setRerr(null); }} />
          <button type="button" className="btn btn-out btn-block" onClick={() => fileRef.current?.click()}>
            <Icon n="upload" size={20} />{file ? file.name : '選擇備份檔'}
          </button>
          {file && !restored && (
            <>
              <div><label className="label" htmlFor="rpw">備份密碼</label><input id="rpw" className="fld" type="password" value={rpw} onChange={(e) => setRpw(e.target.value)} /></div>
              <button type="button" className="btn btn-pri btn-block" disabled={!rpw || busy} onClick={doDecrypt}>{busy ? '解密中…' : '解密並檢查'}</button>
            </>
          )}
          {rerr && <p className="err">{rerr}</p>}
          {restored && (
            <div className="reveal stack-12">
              <div className="inset small stack-8">
                <b>檔案驗證通過</b>
                <span>{restored.contracts.length} 張合約、{restored.sales.length} 位業務、{Object.keys(restored.payments).length} 筆核銷、{restored.audit.length} 筆稽核紀錄</span>
              </div>
              <ConfirmInline block danger label="用這份備份取代手機上的資料" confirmLabel="確定還原" onConfirm={() => {
                replaceLedger({ ...restored, audit: [...restored.audit, { at: new Date().toISOString(), action: '從備份還原', detail: file?.name ?? '' }] }, 0);
                setMeta({ lastBackupAt: new Date().toISOString() });
                setFile(null); setRpw(''); setRestored(null);
                toast('還原完成');
                nav.go('board');
              }}>
                <p className="small">手機上目前的資料會被這份備份完全取代。</p>
              </ConfirmInline>
            </div>
          )}
        </section>

        <section className="section">
          <ul className="list">
            <li><button type="button" className="item" style={{ alignItems: 'center' }} onClick={() => nav.push({ name: 'settings' })}><Icon n="gear" /><span className="grow strong">專案與系統設定</span><span className="xs muted">專案、贖回比例、PIN 碼</span><Icon n="chev" size={18} /></button></li>
            <li><button type="button" className="item" style={{ alignItems: 'center' }} onClick={() => nav.push({ name: 'audit' })}><Icon n="list" /><span className="grow strong">稽核紀錄</span><span className="xs muted">{ledger.audit.length} 筆，唯讀</span><Icon n="chev" size={18} /></button></li>
          </ul>
        </section>

        <section className="section">
          <ConfirmInline block danger label="清除手機上的全部資料" confirmLabel="確定全部清除" onConfirm={() => { wipeAll(); }}>
            <p className="small">帳本、PIN 碼和設定都會刪除，無法復原。清除前請確認已經備份。{meta.dirty > 0 ? `目前還有 ${meta.dirty} 筆異動沒備份！` : ''}</p>
          </ConfirmInline>
        </section>
        <p className="foot-note">分紅獎金帳本 v1.0・資料只存在這支手機</p>
      </div>
    </>
  );
};

/* ---------- 系統設定 ---------- */
export const SettingsPage = () => {
  const { ledger, commit, meta, setMeta } = useStore();
  const nav = useNav();
  const toast = useToast();
  const [edit, setEdit] = useState<Project | 'new' | null>(null);
  const [refund, setRefund] = useState(ledger.settings.refundPct);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const used = (id: string) => ledger.contracts.filter((c) => c.terms.projectId === id).length;
  const cats = [...new Set(ledger.settings.projects.map((p) => p.category))];
  const ordered = [...ledger.settings.projects].sort((x, y) => Number(!!x.archived) - Number(!!y.archived) || cats.indexOf(x.category) - cats.indexOf(y.category));

  return (
    <>
      <Header title="專案與系統設定" onBack={nav.back} />
      <div className="page">
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">專案</h2>
            <span className="xs muted">點專案即可修改條件</span>
          </div>
          <ul className="list">
            {ordered.map((p) => (
              <li key={p.id}>
                <button type="button" className="item" onClick={() => setEdit(p)} style={{ alignItems: 'center', opacity: p.archived ? 0.6 : 1 }}>
                  <div className="grow">
                    <div className="item-title"><span className="name">{p.name}</span><span className="tag tag-proj">{p.category}</span>{p.archived && <span className="tag tag-gray">已停用</span>}</div>
                    <div className="item-sub">{projectSummary(p)}</div>
                    <div className="item-sub">業務獎金 {p.tiers.length === 1 ? `${p.tiers[0].pct}%` : p.tiers.map((t) => `${wan(t.min)}↑${t.pct}%`).join('、')}・{BONUS_SCHEDULE_LABEL[p.bonusSchedule]}</div>
                  </div>
                  <span className="xs muted">{used(p.id)} 張</span>
                  <Icon n="chev" size={18} />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-out btn-block" style={{ marginTop: 12 }} onClick={() => setEdit('new')}><Icon n="plus" size={18} />新增專案</button>
        </section>

        <section className="section card pad stack-12">
          <h2 className="section-title">提前贖回</h2>
          <div className="row-flex">
            <label className="grow small" htmlFor="rp">退回本金比例（全部專案）</label>
            <NumInput id="rp" value={refund} onChange={(v) => setRefund(Math.min(100, v))} />
            <span className="small">%</span>
          </div>
          <button type="button" className="btn btn-pri btn-block" disabled={refund === ledger.settings.refundPct || refund <= 0} onClick={() => {
            commit(updateSettings(ledger, { ...ledger.settings, refundPct: refund }, `提前贖回退本比例 ${ledger.settings.refundPct}% → ${refund}%`));
            toast('已儲存');
          }}>儲存</button>
        </section>

        <section className="section card pad stack-12">
          <h2 className="section-title">更改 PIN 碼</h2>
          <div className="grid-2">
            <div><label className="label" htmlFor="op">目前 PIN</label><input id="op" className="fld" type="password" inputMode="numeric" maxLength={4} value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ''))} /></div>
            <div><label className="label" htmlFor="np">新 PIN（4 碼）</label><input id="np" className="fld" type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} /></div>
          </div>
          <button type="button" className="btn btn-out btn-block" disabled={oldPin.length !== 4 || newPin.length !== 4} onClick={async () => {
            if (!meta.pin || !(await verifyPin(oldPin, meta.pin))) { setPinMsg('目前 PIN 碼不正確。'); return; }
            setMeta({ pin: await hashPin(newPin) });
            setOldPin(''); setNewPin(''); setPinMsg(null);
            toast('PIN 碼已更新');
          }}>更新 PIN 碼</button>
          {pinMsg && <p className="err">{pinMsg}</p>}
        </section>
      </div>
      {edit && <ProjectSheet project={edit === 'new' ? null : edit} cats={cats} usedCount={edit === 'new' ? 0 : used(edit.id)} onClose={() => setEdit(null)} />}
    </>
  );
};

const blankProject = (cat: string): Project => ({
  id: 'pj-' + Date.now().toString(36), name: '', category: cat, effRule: 'nextMonth1', termMonths: 12, periodMonths: 3, pct: 2,
  tiers: [{ min: 0, pct: 2 }], bonusSchedule: 'split'
});

const ProjectSheet = ({ project, cats, usedCount, onClose }: { project: Project | null; cats: string[]; usedCount: number; onClose: () => void }) => {
  const { ledger, commit } = useStore();
  const toast = useToast();
  const [p, setP] = useState<Project>(() => (project ? JSON.parse(JSON.stringify(project)) : blankProject(cats[0] ?? '新事業')));
  const [otherCat, setOtherCat] = useState(cats.includes(p.category) ? '' : p.category);
  const set = (patch: Partial<Project>) => setP((x) => ({ ...x, ...patch }));
  const setTier = (i: number, patch: Partial<Tier>) => set({ tiers: p.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const category = (otherCat.trim() || p.category).trim();
  const dupName = ledger.settings.projects.some((x) => x.id !== p.id && x.name === p.name.trim());
  const ok = p.name.trim() && !dupName && category && p.pct > 0 && periodOptions(p.termMonths).includes(p.periodMonths) && p.tiers.length > 0;
  const save = (next: Project, msg: string) => {
    const exists = ledger.settings.projects.some((x) => x.id === next.id);
    const projects = exists ? ledger.settings.projects.map((x) => (x.id === next.id ? next : x)) : [...ledger.settings.projects, next];
    commit(updateSettings(ledger, { ...ledger.settings, projects }, `${exists ? '修改' : '新增'}專案：${describeProject(next)}`));
    toast(msg);
    onClose();
  };
  return (
    <Sheet title={project ? `編輯專案：${project.name}` : '新增專案'} onClose={onClose}>
      <div className="stack-14">
        {usedCount > 0 && <p className="inset small">已有 {usedCount} 張合約使用這個專案。修改後只套用在之後新增或續約的合約，舊合約條件不變。</p>}
        <div><label className="label" htmlFor="pj-name">專案名稱</label><input id="pj-name" className="fld" value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="例：私募 1 年" aria-invalid={dupName || undefined} />{dupName && <p className="err">已經有同名的專案。</p>}</div>
        <div>
          <span className="label">類別（用來合計資金）</span>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {cats.map((c) => <button key={c} type="button" className="chip" aria-pressed={!otherCat && p.category === c} onClick={() => { set({ category: c }); setOtherCat(''); }}>{c}</button>)}
          </div>
          <input className="fld" style={{ marginTop: 8 }} placeholder="或輸入新類別" value={otherCat} onChange={(e) => setOtherCat(e.target.value)} aria-label="新類別名稱" />
        </div>
        <div>
          <span className="label">生效日</span>
          <Seg<EffRule> label="生效日規則" value={p.effRule} onChange={(v) => set({ effRule: v })} options={[{ v: 'nextMonth1', t: '入金隔月 1 日' }, { v: 'wednesday', t: '最近一個週三' }]} />
          {p.effRule === 'wednesday' && <p className="hint">週三入金當天生效，其他日子取下一個週三。</p>}
        </div>
        <div>
          <span className="label">合約期間</span>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {TERM_OPTIONS.map((m) => <button key={m} type="button" className="chip" aria-pressed={p.termMonths === m} onClick={() => set({ termMonths: m, periodMonths: periodOptions(m).includes(p.periodMonths) ? p.periodMonths : 1 })}>{m} 個月</button>)}
          </div>
        </div>
        <div>
          <span className="label">紅利：每期幾個月</span>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {periodOptions(p.termMonths).map((m) => <button key={m} type="button" className="chip" aria-pressed={p.periodMonths === m} onClick={() => set({ periodMonths: m })}>{m === 1 ? '月配' : m === 3 ? '季配' : m === 6 ? '半年配' : m === 12 ? '年配' : `每 ${m} 個月`}</button>)}
          </div>
        </div>
        <div className="row-flex">
          <label className="grow small" htmlFor="pj-pct">每期紅利（佔本金）</label>
          <NumInput id="pj-pct" value={p.pct} onChange={(v) => set({ pct: v })} />
          <span className="small">%</span>
        </div>
        <div className="stack-8">
          <span className="label" style={{ marginBottom: 0 }}>業務獎金比例（依本金級距）</span>
          {p.tiers.map((t, i) => (
            <div key={i} className="row-flex">
              <span className="small" style={{ width: 24 }}>滿</span>
              <div className="grow"><MoneyInput id={`pj-tm-${i}`} value={t.min} onChange={(v) => setTier(i, { min: v ?? 0 })} /></div>
              <NumInput id={`pj-tp-${i}`} value={t.pct} onChange={(v) => setTier(i, { pct: v })} />
              <span className="small">%</span>
              <button type="button" className="sheet-close" aria-label="刪除這個級距" disabled={p.tiers.length <= 1} onClick={() => set({ tiers: p.tiers.filter((_, j) => j !== i) })}><Icon n="trash" size={20} /></button>
            </div>
          ))}
          <button type="button" className="btn btn-quiet" onClick={() => set({ tiers: [...p.tiers, { min: (Math.max(...p.tiers.map((t) => t.min)) || 0) + 1000000, pct: p.tiers[p.tiers.length - 1]?.pct ?? 2 }] })}><Icon n="plus" size={18} />新增級距</button>
        </div>
        <div>
          <span className="label">業務獎金發放時間</span>
          <div className="stack-8">
            {(['split', 'start', 'end'] as BonusSchedule[]).map((v) => (
              <button key={v} type="button" className="choice" aria-pressed={p.bonusSchedule === v} onClick={() => set({ bonusSchedule: v })} style={{ minHeight: 0, padding: '10px 14px', textAlign: 'left' }}>
                <span className="t" style={{ fontSize: 14 }}>{BONUS_SCHEDULE_LABEL[v]}</span>
              </button>
            ))}
          </div>
          <p className="hint">「開始時」在生效當月首週發（生效日在 8 日以後就排到隔月首週）；「到期後」在到期日的隔月首週發。</p>
        </div>
        <button type="button" className="btn btn-pri btn-block" disabled={!ok} onClick={() => save({ ...p, name: p.name.trim(), category, tiers: [...p.tiers].sort((a, b) => a.min - b.min) }, '專案已儲存')}>儲存專案</button>
        {project && usedCount === 0 && (
          <ConfirmInline block danger label="刪除這個專案" confirmLabel="確定刪除" onConfirm={() => {
            commit(updateSettings(ledger, { ...ledger.settings, projects: ledger.settings.projects.filter((x) => x.id !== project.id) }, `刪除專案：${project.name}`));
            toast('已刪除專案');
            onClose();
          }}>
            <p className="small">這個專案還沒有任何合約，刪除後無法復原。</p>
          </ConfirmInline>
        )}
        {project && usedCount > 0 && (project.archived ? (
          <button type="button" className="btn btn-out btn-block" onClick={() => save({ ...project, archived: false }, '已重新啟用')}>重新啟用</button>
        ) : (
          <ConfirmInline block danger label="停用這個專案" confirmLabel="確定停用" onConfirm={() => save({ ...project, archived: true }, '已停用')}>
            <p className="small">停用後新增合約時不能再選這個專案；已經登錄的 {usedCount} 張合約照常運作、照常發放。</p>
          </ConfirmInline>
        ))}
      </div>
    </Sheet>
  );
};

/* ---------- 稽核紀錄 ---------- */
export const AuditPage = () => {
  const { ledger } = useStore();
  const nav = useNav();
  const [n, setN] = useState(60);
  const rows = [...ledger.audit].reverse();
  return (
    <>
      <Header title="稽核紀錄" onBack={nav.back} />
      <div className="page">
        <p className="foot-note" style={{ textAlign: 'left', marginTop: 14 }}>系統自動記錄每一次新增、核銷、續約、移轉和贖回。這裡只能查看，不能修改或刪除。</p>
        <ul className="list" style={{ margin: '12px 16px 0' }}>
          {rows.slice(0, n).map((a, i) => (
            <li key={i} className="audit-row">
              <div className="row-flex"><span className="tag tag-gray">{a.action}</span><span className="grow" /><span className="when">{fmtTime(a.at)}</span></div>
              <div className="what">{a.detail}</div>
            </li>
          ))}
          {rows.length === 0 && <li className="empty"><p className="d">還沒有紀錄</p></li>}
        </ul>
        {rows.length > n && <button type="button" className="btn btn-quiet" style={{ margin: '12px 16px 0', width: 'calc(100% - 32px)' }} onClick={() => setN(n + 100)}>顯示更多</button>}
      </div>
    </>
  );
};
