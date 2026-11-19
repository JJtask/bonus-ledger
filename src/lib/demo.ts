import { addSales, createContract, emptyLedger, pay, setIntent } from '../engine/actions';
import { allEvents, boardYM, dateOf, defaultSettings } from '../engine/engine';
import type { Intent, Ledger } from '../engine/types';

/** 示範資料：以「今天」為基準產生，隨時打開都看得到首週款項 */
export const demoLedger = (today: string): Ledger => {
  let l = emptyLedger(defaultSettings());
  for (const n of ['蔡宗翰', '郭雅婷', '林志明']) l = addSales(l, n);
  const [s1, s2, s3] = l.sales.map((s) => s.id);
  const base = boardYM(today);
  const rows: [string, string, number, number, string, Intent?][] = [
    ['陳美華', s2, 2000000, -12, 'p-q', 'close'],
    ['林志豪', s3, 500000, -12, 'p-q'],
    ['吳家豪', s1, 1200000, -12, 'p-q', 'renew'],
    ['周佩君', s2, 800000, -11, 'p-q'],
    ['王建民', s3, 1500000, -10, 'p-h'],
    ['黃淑芬', s1, 3000000, -9, 'p-q'],
    ['張大同', s2, 1500000, -6, 'p-q'],
    ['許文彥', s3, 600000, -6, 'p-m'],
    ['王小明', s1, 2000000, -3, 'p-q'],
    ['李建國', s2, 1000000, -2, 'p-m'],
    ['鄭雅文', s3, 2500000, -1, 'p-q'],
    ['劉怡君', s1, 900000, 0, 'p-q']
  ];
  for (const [client, salesId, principal, off, planId, intent] of rows) {
    const eff = base + off;
    const r = createContract(l, {
      client, salesId, principal, planId,
      depositDate: dateOf(eff - 1, 15),
      bonusPct: principal >= 1000000 ? 3 : 2
    });
    l = r.ledger;
    if (intent) l = setIntent(l, r.contract.id, intent);
  }
  for (const e of allEvents(l)) {
    if (e.ym < base && !e.projected && !e.blocked) l = pay(l, today, { eventId: e.id, paidOn: dateOf(e.ym, 3) }).ledger;
  }
  l = { ...l, audit: [...l.audit, { at: new Date().toISOString(), action: '載入示範資料', detail: '12 張示範合約、3 位業務' }] };
  return l;
};
