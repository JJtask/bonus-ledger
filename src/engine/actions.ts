import {
  allEvents, effectiveYM, evLabel, eventsOf, money, nextCode, redemptionQuote, statusOf, tierPct, ymLabel
} from './engine';
import type { Contract, Intent, Ledger, Settings } from './types';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const nowIso = () => new Date().toISOString();

const withAudit = (l: Ledger, action: string, detail: string): Ledger => ({
  ...l,
  audit: [...l.audit, { at: nowIso(), action, detail }]
});

export const emptyLedger = (settings: Settings): Ledger => ({
  v: 1, contracts: [], sales: [], payments: {}, settings, audit: []
});

export interface NewContractInput {
  client: string;
  salesId: string;
  principal: number;
  depositDate: string;
  planId: string;
  bonusPct: number;
}

export const previewContract = (l: Ledger, input: NewContractInput): Contract => {
  const plan = l.settings.plans.find((p) => p.id === input.planId) ?? l.settings.plans[0];
  const effYM = effectiveYM(input.depositDate);
  return {
    id: 'preview',
    code: nextCode(effYM, l.contracts),
    client: input.client.trim(),
    salesId: input.salesId,
    principal: Math.round(input.principal),
    depositDate: input.depositDate,
    effYM,
    plan: { name: plan.name, months: plan.months, pct: plan.pct },
    bonusPct: input.bonusPct,
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
    `${c.code} ${c.client}・本金 ${money(c.principal)}・${c.plan.name} ${c.plan.pct}%/期・業務 ${sp?.name ?? ''} ${c.bonusPct}%・入金 ${c.depositDate}`
  );
  return { ledger, contract: c };
};

const INTENT_LABEL: Record<Intent, string> = { unk: '未確認', renew: '確認續存', close: '不續存' };

export const setIntent = (l: Ledger, contractId: string, intent: Intent): Ledger => {
  const c = l.contracts.find((x) => x.id === contractId);
  if (!c || c.renewedTo || c.redemption) return l;
  const finalPaid = eventsOf(c, l).some((e) => e.final && l.payments[e.id]);
  if (finalPaid) return l;
  return withAudit(
    { ...l, contracts: l.contracts.map((x) => (x.id === contractId ? { ...x, intent } : x)) },
    '續存意願',
    `${c.code} ${c.client}：${INTENT_LABEL[c.intent]} → ${INTENT_LABEL[intent]}`
  );
};

export interface PayInput {
  eventId: string;
  paidOn: string;
  tail5?: string;
  /** 續存時新約的本金與方案（不填則沿用） */
  renewPrincipal?: number;
  renewPlanId?: string;
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
        eventId: ev.id,
        paidOn: input.paidOn,
        amount: ev.amount,
        tail5: input.tail5 || undefined,
        salesId: ev.track === 'bonus' ? ev.salesId : undefined,
        at: nowIso()
      }
    }
  };
  const who = ev.track === 'bonus' ? `業務 ${l.sales.find((s) => s.id === ev.salesId)?.name ?? ''}・` : '';
  ledger = withAudit(
    ledger,
    '核銷',
    `${c.code} ${c.client}・${who}${evLabel(ev)} ${money(ev.amount)}${input.tail5 ? `・後五碼 ${input.tail5}` : ''}`
  );

  let renewed: Contract | undefined;
  if (ev.kind === 'div' && ev.final && c.intent === 'renew' && !c.renewedTo) {
    const principal = input.renewPrincipal && input.renewPrincipal > 0 ? Math.round(input.renewPrincipal) : c.principal;
    const plan = l.settings.plans.find((p) => p.id === input.renewPlanId);
    const effYM = c.effYM + 12;
    renewed = {
      id: uid(),
      code: nextCode(effYM, ledger.contracts),
      client: c.client,
      salesId: c.salesId,
      principal,
      depositDate: c.depositDate,
      effYM,
      plan: plan ? { name: plan.name, months: plan.months, pct: plan.pct } : { ...c.plan },
      bonusPct: principal === c.principal ? c.bonusPct : tierPct(principal, l.settings.tiers),
      intent: 'unk',
      renewedFrom: c.id,
      createdAt: nowIso()
    };
    ledger = {
      ...ledger,
      contracts: [...ledger.contracts.map((x) => (x.id === c.id ? { ...x, renewedTo: renewed!.id } : x)), renewed]
    };
    ledger = withAudit(
      ledger,
      '續約建立新約',
      `${c.code} → ${renewed.code} ${c.client}・本金 ${money(principal)}・${ymLabel(effYM)} 生效`
    );
  }
  void today;
  return { ledger, renewed };
};

export const unpay = (l: Ledger, eventId: string): Ledger => {
  const p = l.payments[eventId];
  if (!p) return l;
  const [cid] = eventId.split(':');
  const c = l.contracts.find((x) => x.id === cid);
  // 已因續存建立新約的最後一期，不可撤銷
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
  const r = { ...q, ...(override?.refund != null ? { refund: Math.round(override.refund) } : {}), ...(override?.proRataDiv != null ? { proRataDiv: Math.round(override.proRataDiv) } : {}) };
  return withAudit(
    { ...l, contracts: l.contracts.map((x) => (x.id === contractId ? { ...x, redemption: r } : x)) },
    '提前贖回',
    `${c.code} ${c.client}・贖回日 ${date}・實退本金 ${money(r.refund)}・當期紅利 ${money(r.proRataDiv)}（持有 ${r.heldMonths} 個月）・作廢尾款 ${money(r.voidedTail)}・應追回頭款 ${money(r.clawback)}`
  );
};

export const addSales = (l: Ledger, name: string): Ledger =>
  withAudit({ ...l, sales: [...l.sales, { id: uid(), name: name.trim(), active: true }] }, '新增業務', name.trim());

export const renameSales = (l: Ledger, id: string, name: string): Ledger => {
  const s = l.sales.find((x) => x.id === id);
  return withAudit(
    { ...l, sales: l.sales.map((x) => (x.id === id ? { ...x, name: name.trim() } : x)) },
    '修改業務姓名',
    `${s?.name ?? ''} → ${name.trim()}`
  );
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
    {
      ...l,
      contracts,
      sales: l.sales.map((s) => (s.id === fromId ? { ...s, active: false, leftAt: today, successorId: toId } : s))
    },
    '業務離職移轉',
    `${from.name} → ${to.name}・移轉 ${moved} 張合約（已發獎金仍歸 ${from.name}）`
  );
  return { ledger, moved };
};

export const updateSettings = (l: Ledger, settings: Settings, detail: string): Ledger =>
  withAudit({ ...l, settings }, '修改設定', detail);
