import type { BonusSchedule, Contract, DateRules, Ev, Ledger, PayRule, Project, Redemption, Scope, Settings, Tier } from './types';

/* ---------- 日期與月份（一律用 YYYY-MM-DD 字串，避免時區誤差） ---------- */

const parts = (d: string) => d.split('-').map(Number) as [number, number, number];
const fromUTC = (t: number) => {
  const x = new Date(t);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
};

/** 月序號：年*12 + (月-1) */
export const ymOf = (date: string): number => {
  const [y, m] = parts(date);
  return y * 12 + (m - 1);
};
export const ymYear = (ym: number) => Math.floor(ym / 12);
export const ymMonth = (ym: number) => (ym % 12) + 1;
export const ymLabel = (ym: number) => `${ymYear(ym)}/${String(ymMonth(ym)).padStart(2, '0')}`;
export const ymInput = (ym: number) => `${ymYear(ym)}-${String(ymMonth(ym)).padStart(2, '0')}`;
export const lastDay = (ym: number) => new Date(Date.UTC(ymYear(ym), ymMonth(ym), 0)).getUTCDate();
export const dateOf = (ym: number, day: number) =>
  `${ymYear(ym)}-${String(ymMonth(ym)).padStart(2, '0')}-${String(Math.min(day, lastDay(ym))).padStart(2, '0')}`;
export const fmtDate = (d: string) => d.replace(/-/g, '/');
export const dayOf = (d: string) => parts(d)[2];

export const addDays = (d: string, n: number) => {
  const [y, m, dd] = parts(d);
  return fromUTC(Date.UTC(y, m - 1, dd + n));
};
/** 加 n 個月；遇到月底不足時取當月最後一天 */
export const addMonths = (d: string, n: number) => dateOf(ymOf(d) + n, dayOf(d));

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
export const weekdayOf = (d: string) => {
  const [y, m, dd] = parts(d);
  return new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
};
export const weekday = (ym: number, day: number) => WEEK[weekdayOf(dateOf(ym, day))];
export const fmtDateW = (d: string) => `${fmtDate(d)}（${WEEK[weekdayOf(d)]}）`;
export const firstWeekLabel = (ym: number) =>
  `${ymMonth(ym)}/1（${weekday(ym, 1)}）至 ${ymMonth(ym)}/7（${weekday(ym, 7)}）`;

export const todayStr = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

/** 資金看板預設顯示的月份：當月 */
export const boardYM = (today: string) => ymOf(today);

export const isWeekend = (d: string) => {
  const w = weekdayOf(d);
  return w === 0 || w === 6;
};
/** 遇週六、週日順延到下個上班日 */
export const nextBizDay = (d: string) => {
  let x = d;
  while (isWeekend(x)) x = addDays(x, 1);
  return x;
};
export const addBizDays = (d: string, n: number) => {
  let x = d;
  let left = n;
  while (left > 0) {
    x = addDays(x, 1);
    if (!isWeekend(x)) left--;
  }
  return x;
};
export const shortDateW = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}（${WEEK[weekdayOf(d)]}）`;

export const daysUntil = (today: string, ym: number) => {
  const [y, m, d] = parts(today);
  return Math.round((Date.UTC(ymYear(ym), ymMonth(ym) - 1, 1) - Date.UTC(y, m - 1, d)) / 86400000);
};

/* ---------- 金額 ---------- */

export const money = (n: number) => Math.round(n).toLocaleString('en-US');
export const round = (n: number) => Math.round(n);
export const wan = (n: number) =>
  n >= 10000 ? `${(n / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 })} 萬` : `${money(n)} 元`;

/* ---------- 專案規則 ---------- */

export const WEEKDAY_LABEL = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

export const effRuleText = (r: DateRules) => {
  if (r.effRule === 'weekday') return `入帳後最近的${WEEKDAY_LABEL[r.effWeekday ?? 3]}生效${r.effSameDay === false ? '（當天入帳取下週）' : ''}`;
  if (r.effRule === 'tplus') return `入帳後 T+${r.effDays ?? 14} ${r.effDayUnit === 'business' ? '個工作天' : '天（遇週末順延）'}生效`;
  return '入帳隔月 1 日生效';
};
export const payRuleText = (r: DateRules) => {
  if (r.payRule === 'anniversary') return '每期滿的同一天發放（遇週末順延）';
  if (r.payRule === 'fixedDay') return `期滿後的每月 ${r.payDay ?? 10} 日發放（遇週末順延）`;
  return '期滿後的隔月 1～7 日發放';
};
export const PAY_RULE_LABEL: Record<PayRule, string> = {
  anniversary: '每期滿的同一天（遇週末順延）',
  firstWeek: '期滿後的隔月 1～7 日（集中發放）',
  fixedDay: '期滿後的每月固定日（遇週末順延）'
};
export const BONUS_SCHEDULE_LABEL: Record<BonusSchedule, string> = {
  split: '開始時發一半、到期時發一半',
  start: '合約開始時全部發放',
  end: '到期時全部發放'
};

/** 每期月數必須能整除合約期間 */
export const periodOptions = (termMonths: number) => [1, 2, 3, 4, 6, 12].filter((m) => m <= termMonths && termMonths % m === 0);
export const TERM_OPTIONS = [3, 6, 12, 24];

export const tierPct = (principal: number, tiers: Tier[]) => {
  const sorted = [...tiers].sort((a, b) => b.min - a.min);
  const hit = sorted.find((t) => principal >= t.min);
  return hit ? hit.pct : 0;
};

export const effectiveDate = (depositDate: string, r: DateRules) => {
  if (r.effRule === 'weekday') {
    const wd = r.effWeekday ?? 3;
    let gap = (wd - weekdayOf(depositDate) + 7) % 7;
    if (gap === 0 && r.effSameDay === false) gap = 7;
    return addDays(depositDate, gap);
  }
  if (r.effRule === 'tplus') {
    const n = r.effDays ?? 14;
    return r.effDayUnit === 'business' ? addBizDays(depositDate, n) : nextBizDay(addDays(depositDate, n));
  }
  return dateOf(ymOf(depositDate) + 1, 1);
};

export const projectSummary = (p: Project) =>
  `${effRuleText(p)}・${p.termMonths} 個月・每 ${p.periodMonths} 個月 ${p.pct}%・${payRuleText(p)}`;

/* ---------- 合約日期 ---------- */

export const endDate = (c: Pick<Contract, 'effDate' | 'terms'>) => addDays(addMonths(c.effDate, c.terms.termMonths), -1);
export const periodsOf = (c: Pick<Contract, 'terms'>) => Math.max(1, Math.round(c.terms.termMonths / c.terms.periodMonths));
/** 第 k 期的期滿日（下一期的起算日） */
export const periodAnchor = (c: Pick<Contract, 'effDate' | 'terms'>, k: number) => addMonths(c.effDate, k * c.terms.periodMonths);
export const periodEnd = (c: Pick<Contract, 'effDate' | 'terms'>, k: number) => addDays(periodAnchor(c, k), -1);

/** 依專案的發放日規則，算出一個基準日之後的應發放日 */
export const dueFrom = (r: DateRules, base: string, kind: 'start' | 'anchor') => {
  if (r.payRule === 'firstWeek') {
    // 開始：生效日在 1～7 日就當月首週，否則隔月；期滿：期滿日（前一天）的隔月首週
    const ym = kind === 'start' ? (dayOf(base) <= 7 ? ymOf(base) : ymOf(base) + 1) : ymOf(addDays(base, -1)) + 1;
    return dateOf(ym, 1);
  }
  if (r.payRule === 'fixedDay') {
    const day = r.payDay ?? 10;
    let ym = ymOf(base);
    if (dateOf(ym, day) < base) ym += 1;
    return nextBizDay(dateOf(ym, day));
  }
  return nextBizDay(base);
};

/** 到期處理日（最後一期分紅、退本、到期獎金同一天） */
export const maturityDue = (c: Pick<Contract, 'effDate' | 'terms'>) => dueFrom(c.terms, periodAnchor(c, periodsOf(c)), 'anchor');
export const maturityYM = (c: Pick<Contract, 'effDate' | 'terms'>) => ymOf(maturityDue(c));
export const startDue = (c: Pick<Contract, 'effDate' | 'terms'>) => dueFrom(c.terms, c.effDate, 'start');

export const nextCode = (effYM: number, contracts: Contract[]) => {
  const prefix = `C${String(ymYear(effYM)).slice(2)}${String(ymMonth(effYM)).padStart(2, '0')}-`;
  const used = contracts.filter((c) => c.code.startsWith(prefix)).map((c) => Number(c.code.slice(prefix.length)) || 0);
  return prefix + String((used.length ? Math.max(...used) : 0) + 1).padStart(2, '0');
};

export const dividendPerPeriod = (c: Pick<Contract, 'principal' | 'terms'>) => round((c.principal * c.terms.pct) / 100);
export const bonusTotal = (c: Pick<Contract, 'principal' | 'bonusPct'>) => round((c.principal * c.bonusPct) / 100);
export const headAmount = (c: Pick<Contract, 'principal' | 'bonusPct' | 'terms'>) =>
  c.terms.bonusSchedule === 'end' ? 0 : c.terms.bonusSchedule === 'start' ? bonusTotal(c) : round(bonusTotal(c) / 2);
export const tailAmount = (c: Pick<Contract, 'principal' | 'bonusPct' | 'terms'>) => bonusTotal(c) - headAmount(c);

/* ---------- 排程事件 ---------- */

export const eventsOf = (c: Contract, ledger: Pick<Ledger, 'payments'>): Ev[] => {
  const n = periodsOf(c);
  const week = c.terms.payRule === 'firstWeek' || undefined;
  const base = { contractId: c.id, salesId: c.salesId, client: c.client, code: c.code, projectId: c.terms.projectId, category: c.terms.category, week };
  const at = (due: string) => ({ due, ym: ymOf(due) });
  const out: Ev[] = [];
  const paid = (id: string) => !!ledger.payments[id];
  const r = c.redemption;

  const headId = `${c.id}:head`;
  const head = headAmount(c);
  if (head > 0 && (!r || paid(headId))) {
    out.push({ ...base, ...at(startDue(c)), id: headId, kind: 'head', amount: head, track: 'bonus' });
  }
  for (let k = 1; k <= n; k++) {
    if (r && periodEnd(c, k) >= r.date) break;
    const final = k === n;
    out.push({
      ...base, ...at(dueFrom(c.terms, periodAnchor(c, k), 'anchor')), id: `${c.id}:div:${k}`, kind: 'div', amount: dividendPerPeriod(c), track: 'client',
      period: k, periods: n, final, blocked: final && c.intent === 'unk' && !r
    });
  }
  if (r) {
    const pd = r.payDate ?? dateOf(r.payYM ?? ymOf(r.date) + 1, 1);
    const rw = r.payDate ? week && pd.endsWith('-01') : true;
    if (r.proRataDiv > 0) out.push({ ...base, week: rw || undefined, ...at(pd), id: `${c.id}:rdiv`, kind: 'rdiv', amount: r.proRataDiv, track: 'client' });
    out.push({ ...base, week: rw || undefined, ...at(pd), id: `${c.id}:rret`, kind: 'rret', amount: r.refund, track: 'client' });
    return out;
  }
  const m = at(maturityDue(c));
  const tail = tailAmount(c);
  if (tail > 0) out.push({ ...base, ...m, id: `${c.id}:tail`, kind: 'tail', amount: tail, track: 'bonus' });
  if (c.intent === 'close') {
    out.push({ ...base, ...m, id: `${c.id}:ret`, kind: 'ret', amount: c.principal, track: 'client', final: true });
  } else if (c.intent === 'unk') {
    out.push({ ...base, ...m, id: `${c.id}:ret`, kind: 'ret_unk', amount: c.principal, track: 'client', final: true, blocked: true });
  } else if (c.intent === 'renew' && !c.renewedTo && head > 0) {
    out.push({ ...base, ...m, id: `${c.id}:headproj`, kind: 'head_proj', amount: head, track: 'bonus', projected: true });
  }
  return out;
};

export const sortEv = (a: Ev, b: Ev) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.code.localeCompare(b.code));

export const inScope = (c: Contract, scope?: Scope) =>
  !scope || scope.kind === 'all' || (scope.kind === 'cat' ? c.terms.category === scope.v : c.terms.projectId === scope.id);

export const allEvents = (ledger: Ledger, scope?: Scope): Ev[] =>
  ledger.contracts.filter((c) => inScope(c, scope)).flatMap((c) => eventsOf(c, ledger));

export const bonusLabel = (e: Ev, c?: Contract) => {
  const s = c?.terms.bonusSchedule ?? 'split';
  if (e.kind === 'head') return s === 'split' ? '業務獎金・開始 50%' : '業務獎金・開始時全額';
  if (e.kind === 'tail') return s === 'split' ? '業務獎金・到期 50%' : '業務獎金・到期後全額';
  return '續約新約開始獎金（預估）';
};

export const evLabel = (e: Ev, c?: Contract) => {
  switch (e.kind) {
    case 'head':
    case 'tail':
    case 'head_proj': return bonusLabel(e, c);
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
  const evs = eventsOf(c, ledger).filter((e) => !e.projected);
  const allPaid = evs.every((e) => ledger.payments[e.id]);
  if (c.redemption) return allPaid ? 'redeemed' : 'redeeming';
  if (today < c.effDate) return 'pending';
  if (today <= endDate(c)) return 'active';
  if (allPaid) return c.renewedTo ? 'renewed' : 'closed';
  return 'maturing';
};

export const LIVE: Status[] = ['pending', 'active', 'maturing', 'redeeming'];

export const STATUS_LABEL: Record<Status, string> = {
  pending: '待生效', active: '運作中', maturing: '到期處理中', closed: '已結案', renewed: '已續約結案', redeeming: '贖回處理中', redeemed: '已贖回結案'
};

/* ---------- 首週看板 ---------- */

export interface Totals { div: number; retSure: number; retUnk: number; head: number; tail: number; total: number }

const sumTotals = (evs: Ev[]): Totals => {
  const t: Totals = { div: 0, retSure: 0, retUnk: 0, head: 0, tail: 0, total: 0 };
  for (const e of evs) {
    if (e.kind === 'div' || e.kind === 'rdiv') t.div += e.amount;
    else if (e.kind === 'ret' || e.kind === 'rret') t.retSure += e.amount;
    else if (e.kind === 'ret_unk') t.retUnk += e.amount;
    else if (e.kind === 'head' || e.kind === 'head_proj') t.head += e.amount;
    else if (e.kind === 'tail') t.tail += e.amount;
  }
  t.total = t.div + t.retSure + t.retUnk + t.head + t.tail;
  return t;
};

export interface BoardSummary extends Totals {
  ym: number;
  paid: number;
  items: Ev[];
  overdue: Ev[];
  overdueTotal: number;
}

/** 過了應發日（首週制為該月 7 日）還沒核銷 */
export const isOverdue = (e: Ev, ledger: Ledger, today: string) =>
  !ledger.payments[e.id] && !e.projected && (e.week ? addDays(e.due, 6) : e.due) < today;

export const board = (ledger: Ledger, today: string, scope?: Scope, month?: number): BoardSummary => {
  const ym = month ?? boardYM(today);
  const evs = allEvents(ledger, scope);
  const items = evs.filter((e) => e.ym === ym).sort(sortEv);
  // 逾期：本月之前的月份還沒發的款項
  const overdue = evs.filter((e) => e.ym < ym && isOverdue(e, ledger, today)).sort(sortEv);
  return {
    ...sumTotals(items),
    ym,
    paid: items.filter((e) => ledger.payments[e.id]).reduce((t, e) => t + e.amount, 0),
    items,
    overdue,
    overdueTotal: overdue.reduce((t, e) => t + e.amount, 0)
  };
};

export interface ScopeRow { scope: Scope; label: string; level: 'cat' | 'proj'; totals: Totals }

/** 某月首週依類別、專案拆開的資金需求 */
export const monthByScope = (ledger: Ledger, ym: number): ScopeRow[] => {
  const evs = allEvents(ledger).filter((e) => e.ym === ym);
  const projects = ledger.settings.projects;
  const cats = [...new Set([...projects.map((p) => p.category), ...ledger.contracts.map((c) => c.terms.category)])];
  const rows: ScopeRow[] = [];
  for (const cat of cats) {
    const ce = evs.filter((e) => e.category === cat);
    const pids = [...new Set([...projects.filter((p) => p.category === cat).map((p) => p.id), ...ce.map((e) => e.projectId)])];
    if (!ce.length && !projects.some((p) => p.category === cat && !p.archived)) continue;
    rows.push({ scope: { kind: 'cat', v: cat }, label: cat, level: 'cat', totals: sumTotals(ce) });
    if (pids.length <= 1) continue;
    for (const id of pids) {
      const pe = ce.filter((e) => e.projectId === id);
      const p = projects.find((x) => x.id === id);
      if (!pe.length && (!p || p.archived)) continue;
      const name = p?.name ?? ledger.contracts.find((c) => c.terms.projectId === id)?.terms.projectName ?? '';
      rows.push({ scope: { kind: 'proj', id }, label: name, level: 'proj', totals: sumTotals(pe) });
    }
  }
  return rows;
};

export const scopeLabel = (ledger: Ledger, scope: Scope) =>
  scope.kind === 'all' ? '全部專案' : scope.kind === 'cat' ? scope.v : ledger.settings.projects.find((p) => p.id === scope.id)?.name ??
    ledger.contracts.find((c) => c.terms.projectId === scope.id)?.terms.projectName ?? '';

/** 可以核銷：應發日前 7 天起就能先登記 */
export const payable = (e: Ev, ledger: Ledger, today: string) =>
  !e.projected && !e.blocked && !ledger.payments[e.id] && e.due <= addDays(today, 7);

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

export const forecast = (ledger: Ledger, today: string, scope?: Scope, months = 12): ForecastMonth[] => {
  const start = boardYM(today);
  const evs = allEvents(ledger, scope);
  return Array.from({ length: months }, (_, i) => {
    const ym = start + i;
    const me = evs.filter((e) => e.ym === ym);
    const t = sumTotals(me);
    return {
      ym, div: t.div, bonus: t.head + t.tail, retSure: t.retSure, retUnk: t.retUnk, total: t.total,
      unkContracts: me.filter((e) => e.kind === 'ret_unk').map((e) => e.contractId)
    };
  });
};

/* ---------- 額外分紅（積數法） ---------- */

export interface ExtraShare {
  contractId: string; code: string; client: string; principal: number; months: number; weight: number; amount: number; share: number;
}

export const extraDividend = (ledger: Ledger, today: string, pool: number, fromYM: number, toYM: number, scope?: Scope): ExtraShare[] => {
  const rows = ledger.contracts
    .filter((c) => inScope(c, scope) && statusOf(c, ledger, today) === 'active')
    .map((c) => {
      const a = Math.max(fromYM, ymOf(c.effDate));
      const b = Math.min(toYM, ymOf(endDate(c)));
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
  let rest = Math.round(pool) - rows.reduce((t, r) => t + r.amount, 0);
  const order = [...rows].sort((x, y) => ((pool * y.share) % 1) - ((pool * x.share) % 1));
  for (let i = 0; rest > 0; i = (i + 1) % order.length, rest--) order[i].amount += 1;
  return rows.sort((x, y) => y.amount - x.amount);
};

/* ---------- 提前贖回試算 ---------- */

/** 贖回款的預設發放日：首週制為隔月 1～7 日；其他照下一個原訂的發放日 */
export const redemptionPayDate = (c: Contract, date: string) => {
  if (c.terms.payRule === 'firstWeek') return dateOf(ymOf(date) + 1, 1);
  for (let k = 1; k <= periodsOf(c); k++) {
    const d = dueFrom(c.terms, periodAnchor(c, k), 'anchor');
    if (d > date) return d;
  }
  return nextBizDay(addDays(date, 1));
};

export const redemptionQuote = (c: Contract, ledger: Ledger, date: string, settings: Settings): Redemption => {
  const per = c.terms.periodMonths;
  const n = periodsOf(c);
  let kept = 0;
  for (let k = 1; k <= n; k++) if (periodEnd(c, k) < date) kept = k;
  const start = addMonths(c.effDate, kept * per);
  let held = 0;
  while (held < per && addMonths(start, held + 1) <= date) held++;
  const headPaid = ledger.payments[`${c.id}:head`];
  return {
    date,
    payDate: redemptionPayDate(c, date),
    refund: round((c.principal * settings.refundPct) / 100),
    heldMonths: held,
    proRataDiv: round((dividendPerPeriod(c) * held) / per),
    clawback: headPaid ? headPaid.amount : 0,
    voidedTail: tailAmount(c)
  };
};

/* ---------- 業務對帳單 ---------- */

export const dueText = (e: Pick<Ev, 'due' | 'week'>) => (e.week ? `${Number(e.due.slice(5, 7))}/1～7` : shortDateW(e.due));

export const salesStatement = (ledger: Ledger, today: string, salesId: string, month?: number) => {
  const ym = month ?? boardYM(today);
  const sp = ledger.sales.find((s) => s.id === salesId);
  const evs = allEvents(ledger).filter((e) => e.ym === ym && !e.projected);
  const owner = (e: Ev) => ledger.payments[e.id]?.salesId ?? e.salesId;
  const client = evs.filter((e) => e.track === 'client' && e.salesId === salesId).sort(sortEv);
  const bonus = evs.filter((e) => e.track === 'bonus' && owner(e) === salesId).sort(sortEv);
  const cOf = (e: Ev) => ledger.contracts.find((c) => c.id === e.contractId);
  const line = (e: Ev, i: number) => {
    const st = ledger.payments[e.id] ? '（已發）' : e.blocked ? '（待確認續存）' : '';
    return `${i + 1}. ${dueText(e)} ${e.client} ${e.code}［${cOf(e)?.terms.projectName ?? ''}］${evLabel(e, cOf(e))} ${money(e.amount)}${st}`;
  };
  const sum = (xs: Ev[]) => xs.reduce((t, e) => t + e.amount, 0);
  const lines = [
    `【${ymYear(ym)} 年 ${ymMonth(ym)} 月對帳單】`,
    `業務：${sp?.name ?? ''}`,
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

/* ---------- 預設專案 ---------- */

const PE: Pick<Project, 'effRule' | 'effWeekday' | 'effSameDay' | 'payRule'> = { effRule: 'weekday', effWeekday: 3, effSameDay: true, payRule: 'anniversary' };
export const DEFAULT_RULES: Record<string, Partial<Project>> = {
  'pj-new': { effRule: 'tplus', effDays: 14, effDayUnit: 'calendar', payRule: 'anniversary' },
  'pj-pe6': PE,
  'pj-pe12': PE
};

export const defaultProjects = (): Project[] => [
  { id: 'pj-new', name: '新事業', category: '新事業', ...(DEFAULT_RULES['pj-new'] as DateRulesFull), termMonths: 12, periodMonths: 3, pct: 2, tiers: [{ min: 0, pct: 2 }], bonusSchedule: 'split' },
  { id: 'pj-pe6', name: '私募半年', category: '私募', ...PE, termMonths: 6, periodMonths: 1, pct: 1.2, tiers: [{ min: 0, pct: 2 }], bonusSchedule: 'start' },
  { id: 'pj-pe12', name: '私募 1 年', category: '私募', ...PE, termMonths: 12, periodMonths: 1, pct: 1.5, tiers: [{ min: 0, pct: 2 }], bonusSchedule: 'start' }
];
type DateRulesFull = Pick<Project, 'effRule' | 'payRule'>;

export const defaultSettings = (): Settings => ({ projects: defaultProjects(), refundPct: 90 });
