import { useMemo, useState } from 'react';
import { extraDividend, forecast, money, scopeLabel, ymInput, ymLabel, ymOf } from '../engine/engine';
import { copyText } from '../lib/backup';
import { useStore } from '../lib/store';
import { MoneyInput, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';
import { TopActions } from '../ui/TopActions';
import { ScopeChips, useScope } from '../ui/scope';

export const Forecast = () => {
  const { ledger, today } = useStore();
  const nav = useNav();
  const toast = useToast();
  const [scope, setScope] = useScope(ledger);
  const months = useMemo(() => forecast(ledger, today, scope), [ledger, today, scope]);
  const [open, setOpen] = useState<number | null>(null);
  const total = months.reduce((t, m) => t + m.total, 0);
  const unk = months.reduce((t, m) => t + m.retUnk, 0);
  const max = Math.max(1, ...months.map((m) => m.total));
  const peak = months.find((m) => m.total === max && m.total > 0);
  const nowYM = ymOf(today);

  const [pool, setPool] = useState<number | null>(null);
  const [from, setFrom] = useState(ymInput(nowYM - 5));
  const [to, setTo] = useState(ymInput(nowYM));
  const [shown, setShown] = useState(false);
  const fromYM = ymOf(from + '-01');
  const toYM = ymOf(to + '-01');
  const rangeBad = !from || !to || fromYM > toYM;
  const result = useMemo(
    () => (shown && pool && !rangeBad ? extraDividend(ledger, today, pool, fromYM, toYM, scope) : []),
    [shown, pool, rangeBad, ledger, today, fromYM, toYM, scope]
  );
  const text = `【額外分紅${scope.kind === 'all' ? '' : `・${scopeLabel(ledger, scope)}`}】${ymLabel(fromYM)} 至 ${ymLabel(toYM)}，總池 ${money(pool ?? 0)} 元\n` +
    result.map((r, i) => `${i + 1}. ${r.client} ${r.code}：${money(r.amount)} 元`).join('\n');
  const pct = (v: number) => `${(v / max) * 100}%`;

  return (
    <>
      <div className="hdr"><div className="hdr-bar"><h1 className="hdr-title">12 月水位</h1><TopActions /></div></div>
      <div className="page">
        <div className="hero">
          <ScopeChips ledger={ledger} scope={scope} onChange={(v) => { setScope(v); setShown(false); }} />
          <p className="hero-label">{scope.kind === 'all' ? '' : `${scopeLabel(ledger, scope)}・`}未來 12 個月首週合計應備（最保守）</p>
          <div className="hero-amt"><span className="cur">NT$</span><span className="num">{money(total)}</span></div>
          <p className="hero-note">{ymLabel(months[0].ym)} 至 {ymLabel(months[11].ym)}・含未確認退本 {money(unk)}</p>
        </div>

        <section className="card raised lift pad" aria-labelledby="peak-h">
          {peak ? (
            <>
              <div className="row-flex" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <h2 id="peak-h" style={{ fontSize: 15, fontWeight: 600 }}>資金高峰：{ymLabel(peak.ym)} 首週</h2>
                  <p className="small muted" style={{ marginTop: 4, lineHeight: 1.5 }}>
                    {peak.unkContracts.length
                      ? `其中 ${money(peak.retUnk)} 是 ${peak.unkContracts.length} 筆到期但未確認續存的本金。確認續存後會下降。`
                      : '這個月的款項都已確定。'}
                  </p>
                </div>
                <span className="strong" style={{ fontSize: 18, color: peak.retUnk ? 'var(--warn)' : 'var(--ink)' }}>{money(peak.total)}</span>
              </div>
              {peak.unkContracts.length > 0 && (
                <ul className="list" style={{ marginTop: 10, background: 'var(--brand-wash)' }}>
                  {peak.unkContracts.map((id) => {
                    const c = ledger.contracts.find((x) => x.id === id)!;
                    return (
                      <li key={id}>
                        <button type="button" className="item" onClick={() => nav.push({ name: 'contract', id })} style={{ padding: '10px 12px', alignItems: 'center' }}>
                          <span className="grow"><b>{c.client}</b> <span className="xs muted">{c.code}</span></span>
                          <span className="small warn-ink strong">本金 {money(c.principal)}</span>
                          <span className="tag tag-orange">去確認</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <p className="small muted">未來 12 個月沒有排定的款項。</p>
          )}
        </section>

        <section className="section" aria-labelledby="months-h">
          <div className="section-head">
            <h2 id="months-h" className="section-title">每月首週應備</h2>
            <span className="xs muted">點月份看明細</span>
          </div>
          <div className="row-flex xs" style={{ flexWrap: 'wrap', gap: '6px 14px', marginBottom: 10, color: 'var(--ink-2)' }}>
            <span className="row-flex" style={{ gap: 6 }}><span className="swatch sw-div" />客戶紅利</span>
            <span className="row-flex" style={{ gap: 6 }}><span className="swatch sw-bonus" />業務獎金</span>
            <span className="row-flex" style={{ gap: 6 }}><span className="swatch sw-ret" />退本・確定</span>
            <span className="row-flex" style={{ gap: 6 }}><span className="swatch sw-unk" />退本・未確認</span>
          </div>
          <ul className="list">
            {months.map((m, i) => {
              const isOpen = open === i;
              return (
                <li key={m.ym}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : i)}
                    style={{ appearance: 'none', border: 0, width: '100%', background: isOpen ? 'var(--brand-wash)' : 'transparent', padding: '10px 16px', display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) 96px', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left', minHeight: 52 }}
                  >
                    <span className="strong small">{ymLabel(m.ym)}</span>
                    <span className="bar" aria-hidden="true">
                      <span className="b-div" style={{ width: pct(m.div) }} />
                      <span className="b-bonus" style={{ width: pct(m.bonus) }} />
                      <span className="b-ret" style={{ width: pct(m.retSure) }} />
                      <span className="b-unk" style={{ width: pct(m.retUnk) }} />
                    </span>
                    <span className="strong right" style={{ color: m === peak && m.retUnk ? 'var(--warn)' : 'var(--ink)' }}>{money(m.total)}</span>
                  </button>
                  {isOpen && (
                    <div className="reveal small" style={{ padding: '4px 16px 14px 90px', display: 'grid', gap: 6, background: 'var(--brand-wash)' }}>
                      <div className="row-flex"><span className="grow">客戶紅利</span><b>{money(m.div)}</b></div>
                      <div className="row-flex"><span className="grow">業務獎金</span><b>{money(m.bonus)}</b></div>
                      <div className="row-flex"><span className="grow">到期退本・確定</span><b>{money(m.retSure)}</b></div>
                      <div className="row-flex warn-ink" style={{ color: m.retUnk ? undefined : 'inherit' }}><span className="grow">到期退本・未確認</span><b>{money(m.retUnk)}</b></div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="section card pad" aria-labelledby="bonus-h">
          <h2 id="bonus-h" className="section-title">額外分紅試算</h2>
          <p className="small muted" style={{ margin: '4px 0 14px', lineHeight: 1.5 }}>只分給今天仍在運作中的合約，依「本金 × 期間內計息月數」的比例分配。範圍：<b>{scopeLabel(ledger, scope)}</b>（可在上方切換專案）。</p>
          <div className="stack-12">
            <div>
              <label className="label" htmlFor="pool">分紅總池（元）</label>
              <MoneyInput id="pool" value={pool} onChange={(v) => { setPool(v); setShown(false); }} placeholder="例：300,000" />
            </div>
            <div className="grid-2">
              <div><label className="label" htmlFor="from">結算起月</label><input id="from" className="fld" type="month" value={from} onChange={(e) => { setFrom(e.target.value); setShown(false); }} /></div>
              <div><label className="label" htmlFor="to">結算迄月</label><input id="to" className="fld" type="month" value={to} onChange={(e) => { setTo(e.target.value); setShown(false); }} /></div>
            </div>
            {rangeBad && <p className="err">起月不能晚於迄月。</p>}
            <button type="button" className="btn btn-pri btn-block" disabled={!pool || rangeBad} onClick={() => setShown(true)}>試算</button>
          </div>
          {shown && (
            <div className="reveal" style={{ marginTop: 14, borderTop: '1px solid var(--line-soft)' }}>
              {result.length === 0 ? (
                <p className="small muted" style={{ paddingTop: 12 }}>這段期間沒有運作中的合約可以分配。</p>
              ) : (
                <>
                  {result.map((r) => (
                    <div key={r.contractId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '2px 10px', padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
                      <span style={{ fontWeight: 500 }}>{r.client} <span className="xs muted">{r.code}</span></span>
                      <span className="strong right">{money(r.amount)}</span>
                      <span className="xs muted">本金 {money(r.principal)} × {r.months} 個月</span>
                      <span className="xs muted right">佔 {(r.share * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                  <div className="row-flex" style={{ justifyContent: 'space-between', padding: '12px 0 4px' }}>
                    <span className="small muted">{result.length} 張合約合計</span>
                    <b style={{ fontWeight: 700 }}>{money(result.reduce((t, r) => t + r.amount, 0))}</b>
                  </div>
                  <button type="button" className="btn btn-out btn-block" style={{ marginTop: 10 }} onClick={async () => toast((await copyText(text)) ? '已複製，可以貼到 LINE' : '複製失敗，請長按文字自行複製')}>
                    複製結果貼到 LINE
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
};
