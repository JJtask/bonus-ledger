import { useMemo, useState } from 'react';
import { board, boardYM, daysUntil, firstWeekLabel, money, ymMonth, ymOf } from '../engine/engine';
import type { Ev } from '../engine/types';
import { demoLedger } from '../lib/demo';
import { useStore } from '../lib/store';
import { EventRow } from '../ui/EventRow';
import { EventSheet } from '../ui/EventSheet';
import { Icon, Seg, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';
import { TopActions } from '../ui/TopActions';

const ORDER: Record<string, number> = { ret_unk: 0, div: 1, ret: 2, rret: 3, rdiv: 4, tail: 5, head: 6, head_proj: 7 };

export const Board = () => {
  const { ledger, today, replaceLedger } = useStore();
  const nav = useNav();
  const toast = useToast();
  const [list, setList] = useState<'c' | 'b'>('c');
  const [open, setOpen] = useState<Ev | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const b = useMemo(() => board(ledger, today), [ledger, today]);
  const ym = boardYM(today);
  const inWeek = ym === ymOf(today);
  const day = Number(today.slice(8, 10));
  const salesName = (id: string) => ledger.sales.find((s) => s.id === id)?.name ?? '';

  const rows = b.items
    .filter((e) => (list === 'c' ? e.track === 'client' : e.track === 'bonus'))
    .sort((x, y) => {
      const px = ledger.payments[x.id] ? 1 : 0;
      const py = ledger.payments[y.id] ? 1 : 0;
      if (px !== py) return px - py;
      if (x.contractId !== y.contractId && x.track === 'client') return x.code.localeCompare(y.code);
      return (ORDER[x.kind] ?? 9) - (ORDER[y.kind] ?? 9);
    });
  // 同一張合約的「本金未確認」放在它的紅利後面
  const grouped: Ev[] = [];
  if (list === 'c') {
    const unk = rows.filter((e) => e.kind === 'ret_unk');
    rows.filter((e) => e.kind !== 'ret_unk').forEach((e) => {
      grouped.push(e);
      const u = unk.find((x) => x.contractId === e.contractId && e.final);
      if (u) grouped.push(u);
    });
    unk.filter((u) => !grouped.includes(u)).forEach((u) => grouped.push(u));
  } else grouped.push(...rows);

  const left = (track: 'client' | 'bonus') =>
    b.items.filter((e) => e.track === track && !ledger.payments[e.id] && e.kind !== 'ret_unk' && !e.projected).length;
  const unkCount = b.items.filter((e) => e.kind === 'ret_unk').length;
  const pct = b.total ? Math.min(100, (b.paid / b.total) * 100) : 0;
  const empty = ledger.contracts.length === 0;

  return (
    <>
      <div className="hdr" style={{ paddingBottom: 0 }}>
        <div className="hdr-bar">
          <h1 className="hdr-title">首週看板</h1>
          <TopActions />
        </div>
      </div>
      <div className="page">
        <div className="hero">
          <p className="hero-label">{ymMonth(ym)} 月首週應備總額（最保守）</p>
          <div className="hero-amt"><span className="cur">NT$</span><span className="num">{money(b.total)}</span></div>
          <p className="hero-note">
            {firstWeekLabel(ym)}・{inWeek ? `首週進行中，剩 ${8 - day} 天` : `還有 ${daysUntil(today, ym)} 天開始`}
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
              <div className="xs muted">頭款 {money(b.head)}・尾款 {money(b.tail)}</div>
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

        {b.overdue.length > 0 && (
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
              {grouped.length ? (
                <ul className="list">
                  {grouped.map((e) => (
                    <EventRow key={e.id} ev={e} ledger={ledger} today={today} onOpen={setOpen} fresh={fresh === e.id} salesName={salesName(ledger.payments[e.id]?.salesId ?? e.salesId)} />
                  ))}
                </ul>
              ) : (
                <div className="card empty"><p className="t">{ymMonth(ym)} 月首週沒有{list === 'c' ? '客戶款項' : '業務獎金'}</p></div>
              )}
            </div>
            {!inWeek && <p className="foot-note">每月 1～7 日顯示當月款項，8 日起改顯示下個月的預警。</p>}
          </>
        )}
      </div>
      {open && <EventSheet ev={ledger.payments[open.id] ? open : (b.items.concat(b.overdue).find((e) => e.id === open.id) ?? open)} onClose={() => setOpen(null)} onPaid={(id) => setFresh(id)} />}
    </>
  );
};
