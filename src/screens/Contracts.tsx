import { useMemo, useState } from 'react';
import { createContract, previewContract, redeem, setIntent } from '../engine/actions';
import {
  BONUS_SCHEDULE_LABEL, STATUS_LABEL, endDate, eventsOf, evLabel, fmtDate, fmtDateW, maturityYM, money, periodsOf, projectSummary,
  redemptionQuote, statusOf, tierPct, wan, ymLabel, ymOf, type Status
} from '../engine/engine';
import type { Contract, Ev, Intent } from '../engine/types';
import { useStore } from '../lib/store';
import { EventSheet } from '../ui/EventSheet';
import { ConfirmInline, Header, Icon, MoneyInput, NumInput, Seg, Sheet, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';
import { TopActions } from '../ui/TopActions';

const STATUS_TAG: Record<Status, string> = {
  pending: 'tag-blue', active: 'tag-green', maturing: 'tag-orange', closed: 'tag-gray', renewed: 'tag-gray', redeeming: 'tag-red', redeemed: 'tag-gray'
};

const termText = (c: Contract) => `每 ${c.terms.periodMonths} 個月 ${c.terms.pct}%`;

type Filter = 'all' | 'live' | 'soon' | 'unk' | 'done';

/* ---------- 合約清單 ---------- */
export const ContractList = () => {
  const { ledger, today } = useStore();
  const nav = useNav();
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>('live');
  const nowYM = ymOf(today);
  const rows = useMemo(() => {
    return ledger.contracts
      .map((c) => ({ c, st: statusOf(c, ledger, today) }))
      .filter(({ c, st }) => {
        if (q && !(c.client.includes(q.trim()) || c.terms.projectName.includes(q.trim()) || c.code.toLowerCase().includes(q.trim().toLowerCase()) || (ledger.sales.find((s) => s.id === c.salesId)?.name ?? '').includes(q.trim()))) return false;
        const live = ['pending', 'active', 'maturing', 'redeeming'].includes(st);
        if (f === 'live') return live;
        if (f === 'soon') return live && !c.redemption && maturityYM(c) - nowYM <= 3 && maturityYM(c) >= nowYM;
        if (f === 'unk') return live && !c.redemption && c.intent === 'unk' && maturityYM(c) - nowYM <= 3;
        if (f === 'done') return !live;
        return true;
      })
      .sort((a, b) => maturityYM(a.c) - maturityYM(b.c) || a.c.code.localeCompare(b.c.code));
  }, [ledger, today, q, f, nowYM]);
  const unkSoon = ledger.contracts.filter((c) => !c.redemption && c.intent === 'unk' && maturityYM(c) - nowYM <= 3 && ['active', 'maturing'].includes(statusOf(c, ledger, today))).length;

  return (
    <>
      <div className="hdr">
        <div className="hdr-bar">
          <h1 className="hdr-title">合約管理</h1>
          <TopActions />
        </div>
        <div className="hdr-sub">
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: 13, color: 'var(--ink-3)' }}><Icon n="search" size={20} /></span>
            <input className="fld" style={{ paddingLeft: 40, border: 0 }} placeholder="搜尋客戶、合約編號、業務" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜尋合約" />
          </div>
        </div>
      </div>
      <div className="page">
        <div style={{ margin: '14px 16px 0' }}>
          <div className="chips">
            {([['live', '未結案'], ['soon', '3 個月內到期'], ['unk', `待確認意願${unkSoon ? ` ${unkSoon}` : ''}`], ['done', '已結案'], ['all', '全部']] as [Filter, string][]).map(([v, t]) => (
              <button key={v} type="button" className="chip" aria-pressed={f === v} onClick={() => setF(v)}>{t}</button>
            ))}
          </div>
        </div>
        <div className="grid-2" style={{ margin: '12px 16px 0' }}>
          <button type="button" className="btn btn-pri" onClick={() => nav.push({ name: 'new' })}>
            <Icon n="plus" size={20} sw={2.2} />新增合約
          </button>
          <button type="button" className="btn btn-out" onClick={() => nav.push({ name: 'settings' })}>
            <Icon n="gear" size={20} />專案設定
          </button>
        </div>
        <ul className="list" style={{ margin: '12px 16px 0' }}>
          {rows.map(({ c, st }) => (
            <li key={c.id}>
              <button type="button" className="item" onClick={() => nav.push({ name: 'contract', id: c.id })}>
                <div className="grow">
                  <div className="item-title"><span className="name">{c.client}</span><span className="code">{c.code}</span></div>
                  <div className="item-sub">{termText(c)}・到期 {fmtDate(endDate(c))}</div>
                  <div className="row-flex" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <span className="tag tag-proj">{c.terms.projectName}</span>
                    <span className={`tag ${STATUS_TAG[st]}`}>{STATUS_LABEL[st]}</span>
                    {!c.redemption && !c.renewedTo && ['active', 'maturing'].includes(st) && maturityYM(c) - nowYM <= 3 && (
                      <span className={`tag ${c.intent === 'unk' ? 'tag-orange' : 'tag-gray'}`}>{c.intent === 'unk' ? '續存意願未確認' : c.intent === 'renew' ? '確認續存' : '不續存'}</span>
                    )}
                  </div>
                </div>
                <div className="right" style={{ flex: 'none' }}>
                  <div className="item-amt">{money(c.principal)}</div>
                  <div className="xs muted" style={{ marginTop: 2 }}>{ledger.sales.find((s) => s.id === c.salesId)?.name}</div>
                </div>
              </button>
            </li>
          ))}
          {rows.length === 0 && <li className="empty"><p className="t">沒有符合的合約</p></li>}
        </ul>
      </div>
    </>
  );
};

/* ---------- 新增合約 ---------- */
export const NewContract = ({ presetClient }: { presetClient?: string }) => {
  const { ledger, today, commit } = useStore();
  const nav = useNav();
  const toast = useToast();
  const active = ledger.sales.filter((s) => s.active);
  const [client, setClient] = useState(presetClient ?? '');
  const [focusName, setFocusName] = useState(false);
  const lastSales = [...ledger.contracts].reverse().find((c) => c.client === client.trim())?.salesId;
  const [salesId, setSalesId] = useState<string | null>(active.length === 1 ? active[0].id : null);
  const [principal, setPrincipal] = useState<number | null>(null);
  const [dep, setDep] = useState(today);
  const projects = ledger.settings.projects.filter((x) => !x.archived);
  const [projectId, setProjectId] = useState<string | null>(projects.length === 1 ? projects[0].id : null);
  const proj = projects.find((x) => x.id === projectId) ?? null;
  const [rate, setRate] = useState<number | null>(null);
  const [tried, setTried] = useState(false);
  const tier = proj ? tierPct(principal ?? 0, proj.tiers) : 0;
  const bonusPct = rate ?? tier;
  const effSales = salesId ?? lastSales ?? null;

  const clients = useMemo(() => [...new Set(ledger.contracts.map((c) => c.client))], [ledger.contracts]);
  const sugg = client.trim() ? clients.filter((n) => n.includes(client.trim()) && n !== client.trim()).slice(0, 5) : [];

  const p = proj ? previewContract(ledger, { client, salesId: effSales ?? '', principal: principal ?? 0, depositDate: dep || today, projectId: proj.id, bonusPct }) : null;
  const evs = p && principal ? eventsOf({ ...p, intent: 'unk' }, ledger) : [];
  const valid = client.trim() && effSales && principal && principal > 0 && dep && proj;

  return (
    <>
      <Header title="新增合約" onBack={nav.back} />
      <div className="page" style={{ padding: '16px 16px 24px' }}>
        {active.length === 0 && (
          <div className="banner banner-warn" style={{ margin: '0 0 12px' }}>
            <Icon n="alert" size={18} />還沒有業務。請先到「業務對帳」新增業務。
          </div>
        )}
        <section className="card pad stack-14" aria-labelledby="f-h">
          <h2 id="f-h" className="section-title">合約資料</h2>
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="label" style={{ padding: 0, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>專案</span>
              <button type="button" className="btn btn-link" style={{ fontSize: 13 }} onClick={() => nav.push({ name: 'settings' })}>新增／修改專案</button>
            </legend>
            {projects.length === 0 && <p className="inset small">還沒有可用的專案，請先按右上「新增／修改專案」建立。</p>}
            <div className="stack-8">
              {projects.map((pj) => (
                <button key={pj.id} type="button" className="choice" aria-pressed={projectId === pj.id} onClick={() => setProjectId(pj.id)} style={{ textAlign: 'left', padding: '10px 14px', minHeight: 0 }}>
                  <span className="t">{pj.name} <span className="xs" style={{ fontWeight: 500 }}>（{pj.category}）</span></span>
                  <span className="d">{projectSummary(pj)}</span>
                </button>
              ))}
            </div>
            {tried && !proj && <p className="err">請選擇專案。</p>}
          </fieldset>
          <div>
            <label className="label" htmlFor="cname">客戶姓名</label>
            <input id="cname" className="fld" autoComplete="off" value={client} aria-invalid={tried && !client.trim() ? true : undefined}
              onChange={(e) => setClient(e.target.value)} onFocus={() => setFocusName(true)} onBlur={() => setTimeout(() => setFocusName(false), 150)} />
            {focusName && sugg.length > 0 && (
              <div className="suggest" role="listbox" aria-label="已有客戶">
                {sugg.map((n) => (
                  <button key={n} type="button" role="option" aria-selected="false" onMouseDown={(e) => e.preventDefault()} onClick={() => { setClient(n); setFocusName(false); }}>
                    <span>{n}</span><span className="xs muted">已有客戶</span>
                  </button>
                ))}
              </div>
            )}
            {clients.includes(client.trim()) && <p className="hint">已有客戶，會另開一張獨立合約。</p>}
          </div>
          <div>
            <span className="label">負責業務</span>
            <div className="chips" style={{ flexWrap: 'wrap' }}>
              {active.map((s) => (
                <button key={s.id} type="button" className="chip" aria-pressed={effSales === s.id} onClick={() => setSalesId(s.id)}>{s.name}</button>
              ))}
            </div>
            {tried && !effSales && <p className="err">請選擇業務。</p>}
          </div>
          <div>
            <label className="label" htmlFor="amt">投資本金（元）</label>
            <MoneyInput id="amt" big value={principal} onChange={setPrincipal} placeholder="例：1,000,000" invalid={tried && !principal} />
            <p className="hint">{principal ? wan(principal) : '請輸入金額'}・寫入後本金鎖定，不可修改</p>
          </div>
          <div>
            <label className="label" htmlFor="dep">實際入金日</label>
            <input id="dep" className="fld" type="date" value={dep} onChange={(e) => setDep(e.target.value)} />
          </div>
          <div className="inset row-flex" style={{ justifyContent: 'space-between' }}>
            <div>
              <label className="small" htmlFor="rate" style={{ color: 'var(--ink-2)' }}>業務獎金比例</label>
              <div className="xs muted" style={{ marginTop: 2 }}>{rate == null ? '依級距自動帶入' : `已手動修改，級距建議 ${tier}%`}</div>
            </div>
            <div className="row-flex" style={{ gap: 4 }}>
              <NumInput id="rate" value={bonusPct} onChange={(v) => setRate(v)} />
              <span>%</span>
            </div>
          </div>
        </section>

        <section className="card pad" style={{ marginTop: 16 }} aria-labelledby="pv-h">
          <div className="row-flex" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 id="pv-h" className="section-title">系統自動推算</h2>
            {p && <span className="small muted">合約編號 <b style={{ color: 'var(--ink)', fontWeight: 700 }}>{p.code}</b></span>}
          </div>
          {p && proj ? (
            <>
              <div className="grid-2" style={{ marginTop: 12 }}>
                <div className="stat"><div className="k">生效日（{proj.effRule === 'wednesday' ? '最近週三' : '入金隔月 1 日'}）</div><div className="v">{fmtDateW(p.effDate)}</div></div>
                <div className="stat"><div className="k">到期日（{proj.termMonths} 個月）</div><div className="v">{fmtDateW(endDate(p))}</div></div>
              </div>
              <div className="grid-3" style={{ marginTop: 10, textAlign: 'center' }}>
                <div><div className="xs muted">每期紅利</div><div className="strong" style={{ marginTop: 2 }}>{money((principal ?? 0) * proj.pct / 100)}</div></div>
                <div><div className="xs muted">合約期紅利合計</div><div className="strong" style={{ marginTop: 2 }}>{money((principal ?? 0) * proj.pct / 100 * periodsOf(p))}</div></div>
                <div><div className="xs muted">業務獎金合計</div><div className="strong" style={{ marginTop: 2 }}>{money((principal ?? 0) * bonusPct / 100)}</div></div>
              </div>
              <p className="xs muted" style={{ marginTop: 8 }}>業務獎金：{BONUS_SCHEDULE_LABEL[proj.bonusSchedule]}</p>
              <h3 className="small strong" style={{ margin: '18px 0 8px', color: 'var(--ink-2)' }}>發放時程（每月 1～7 日）</h3>
              {evs.length ? <Timeline evs={evs.filter((e) => e.kind !== 'ret_unk')} c={p} /> : <p className="small muted">輸入本金後顯示每一次發放的時間和金額。</p>}
            </>
          ) : (
            <p className="small muted" style={{ marginTop: 10 }}>先選擇專案。</p>
          )}
          <p className="xs muted" style={{ marginTop: 10, lineHeight: 1.5 }}>到期前要確認續存意願；還沒確認時，本金會先算進到期月的應備金額。</p>
        </section>

        <button
          type="button"
          className="btn btn-pri btn-block"
          style={{ marginTop: 16, height: 52, fontSize: 17 }}
          onClick={() => {
            setTried(true);
            if (!valid) return;
            const r = createContract(ledger, { client, salesId: effSales!, principal: principal!, depositDate: dep, projectId: proj!.id, bonusPct });
            commit(r.ledger);
            toast(`已寫入帳本：${r.contract.code}`);
            nav.replaceTop({ name: 'contract', id: r.contract.id });
          }}
        >
          確認寫入帳本
        </button>
        {tried && !valid && <p className="err" style={{ textAlign: 'center' }}>還有欄位沒填完整。</p>}
      </div>
    </>
  );
};

const Timeline = ({ evs, paid, c }: { evs: Ev[]; paid?: Record<string, { paidOn: string }>; c?: Contract }) => {
  // 同月份的款項合併成一列
  const byYM = new Map<number, Ev[]>();
  evs.forEach((e) => byYM.set(e.ym, [...(byYM.get(e.ym) ?? []), e]));
  return (
    <ol className="timeline">
      {[...byYM.entries()].sort((a, b) => a[0] - b[0]).map(([ym, xs]) => {
        const done = paid && xs.every((e) => paid[e.id]);
        const final = xs.some((e) => e.final);
        const onlyBonus = xs.every((e) => e.track === 'bonus');
        return (
          <li key={ym}>
            <span className={`dot ${done ? 'dot-done' : final ? 'dot-final' : onlyBonus ? 'dot-bonus' : 'dot-div'}`} aria-hidden="true" />
            <span className="strong small" style={{ color: done ? 'var(--ink-3)' : undefined }}>{ymLabel(ym)}</span>
            <span className="small" style={{ color: done ? 'var(--ink-3)' : 'var(--ink-2)', lineHeight: 1.4 }}>
              {xs.map((e) => evLabel(e, c)).join('、')}{done ? '（已發）' : ''}
            </span>
            <span className="strong small right" style={{ color: done ? 'var(--ink-3)' : undefined }}>{money(xs.reduce((t, e) => t + e.amount, 0))}</span>
          </li>
        );
      })}
    </ol>
  );
};

/* ---------- 合約明細 ---------- */
export const ContractDetail = ({ id }: { id: string }) => {
  const { ledger, today, commit } = useStore();
  const nav = useNav();
  const toast = useToast();
  const [open, setOpen] = useState<Ev | null>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const c = ledger.contracts.find((x) => x.id === id);
  if (!c) return (<><Header title="合約" onBack={nav.back} /><div className="page"><div className="empty"><p className="t">找不到這張合約</p></div></div></>);
  const st = statusOf(c, ledger, today);
  const evs = eventsOf(c, ledger);
  const sales = ledger.sales.find((s) => s.id === c.salesId);
  const finalPaid = evs.some((e) => e.final && ledger.payments[e.id]);
  const canIntent = !c.redemption && !c.renewedTo && !finalPaid && ['pending', 'active', 'maturing'].includes(st);
  const from = c.renewedFrom ? ledger.contracts.find((x) => x.id === c.renewedFrom) : undefined;
  const to = c.renewedTo ? ledger.contracts.find((x) => x.id === c.renewedTo) : undefined;
  const paidDiv = evs.filter((e) => e.track === 'client' && ledger.payments[e.id]).reduce((t, e) => t + e.amount, 0);

  return (
    <>
      <Header title={c.code} onBack={nav.back} right={<TopActions />} />
      <div className="page">
        <div className="hero" style={{ paddingTop: 6 }}>
          <button type="button" className="btn btn-link" style={{ color: 'var(--on-field)', fontSize: 20, fontWeight: 700, padding: 0 }} onClick={() => nav.push({ name: 'client', client: c.client })}>
            {c.client}<Icon n="chev" size={18} />
          </button>
          <div className="hero-amt"><span className="cur">本金 NT$</span><span className="num" style={{ fontSize: 32 }}>{money(c.principal)}</span></div>
          <p className="hero-note">［{c.terms.projectName}］{termText(c)}・業務 {sales?.name}（{c.bonusPct}%）</p>
        </div>
        <section className="card raised lift pad stack-12">
          <div className="row-flex">
            <span className={`tag ${STATUS_TAG[st]}`}>{STATUS_LABEL[st]}</span>
            <span className="grow" />
            <span className="small muted">已發客戶款 {money(paidDiv)}</span>
          </div>
          <div className="grid-2">
            <div className="stat"><div className="k">入金日</div><div className="v">{fmtDate(c.depositDate)}</div></div>
            <div className="stat"><div className="k">生效 ～ 到期</div><div className="v" style={{ fontSize: 15 }}>{fmtDate(c.effDate)} ～ {fmtDate(endDate(c)).slice(5)}</div></div>
          </div>
          {from && <button type="button" className="btn btn-link" style={{ justifySelf: 'start' }} onClick={() => nav.push({ name: 'contract', id: from.id })}>由 {from.code} 續約而來</button>}
          {to && <button type="button" className="btn btn-link" style={{ justifySelf: 'start' }} onClick={() => nav.push({ name: 'contract', id: to.id })}>已續約為 {to.code}</button>}
          {c.redemption && (
            <div className="inset-danger small stack-8">
              <b>{fmtDate(c.redemption.date)} 提前贖回</b>
              <span>實退本金 {money(c.redemption.refund)}、當期紅利 {money(c.redemption.proRataDiv)}（持有 {c.redemption.heldMonths} 個月），{ymLabel(c.redemption.payYM)} 首週發放。</span>
              <span>作廢尾款 {money(c.redemption.voidedTail)}{c.redemption.clawback ? `；應向業務追回已發頭款 ${money(c.redemption.clawback)}` : ''}。</span>
            </div>
          )}
        </section>

        {canIntent && (
          <section className="section card pad">
            <h2 className="section-title">到期續存意願</h2>
            <p className="small muted" style={{ margin: '4px 0 12px' }}>{ymLabel(maturityYM(c))} 首週到期。沒確認前，本金會先列入應備金額。</p>
            <Seg<Intent>
              label="續存意願"
              value={c.intent}
              onChange={(v) => { if (v !== c.intent) { commit(setIntent(ledger, c.id, v)); toast('已更新續存意願'); } }}
              options={[{ v: 'unk', t: '未確認' }, { v: 'renew', t: '確認續存' }, { v: 'close', t: '不續存' }]}
            />
          </section>
        )}

        <section className="section">
          <h2 className="section-title" style={{ marginBottom: 10 }}>發放明細</h2>
          <ul className="list">
            {evs.map((e) => {
              const p = ledger.payments[e.id];
              return (
                <li key={e.id}>
                  <button type="button" className="item" onClick={() => setOpen(e)} style={{ alignItems: 'center' }}>
                    <span className={`swatch ${e.kind === 'ret_unk' ? 'sw-unk' : e.track === 'bonus' ? 'sw-bonus' : e.kind === 'ret' || e.kind === 'rret' ? 'sw-ret' : 'sw-div'}`} />
                    <div className="grow">
                      <div className="strong small">{evLabel(e, c)}{e.track === 'bonus' && p?.salesId && p.salesId !== c.salesId ? `（${ledger.sales.find((s) => s.id === p.salesId)?.name}）` : ''}</div>
                      <div className="xs muted">{ymLabel(e.ym)} 首週{p ? `・${fmtDate(p.paidOn)} 已發${p.tail5 ? `・後五碼 ${p.tail5}` : ''}` : e.blocked ? '・待確認續存' : ''}</div>
                    </div>
                    <span className="strong" style={{ color: p ? 'var(--ink-3)' : e.blocked ? 'var(--warn)' : 'var(--ink)' }}>{money(e.amount)}</span>
                    {p ? <span className="tag tag-green"><Icon n="check" size={14} sw={2.6} />已發</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {['pending', 'active'].includes(st) && !c.redemption && (
          <section className="section">
            <button type="button" className="btn btn-danger-out btn-block" onClick={() => setRedeemOpen(true)}>提前贖回</button>
          </section>
        )}
      </div>
      {open && <EventSheet ev={open} onClose={() => setOpen(null)} />}
      {redeemOpen && <RedeemSheet c={c} onClose={() => setRedeemOpen(false)} />}
    </>
  );
};

const RedeemSheet = ({ c, onClose }: { c: Contract; onClose: () => void }) => {
  const { ledger, today, commit } = useStore();
  const toast = useToast();
  const [date, setDate] = useState(today);
  const q = redemptionQuote(c, ledger, date || today, ledger.settings);
  const [refund, setRefund] = useState<number | null>(null);
  const [div, setDiv] = useState<number | null>(null);
  const r = refund ?? q.refund;
  const d = div ?? q.proRataDiv;
  return (
    <Sheet title={`提前贖回 ${c.code}`} onClose={onClose}>
      <div className="stack-14">
        <div>
          <label className="label" htmlFor="rd">客戶提出贖回日</label>
          <input id="rd" className="fld" type="date" value={date} onChange={(e) => { setDate(e.target.value); setRefund(null); setDiv(null); }} />
        </div>
        <div>
          <label className="label" htmlFor="rf">實退本金（本金 {money(c.principal)} × {ledger.settings.refundPct}%）</label>
          <MoneyInput id="rf" value={r} onChange={setRefund} />
        </div>
        <div>
          <label className="label" htmlFor="rdv">當期紅利（已持有 {q.heldMonths} 個月，按月比例）</label>
          <MoneyInput id="rdv" value={d} onChange={setDiv} />
        </div>
        <div className="inset small stack-8">
          <div className="row-flex"><span className="grow">發放時間</span><b>{ymLabel(q.payYM)} 首週</b></div>
          <div className="row-flex"><span className="grow">之後各期紅利</span><b>不再發放</b></div>
          <div className="row-flex"><span className="grow">未發獎金作廢</span><b>{money(q.voidedTail)}</b></div>
          <div className="row-flex"><span className="grow">應追回已發獎金</span><b className={q.clawback ? 'danger-ink' : ''}>{money(q.clawback)}</b></div>
        </div>
        <ConfirmInline block danger label="確認提前贖回" confirmLabel="確定贖回結案" onConfirm={() => {
          commit(redeem(ledger, c.id, date || today, { refund: r, proRataDiv: d }));
          toast('已登記提前贖回');
          onClose();
        }}>
          <p className="small">贖回後這張合約不能復原，未來排程會全部移除。</p>
        </ConfirmInline>
      </div>
    </Sheet>
  );
};

/* ---------- 客戶頁 ---------- */
export const ClientPage = ({ client }: { client: string }) => {
  const { ledger, today } = useStore();
  const nav = useNav();
  const cs = ledger.contracts.filter((c) => c.client === client);
  const live = cs.filter((c) => ['pending', 'active', 'maturing', 'redeeming'].includes(statusOf(c, ledger, today)));
  const evs = cs.flatMap((c) => eventsOf(c, ledger)).filter((e) => e.track === 'client');
  const paid = evs.filter((e) => ledger.payments[e.id]).sort((a, b) => b.ym - a.ym);
  const next = evs.filter((e) => !ledger.payments[e.id] && !e.projected).sort((a, b) => a.ym - b.ym).slice(0, 4);
  const total = paid.reduce((t, e) => t + e.amount, 0);
  return (
    <>
      <Header title={client} onBack={nav.back} right={<TopActions />} />
      <div className="page">
        <div className="hero" style={{ paddingTop: 6 }}>
          <p className="hero-label">運作中本金</p>
          <div className="hero-amt"><span className="cur">NT$</span><span className="num">{money(live.reduce((t, c) => t + c.principal, 0))}</span></div>
          <p className="hero-note">{cs.length} 張合約・累計已發 {money(total)}</p>
        </div>
        <section className="card raised lift">
          <ul className="list">
            {cs.map((c) => {
              const st = statusOf(c, ledger, today);
              return (
                <li key={c.id}>
                  <button type="button" className="item" onClick={() => nav.push({ name: 'contract', id: c.id })} style={{ alignItems: 'center' }}>
                    <div className="grow">
                      <div className="item-title"><span className="name" style={{ fontSize: 15 }}>{c.code}</span><span className={`tag ${STATUS_TAG[st]}`}>{STATUS_LABEL[st]}</span></div>
                      <div className="item-sub">{c.terms.projectName}・{termText(c)}・到期 {fmtDate(endDate(c))}</div>
                    </div>
                    <span className="item-amt">{money(c.principal)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <button type="button" className="btn btn-out" style={{ margin: '12px 16px 0', width: 'calc(100% - 32px)' }} onClick={() => nav.push({ name: 'new', client })}>
          <Icon n="plus" size={20} />幫 {client} 新增一張合約
        </button>
        {next.length > 0 && (
          <section className="section">
            <h2 className="section-title" style={{ marginBottom: 10 }}>接下來的款項</h2>
            <ul className="list">
              {next.map((e) => (
                <li key={e.id} className="item" style={{ alignItems: 'center' }}>
                  <div className="grow"><div className="strong small">{evLabel(e, cs.find((x) => x.id === e.contractId))}</div><div className="xs muted">{ymLabel(e.ym)} 首週・{e.code}</div></div>
                  <span className="strong" style={{ color: e.blocked || e.kind === 'ret_unk' ? 'var(--warn)' : undefined }}>{money(e.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="section">
          <h2 className="section-title" style={{ marginBottom: 10 }}>發放紀錄</h2>
          <ul className="list">
            {paid.map((e) => {
              const p = ledger.payments[e.id];
              return (
                <li key={e.id} className="item" style={{ alignItems: 'center' }}>
                  <div className="grow"><div className="strong small">{evLabel(e, cs.find((x) => x.id === e.contractId))}</div><div className="xs muted">{fmtDate(p.paidOn)}・{e.code}{p.tail5 ? `・後五碼 ${p.tail5}` : ''}</div></div>
                  <span className="strong">{money(e.amount)}</span>
                </li>
              );
            })}
            {paid.length === 0 && <li className="empty"><p className="d">還沒有發放紀錄</p></li>}
          </ul>
        </section>
      </div>
    </>
  );
};
