import { describe, expect, it } from 'vitest';
import {
  board, boardYM, endDate, eventsOf, extraDividend, forecast, monthByScope, payable, redemptionQuote, salesStatement,
  statusOf, tierPct, ymLabel, ymOf, effectiveDate, maturityYM
} from './engine';
import { addSales, createContract, emptyLedger, migrate, pay, redeem, setIntent, transferSales, unpay } from './actions';
import type { Ledger, Project } from './types';

const T = (l: Ledger) => l; // 型別小幫手
const base = (): Ledger => {
  let l = emptyLedger();
  // 測試用：新事業改季配 3%、級距 100 萬以上 3%
  const p0 = l.settings.projects[0];
  const p: Project = { ...p0, pct: 3, tiers: [{ min: 0, pct: 2 }, { min: 1000000, pct: 3 }] };
  l = { ...l, settings: { ...l.settings, projects: [p, ...l.settings.projects.slice(1)] } };
  l = addSales(l, '蔡宗翰');
  l = addSales(l, '郭雅婷');
  return T(l);
};
const mk = (l: Ledger, over: Partial<{ client: string; principal: number; depositDate: string; projectId: string; bonusPct: number; salesId: string }> = {}) =>
  createContract(l, {
    client: over.client ?? '王小明',
    salesId: over.salesId ?? l.sales[0].id,
    principal: over.principal ?? 2000000,
    depositDate: over.depositDate ?? '2026-01-20',
    projectId: over.projectId ?? 'pj-new',
    bonusPct: over.bonusPct
  });

describe('新事業：隔月 1 日生效、一年期、季配', () => {
  it('1/20 入金 → 2/1 生效、隔年 1/31 到期', () => {
    const { contract } = mk(base());
    expect(contract.effDate).toBe('2026-02-01');
    expect(endDate(contract)).toBe('2027-01-31');
    expect(contract.code).toBe('C2602-01');
    expect(contract.bonusPct).toBe(3);
  });
  it('季配：5、8、11、隔年 2 月首週發放', () => {
    const { ledger, contract } = mk(base());
    const divs = eventsOf(contract, ledger).filter((e) => e.kind === 'div');
    expect(divs.map((e) => ymLabel(e.ym))).toEqual(['2026/05', '2026/08', '2026/11', '2027/02']);
    expect(divs[0].amount).toBe(60000);
  });
  it('獎金開始一半、到期一半，奇數差額算在到期', () => {
    const { ledger, contract } = mk(base(), { principal: 1000001 });
    const evs = eventsOf(contract, ledger);
    const head = evs.find((e) => e.kind === 'head')!;
    const tail = evs.find((e) => e.kind === 'tail')!;
    expect(ymLabel(head.ym)).toBe('2026/02');
    expect(ymLabel(tail.ym)).toBe('2027/02');
    expect(head.amount + tail.amount).toBe(30000);
  });
});

describe('私募：最近週三生效、月配、獎金開始時全額', () => {
  it('週三入金當天生效，其他日子取下一個週三', () => {
    expect(effectiveDate('2026-11-25', 'wednesday')).toBe('2026-11-25'); // 週三
    expect(effectiveDate('2026-11-26', 'wednesday')).toBe('2026-12-02'); // 週四
    expect(effectiveDate('2026-11-24', 'wednesday')).toBe('2026-11-25'); // 週二
  });
  it('私募半年：6 期月配 1.2%，每期滿後隔月首週發，到期後退本', () => {
    const r = mk(base(), { projectId: 'pj-pe6', principal: 1000000, depositDate: '2026-11-26' });
    const c = r.contract;
    expect(c.effDate).toBe('2026-12-02');
    expect(endDate(c)).toBe('2027-06-01');
    const evs = eventsOf(c, r.ledger);
    const divs = evs.filter((e) => e.kind === 'div');
    expect(divs).toHaveLength(6);
    expect(divs[0].amount).toBe(12000);
    // 第 1 期 12/2～1/1 → 2 月首週
    expect(divs.map((e) => ymLabel(e.ym))).toEqual(['2027/02', '2027/03', '2027/04', '2027/05', '2027/06', '2027/07']);
    expect(ymLabel(maturityYM(c))).toBe('2027/07');
    const head = evs.find((e) => e.kind === 'head')!;
    expect(head.amount).toBe(20000);
    expect(ymLabel(head.ym)).toBe('2026/12');
    expect(evs.some((e) => e.kind === 'tail')).toBe(false);
  });
  it('生效日在 8 日以後，開始獎金排在隔月首週', () => {
    const r = mk(base(), { projectId: 'pj-pe12', principal: 1000000, depositDate: '2026-11-19' });
    expect(r.contract.effDate).toBe('2026-11-25');
    expect(ymLabel(eventsOf(r.contract, r.ledger).find((e) => e.kind === 'head')!.ym)).toBe('2026/12');
    expect(eventsOf(r.contract, r.ledger).filter((e) => e.kind === 'div')).toHaveLength(12);
  });
  it('到期後發放：獎金全額排在到期月', () => {
    let l = base();
    l = { ...l, settings: { ...l.settings, projects: l.settings.projects.map((p) => (p.id === 'pj-pe6' ? { ...p, bonusSchedule: 'end' as const } : p)) } };
    const r = mk(l, { projectId: 'pj-pe6', principal: 1000000, depositDate: '2026-11-25' });
    const evs = eventsOf(r.contract, r.ledger);
    expect(evs.some((e) => e.kind === 'head')).toBe(false);
    expect(evs.find((e) => e.kind === 'tail')!.amount).toBe(20000);
  });
});

describe('到期意願與續約', () => {
  it('未確認：本金列入應備，且最後一期不可核銷', () => {
    const { ledger, contract } = mk(base());
    const evs = eventsOf(contract, ledger);
    const final = evs.find((e) => e.final && e.kind === 'div')!;
    expect(final.blocked).toBe(true);
    expect(evs.find((e) => e.kind === 'ret_unk')!.amount).toBe(2000000);
    expect(payable(final, ledger, '2027-02-03')).toBe(false);
  });
  it('新事業續存：核銷最後一期時建立隔年同月 1 日新約', () => {
    let { ledger, contract } = mk(base());
    ledger = setIntent(ledger, contract.id, 'renew');
    const evs = eventsOf(ledger.contracts[0], ledger);
    expect(evs.find((e) => e.kind === 'head_proj')!.amount).toBe(30000);
    const final = evs.find((e) => e.final && e.kind === 'div')!;
    const r = pay(ledger, '2027-02-03', { eventId: final.id, paidOn: '2027-02-03' });
    expect(r.renewed!.code).toBe('C2702-01');
    expect(r.renewed!.effDate).toBe('2027-02-01');
    const feb = board(r.ledger, '2027-02-03');
    expect(feb.tail).toBe(30000);
    expect(feb.head).toBe(30000);
    expect(setIntent(r.ledger, contract.id, 'close')).toBe(r.ledger);
    expect(unpay(r.ledger, final.id)).toBe(r.ledger);
  });
  it('私募續存：新約從到期隔天起最近的週三生效', () => {
    let { ledger, contract } = mk(base(), { projectId: 'pj-pe6', depositDate: '2026-11-25' });
    ledger = setIntent(ledger, contract.id, 'renew');
    const final = eventsOf(ledger.contracts[0], ledger).find((e) => e.final && e.kind === 'div')!;
    const r = pay(ledger, '2027-06-03', { eventId: final.id, paidOn: '2027-06-03' });
    // 11/25 生效 → 5/24 到期 → 5/25 起最近週三 = 5/26
    expect(r.renewed!.effDate).toBe('2027-05-26');
  });
});

describe('離職移轉與提前贖回', () => {
  it('移轉後未發獎金歸新業務、已發獎金仍歸原業務', () => {
    let { ledger, contract } = mk(base());
    ledger = pay(ledger, '2026-02-03', { eventId: `${contract.id}:head`, paidOn: '2026-02-03' }).ledger;
    const [a, b] = ledger.sales;
    ledger = transferSales(ledger, a.id, b.id, '2026-06-10').ledger;
    expect(ledger.contracts[0].salesId).toBe(b.id);
    expect(ledger.payments[`${contract.id}:head`].salesId).toBe(a.id);
    expect(salesStatement(ledger, '2027-02-03', b.id).bonus.map((e) => e.kind)).toEqual(['tail']);
  });
  it('提前贖回：當期紅利只算已持有月數、作廢未發獎金、記錄應追回', () => {
    let { ledger, contract } = mk(base());
    ledger = pay(ledger, '2026-02-03', { eventId: `${contract.id}:head`, paidOn: '2026-02-03' }).ledger;
    ledger = pay(ledger, '2026-05-03', { eventId: `${contract.id}:div:1`, paidOn: '2026-05-03' }).ledger;
    const q = redemptionQuote(ledger.contracts[0], ledger, '2026-07-15', ledger.settings);
    expect(q.heldMonths).toBe(2);
    expect(q.proRataDiv).toBe(40000);
    expect(q.refund).toBe(1800000);
    expect(q.clawback).toBe(30000);
    expect(q.voidedTail).toBe(30000);
    ledger = redeem(ledger, contract.id, '2026-07-15');
    const evs = eventsOf(ledger.contracts[0], ledger);
    expect(evs.map((e) => e.kind).sort()).toEqual(['div', 'head', 'rdiv', 'rret']);
    expect(evs.find((e) => e.kind === 'rret')!.ym).toBe(ymOf('2026-08-01'));
    expect(statusOf(ledger.contracts[0], ledger, '2026-07-20')).toBe('redeeming');
  });
});

describe('額外分紅與依專案看資金', () => {
  it('積數法：總和等於分紅池，可只算單一專案', () => {
    let l = base();
    l = mk(l, { principal: 1000000, depositDate: '2026-01-10' }).ledger;
    l = mk(l, { client: 'B', principal: 2000000, depositDate: '2026-04-10' }).ledger;
    l = mk(l, { client: 'C', principal: 5000000, depositDate: '2025-01-10' }).ledger;
    l = mk(l, { client: 'D', principal: 3000000, depositDate: '2026-03-04', projectId: 'pj-pe12' }).ledger;
    const r = extraDividend(l, '2026-06-20', 100001, ymOf('2026-01-01'), ymOf('2026-06-01'), { kind: 'proj', id: 'pj-new' });
    expect(r).toHaveLength(2);
    expect(r.reduce((t, x) => t + x.amount, 0)).toBe(100001);
    expect(r[0].amount).toBe(55556);
    expect(extraDividend(l, '2026-06-20', 1000, ymOf('2026-01-01'), ymOf('2026-06-01'))).toHaveLength(3);
  });
  it('同一個月可依類別、專案拆開，合計等於全部', () => {
    let l = base();
    l = mk(l, { depositDate: '2026-10-20' }).ledger; // 新事業 11/1 生效 → 12 月沒有款項
    l = mk(l, { client: 'P1', principal: 1000000, depositDate: '2026-10-28', projectId: 'pj-pe6' }).ledger; // 10/28 生效、11/27 滿第 1 期 → 12 月首週發
    l = mk(l, { client: 'P2', principal: 2000000, depositDate: '2026-12-02', projectId: 'pj-pe12' }).ledger; // 12/2 生效 → 12 月開始獎金
    const ym = ymOf('2026-12-01');
    const rows = monthByScope(l, ym);
    const pe = rows.find((r) => r.label === '私募')!;
    expect(pe.totals.div).toBe(12000);
    expect(pe.totals.head).toBe(40000);
    const all = board(l, '2026-12-03');
    expect(rows.filter((r) => r.level === 'cat').reduce((t, r) => t + r.totals.total, 0)).toBe(all.total);
    expect(board(l, '2026-12-03', { kind: 'cat', v: '私募' }).total).toBe(52000);
  });
});

describe('首週看板與水位', () => {
  it('1～7 日看當月、8 日起看下月；未核銷的過去款項列逾期', () => {
    expect(ymLabel(boardYM('2026-12-07'))).toBe('2026/12');
    expect(ymLabel(boardYM('2026-12-08'))).toBe('2027/01');
    const { ledger } = mk(base());
    const b = board(ledger, '2026-05-10');
    expect(b.overdue.map((e) => e.kind)).toEqual(['head', 'div']);
  });
  it('水位表把未確認本金與續約預估獎金算進去', () => {
    const { ledger } = mk(base());
    const feb = forecast(ledger, '2026-12-20').find((m) => ymLabel(m.ym) === '2027/02')!;
    expect(feb.retUnk).toBe(2000000);
    expect(feb.div).toBe(60000);
    expect(feb.bonus).toBe(30000);
  });
  it('級距', () => {
    expect(tierPct(999999, [{ min: 0, pct: 2 }, { min: 1000000, pct: 3 }])).toBe(2);
  });
});

describe('舊版資料升級', () => {
  it('v1 合約改成專案制，核銷紀錄與排程不變', () => {
    const v1 = {
      v: 1,
      contracts: [{ id: 'a1', code: 'C2602-01', client: '王', salesId: 's1', principal: 2000000, depositDate: '2026-01-20', effYM: ymOf('2026-02-01'), plan: { name: '季配', months: 3, pct: 3 }, bonusPct: 3, intent: 'unk', createdAt: '' }],
      sales: [{ id: 's1', name: '蔡', active: true }],
      payments: { 'a1:head': { eventId: 'a1:head', paidOn: '2026-02-03', amount: 30000, at: '' } },
      settings: { plans: [], tiers: [{ min: 0, pct: 3 }], refundPct: 85 },
      audit: []
    };
    const l = migrate(v1)!;
    expect(l.v).toBe(2);
    expect(l.settings.refundPct).toBe(85);
    const c = l.contracts[0];
    expect(c.effDate).toBe('2026-02-01');
    const evs = eventsOf(c, l);
    expect(evs.find((e) => e.kind === 'head')!.amount).toBe(30000);
    expect(evs.filter((e) => e.kind === 'div').map((e) => ymLabel(e.ym))).toEqual(['2026/05', '2026/08', '2026/11', '2027/02']);
    expect(l.settings.projects.some((p) => p.archived && p.pct === 3)).toBe(true);
    expect(migrate({ foo: 1 })).toBeNull();
  });
});
