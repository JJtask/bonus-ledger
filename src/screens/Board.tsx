import { useMemo, useState } from 'react';
import { addDays, board, isOverdue, dueText, money, monthByScope, scopeLabel, sortEv, ymMonth, ymOf, ymYear } from '../engine/engine';
import type { Ev } from '../engine/types';
import { demoLedger } from '../lib/demo';
import { useStore } from '../lib/store';
import { EventRow } from '../ui/EventRow';
import { EventSheet } from '../ui/EventSheet';
import { Icon, Seg, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';
import { TopActions } from '../ui/TopActions';
import { ScopeChips, useScope } from '../ui/scope';

const ORDER: Record<string, number> = { ret_unk: 0, div: 1, ret: 2, rret: 3, rdiv: 4, tail: 5, head: 6, head_proj: 7 };

export const Board = () => {
  const { ledger, today, replaceLedger } = useStore();
  const nav = useNav();
  const toast = useToast();
  const [list, setList] = useState<'c' | 'b'>('c');
  const [open, setOpen] = useState<Ev | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [scope, setScope] = useScope(ledger);
  const nowYM = ymOf(today);
  const [ym, setYm] = useState(nowYM);
  const b = useMemo(() => board(ledger, today, scope, ym), [ledger, today, scope, ym]);
  const byScope = useMemo(() => monthByScope(ledger, ym), [ledger, ym]);
  const salesName = (id: string) => ledger.sales.find((s) => s.id === id)?.name ?? '';
  const isNow = ym === nowYM;

  const rows = b.items
    .filter((e) => (list === 'c' ? e.track === 'client' : e.track === 'bonus'))
    .sort((x, y) => sortEv(x, y) || (ORDER[x.kind] ?? 9) - (ORDER[y.kind] ?? 9));
  // 依應發日分組
  const groups: { key: string; label: string; due: string; week?: boolean; evs: Ev[] }[] = [];
  for (const e of rows) {
    const key = e.week ? `${e.due}-w` : e.due;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label: dueText(e), due: e.due, week: e.week, evs: [] };
      groups.push(g);
    }
    g.evs.push(e);
  }

  const left = (track: 'client' | 'bonus') =>
    b.items.filter((e) => e.track === track && !ledger.payments[e.id] && e.kind !== 'ret_unk' && !e.projected).length;
  const unkCount = b.items.filter((e) => e.kind === 'ret_unk').length;
  const pct = b.total ? Math.min(100, (b.paid / b.total) * 100) : 0;
  const empty = ledger.contracts.length === 0;
  const next = b.items.find((e) => !ledger.payments[e.id] && !e.projected && e.kind !== 'ret_unk' && (e.week ? addDays(e.due, 6) : e.due) >= today);
  const groupState = (g: { due: string; week?: boolean }) => {
    const end = g.week ? addDays(g.due, 6) : g.due;
    if (g.due <= today && today <= end) return 'today';
    return end < today ? 'past' : 'future';
  };

  return (
    <>
      <div className="hdr" style={{ paddingBottom: 0 }}>
        <div className="hdr-bar">
          <h1 className="hdr-title">資金看板</h1>
          <TopActions />
        </div>
      </div>
      <div className="page">
        <div className="hero">
          <ScopeChips ledger={ledger} scope={scope} onChange={setScope} />
          <div className="month-nav">
            <button type="button" className="icon-btn" aria-label="上個月" onClick={() => setYm(ym - 1)}><Icon n="back" size={20} sw={2} /></button>
            <p className="hero-label grow">{scope.kind === 'all' ? '' : `${scopeLabel(ledger, scope)}・`}{ymYear(ym)} 年 {ymMonth(ym)} 月應備總額（最保守）</p>
            <button type="button" className="icon-btn" aria-label="下個月" onClick={() => setYm(ym + 1)}><Icon n="chev" size={20} sw={2} /></button>
          </div>
          <div className="hero-amt"><span className="cur">NT$</span><span className="num">{money(b.total)}</span></div>
          <p className="hero-note">
            {next ? `下一筆：${dueText(next)}・${b.items.filter((e) => e.due === next.due && !ledger.payments[e.id] && !e.projected).length} 筆` : b.items.length ? '這個月的款項都已發放' : '這個月沒有款項'}
            {!isNow && <> ・<button type="button" className="btn btn-link" style={{ color: 'var(--on-field)', padding: 0, fontSize: 13, textDecoration: 'underline' }} onClick={() => setYm(nowYM)}>回到本月</button></>}
          </p>
        </div>

        <section className="card raised lift" aria-label="應備款項組成" style={{ padding: '6px 16px 14px' }}>
          <div className="kv">
            <span className="swatch sw-div" />
            <div className="grow"><div className="label">客戶紅利</div></div>
            <span className="val">{money(b.div)}</span>
          </div>
          <div className="kv">
            <span className="swatch sw-ret" />
            <div className="grow"><div className="label">到期退本・確定</div></div>
            <span className="val">{money(b.retSure)}</span>
          </div>
          <div className="kv">
            <span className="swatch sw-unk" />
            <div className="grow">
              <div className="label" style={{ color: b.retUnk ? 'var(--warn)' : undefined }}>到期退本・未確認</div>
              {unkCount > 0 && <div className="xs warn-ink">{unkCount} 筆待確認續存，確認後才可核銷</div>}
            </div>
            <span className="val" style={{ color: b.retUnk ? 'var(--warn)' : undefined }}>{money(b.retUnk)}</span>
          </div>
          <div className="kv">
            <span className="swatch sw-bonus" />
            <div className="grow">
              <div className="label">業務獎金</div>
              <div className="xs muted">開始時 {money(b.head)}・到期時 {money(b.tail)}</div>
            </div>
            <span className="val">{money(b.head + b.tail)}</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="progress" aria-hidden="true"><span style={{ transform: `scaleX(${pct / 100})` }} /></div>
            <div className="row-flex small muted" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <span>已發 <b className="brand-ink">{money(b.paid)}</b></span>
              <span>待發 <b style={{ color: 'var(--ink)' }}>{money(b.total - b.paid)}</b></span>
            </div>
          </div>
        </section>

        {scope.kind === 'all' && byScope.length > 2 && !empty && (
          <section className="section" aria-labelledby="bs-h">
            <div className="section-head">
              <h2 id="bs-h" className="section-title">依專案的資金需求</h2>
              <span className="xs muted">點一列只看該範圍</span>
            </div>
            <ul className="list">
              {byScope.map((r) => (
                <li key={JSON.stringify(r.scope)}>
                  <button type="button" className={`scope-row ${r.level}`} onClick={() => setScope(r.scope)}>
                    <span className="nm" style={{ fontWeight: r.level === 'cat' ? 700 : 500 }}>{r.label}</span>
                    <span className="strong right">{money(r.totals.total)}</span>
                    <span className="nm xs muted">紅利 {money(r.totals.div)}・獎金 {money(r.totals.head + r.totals.tail)}</span>
                    <span className="xs right" style={{ color: r.totals.retSure + r.totals.retUnk ? (r.totals.retUnk ? 'var(--warn)' : 'var(--ink-3)') : 'var(--ink-3)' }}>退本 {money(r.totals.retSure + r.totals.retUnk)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {empty && (
          <section className="section card empty">
            <p className="t">還沒有任何合約</p>
            <p className="d">新增第一張合約後，系統會自動排好每一期紅利和業務獎金。<br />想先看看怎麼運作，可以載入示範資料，之後在「資安備份」清除。</p>
            <div className="grid-2" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-out" onClick={() => { replaceLedger(demoLedger(today), 0); toast('已載入示範資料'); }}>載入示範資料</button>
              <button type="button" className="btn btn-pri" onClick={() => { nav.go('contracts'); nav.push({ name: 'new' }); }}>新增合約</button>
            </div>
          </section>
        )}

        {isNow && b.overdue.length > 0 && (
          <section className="section" aria-labelledby="od-h">
            <div className="section-head">
              <h2 id="od-h" className="section-title danger-ink" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon n="alert" size={18} />逾期未發 {b.overdue.length} 筆</h2>
              <span className="small danger-ink strong">{money(b.overdueTotal)}</span>
            </div>
            <ul className="list">
              {b.overdue.map((e) => (
                <EventRow key={e.id} ev={e} ledger={ledger} today={today} onOpen={setOpen} overdue showMonth salesName={salesName(e.salesId)} />
              ))}
            </ul>
          </section>
        )}

        {!empty && (
          <>
            <div className="section">
              <Seg
                label="切換清單"
                value={list}
                onChange={setList}
                options={[{ v: 'c', t: `客戶款項（${left('client')}）` }, { v: 'b', t: `業務獎金（${left('bonus')}）` }]}
              />
            </div>
            <div style={{ margin: '10px 16px 0' }}>
              {groups.length ? (
                <div className="stack-12">
                  {groups.map((g) => {
                    const st = groupState(g);
                    const sum = g.evs.reduce((t, e) => t + e.amount, 0);
                    const done = g.evs.every((e) => ledger.payments[e.id] || e.projected);
                    return (
                      <section key={g.key} aria-label={g.label}>
                        <div className={`day-head ${st}${done ? ' done' : ''}`}>
                          <span className="d">{g.label}{g.week ? ' 首週' : ''}</span>
                          {st === 'today' && <span className="tag tag-today">今天</span>}
                          <span className="grow" />
                          <span className="xs muted">{g.evs.length} 筆</span>
                          <b className="small">{money(sum)}</b>
                        </div>
                        <ul className="list">
                          {g.evs.map((e) => (
                            <EventRow key={e.id} ev={e} ledger={ledger} today={today} onOpen={setOpen} fresh={fresh === e.id} overdue={isOverdue(e, ledger, today)} salesName={salesName(ledger.payments[e.id]?.salesId ?? e.salesId)} />
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="card empty"><p className="t">{ymMonth(ym)} 月沒有{list === 'c' ? '客戶款項' : '業務獎金'}</p></div>
              )}
            </div>
          </>
        )}
      </div>
      {open && <EventSheet ev={ledger.payments[open.id] ? open : (b.items.concat(b.overdue).find((e) => e.id === open.id) ?? open)} onClose={() => setOpen(null)} onPaid={(id) => setFresh(id)} />}
    </>
  );
};
