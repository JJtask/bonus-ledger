import { describe, expect, it } from 'vitest';
import {
  board, boardYM, defaultSettings, effectiveYM, endDate, eventsOf, extraDividend, forecast, payable,
  redemptionQuote, salesStatement, statusOf, tierPct, ymLabel, ymOf
} from './engine';
import { addSales, createContract, emptyLedger, pay, redeem, setIntent, transferSales, unpay } from './actions';
import type { Ledger } from './types';

const base = (): Ledger => {
  let l = emptyLedger(defaultSettings());
  l = addSales(l, '蔡宗翰');
  l = addSales(l, '郭雅婷');
  return l;
};
const mk = (l: Ledger, over: Partial<{ client: string; principal: number; depositDate: string; planId: string; bonusPct: number; salesId: string }> = {}) =>
  createContract(l, {
    client: over.client ?? '王小明',
    salesId: over.salesId ?? l.sales[0].id,
    principal: over.principal ?? 2000000,
    depositDate: over.depositDate ?? '2026-01-20',
    planId: over.planId ?? 'p-q',
    bonusPct: over.bonusPct ?? 3
  });

describe('規則一：隔月生效、一年期', () => {
  it('1/20 入金 → 2/1 生效、隔年 1/31 到期', () => {
    const { contract } = mk(base());
    expect(ymLabel(contract.effYM)).toBe('2026/02');
    expect(endDate(contract)).toBe('2027-01-31');
    expect(contract.code).toBe('C2602-01');
  });
  it('12 月入金跨年、月初入金也是隔月生效', () => {
    expect(ymLabel(effectiveYM('2026-12-01'))).toBe('2027/01');
  });
  it('同月生效的合約編號遞增', () => {
    let l = base();
    l = mk(l).ledger;
    const { contract } = mk(l, { client: '陳美華', depositDate: '2026-01-05' });
    expect(contract.code).toBe('C2602-02');
  });
});

describe('規則二：每期滿後隔月首週發放', () => {
  it('季配：2/1 生效 → 5、8、11、隔年 2 月發放', () => {
    const { ledger, contract } = mk(base());
    const divs = eventsOf(contract, ledger).filter((e) => e.kind === 'div');
    expect(divs.map((e) => ymLabel(e.ym))).toEqual(['2026/05', '2026/08', '2026/11', '2027/02']);
    expect(divs[0].amount).toBe(60000);
  });
  it('月配 12 期、半年配 2 期', () => {
    const m = mk(base(), { planId: 'p-m' });
    expect(eventsOf(m.contract, m.ledger).filter((e) => e.kind === 'div')).toHaveLength(12);
    const h = mk(base(), { planId: 'p-h' });
    const hd = eventsOf(h.contract, h.ledger).filter((e) => e.kind === 'div');
    expect(hd.map((e) => ymLabel(e.ym))).toEqual(['2026/08', '2027/02']);
    expect(hd[0].amount).toBe(130000);
  });
});

describe('規則四：到期意願', () => {
  it('未確認：本金列入應備，且第 4 期不可核銷', () => {
    const { ledger, contract } = mk(base());
    const evs = eventsOf(contract, ledger);
    const final = evs.find((e) => e.final && e.kind === 'div')!;
    expect(final.blocked).toBe(true);
    expect(evs.find((e) => e.kind === 'ret_unk')!.amount).toBe(2000000);
    expect(payable(final, ledger, '2027-02-03')).toBe(false);
  });
  it('不續存：退本確定；續存：核銷第 4 期時自動建立隔年同月新約', () => {
    let { ledger, contract } = mk(base());
    ledger = setIntent(ledger, contract.id, 'close');
    expect(eventsOf(ledger.contracts[0], ledger).some((e) => e.kind === 'ret' && e.amount === 2000000)).toBe(true);
    ledger = setIntent(ledger, contract.id, 'renew');
    const evs = eventsOf(ledger.contracts[0], ledger);
    expect(evs.some((e) => e.kind === 'ret' || e.kind === 'ret_unk')).toBe(false);
    expect(evs.find((e) => e.kind === 'head_proj')!.amount).toBe(30000);
    const final = evs.find((e) => e.final && e.kind === 'div')!;
    const r = pay(ledger, '2027-02-03', { eventId: final.id, paidOn: '2027-02-03' });
    expect(r.renewed!.code).toBe('C2702-01');
    expect(r.renewed!.renewedFrom).toBe(contract.id);
    // 續約當月首週：舊約尾款 + 新約頭款
    const feb = board(r.ledger, '2027-02-03');
    expect(feb.tail).toBe(30000);
    expect(feb.head).toBe(30000);
    // 已建立新約後，不可再改意願、不可撤銷最後一期
    expect(setIntent(r.ledger, contract.id, 'close')).toBe(r.ledger);
    expect(unpay(r.ledger, final.id)).toBe(r.ledger);
  });
});

describe('規則五：業務獎金 50/50', () => {
  it('頭款在生效月、尾款在到期月，奇數金額尾款補差', () => {
    const { ledger, contract } = mk(base(), { principal: 1000001, bonusPct: 3 });
    const evs = eventsOf(contract, ledger);
    const head = evs.find((e) => e.kind === 'head')!;
    const tail = evs.find((e) => e.kind === 'tail')!;
    expect(ymLabel(head.ym)).toBe('2026/02');
    expect(ymLabel(tail.ym)).toBe('2027/02');
    expect(head.amount + tail.amount).toBe(30000);
  });
  it('依級距自動帶入比例', () => {
    const t = defaultSettings().tiers;
    expect(tierPct(999999, t)).toBe(2);
    expect(tierPct(1000000, t)).toBe(3);
  });
});

describe('規則六：離職移轉與提前贖回', () => {
  it('移轉後未發獎金歸新業務、已發獎金仍歸原業務', () => {
    let { ledger, contract } = mk(base());
    ledger = pay(ledger, '2026-02-03', { eventId: `${contract.id}:head`, paidOn: '2026-02-03' }).ledger;
    const [a, b] = ledger.sales;
    ledger = transferSales(ledger, a.id, b.id, '2026-06-10').ledger;
    expect(ledger.contracts[0].salesId).toBe(b.id);
    expect(ledger.payments[`${contract.id}:head`].salesId).toBe(a.id);
    expect(ledger.sales[0].active).toBe(false);
    const st = salesStatement(ledger, '2027-02-03', b.id);
    expect(st.bonus.map((e) => e.kind)).toEqual(['tail']);
  });
  it('提前贖回：當期紅利只算已持有月數、作廢尾款、記錄應追回頭款', () => {
    let { ledger, contract } = mk(base());
    ledger = pay(ledger, '2026-02-03', { eventId: `${contract.id}:head`, paidOn: '2026-02-03' }).ledger;
    ledger = pay(ledger, '2026-05-03', { eventId: `${contract.id}:div:1`, paidOn: '2026-05-03' }).ledger;
    // 2/1 生效，第 1 期 5 月已發，7/15 贖回 → 第 2 期持有 5、6 月 = 2 個月
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

describe('規則七：額外分紅積數法', () => {
  it('依本金 × 月數分配，總和等於分紅池，只算運作中', () => {
    let l = base();
    l = mk(l, { principal: 1000000, depositDate: '2026-01-10' }).ledger; // 2 月生效
    l = mk(l, { client: 'B', principal: 2000000, depositDate: '2026-04-10' }).ledger; // 5 月生效
    l = mk(l, { client: 'C', principal: 5000000, depositDate: '2025-01-10' }).ledger; // 已到期
    const r = extraDividend(l, '2026-06-20', 100001, ymOf('2026-01-01'), ymOf('2026-06-01'));
    expect(r).toHaveLength(2);
    // A: 100 萬 × 5 月 = 500 萬；B: 200 萬 × 2 月 = 400 萬
    expect(r.reduce((t, x) => t + x.amount, 0)).toBe(100001);
    expect(r[0].client).toBe('王小明');
    expect(r[0].amount).toBe(55556);
  });
});

describe('首週看板與水位', () => {
  it('1～7 日看當月、8 日起看下月；未核銷的過去款項列逾期', () => {
    expect(ymLabel(boardYM('2026-12-07'))).toBe('2026/12');
    expect(ymLabel(boardYM('2026-12-08'))).toBe('2027/01');
    const { ledger } = mk(base());
    const b = board(ledger, '2026-05-10');
    expect(b.overdue.map((e) => e.kind)).toEqual(['head', 'div']);
    expect(ymLabel(b.ym)).toBe('2026/06');
  });
  it('水位表把未確認本金與續約預估頭款算進去', () => {
    const { ledger } = mk(base());
    const f = forecast(ledger, '2026-12-20');
    const feb = f.find((m) => ymLabel(m.ym) === '2027/02')!;
    expect(feb.retUnk).toBe(2000000);
    expect(feb.div).toBe(60000);
    expect(feb.bonus).toBe(30000);
    expect(f).toHaveLength(12);
  });
});
