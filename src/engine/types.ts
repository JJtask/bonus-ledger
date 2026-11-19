export type Intent = 'unk' | 'renew' | 'close';

export interface Plan {
  id: string;
  name: string;
  /** 每期幾個月（1、2、3、4、6、12） */
  months: number;
  /** 每期紅利 %（以本金計） */
  pct: number;
}

export interface Tier {
  /** 本金達此金額（含）以上適用 */
  min: number;
  pct: number;
}

export interface SalesPerson {
  id: string;
  name: string;
  active: boolean;
  leftAt?: string;
  successorId?: string;
}

export interface Redemption {
  /** 客戶提出贖回日 YYYY-MM-DD */
  date: string;
  /** 於哪個月首週發放（月序號） */
  payYM: number;
  refund: number;
  heldMonths: number;
  proRataDiv: number;
  /** 已發頭款應追回金額 */
  clawback: number;
  /** 作廢的尾款金額 */
  voidedTail: number;
}

export interface Contract {
  id: string;
  code: string;
  client: string;
  salesId: string;
  principal: number;
  depositDate: string;
  /** 生效月序號 = 年*12 + (月-1) */
  effYM: number;
  plan: { name: string; months: number; pct: number };
  bonusPct: number;
  intent: Intent;
  renewedFrom?: string;
  renewedTo?: string;
  redemption?: Redemption;
  createdAt: string;
}

export interface Payment {
  eventId: string;
  paidOn: string;
  amount: number;
  tail5?: string;
  /** 獎金類款項發放當下所屬業務（離職移轉後仍保留） */
  salesId?: string;
  at: string;
}

export interface AuditEntry {
  at: string;
  action: string;
  detail: string;
}

export interface Settings {
  plans: Plan[];
  tiers: Tier[];
  /** 提前贖回退回本金 % */
  refundPct: number;
}

export interface Ledger {
  v: 1;
  contracts: Contract[];
  sales: SalesPerson[];
  payments: Record<string, Payment>;
  settings: Settings;
  audit: AuditEntry[];
}

export type EvKind = 'head' | 'tail' | 'div' | 'ret' | 'ret_unk' | 'rdiv' | 'rret' | 'head_proj';

export interface Ev {
  id: string;
  contractId: string;
  kind: EvKind;
  ym: number;
  amount: number;
  track: 'client' | 'bonus';
  /** 第幾期（紅利） */
  period?: number;
  periods?: number;
  final?: boolean;
  salesId: string;
  client: string;
  code: string;
  /** 預估款項（續存後才會建立的新約頭款），不可核銷 */
  projected?: boolean;
  /** 尚未確認續存意願，不可核銷 */
  blocked?: boolean;
}
