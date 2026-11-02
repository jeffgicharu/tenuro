import type { ColumnType, Generated } from 'kysely';

// numeric columns travel as strings (exact decimals); date columns as 'YYYY-MM-DD' strings.
type Numeric = ColumnType<string, string | number, string | number>;
type NumericDefault = ColumnType<string, string | number | undefined, string | number>;
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type IsoDate = string;

export type UserRole = 'ADMIN' | 'MANAGER' | 'VIEWER';
export type PropertyType = 'OFFICE' | 'RETAIL' | 'WAREHOUSE' | 'INDUSTRIAL' | 'MIXED_USE';
export type LeaseStatus = 'DRAFT' | 'ACTIVE' | 'HOLDING_OVER' | 'EXPIRED' | 'TERMINATED';
export type PaymentFrequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
export type PaymentTiming = 'ADVANCE' | 'ARREARS';
export type AccountingStandard = 'IFRS16' | 'ASC842';
export type Asc842Class = 'FINANCE' | 'OPERATING';
export type LeaseExemption = 'NONE' | 'SHORT_TERM' | 'LOW_VALUE';
export type PartyRole = 'LANDLORD' | 'LESSEE_ENTITY' | 'GUARANTOR' | 'AGENT';
export type EscalationKind = 'FIXED' | 'CPI' | 'MARKET_REVIEW';
export type OptionKind = 'BREAK' | 'RENEWAL' | 'PURCHASE';
export type OptionStatus = 'OPEN' | 'EXERCISED' | 'WAIVED' | 'LAPSED';
export type DepositKind = 'CASH' | 'BANK_GUARANTEE' | 'LETTER_OF_CREDIT';
export type DepositStatus = 'HELD' | 'PARTLY_RETURNED' | 'RETURNED';
export type KeyDateKind = 'BREAK_NOTICE' | 'RENEWAL_NOTICE' | 'RENT_REVIEW' | 'EXPIRY' | 'DEPOSIT_RETURN' | 'INSURANCE' | 'CUSTOM';
export type KeyDateStatus = 'UPCOMING' | 'ACTIONED' | 'DISMISSED';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type DocumentKind = 'LEASE' | 'AMENDMENT' | 'FLOOR_PLAN' | 'PHOTO' | 'CERTIFICATE' | 'CORRESPONDENCE' | 'OTHER';
export type ViewScope = 'LEASE_REGISTER' | 'KEY_DATES' | 'TASKS';
export type ModificationKind = 'INDEX_CHANGE' | 'TERM_REASSESSMENT' | 'SEPARATE_LEASE' | 'SCOPE_DECREASE' | 'OTHER';

export interface TenantTheme {
  brandHue: number;
  accentHue: number;
  density: 'compact' | 'standard' | 'comfortable';
  logo: string;
  logoOnDark: string;
  mark: string;
}

interface Scoped {
  tenant_id: string;
  sandbox_id: string | null;
}

interface Overlayable extends Scoped {
  origin_id: string | null;
  deleted_at: Timestamp | null;
  version: Generated<number>;
}

export interface TenantTable {
  id: string;
  slug: string;
  name: string;
  name_local: string | null;
  locale: string;
  languages: string[];
  reporting_currency: string;
  theme: ColumnType<TenantTheme, string, string>;
  sort_order: Generated<number>;
}

export interface AppUserTable {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  job_title: string;
  role: UserRole;
  locale: string | null;
  listed_for_sign_in: Generated<boolean>;
}

export interface SandboxTable {
  id: string;
  created_at: Timestamp;
  last_active_at: Timestamp;
  ip_hash: string;
  write_count: Generated<number>;
  upload_bytes: ColumnType<string, number | undefined, number | string>;
}

export interface SessionTable {
  token_hash: string;
  user_id: string;
  sandbox_id: string | null;
  ip_hash: string;
  created_at: Timestamp;
  last_seen_at: Timestamp;
  expires_at: Timestamp;
}

export interface PropertyTable extends Scoped {
  id: string;
  code: string;
  name: string;
  type: PropertyType;
  address_line: string;
  city: string;
  region: string | null;
  country_code: string;
  area_sqm: Numeric;
  year_built: number | null;
  latitude: Numeric | null;
  longitude: Numeric | null;
  photo: string | null;
  created_at: Timestamp;
}

export interface LeaseColumns {
  id: string;
  reference: string;
  status: LeaseStatus;
  property_id: string;
  premises: string;
  area_sqm: Numeric;
  commencement_date: IsoDate;
  expiry_date: IsoDate;
  currency: string;
  payment_frequency: PaymentFrequency;
  payment_timing: PaymentTiming;
  rent_per_period: Numeric;
  service_charge_per_period: NumericDefault;
  discount_rate: Numeric;
  initial_direct_costs: NumericDefault;
  incentives: NumericDefault;
  prepayments: NumericDefault;
  restoration_cost: NumericDefault;
  useful_life_months: number | null;
  ownership_transfers: Generated<boolean>;
  standard: Generated<AccountingStandard>;
  asc842_class: Asc842Class | null;
  exemption: Generated<LeaseExemption>;
  cost_centre: string | null;
  notes: string | null;
  country_code: string;
  city: string;
  property_type: PropertyType;
  property_name: string;
  landlord_name: string;
  lessee_entity: string;
  annual_rent: Numeric;
  annual_rent_reporting: Numeric;
  next_key_date: IsoDate | null;
  next_key_kind: KeyDateKind | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface LeaseTable extends Overlayable, LeaseColumns {}

interface LeaseChild extends Scoped {
  id: string;
  lease_row_id: string;
}

export interface LeasePartyTable extends LeaseChild {
  role: PartyRole;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  position: Generated<number>;
}

export interface RentStepTable extends LeaseChild {
  starts_on: IsoDate;
  rent_per_period: Numeric;
}

export interface EscalationTable extends LeaseChild {
  kind: EscalationKind;
  rate: Numeric | null;
  index_name: string | null;
  cap: Numeric | null;
  collar: Numeric | null;
  every_months: number;
  first_review_on: IsoDate;
}

export interface LeaseOptionTable extends LeaseChild {
  kind: OptionKind;
  exercise_on: IsoDate;
  notice_by: IsoDate | null;
  term_months: number | null;
  price: Numeric | null;
  reasonably_certain: Generated<boolean>;
  status: Generated<OptionStatus>;
  terms: string | null;
}

export interface DepositTable extends LeaseChild {
  kind: DepositKind;
  amount: Numeric;
  currency: string;
  held_by: string;
  return_due_on: IsoDate | null;
  status: Generated<DepositStatus>;
}

export interface KeyDateTable extends Overlayable {
  id: string;
  lease_id: string;
  kind: KeyDateKind;
  due_on: IsoDate;
  title: string;
  status: Generated<KeyDateStatus>;
  owner_id: string | null;
  remind_days: ColumnType<number[], number[] | undefined, number[]>;
  generated: Generated<boolean>;
}

export interface TaskTable extends Overlayable {
  id: string;
  lease_id: string | null;
  key_date_id: string | null;
  title: string;
  description: string | null;
  assignee_id: string | null;
  due_on: IsoDate | null;
  priority: Generated<TaskPriority>;
  status: Generated<TaskStatus>;
  created_by: string | null;
  created_at: Timestamp;
  completed_at: Timestamp | null;
}

export interface DocumentTable extends Scoped {
  id: string;
  lease_id: string;
  kind: DocumentKind;
  title: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  template: string | null;
  content: Buffer | null;
  uploaded_by: string | null;
  created_at: Timestamp;
}

export interface ActivityTable extends Scoped {
  id: string;
  lease_id: string | null;
  actor_id: string | null;
  verb: string;
  summary: string;
  diff: ColumnType<unknown, string | null, string | null> | null;
  created_at: Timestamp;
}

export interface LeaseDraftTable extends Scoped {
  id: string;
  owner_id: string;
  lease_id: string | null;
  data: ColumnType<Record<string, unknown>, string, string>;
  current_step: string;
  version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface LeaseModificationTable extends Scoped {
  id: string;
  lease_id: string;
  effective_on: IsoDate;
  kind: ModificationKind;
  before: ColumnType<Record<string, unknown>, string, string>;
  after: ColumnType<Record<string, unknown>, string, string>;
  revised_rate: Numeric | null;
  liability_change: Numeric;
  rou_change: Numeric;
  gain_loss: NumericDefault;
  created_by: string | null;
  created_at: Timestamp;
}

export interface SavedViewTable extends Overlayable {
  id: string;
  owner_id: string | null;
  scope: ViewScope;
  name: string;
  config: ColumnType<Record<string, unknown>, string, string>;
  position: Generated<number>;
  created_at: Timestamp;
}

export interface NotificationTable extends Scoped {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: Timestamp | null;
  created_at: Timestamp;
}

export interface FxRateTable {
  currency: string;
  on_date: IsoDate;
  per_usd: Numeric;
}

export interface WebVitalTable {
  id: Generated<string>;
  name: string;
  value: number;
  rating: string;
  route: string;
  created_at: Timestamp;
}

export interface CspReportTable {
  id: Generated<string>;
  directive: string;
  blocked: string | null;
  source: string | null;
  created_at: Timestamp;
}

export interface OpsCheckTable {
  id: Generated<string>;
  kind: string;
  ok: boolean;
  detail: string;
  created_at: Timestamp;
}

type View<T, K extends string> = { readonly [P in keyof T]: T[P] } & { readonly [P in K]: string };

export interface Database {
  tenant: TenantTable;
  app_user: AppUserTable;
  sandbox: SandboxTable;
  session: SessionTable;
  property: PropertyTable;
  lease: LeaseTable;
  lease_party: LeasePartyTable;
  rent_step: RentStepTable;
  escalation: EscalationTable;
  lease_option: LeaseOptionTable;
  deposit: DepositTable;
  key_date: KeyDateTable;
  task: TaskTable;
  document: DocumentTable;
  activity: ActivityTable;
  lease_draft: LeaseDraftTable;
  lease_modification: LeaseModificationTable;
  saved_view: SavedViewTable;
  notification: NotificationTable;
  fx_rate: FxRateTable;
  web_vital: WebVitalTable;
  csp_report: CspReportTable;
  ops_check: OpsCheckTable;
  v_lease: View<LeaseTable, 'lease_id'>;
  v_key_date: View<KeyDateTable, 'key_date_id'>;
  v_task: View<TaskTable, 'task_id'>;
  v_saved_view: View<SavedViewTable, 'view_id'>;
}
