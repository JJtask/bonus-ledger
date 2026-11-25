import { describe, expect, it } from 'vitest';
import {
  board, endDate, eventsOf, extraDividend, forecast, isOverdue, monthByScope, payable, redemptionQuote, salesStatement,
  statusOf, tierPct, ymLabel, ymOf, effectiveDate, maturityDue
} from './engine';
import { addSales, createContract, emptyLedger, migrate, pay, redeem, setIntent, transferSales, unpay } from './actions';
import type { Ledger, Project } from './types';

/** 測試用「舊制」專案：隔月 1 日生效、季配 3%、期滿後隔月首週發 */
const FW: Project = {
  id: 'pj-fw', name: '舊制季配', category: '新事業', effRule: 'nextMonth1', payRule: 'firstWeek', termMonths: 12, periodMonths: 3, pct: 3,
  tiers: [{ min: 0, pct: 2 }, { min: 1000000, pct: 3 }], bonusPlan: [{ at: 'start', pct: 1 }, { at: 'maturity', pct: 1 }]
};
const base = (extra: Project[] = []): Ledger => {
  let l = emptyLedger();
  l = { ...l, settings: { ...l.settings, projects: [...l.settings.projects, FW, ...extra] } };
  l = addSales(l, '蔡宗翰');
  l = addSales(l, '郭雅婷');
  return l;
};
const mk = (l: Ledger, over: Partial<{ client: string; principal: number; depositDate: string; projectId: string; bonusPct: number; salesId: string }> = {}) =>
  createContract(l, {
    client: over.client ?? '王小明',
    salesId: over.salesId ?? l.sales[0].id,
    principal: over.principal ?? 2000000,
    depositDate: over.depositDate ?? '2026-01-20',
    projectId: over.projectId ?? 'pj-fw',
    bonusPct: over.bonusPct
  });
const hid = (l: Ledger, c: { id: string }) => eventsOf(l.contracts.find((x) => x.id === c.id)!, l).find((e) => e.kind === 'head')!.id;
const dues = (l: Ledger, id: string, kind: string) => eventsOf(l.contracts.find((c) => c.id === id)!, l).filter((e) => e.kind === kind).map((e) => e.due);

describe('生效日規則', () => {
  it('最近的週三：週三入帳當天生效，可設定改成取下週', () => {
    const r = { effRule: 'weekday' as const, effWeekday: 3, effSameDay: true, payRule: 'anniversary' as const };
    expect(effectiveDate('2026-11-25', r)).toBe('2026-11-25');
    expect(effectiveDate('2026-11-26', r)).toBe('2026-12-02');
    expect(effectiveDate('2026-11-25', { ...r, effSameDay: false })).toBe('2026-12-02');
  });
  it('T+14 日曆天，遇週末順延', () => {
    const r = { effRule: 'tplus' as const, effDays: 14, effDayUnit: 'calendar' as const, payRule: 'anniversary' as const };
    expect(effectiveDate('2026-12-03', r)).toBe('2026-12-17');
    expect(effectiveDate('2026-12-05', r)).toBe('2026-12-21');
  });
  it('T+14 工作天，只算週一到週五', () => {
    expect(effectiveDate('2026-12-03', { effRule: 'tplus', effDays: 14, effDayUnit: 'business', payRule: 'anniversary' })).toBe('2026-12-23');
  });
  it('入帳隔月 1 日', () => {
    expect(effectiveDate('2026-01-20', { effRule: 'nextMonth1', payRule: 'firstWeek' })).toBe('2026-02-01');
  });
});

describe('新事業預設：T+14、每三個月同一天發', () => {
  it('12/3 入帳 → 12/17 生效，3/17、6/17、9/17、12/17 發，到期當天退本與到期獎金', () => {
    let { ledger, contract } = mk(base(), { projectId: 'pj-new', depositDate: '2026-12-03', principal: 1000000 });
    expect(contract.effDate).toBe('2026-12-17');
    expect(endDate(contract)).toBe('2027-12-16');
    expect(dues(ledger, contract.id, 'div')).toEqual(['2027-03-17', '2027-06-17', '2027-09-17', '2027-12-17']);
    expect(eventsOf(contract, ledger).find((e) => e.kind === 'div')!.amount).toBe(20000);
    expect(dues(ledger, contract.id, 'head')).toEqual(['2026-12-17']);
    expect(dues(ledger, contract.id, 'tail')).toEqual(['2027-12-17']);
    ledger = setIntent(ledger, contract.id, 'close');
    expect(dues(ledger, contract.id, 'ret')).toEqual(['2027-12-17']);
  });
  it('續存：新約從到期隔天生效，發放日一樣是每三個月同一天', () => {
    let { ledger, contract } = mk(base(), { projectId: 'pj-new', depositDate: '2026-12-03' });
    ledger = setIntent(ledger, contract.id, 'renew');
    const final = eventsOf(ledger.contracts[0], ledger).find((e) => e.final && e.kind === 'div')!;
    const r = pay(ledger, '2027-12-17', { eventId: final.id, paidOn: '2027-12-17' });
    expect(r.renewed!.effDate).toBe('2027-12-17');
    expect(dues(r.ledger, r.renewed!.id, 'div')[0]).toBe('2028-03-17');
  });
});

describe('私募預設：最近週三、隔月同日發', () => {
  it('私募半年：6 期，遇週末順延到週一，最後一期與退本同一天', () => {
    const r = mk(base(), { projectId: 'pj-pe6', principal: 1000000, depositDate: '2026-11-26' });
    expect(r.contract.effDate).toBe('2026-12-02');
    expect(dues(r.ledger, r.contract.id, 'div')).toEqual(['2027-01-04', '2027-02-02', '2027-03-02', '2027-04-02', '2027-05-03', '2027-06-02']);
    expect(eventsOf(r.contract, r.ledger).find((e) => e.kind === 'div')!.amount).toBe(12000);
    expect(dues(r.ledger, r.contract.id, 'head')).toEqual(['2026-12-02']);
    expect(maturityDue(r.contract)).toBe('2027-06-02');
    expect(dues(r.ledger, r.contract.id, 'ret_unk')).toEqual(['2027-06-02']);
    const l2 = setIntent(r.ledger, r.contract.id, 'renew');
    const final = eventsOf(l2.contracts[0], l2).find((e) => e.final && e.kind === 'div')!;
    const rn = pay(l2, '2027-06-02', { eventId: final.id, paidOn: '2027-06-02' });
    expect(rn.renewed!.effDate).toBe('2027-06-02');
  });
  it('月底生效：下個月沒有那一天時取月底，再遇週末順延', () => {
    const P: Project = { ...FW, id: 'pj-x', effRule: 'tplus', effDays: 0, effDayUnit: 'calendar', payRule: 'anniversary', periodMonths: 1, termMonths: 3, pct: 1 };
    const r = mk(base([P]), { projectId: 'pj-x', depositDate: '2027-01-29' });
    expect(dues(r.ledger, r.contract.id, 'div')).toEqual(['2027-03-01', '2027-03-29', '2027-04-29']);
  });
  it('每月固定日：期滿後的每月 10 日', () => {
    const P: Project = { ...FW, id: 'pj-y', effRule: 'tplus', effDays: 14, effDayUnit: 'calendar', payRule: 'fixedDay', payDay: 10, periodMonths: 1, termMonths: 3 };
    const r = mk(base([P]), { projectId: 'pj-y', depositDate: '2026-12-03' });
    expect(dues(r.ledger, r.contract.id, 'div')).toEqual(['2027-02-10', '2027-03-10', '2027-04-12']);
  });
});

describe('舊制（期滿後隔月首週）維持不變', () => {
  it('1/20 入帳 → 2/1 生效，5、8、11、2 月首週發', () => {
    const { ledger, contract } = mk(base());
    expect(contract.code).toBe('C2602-01');
    expect(dues(ledger, contract.id, 'div')).toEqual(['2026-05-01', '2026-08-01', '2026-11-01', '2027-02-01']);
    const evs = eventsOf(contract, ledger);
    expect(evs.every((e) => e.week)).toBe(true);
    expect(evs.find((e) => e.kind === 'head')!.amount + evs.find((e) => e.kind === 'tail')!.amount).toBe(60000);
  });
  it('未確認：本金列入應備，最後一期不可核銷；續存時建立隔年同月 1 日新約', () => {
    let { ledger, contract } = mk(base());
    const final0 = eventsOf(contract, ledger).find((e) => e.final && e.kind === 'div')!;
    expect(final0.blocked).toBe(true);
    expect(payable(final0, ledger, '2027-02-03')).toBe(false);
    ledger = setIntent(ledger, contract.id, 'renew');
    const final = eventsOf(ledger.contracts[0], ledger).find((e) => e.final && e.kind === 'div')!;
    const r = pay(ledger, '2027-02-03', { eventId: final.id, paidOn: '2027-02-03' });
    expect(r.renewed!.effDate).toBe('2027-02-01');
    const feb = board(r.ledger, '2027-02-03');
    expect(feb.tail).toBe(30000);
    expect(feb.head).toBe(30000);
    expect(setIntent(r.ledger, contract.id, 'close')).toBe(r.ledger);
    expect(unpay(r.ledger, final.id)).toBe(r.ledger);
  });
});

describe('逾期與核銷時機', () => {
  it('同日制：過了應發日就逾期；應發日前 7 天起可以先核銷', () => {
    const r = mk(base(), { projectId: 'pj-pe12', principal: 1000000, depositDate: '2026-11-25' });
    const div1 = eventsOf(r.contract, r.ledger).find((e) => e.kind === 'div')!;
    expect(div1.due).toBe('2026-12-25');
    expect(payable(div1, r.ledger, '2026-12-17')).toBe(false);
    expect(payable(div1, r.ledger, '2026-12-18')).toBe(true);
    expect(isOverdue(div1, r.ledger, '2026-12-25')).toBe(false);
    expect(isOverdue(div1, r.ledger, '2026-12-26')).toBe(true);
    const jan = board(r.ledger, '2027-01-05');
    expect(jan.overdue.map((e) => e.kind)).toEqual(['head', 'div']);
  });
  it('首週制：7 日之後才算逾期', () => {
    const { ledger, contract } = mk(base());
    const head = eventsOf(contract, ledger).find((e) => e.kind === 'head')!;
    expect(isOverdue(head, ledger, '2026-02-07')).toBe(false);
    expect(isOverdue(head, ledger, '2026-02-08')).toBe(true);
  });
});

describe('離職移轉與提前贖回', () => {
  it('移轉後未發獎金歸新業務、已發獎金仍歸原業務', () => {
    let { ledger, contract } = mk(base());
    ledger = pay(ledger, '2026-02-03', { eventId: hid(ledger, contract), paidOn: '2026-02-03' }).ledger;
    const [a, b] = ledger.sales;
    ledger = transferSales(ledger, a.id, b.id, '2026-06-10').ledger;
    expect(ledger.payments[hid(ledger, contract)].salesId).toBe(a.id);
    expect(salesStatement(ledger, '2027-02-03', b.id).bonus.map((e) => e.kind)).toEqual(['tail']);
  });
  it('首週制贖回：持有月數比例、隔月首週發', () => {
    let { ledger, contract } = mk(base());
    ledger = pay(ledger, '2026-02-03', { eventId: hid(ledger, contract), paidOn: '2026-02-03' }).ledger;
    ledger = pay(ledger, '2026-05-03', { eventId: `${contract.id}:div:1`, paidOn: '2026-05-03' }).ledger;
    const q = redemptionQuote(ledger.contracts[0], ledger, '2026-07-15', ledger.settings);
    expect(q.heldMonths).toBe(2);
    expect(q.proRataDiv).toBe(40000);
    expect(q.refund).toBe(1800000);
    expect(q.clawback).toBe(30000);
    expect(q.payDate).toBe('2026-08-01');
    ledger = redeem(ledger, contract.id, '2026-07-15');
    expect(eventsOf(ledger.contracts[0], ledger).map((e) => e.kind).sort()).toEqual(['div', 'head', 'rdiv', 'rret']);
    expect(statusOf(ledger.contracts[0], ledger, '2026-07-20')).toBe('redeeming');
  });
  it('同日制贖回：退本排在原本下一次的發放日', () => {
    const r = mk(base(), { projectId: 'pj-pe12', principal: 1000000, depositDate: '2026-11-25' });
    const q = redemptionQuote(r.contract, r.ledger, '2027-02-10', r.ledger.settings);
    expect(q.heldMonths).toBe(0);
    expect(q.payDate).toBe('2027-02-25');
  });
});

describe('額外分紅與依專案看資金', () => {
  it('積數法：總和等於分紅池，可只算單一專案', () => {
    let l = base();
    l = mk(l, { principal: 1000000, depositDate: '2026-01-10' }).ledger;
    l = mk(l, { client: 'B', principal: 2000000, depositDate: '2026-04-10' }).ledger;
    l = mk(l, { client: 'C', principal: 5000000, depositDate: '2025-01-10' }).ledger;
    l = mk(l, { client: 'D', principal: 3000000, depositDate: '2026-03-04', projectId: 'pj-pe12' }).ledger;
    const r = extraDividend(l, '2026-06-20', 100001, ymOf('2026-01-01'), ymOf('2026-06-01'), { kind: 'proj', id: 'pj-fw' });
    expect(r).toHaveLength(2);
    expect(r.reduce((t, x) => t + x.amount, 0)).toBe(100001);
    expect(r[0].amount).toBe(55556);
  });
  it('同一個月依類別、專案拆開，合計等於全部', () => {
    let l = base();
    l = mk(l, { client: 'N', principal: 1000000, depositDate: '2026-12-03', projectId: 'pj-new' }).ledger;
    l = mk(l, { client: 'P1', principal: 1000000, depositDate: '2026-11-25', projectId: 'pj-pe6' }).ledger;
    l = mk(l, { client: 'P2', principal: 2000000, depositDate: '2026-12-02', projectId: 'pj-pe12' }).ledger;
    const rows = monthByScope(l, ymOf('2026-12-01'));
    expect(rows.find((r) => r.label === '私募')!.totals.div).toBe(12000);
    expect(rows.find((r) => r.label === '私募')!.totals.head).toBe(40000);
    const all = board(l, '2026-12-03');
    expect(rows.filter((r) => r.level === 'cat').reduce((t, r) => t + r.totals.total, 0)).toBe(all.total);
    expect(board(l, '2026-12-03', { kind: 'cat', v: '私募' }).total).toBe(52000);
    expect(ymLabel(board(l, '2026-12-03', undefined, ymOf('2027-01-01')).ym)).toBe('2027/01');
  });
  it('水位表從本月開始，把未確認本金與續約預估獎金算進去', () => {
    const { ledger } = mk(base());
    const f = forecast(ledger, '2026-12-20');
    expect(ymLabel(f[0].ym)).toBe('2026/12');
    const feb = f.find((m) => ymLabel(m.ym) === '2027/02')!;
    expect(feb.retUnk).toBe(2000000);
    expect(feb.div).toBe(60000);
    expect(tierPct(999999, FW.tiers)).toBe(2);
  });
});

describe('舊版資料升級', () => {
  it('v1 → 專案制，發放日維持首週', () => {
    const v1 = {
      v: 1,
      contracts: [{ id: 'a1', code: 'C2602-01', client: '王', salesId: 's1', principal: 2000000, depositDate: '2026-01-20', effYM: ymOf('2026-02-01'), plan: { name: '季配', months: 3, pct: 3 }, bonusPct: 3, intent: 'unk', createdAt: '' }],
      sales: [{ id: 's1', name: '蔡', active: true }],
      payments: { 'a1:head': { eventId: 'a1:head', paidOn: '2026-02-03', amount: 30000, at: '' } },
      settings: { plans: [], tiers: [{ min: 0, pct: 3 }], refundPct: 85 },
      audit: []
    };
    const l = migrate(v1)!;
    expect(l.settings.refundPct).toBe(85);
    expect(dues(l, 'a1', 'div')).toEqual(['2026-05-01', '2026-08-01', '2026-11-01', '2027-02-01']);
    expect(migrate({ foo: 1 })).toBeNull();
  });
  it('上一版（週三、首週）資料：舊合約維持首週發放；預設專案換成新規則', () => {
    const old = {
      v: 2, sales: [], payments: {}, audit: [],
      settings: { refundPct: 90, projects: [
        { id: 'pj-new', name: '新事業', category: '新事業', effRule: 'nextMonth1', termMonths: 12, periodMonths: 3, pct: 2, tiers: [{ min: 0, pct: 2 }], bonusSchedule: 'split' },
        { id: 'pj-pe6', name: '私募半年', category: '私募', effRule: 'wednesday', termMonths: 6, periodMonths: 1, pct: 1.2, tiers: [{ min: 0, pct: 2 }], bonusSchedule: 'start' }
      ] },
      contracts: [{ id: 'c1', code: 'C2611-01', client: '甲', salesId: 's', principal: 1000000, depositDate: '2026-11-26', effDate: '2026-11-25', effYM: ymOf('2026-11-01'), bonusPct: 2, intent: 'unk', createdAt: '',
        terms: { projectId: 'pj-pe6', projectName: '私募半年', category: '私募', effRule: 'wednesday', termMonths: 6, periodMonths: 1, pct: 1.2, bonusSchedule: 'start' } }]
    };
    const l = migrate(old)!;
    expect(l.settings.projects.find((p) => p.id === 'pj-new')!.effRule).toBe('tplus');
    expect(l.settings.projects.find((p) => p.id === 'pj-pe6')!.payRule).toBe('anniversary');
    expect(l.settings.projects.find((p) => p.id === 'pj-pe6')!.effWeekday).toBe(3);
    expect(l.contracts[0].terms.payRule).toBe('firstWeek');
    expect(dues(l, 'c1', 'div')[0]).toBe('2027-01-01');
    expect(migrate(l)).toBe(l);
  });
});

describe('業務獎金自訂分次發放', () => {
  it('新事業預設：開始時 1%、第 12 個月 1%', () => {
    const r = mk(base(), { projectId: 'pj-new', depositDate: '2026-12-03', principal: 1000000 });
    const b = eventsOf(r.contract, r.ledger).filter((e) => e.track === 'bonus');
    expect(b.map((e) => [e.due, e.amount, e.bonusNote])).toEqual([['2026-12-17', 10000, '開始時 1%'], ['2027-12-17', 10000, '第 12 個月 1%']]);
  });
  it('三次發放：開始 0.5%、第 6 個月 1%、到期 0.5%；級距放大時按比例分配', () => {
    const P: Project = { ...FW, id: 'pj-z', effRule: 'tplus', effDays: 14, effDayUnit: 'calendar', payRule: 'anniversary',
      tiers: [{ min: 0, pct: 2 }, { min: 3000000, pct: 3 }], bonusPlan: [{ at: 'start', pct: 0.5 }, { at: 'month', months: 6, pct: 1 }, { at: 'maturity', pct: 0.5 }] };
    const a = mk(base([P]), { projectId: 'pj-z', depositDate: '2026-12-03', principal: 1000000 });
    expect(eventsOf(a.contract, a.ledger).filter((e) => e.track === 'bonus').map((e) => [e.due, e.amount])).toEqual([['2026-12-17', 5000], ['2027-06-17', 10000], ['2027-12-17', 5000]]);
    const big = mk(base([P]), { projectId: 'pj-z', depositDate: '2026-12-03', principal: 3000000 });
    const bb = eventsOf(big.contract, big.ledger).filter((e) => e.track === 'bonus');
    expect(bb.map((e) => e.amount)).toEqual([22500, 45000, 22500]);
    expect(bb[1].bonusNote).toBe('第 6 個月 1.5%');
  });
  it('贖回：已發的獎金記為應追回，還沒發的作廢', () => {
    let r = mk(base(), { projectId: 'pj-new', depositDate: '2026-12-03', principal: 1000000 });
    let l = pay(r.ledger, '2026-12-17', { eventId: hid(r.ledger, r.contract), paidOn: '2026-12-17' }).ledger;
    const q = redemptionQuote(l.contracts[0], l, '2027-05-01', l.settings);
    expect(q.clawback).toBe(10000);
    expect(q.voidedTail).toBe(10000);
    l = redeem(l, r.contract.id, '2027-05-01');
    expect(eventsOf(l.contracts[0], l).filter((e) => e.track === 'bonus')).toHaveLength(1);
    r = r;
  });
  it('舊專案升級：發放方式換成分次發放，舊合約的獎金與核銷不變', () => {
    const old = {
      v: 2, sales: [], audit: [],
      payments: { 'c1:head': { eventId: 'c1:head', paidOn: '2026-12-01', amount: 10000, at: '' } },
      settings: { refundPct: 90, projects: [{ id: 'pj-q', name: 'Q', category: '新事業', effRule: 'nextMonth1', payRule: 'firstWeek', termMonths: 12, periodMonths: 3, pct: 2, tiers: [{ min: 0, pct: 2 }], bonusSchedule: 'split' }] },
      contracts: [{ id: 'c1', code: 'C2612-01', client: '甲', salesId: 's', principal: 1000000, depositDate: '2026-11-10', effDate: '2026-12-01', effYM: ymOf('2026-12-01'), bonusPct: 2, intent: 'unk', createdAt: '',
        terms: { projectId: 'pj-q', projectName: 'Q', category: '新事業', effRule: 'nextMonth1', payRule: 'firstWeek', termMonths: 12, periodMonths: 3, pct: 2, bonusSchedule: 'split' } }]
    };
    const l = migrate(old)!;
    expect(l.settings.projects[0].bonusPlan).toEqual([{ at: 'start', pct: 1 }, { at: 'maturity', pct: 1 }]);
    const b = eventsOf(l.contracts[0], l).filter((e) => e.track === 'bonus');
    expect(b.map((e) => e.id)).toEqual(['c1:head', 'c1:tail']);
    expect(l.payments['c1:head']).toBeTruthy();
  });
});
