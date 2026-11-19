import type { Contract, Ev, Ledger, Plan, Redemption, Settings, Tier } from './types';

/* ---------- 日期與月份 ---------- */

/** 月序號：年*12 + (月-1) */
export const ymOf = (date: string): number => {
  const [y, m] = date.split('-').map(Number);
  return y * 12 + (m - 1);
};
export const ymYear = (ym: number) => Math.floor(ym / 12);
export const ymMonth = (ym: number) => (ym % 12) + 1;
export const ymLabel = (ym: number) => `${ymYear(ym)}/${String(ymMonth(ym)).padStart(2, '0')}`;
export const ymShort = (ym: number) => `${ymMonth(ym)} 月`;
export const ymInput = (ym: number) => `${ymYear(ym)}-${String(ymMonth(ym)).padStart(2, '0')}`;
export const lastDay = (ym: number) => new Date(ymYear(ym), ymMonth(ym), 0).getDate();
export const dateOf = (ym: number, day: number) =>
  `${ymYear(ym)}-${String(ymMonth(ym)).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
export const fmtDate = (d: string) => d.replace(/-/g, '/');

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
export const weekday = (ym: number, day: number) => WEEK[new Date(ymYear(ym), ymMonth(ym) - 1, day).getDay()];
export const firstWeekLabel = (ym: number) =>
  `${ymMonth(ym)}/1（${weekday(ym, 1)}）至 ${ymMonth(ym)}/7（${weekday(ym, 7)}）`;

export const todayStr = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

/** 首週看板顯示哪個月：1～7 日顯示當月，8 日起顯示下月 */
export const boardYM = (today: string) => {
  const ym = ymOf(today);
  const day = Number(today.slice(8, 10));
  return day <= 7 ? ym : ym + 1;
};

export const daysUntil = (today: string, ym: number) => {
  const [y, m, d] = today.split('-').map(Number);
  return Math.round((Date.UTC(ymYear(ym), ymMonth(ym) - 1, 1) - Date.UTC(y, m - 1, d)) / 86400000);
};

/* ---------- 金額 ---------- */

export const money = (n: number) => Math.round(n).toLocaleString('en-US');
export const round = (n: number) => Math.round(n);
export const wan = (n: number) =>
  n >= 10000 ? `${(n / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 })} 萬` : `${money(n)} 元`;

/* ---------- 規則 ---------- */

export const VALID_PERIOD_MONTHS = [1, 2, 3, 4, 6, 12];

export const tierPct = (principal: number, tiers: Tier[]) => {
  const sorted = [...tiers].sort((a, b) => b.min - a.min);
  const hit = sorted.find((t) => principal >= t.min);
  return hit ? hit.pct : 0;
};

export const effectiveYM = (depositDate: string) => ymOf(depositDate) + 1;
export const maturityYM = (c: Contract) => c.effYM + 12;
export const endDate = (c: Contract) => dateOf(c.effYM + 11, lastDay(c.effYM + 11));

export const nextCode = (effYM: number, contracts: Contract[]) => {
  const prefix = `C${String(ymYear(effYM)).slice(2)}${String(ymMonth(effYM)).padStart(2, '0')}-`;
  const used = contracts
    .filter((c) => c.code.startsWith(prefix))
    .map((c) => Number(c.code.slice(prefix.length)) || 0);
  const n = (used.length ? Math.max(...used) : 0) + 1;
  return prefix + String(n).padStart(2, '0');
};

export const dividendPerPeriod = (c: Pick<Contract, 'principal' | 'plan'>) =>
  round((c.principal * c.plan.pct) / 100);
export const bonusTotal = (c: Pick<Contract, 'principal' | 'bonusPct'>) => round((c.principal * c.bonusPct) / 100);
export const headAmount = (c: Pick<Contract, 'principal' | 'bonusPct'>) => round(bonusTotal(c) / 2);
export const tailAmount = (c: Pick<Contract, 'principal' | 'bonusPct'>) => bonusTotal(c) - headAmount(c);

/* ---------- 排程事件 ---------- */

export const eventsOf = (c: Contract, ledger: Pick<Ledger, 'payments'>): Ev[] => {
  const per = c.plan.months;
  const n = Math.max(1, Math.round(12 / per));
  const base = { contractId: c.id, salesId: c.salesId, client: c.client, code: c.code };
  const out: Ev[] = [];
  const paid = (id: string) => !!ledger.payments[id];
  const r = c.redemption;
  const redeemYM = r ? ymOf(r.date) : Infinity;

  const headId = `${c.id}:head`;
  if (!r || paid(headId)) {
    out.push({ ...base, id: headId, kind: 'head', ym: c.effYM, amount: headAmount(c), track: 'bonus' });
  }
  for (let k = 1; k <= n; k++) {
    const ym = c.effYM + k * per;
    if (r && ym > redeemYM) break;
    const final = k === n;
    out.push({
      ...base,
      id: `${c.id}:div:${k}`,
      kind: 'div',
      ym,
      amount: dividendPerPeriod(c),
      track: 'client',
      period: k,
      periods: n,
      final,
      blocked: final && c.intent === 'unk' && !r
    });
  }
  if (r) {
    if (r.proRataDiv > 0)
      out.push({ ...base, id: `${c.id}:rdiv`, kind: 'rdiv', ym: r.payYM, amount: r.proRataDiv, track: 'client' });
    out.push({ ...base, id: `${c.id}:rret`, kind: 'rret', ym: r.payYM, amount: r.refund, track: 'client' });
    return out;
  }
  const mYM = maturityYM(c);
  out.push({ ...base, id: `${c.id}:tail`, kind: 'tail', ym: mYM, amount: tailAmount(c), track: 'bonus' });
  if (c.intent === 'close') {
    out.push({ ...base, id: `${c.id}:ret`, kind: 'ret', ym: mYM, amount: c.principal, track: 'client', final: true });
  } else if (c.intent === 'unk') {
    out.push({
      ...base, id: `${c.id}:ret`, kind: 'ret_unk', ym: mYM, amount: c.principal, track: 'client', final: true, blocked: true
    });
  } else if (c.intent === 'renew' && !c.renewedTo) {
    out.push({
      ...base, id: `${c.id}:headproj`, kind: 'head_proj', ym: mYM, amount: headAmount(c), track: 'bonus', projected: true
    });
  }
  return out;
};

export const allEvents = (ledger: Ledger): Ev[] => ledger.contracts.flatMap((c) => eventsOf(c, ledger));

export const evLabel = (e: Ev) => {
  switch (e.kind) {
    case 'head': return '業務頭款 50%';
    case 'tail': return '業務尾款 50%';
    case 'head_proj': return '續約新約頭款 50%（預估）';
    case 'div': return `第 ${e.period} 期紅利`;
    case 'ret': return '到期退還本金';
    case 'ret_unk': return '到期本金（未確認續存）';
    case 'rdiv': return '提前贖回・當期紅利按月比例';
    case 'rret': return '提前贖回・退還本金';
  }
};

/* ---------- 合約狀態 ---------- */

export type Status = 'pending' | 'active' | 'maturing' | 'closed' | 'renewed' | 'redeeming' | 'redeemed';

export const statusOf = (c: Contract, ledger: Ledger, today: string): Status => {
  const nowYM = ymOf(today);
  const evs = eventsOf(c, ledger).filter((e) => !e.projected);
  const allPaid = evs.every((e) => ledger.payments[e.id]);
  if (c.redemption) return allPaid ? 'redeemed' : 'redeeming';
  if (nowYM < c.effYM) return 'pending';
  if (nowYM < maturityYM(c)) return 'active';
  if (allPaid) return c.renewedTo ? 'renewed' : 'closed';
  return 'maturing';
};

export const STATUS_LABEL: Record<Status, string> = {
  pending: '待生效',
  active: '運作中',
  maturing: '到期處理中',
  closed: '已結案',
  renewed: '已續約結案',
  redeeming: '贖回處理中',
  redeemed: '已贖回結案'
};

/* ---------- 首週看板 ---------- */

export interface BoardSummary {
  ym: number;
  div: number;
  retSure: number;
  retUnk: number;
  head: number;
  tail: number;
  total: number;
  paid: number;
  items: Ev[];
  overdue: Ev[];
  overdueTotal: number;
}

export const board = (ledger: Ledger, today: string): BoardSummary => {
  const ym = boardYM(today);
  const evs = allEvents(ledger);
  // 預估的續約頭款也列入（最保守），但不可核銷
  const items = evs.filter((e) => e.ym === ym);
  const overdue = evs.filter((e) => e.ym < ym && !ledger.payments[e.id] && !e.projected);
  const sum = (f: (e: Ev) => boolean) => items.filter(f).reduce((t, e) => t + e.amount, 0);
  const s: BoardSummary = {
    ym,
    div: sum((e) => e.kind === 'div' || e.kind === 'rdiv'),
    retSure: sum((e) => e.kind === 'ret' || e.kind === 'rret'),
    retUnk: sum((e) => e.kind === 'ret_unk'),
    head: sum((e) => e.kind === 'head' || e.kind === 'head_proj'),
    tail: sum((e) => e.kind === 'tail'),
    total: 0,
    paid: items.filter((e) => ledger.payments[e.id]).reduce((t, e) => t + e.amount, 0),
    items,
    overdue,
    overdueTotal: overdue.reduce((t, e) => t + e.amount, 0)
  };
  s.total = s.div + s.retSure + s.retUnk + s.head + s.tail;
  return s;
};

/** 這筆款項現在可不可以核銷 */
export const payable = (e: Ev, ledger: Ledger, today: string) =>
  !e.projected && !e.blocked && !ledger.payments[e.id] && e.ym <= boardYM(today);

/* ---------- 12 個月水位 ---------- */

export interface ForecastMonth {
  ym: number;
  div: number;
  bonus: number;
  retSure: number;
  retUnk: number;
  total: number;
  unkContracts: string[];
}

export const forecast = (ledger: Ledger, today: string, months = 12): ForecastMonth[] => {
  const start = boardYM(today);
  const evs = allEvents(ledger);
  return Array.from({ length: months }, (_, i) => {
    const ym = start + i;
    const m: ForecastMonth = { ym, div: 0, bonus: 0, retSure: 0, retUnk: 0, total: 0, unkContracts: [] };
    for (const e of evs) {
      if (e.ym !== ym) continue;
      if (e.kind === 'div' || e.kind === 'rdiv') m.div += e.amount;
      else if (e.kind === 'head' || e.kind === 'tail' || e.kind === 'head_proj') m.bonus += e.amount;
      else if (e.kind === 'ret' || e.kind === 'rret') m.retSure += e.amount;
      else if (e.kind === 'ret_unk') {
        m.retUnk += e.amount;
        m.unkContracts.push(e.contractId);
      }
    }
    m.total = m.div + m.bonus + m.retSure + m.retUnk;
    return m;
  });
};

/* ---------- 額外分紅（積數法） ---------- */

export interface ExtraShare {
  contractId: string;
  code: string;
  client: string;
  principal: number;
  months: number;
  weight: number;
  amount: number;
  share: number;
}

export const extraDividend = (ledger: Ledger, today: string, pool: number, fromYM: number, toYM: number): ExtraShare[] => {
  const rows = ledger.contracts
    .filter((c) => statusOf(c, ledger, today) === 'active')
    .map((c) => {
      const a = Math.max(fromYM, c.effYM);
      const b = Math.min(toYM, c.effYM + 11);
      const months = Math.max(0, b - a + 1);
      return { contractId: c.id, code: c.code, client: c.client, principal: c.principal, months, weight: c.principal * months, amount: 0, share: 0 };
    })
    .filter((r) => r.weight > 0);
  const W = rows.reduce((t, r) => t + r.weight, 0);
  if (!W || pool <= 0) return rows;
  rows.forEach((r) => {
    r.share = r.weight / W;
    r.amount = Math.floor(pool * r.share);
  });
  // 尾差依小數大小補足，總和剛好等於分紅總池
  let rest = Math.round(pool) - rows.reduce((t, r) => t + r.amount, 0);
  const order = [...rows].sort((x, y) => (pool * y.share) % 1 - (pool * x.share) % 1);
  for (let i = 0; rest > 0; i = (i + 1) % order.length, rest--) order[i].amount += 1;
  return rows.sort((x, y) => y.amount - x.amount);
};

/* ---------- 提前贖回試算 ---------- */

export const redemptionQuote = (c: Contract, ledger: Ledger, date: string, settings: Settings): Redemption => {
  const redeemYM = ymOf(date);
  const per = c.plan.months;
  const n = Math.round(12 / per);
  let kept = 0;
  for (let k = 1; k <= n; k++) if (c.effYM + k * per <= redeemYM) kept = k;
  const periodStart = c.effYM + kept * per;
  const heldMonths = Math.max(0, Math.min(per, redeemYM - periodStart));
  const headPaid = !!ledger.payments[`${c.id}:head`];
  return {
    date,
    payYM: redeemYM + 1,
    refund: round((c.principal * settings.refundPct) / 100),
    heldMonths,
    proRataDiv: round((dividendPerPeriod(c) * heldMonths) / per),
    clawback: headPaid ? ledger.payments[`${c.id}:head`].amount : 0,
    voidedTail: tailAmount(c)
  };
};

/* ---------- 業務對帳單 ---------- */

export const salesStatement = (ledger: Ledger, today: string, salesId: string) => {
  const ym = boardYM(today);
  const sp = ledger.sales.find((s) => s.id === salesId);
  const evs = allEvents(ledger).filter((e) => e.ym === ym && !e.projected);
  const owner = (e: Ev) => ledger.payments[e.id]?.salesId ?? e.salesId;
  const client = evs.filter((e) => e.track === 'client' && e.salesId === salesId);
  const bonus = evs.filter((e) => e.track === 'bonus' && owner(e) === salesId);
  const line = (e: Ev, i: number) => {
    const st = ledger.payments[e.id] ? '（已發）' : e.blocked ? '（待確認續存）' : '';
    return `${i + 1}. ${e.client} ${e.code} ${evLabel(e)} ${money(e.amount)}${st}`;
  };
  const sum = (xs: Ev[]) => xs.reduce((t, e) => t + e.amount, 0);
  const lines = [
    `【${ymYear(ym)} 年 ${ymMonth(ym)} 月首週對帳單】`,
    `業務：${sp?.name ?? ''}`,
    `發放期間：${firstWeekLabel(ym)}`,
    '',
    '一、客戶應發款項',
    ...(client.length ? client.map(line) : ['（本月無）']),
    `小計：${money(sum(client))} 元`,
    '',
    '二、業務獎金',
    ...(bonus.length ? bonus.map(line) : ['（本月無）']),
    `應領獎金合計：${money(sum(bonus))} 元`
  ];
  return { text: lines.join('\n'), client, bonus, clientTotal: sum(client), bonusTotal: sum(bonus) };
};

/* ---------- 預設設定 ---------- */

export const defaultSettings = (): Settings => ({
  plans: [
    { id: 'p-q', name: '季配', months: 3, pct: 3 },
    { id: 'p-m', name: '月配', months: 1, pct: 1 },
    { id: 'p-h', name: '半年配', months: 6, pct: 6.5 }
  ] as Plan[],
  tiers: [
    { min: 0, pct: 2 },
    { min: 1000000, pct: 3 }
  ],
  refundPct: 90
});
