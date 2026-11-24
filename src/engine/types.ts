export type Intent = 'unk' | 'renew' | 'close';

/** 生效日規則：入帳隔月 1 日／入帳後最近的星期 X／入帳後 T+N 天 */
export type EffRule = 'nextMonth1' | 'weekday' | 'tplus';

/** 發放日規則：每期滿的同一天（遇週末順延）／期滿後隔月 1～7 日／期滿後每月固定某日 */
export type PayRule = 'anniversary' | 'firstWeek' | 'fixedDay';

/** 生效日與發放日的細部條件（專案與合約共用） */
export interface DateRules {
  effRule: EffRule;
  /** weekday：0=週日 … 3=週三 */
  effWeekday?: number;
  /** weekday：入帳當天剛好是該星期幾時，當天生效 */
  effSameDay?: boolean;
  /** tplus：入帳後幾天 */
  effDays?: number;
  /** tplus：calendar=日曆天（遇週末順延）、business=工作天（只算週一到五） */
  effDayUnit?: 'calendar' | 'business';
  payRule: PayRule;
  /** fixedDay：每月幾號 */
  payDay?: number;
}

/** 業務獎金發放方式：開始一半到期一半／全部在開始時／全部在到期後 */
export type BonusSchedule = 'split' | 'start' | 'end';

export interface Tier {
  /** 本金達此金額（含）以上適用 */
  min: number;
  pct: number;
}

export interface Project extends DateRules {
  id: string;
  name: string;
  /** 類別，例如「新事業」「私募」，用來合計資金需求 */
  category: string;
  /** 合約期間（月） */
  termMonths: number;
  /** 每期幾個月 */
  periodMonths: number;
  /** 每期紅利 %（以本金計） */
  pct: number;
  tiers: Tier[];
  bonusSchedule: BonusSchedule;
  /** 停用後不能再新增合約，但舊合約照常運作 */
  archived?: boolean;
}

export interface SalesPerson {
  id: string;
  name: string;
  active: boolean;
  leftAt?: string;
  successorId?: string;
}

export interface Redemption {
  date: string;
  /** 退本與補發紅利的發放日 */
  payDate: string;
  /** 舊資料欄位 */
  payYM?: number;
  refund: number;
  heldMonths: number;
  proRataDiv: number;
  clawback: number;
  voidedTail: number;
}

/** 合約建立當下的專案條件快照；之後修改專案不影響舊合約 */
export interface ContractTerms extends DateRules {
  projectId: string;
  projectName: string;
  category: string;
  termMonths: number;
  periodMonths: number;
  pct: number;
  bonusSchedule: BonusSchedule;
}

export interface Contract {
  id: string;
  code: string;
  client: string;
  salesId: string;
  principal: number;
  depositDate: string;
  /** 生效日 YYYY-MM-DD */
  effDate: string;
  /** 生效月序號 = 年*12 + (月-1) */
  effYM: number;
  terms: ContractTerms;
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
  salesId?: string;
  at: string;
}

export interface AuditEntry {
  at: string;
  action: string;
  detail: string;
}

export interface Settings {
  projects: Project[];
  /** 提前贖回退回本金 % */
  refundPct: number;
}

export interface Ledger {
  v: 2;
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
  /** 應發放日；首週制為該月 1 日 */
  due: string;
  /** 首週制：可在 1～7 日之間發放 */
  week?: boolean;
  ym: number;
  amount: number;
  track: 'client' | 'bonus';
  period?: number;
  periods?: number;
  final?: boolean;
  salesId: string;
  client: string;
  code: string;
  projectId: string;
  category: string;
  projected?: boolean;
  blocked?: boolean;
}

export type Scope = { kind: 'all' } | { kind: 'cat'; v: string } | { kind: 'proj'; id: string };
