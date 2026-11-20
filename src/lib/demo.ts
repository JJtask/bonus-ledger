import { addSales, createContract, emptyLedger, pay, setIntent } from '../engine/actions';
import { addDays, allEvents, boardYM, dateOf, weekdayOf } from '../engine/engine';
import type { Intent, Ledger } from '../engine/types';

/** 示範資料：以「今天」為基準產生，隨時打開都看得到首週款項 */
export const demoLedger = (today: string): Ledger => {
  let l = emptyLedger();
  for (const n of ['蔡宗翰', '郭雅婷', '林志明']) l = addSales(l, n);
  const [s1, s2, s3] = l.sales.map((s) => s.id);
  const base = boardYM(today);
  // 新事業：以月份位移；私募：以週三入金的日期
  const wed = (ym: number, day: number) => {
    const d = dateOf(ym, day);
    return addDays(d, (3 - weekdayOf(d) + 7) % 7);
  };
  const rows: [string, string, number, string, string, Intent?][] = [
    ['陳美華', s2, 2000000, 'pj-new', dateOf(base - 13, 15), 'close'],
    ['林志豪', s3, 500000, 'pj-new', dateOf(base - 13, 18)],
    ['吳家豪', s1, 1200000, 'pj-new', dateOf(base - 13, 20), 'renew'],
    ['周佩君', s2, 800000, 'pj-new', dateOf(base - 12, 10)],
    ['黃淑芬', s1, 3000000, 'pj-new', dateOf(base - 10, 12)],
    ['張大同', s2, 1500000, 'pj-new', dateOf(base - 7, 8)],
    ['王小明', s1, 2000000, 'pj-new', dateOf(base - 4, 22)],
    ['鄭雅文', s3, 2500000, 'pj-new', dateOf(base - 2, 5)],
    ['許文彥', s3, 600000, 'pj-pe6', wed(base - 6, 10)],
    ['李建國', s2, 1000000, 'pj-pe6', wed(base - 3, 2)],
    ['劉怡君', s1, 1500000, 'pj-pe12', wed(base - 8, 14)],
    ['何俊賢', s3, 3000000, 'pj-pe12', wed(base - 2, 20)],
    ['蘇美玲', s2, 2000000, 'pj-pe12', wed(base - 1, 3)]
  ];
  for (const [client, salesId, principal, projectId, depositDate, intent] of rows) {
    const r = createContract(l, { client, salesId, principal, projectId, depositDate });
    l = r.ledger;
    if (intent) l = setIntent(l, r.contract.id, intent);
  }
  for (const e of allEvents(l)) {
    if (e.ym < base && !e.projected && !e.blocked) l = pay(l, today, { eventId: e.id, paidOn: dateOf(e.ym, 3) }).ledger;
  }
  return { ...l, audit: [...l.audit, { at: new Date().toISOString(), action: '載入示範資料', detail: '13 張示範合約（新事業 8、私募 5）、3 位業務' }] };
};
