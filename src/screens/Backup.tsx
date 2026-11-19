import { useRef, useState } from 'react';
import { updateSettings } from '../engine/actions';
import { VALID_PERIOD_MONTHS, money } from '../engine/engine';
import type { Ledger, Plan, Settings as S, Tier } from '../engine/types';
import { makeBackupFile, shareOrDownload } from '../lib/backup';
import { BackupError, cryptoReady, decryptBackup, hashPin, verifyPin } from '../lib/crypto';
import { isLedger, useStore } from '../lib/store';
import { ConfirmInline, Header, Icon, MoneyInput, NumInput, useToast } from '../ui/kit';
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
      if (!isLedger(data?.ledger)) throw new BackupError('format');
      setRestored(data.ledger);
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
            <li><button type="button" className="item" style={{ alignItems: 'center' }} onClick={() => nav.push({ name: 'settings' })}><Icon n="gear" /><span className="grow strong">系統設定</span><span className="xs muted">紅利方案、獎金級距、PIN 碼</span><Icon n="chev" size={18} /></button></li>
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
  const [s, setS] = useState<S>(() => JSON.parse(JSON.stringify(ledger.settings)));
  const changed = JSON.stringify(s) !== JSON.stringify(ledger.settings);
  const plansOk = s.plans.length > 0 && s.plans.every((p) => p.name.trim() && p.pct > 0 && VALID_PERIOD_MONTHS.includes(p.months));
  const setPlan = (i: number, patch: Partial<Plan>) => setS({ ...s, plans: s.plans.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const setTier = (i: number, patch: Partial<Tier>) => setS({ ...s, tiers: s.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinMsg, setPinMsg] = useState<string | null>(null);

  return (
    <>
      <Header title="系統設定" onBack={nav.back} />
      <div className="page">
        <section className="section card pad stack-12">
          <h2 className="section-title">紅利方案</h2>
          <p className="xs muted">修改方案只影響之後新增的合約，已登錄的合約維持原條件。</p>
          {s.plans.map((p, i) => (
            <div key={p.id} className="inset stack-8">
              <div className="row-flex">
                <label className="sr" htmlFor={`pn-${i}`} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>方案名稱</label>
                <input id={`pn-${i}`} className="fld grow" value={p.name} onChange={(e) => setPlan(i, { name: e.target.value })} />
                <NumInput id={`pp-${i}`} value={p.pct} onChange={(v) => setPlan(i, { pct: v })} />
                <span className="small">%</span>
                <button type="button" className="sheet-close" aria-label={`刪除 ${p.name}`} disabled={s.plans.length <= 1} onClick={() => setS({ ...s, plans: s.plans.filter((_, j) => j !== i) })}><Icon n="trash" size={20} /></button>
              </div>
              <div className="chips">
                {VALID_PERIOD_MONTHS.map((m) => (
                  <button key={m} type="button" className="chip" aria-pressed={p.months === m} onClick={() => setPlan(i, { months: m })}>每 {m} 個月</button>
                ))}
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-quiet" onClick={() => setS({ ...s, plans: [...s.plans, { id: 'p-' + Date.now().toString(36), name: '新方案', months: 3, pct: 3 }] })}><Icon n="plus" size={18} />新增方案</button>
        </section>

        <section className="section card pad stack-12">
          <h2 className="section-title">業務獎金級距</h2>
          <p className="xs muted">本金達到金額（含）以上，套用該比例。登錄合約時自動帶入，可個別修改。</p>
          {[...s.tiers].map((t, i) => (
            <div key={i} className="row-flex">
              <span className="small" style={{ width: 28 }}>滿</span>
              <div className="grow"><MoneyInput id={`tm-${i}`} value={t.min} onChange={(v) => setTier(i, { min: v ?? 0 })} /></div>
              <NumInput id={`tp-${i}`} value={t.pct} onChange={(v) => setTier(i, { pct: v })} />
              <span className="small">%</span>
              <button type="button" className="sheet-close" aria-label="刪除這個級距" disabled={s.tiers.length <= 1} onClick={() => setS({ ...s, tiers: s.tiers.filter((_, j) => j !== i) })}><Icon n="trash" size={20} /></button>
            </div>
          ))}
          <button type="button" className="btn btn-quiet" onClick={() => setS({ ...s, tiers: [...s.tiers, { min: (Math.max(...s.tiers.map((t) => t.min)) || 0) + 1000000, pct: 3 }] })}><Icon n="plus" size={18} />新增級距</button>
        </section>

        <section className="section card pad stack-12">
          <h2 className="section-title">提前贖回</h2>
          <div className="row-flex">
            <label className="grow small" htmlFor="rp">退回本金比例</label>
            <NumInput id="rp" value={s.refundPct} onChange={(v) => setS({ ...s, refundPct: Math.min(100, v) })} />
            <span className="small">%</span>
          </div>
        </section>

        <div style={{ margin: '16px 16px 0' }}>
          <button type="button" className="btn btn-pri btn-block" disabled={!changed || !plansOk} onClick={() => {
            const detail = `方案：${s.plans.map((p) => `${p.name} ${p.months}月${p.pct}%`).join('、')}；級距：${[...s.tiers].sort((a, b) => a.min - b.min).map((t) => `${money(t.min)}↑${t.pct}%`).join('、')}；贖回退本 ${s.refundPct}%`;
            commit(updateSettings(ledger, { ...s, tiers: [...s.tiers].sort((a, b) => a.min - b.min) }, detail));
            toast('設定已儲存');
          }}>儲存設定</button>
          {!plansOk && <p className="err">每個方案都要有名稱和大於 0 的比例。</p>}
        </div>

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
    </>
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
