import {
  addDays, allEvents, defaultSettings, effectiveDate, endDate, evLabel, eventsOf, money, nextCode, projectSummary,
  redemptionQuote, statusOf, tierPct, ymOf, dateOf, fmtDate, bonusText, DEFAULT_RULES
} from './engine';
import type { BonusInstallment, BonusSchedule, Contract, ContractTerms, DateRules, Intent, Ledger, Project, Settings } from './types';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const nowIso = () => new Date().toISOString();

const withAudit = (l: Ledger, action: string, detail: string): Ledger => ({
  ...l,
  audit: [...l.audit, { at: nowIso(), action, detail }]
});

export const emptyLedger = (settings: Settings = defaultSettings()): Ledger => ({
  v: 2, contracts: [], sales: [], payments: {}, settings, audit: []
});

export const rulesOf = (r: DateRules): DateRules => ({
  effRule: r.effRule, effWeekday: r.effWeekday, effSameDay: r.effSameDay, effDays: r.effDays, effDayUnit: r.effDayUnit,
  payRule: r.payRule, payDay: r.payDay
});

export const termsOf = (p: Project): ContractTerms => ({
  projectId: p.id, projectName: p.name, category: p.category, ...rulesOf(p),
  termMonths: p.termMonths, periodMonths: p.periodMonths, pct: p.pct, bonusPlan: p.bonusPlan.map((b) => ({ ...b }))
});

/** 舊專案的發放方式換成分次發放（以最低級距的比例計） */
export const planFromSchedule = (s: BonusSchedule | undefined, total: number): BonusInstallment[] =>
  s === 'start' ? [{ at: 'start', pct: total }]
    : s === 'end' ? [{ at: 'maturity', pct: total }]
      : [{ at: 'start', pct: total / 2 }, { at: 'maturity', pct: total / 2 }];
const baseTier = (p: Project) => [...p.tiers].sort((a, b) => a.min - b.min)[0]?.pct ?? 2;

/** 舊資料補齊日期規則：舊的「週三」改成「最近週X」；沒有發放日規則的舊合約維持「隔月首週」 */
const fixRules = <T extends DateRules>(x: T, fallback?: Partial<DateRules>): T => {
  let y = { ...x } as T & { effRule: string };
  if ((y.effRule as string) === 'wednesday') y = { ...y, effRule: 'weekday', effWeekday: 3, effSameDay: true };
  if (!y.payRule) y = { ...y, ...(fallback ?? {}), payRule: fallback?.payRule ?? 'firstWeek' };
  return y as T;
};

export const normalize = (l: Ledger): Ledger => {
  const needs = l.settings.projects.some((p) => !p.payRule || !p.bonusPlan || (p.effRule as string) === 'wednesday') ||
    l.contracts.some((c) => !c.terms.payRule || (c.terms.effRule as string) === 'wednesday');
  if (!needs) return l;
  return {
    ...l,
    settings: {
      ...l.settings,
      projects: l.settings.projects.map((p) => {
        const q = fixRules(p, p.payRule ? undefined : DEFAULT_RULES[p.id]);
        return q.bonusPlan ? q : { ...q, bonusPlan: planFromSchedule(q.bonusSchedule, baseTier(q)) };
      })
    },
    contracts: l.contracts.map((c) => ({ ...c, terms: fixRules(c.terms) })),
    audit: [...l.audit, { at: nowIso(), action: '資料升級', detail: '加入生效日／發放日規則；已建立的合約維持原本的發放日' }]
  };
};

/* ---------- 舊版資料升級（v1：單一方案 → v2：專案制） ---------- */

interface V1Contract { id: string; code: string; client: string; salesId: string; principal: number; depositDate: string; effYM: number; plan: { name: string; months: number; pct: number }; bonusPct: number; intent: Intent; renewedFrom?: string; renewedTo?: string; redemption?: Contract['redemption']; createdAt: string }

export const migrate = (raw: unknown): Ledger | null => {
  const l = raw as { v?: number } & Record<string, unknown>;
  if (!l || !Array.isArray(l.contracts) || !Array.isArray(l.sales) || typeof l.payments !== 'object' || !Array.isArray(l.audit)) return null;
  if (l.v === 2) return normalize(l as unknown as Ledger);
  if (l.v !== 1) return null;
  const s1 = (l.settings ?? {}) as { tiers?: { min: number; pct: number }[]; refundPct?: number };
  const tiers = s1.tiers?.length ? s1.tiers : [{ min: 0, pct: 2 }];
  const legacy = new Map<string, Project>();
  const contracts = (l.contracts as V1Contract[]).map((c) => {
    const key = `${c.plan.months}-${c.plan.pct}`;
    if (!legacy.has(key)) {
      legacy.set(key, {
        id: `pj-v1-${key.replace('.', '_')}`, name: `原方案 ${c.plan.name} ${c.plan.pct}%`, category: '新事業', effRule: 'nextMonth1', payRule: 'firstWeek',
        termMonths: 12, periodMonths: c.plan.months, pct: c.plan.pct, tiers, bonusSchedule: 'split', bonusPlan: planFromSchedule('split', tiers[0]?.pct ?? 2), archived: true
      });
    }
    const { plan: _plan, ...rest } = c;
    void _plan;
    return { ...rest, effDate: dateOf(c.effYM, 1), terms: termsOf(legacy.get(key)!) } as Contract;
  });
  const projects = [...defaultSettings().projects, ...legacy.values()];
  return normalize({
    v: 2,
    contracts,
    sales: l.sales as Ledger['sales'],
    payments: l.payments as Ledger['payments'],
    settings: { projects, refundPct: s1.refundPct ?? 90 },
    audit: [...(l.audit as Ledger['audit']), { at: nowIso(), action: '資料升級', detail: '改為專案制；舊合約條件維持不變' }]
  });
};

/* ---------- 合約 ---------- */

export interface NewContractInput {
  client: string;
  salesId: string;
  principal: number;
  depositDate: string;
  projectId: string;
  bonusPct?: number;
}

export const previewContract = (l: Ledger, input: NewContractInput): Contract => {
  const p = l.settings.projects.find((x) => x.id === input.projectId) ?? l.settings.projects[0];
  const effDate = effectiveDate(input.depositDate, p);
  const effYM = ymOf(effDate);
  return {
    id: 'preview',
    code: nextCode(effYM, l.contracts),
    client: input.client.trim(),
    salesId: input.salesId,
    principal: Math.round(input.principal),
    depositDate: input.depositDate,
    effDate,
    effYM,
    terms: termsOf(p),
    bonusPct: input.bonusPct ?? tierPct(input.principal, p.tiers),
    intent: 'unk',
    createdAt: nowIso()
  };
};

export const createContract = (l: Ledger, input: NewContractInput): { ledger: Ledger; contract: Contract } => {
  const c = { ...previewContract(l, input), id: uid() };
  const sp = l.sales.find((s) => s.id === c.salesId);
  const ledger = withAudit(
    { ...l, contracts: [...l.contracts, c] },
    '新增合約',
    `${c.code} ${c.client}［${c.terms.projectName}］本金 ${money(c.principal)}・入金 ${c.depositDate}・生效 ${c.effDate}・業務 ${sp?.name ?? ''} ${c.bonusPct}%`
  );
  return { ledger, contract: c };
};

const INTENT_LABEL: Record<Intent, string> = { unk: '未確認', renew: '確認續存', close: '不續存' };

export const setIntent = (l: Ledger, contractId: string, intent: Intent): Ledger => {
  const c = l.contracts.find((x) => x.id === contractId);
  if (!c || c.renewedTo || c.redemption) return l;
  if (eventsOf(c, l).some((e) => e.final && l.payments[e.id])) return l;
  return withAudit(
    { ...l, contracts: l.contracts.map((x) => (x.id === contractId ? { ...x, intent } : x)) },
    '續存意願',
    `${c.code} ${c.client}：${INTENT_LABEL[c.intent]} → ${INTENT_LABEL[intent]}`
  );
};

/** 續約新約的生效日：週X制取到期隔天起最近的週X；其他接續到期隔天 */
export const renewalEffDate = (c: Contract) => {
  const next = addDays(endDate(c), 1);
  return c.terms.effRule === 'weekday' ? effectiveDate(next, c.terms) : next;
};

export interface PayInput {
  eventId: string;
  paidOn: string;
  tail5?: string;
  renewPrincipal?: number;
}

export const pay = (l: Ledger, today: string, input: PayInput): { ledger: Ledger; renewed?: Contract } => {
  const ev = allEvents(l).find((e) => e.id === input.eventId);
  if (!ev || ev.projected || ev.blocked || l.payments[ev.id]) return { ledger: l };
  const c = l.contracts.find((x) => x.id === ev.contractId)!;
  let ledger: Ledger = {
    ...l,
    payments: {
      ...l.payments,
      [ev.id]: {
        eventId: ev.id, paidOn: input.paidOn, amount: ev.amount, tail5: input.tail5 || undefined,
        salesId: ev.track === 'bonus' ? ev.salesId : undefined, at: nowIso()
      }
    }
  };
  const who = ev.track === 'bonus' ? `業務 ${l.sales.find((s) => s.id === ev.salesId)?.name ?? ''}・` : '';
  ledger = withAudit(ledger, '核銷', `${c.code} ${c.client}・${who}${evLabel(ev, c)} ${money(ev.amount)}${input.tail5 ? `・後五碼 ${input.tail5}` : ''}`);

  let renewed: Contract | undefined;
  if (ev.kind === 'div' && ev.final && c.intent === 'renew' && !c.renewedTo) {
    const principal = input.renewPrincipal && input.renewPrincipal > 0 ? Math.round(input.renewPrincipal) : c.principal;
    // 續約採用專案目前的條件；專案已刪除時沿用原約條件
    const p = l.settings.projects.find((x) => x.id === c.terms.projectId);
    const terms = p ? termsOf(p) : { ...c.terms };
    const effDate = renewalEffDate(c);
    const effYM = ymOf(effDate);
    renewed = {
      id: uid(), code: nextCode(effYM, ledger.contracts), client: c.client, salesId: c.salesId, principal,
      depositDate: c.depositDate, effDate, effYM, terms,
      bonusPct: p ? tierPct(principal, p.tiers) : c.bonusPct,
      intent: 'unk', renewedFrom: c.id, createdAt: nowIso()
    };
    ledger = { ...ledger, contracts: [...ledger.contracts.map((x) => (x.id === c.id ? { ...x, renewedTo: renewed!.id } : x)), renewed] };
    ledger = withAudit(ledger, '續約建立新約', `${c.code} → ${renewed.code} ${c.client}［${terms.projectName}］本金 ${money(principal)}・${effDate} 生效`);
  }
  void today;
  return { ledger, renewed };
};

export const unpay = (l: Ledger, eventId: string): Ledger => {
  const p = l.payments[eventId];
  if (!p) return l;
  const [cid] = eventId.split(':');
  const c = l.contracts.find((x) => x.id === cid);
  if (c?.renewedTo && eventId.includes(':div:')) {
    const ev = eventsOf(c, l).find((e) => e.id === eventId);
    if (ev?.final) return l;
  }
  const payments = { ...l.payments };
  delete payments[eventId];
  return withAudit({ ...l, payments }, '撤銷核銷', `${c?.code ?? ''} ${c?.client ?? ''}・${money(p.amount)}（原核銷日 ${p.paidOn}）`);
};

export const redeem = (l: Ledger, contractId: string, date: string, override?: { refund?: number; proRataDiv?: number }): Ledger => {
  const c = l.contracts.find((x) => x.id === contractId);
  if (!c || c.redemption) return l;
  const q = redemptionQuote(c, l, date, l.settings);
  const r = {
    ...q,
    ...(override?.refund != null ? { refund: Math.round(override.refund) } : {}),
    ...(override?.proRataDiv != null ? { proRataDiv: Math.round(override.proRataDiv) } : {})
  };
  return withAudit(
    { ...l, contracts: l.contracts.map((x) => (x.id === contractId ? { ...x, redemption: r } : x)) },
    '提前贖回',
    `${c.code} ${c.client}・贖回日 ${date}・實退本金 ${money(r.refund)}・當期紅利 ${money(r.proRataDiv)}（持有 ${r.heldMonths} 個月）・${fmtDate(r.payDate)} 發放・作廢未發獎金 ${money(r.voidedTail)}・應追回已發獎金 ${money(r.clawback)}`
  );
};

/* ---------- 業務 ---------- */

export const addSales = (l: Ledger, name: string): Ledger =>
  withAudit({ ...l, sales: [...l.sales, { id: uid(), name: name.trim(), active: true }] }, '新增業務', name.trim());

export const renameSales = (l: Ledger, id: string, name: string): Ledger => {
  const s = l.sales.find((x) => x.id === id);
  return withAudit({ ...l, sales: l.sales.map((x) => (x.id === id ? { ...x, name: name.trim() } : x)) }, '修改業務姓名', `${s?.name ?? ''} → ${name.trim()}`);
};

export const transferSales = (l: Ledger, fromId: string, toId: string, today: string): { ledger: Ledger; moved: number } => {
  const from = l.sales.find((s) => s.id === fromId);
  const to = l.sales.find((s) => s.id === toId);
  if (!from || !to || fromId === toId) return { ledger: l, moved: 0 };
  let moved = 0;
  const contracts = l.contracts.map((c) => {
    if (c.salesId !== fromId) return c;
    const st = statusOf(c, l, today);
    if (st === 'closed' || st === 'renewed' || st === 'redeemed') return c;
    moved += 1;
    return { ...c, salesId: toId };
  });
  const ledger = withAudit(
    { ...l, contracts, sales: l.sales.map((s) => (s.id === fromId ? { ...s, active: false, leftAt: today, successorId: toId } : s)) },
    '業務離職移轉',
    `${from.name} → ${to.name}・移轉 ${moved} 張合約（已發獎金仍歸 ${from.name}）`
  );
  return { ledger, moved };
};

/* ---------- 設定 ---------- */

export const describeProject = (p: Project) =>
  `${p.name}（${p.category}）${projectSummary(p)}・獎金 ${bonusText(p)}${p.archived ? '・已停用' : ''}`;

export const updateSettings = (l: Ledger, settings: Settings, detail: string): Ledger => withAudit({ ...l, settings }, '修改設定', detail);
