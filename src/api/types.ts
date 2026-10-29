/**
 * Types mirroring the Phase 1 API contract (see api/API.md).
 *
 * The people who use the mobile app are Merchants. There is no "user" in this file,
 * and there should never be one in a product-facing surface.
 */

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';
export type MerchantStatus = 'active' | 'suspended';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface Merchant {
  id: string;
  countryCode: string;
  phone: string;
  phoneE164: string;
  /** Always false. The verified phone number can never be edited. */
  phoneEditable: false;
  firstName: string;
  lastName: string;
  fullName: string;
  gender: Gender;
  photoUrl: string | null;
  status: MerchantStatus;
  locale: string;
  themeMode: ThemeMode;
  phoneVerifiedAt: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRole {
  id: string;
  slug: string;
  name: string;
  description: string;
}

export interface AdminAccount {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'suspended';
  /**
   * True while this account still holds a password somebody else chose, at creation or
   * after a reset. The API refuses every other admin endpoint until it is cleared, so the
   * panel shows the change-password screen and nothing else.
   */
  mustChangePassword: boolean;
  /** Null until they have replaced a password that was set for them. */
  passwordChangedAt: string | null;
  lastLoginAt: string | null;
  /** When the account was added to the team. */
  createdAt: string;
  role: AdminRole;
  permissions: string[];
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  tokenType: 'Bearer';
}

export interface RoleWithPermissions extends AdminRole {
  permissions: string[];
  isSystem: boolean;
  /** How many admin accounts hold this role. A role in use cannot be deleted. */
  memberCount: number;
  /** False for the seeded super administrator role, which is deliberately fixed. */
  editable: boolean;
  deletable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoleInput {
  name: string;
  description: string;
  permissions: string[];
}

export type AdminStatus = 'active' | 'suspended';

/** A member of the admin team, as the team screen lists them. */
export interface AdminMember {
  id: string;
  name: string;
  email: string;
  status: AdminStatus;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  role: { id: string; slug: string; name: string };
  createdAt: string;
  updatedAt: string;
  /** False on the signed-in admin's own row: self-service is not team management. */
  canManage: boolean;
}

export interface AdminListQuery {
  search?: string;
  status?: AdminStatus | '';
  roleId?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

export interface PermissionGroup {
  group: string;
  permissions: string[];
}

export interface AuditChange {
  field: string;
  from?: unknown;
  to?: unknown;
}

export interface AuditEntry {
  id: string;
  actorType: 'merchant' | 'admin' | 'system';
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  changes: AuditChange[];
  createdAt: string;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export interface FieldIssue {
  field: string;
  message: string;
}

/** Stable error codes the UI branches on. */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RECORD_IN_USE: 'RECORD_IN_USE',
  PHONE_IMMUTABLE: 'PHONE_IMMUTABLE',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  UPLOAD_REJECTED: 'UPLOAD_REJECTED',
  IMAGE_LIMIT_REACHED: 'IMAGE_LIMIT_REACHED',
  IMAGE_STORAGE_UNAVAILABLE: 'IMAGE_STORAGE_UNAVAILABLE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES] | string;

export interface MerchantListQuery {
  search?: string;
  status?: MerchantStatus | '';
  gender?: Gender | '';
  page?: number;
  limit?: number;
  sort?: string;
}

/* ------------------------------ Phase 2: catalog ----------------------------- */

export type CategoryKind = 'item' | 'service' | 'material';

export type BillingUnit = 'one_time' | 'hourly' | 'per_session' | 'per_unit' | 'package';

export type StockSubjectType = 'item' | 'material';

export type StockMovementType =
  | 'opening'
  | 'adjustment'
  | 'receipt'
  | 'sale'
  | 'return'
  | 'reversal';

export type StockAdjustmentReason =
  | 'opening_stock'
  | 'damaged'
  | 'lost'
  | 'expired'
  | 'found'
  | 'manual_correction'
  | 'recount'
  | 'other';

/** Fields shared by the two stock-tracked record types. */
export interface StockFields {
  unit: string;
  trackStock: boolean;
  /** Available now. */
  quantity: number;
  /** Everything ever received, which is not the same as what is available. */
  totalReceived: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
}

/** One photo a merchant added to a product or raw material, cover first. */
export interface CatalogImage {
  id: string;
  url: string;
  /** A small square variant for lists; the same as `url` when not on Cloudinary. */
  thumbnailUrl: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  isCover: boolean;
  createdAt: string;
}

export interface CatalogItem extends StockFields {
  id: string;
  merchantId: string;
  merchantName?: string | null;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  description: string | null;
  imageUrl: string | null;
  /** Older API versions omit this; treat a missing list as empty. */
  images?: CatalogImage[];
  sku: string | null;
  barcode: string | null;
  /** Whole minor units, for example 4500 for ₹45.00. */
  sellingPriceMinor: number;
  costPriceMinor: number | null;
  taxRatePercent: number | null;
  archived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogService {
  id: string;
  merchantId: string;
  merchantName?: string | null;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  description: string | null;
  imageUrl: string | null;
  /** Older API versions omit this; treat a missing list as empty. */
  images?: CatalogImage[];
  billingUnit: BillingUnit;
  rateMinor: number;
  durationMinutes: number | null;
  taxRatePercent: number | null;
  isActive: boolean;
  /** Always false: a service can never move physical stock. */
  affectsStock: false;
  archived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogMaterial extends StockFields {
  id: string;
  merchantId: string;
  merchantName?: string | null;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
  imageUrl: string | null;
  /** Older API versions omit this; treat a missing list as empty. */
  images?: CatalogImage[];
  purchaseCostMinor: number | null;
  batchReference: string | null;
  expiryDate: string | null;
  supplierName: string | null;
  archived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What a product create or edit may send, exactly as the merchant app does. */
export interface CatalogItemInput {
  name?: string;
  categoryId?: string | null;
  description?: string | null;
  sku?: string | null;
  barcode?: string | null;
  unit?: string;
  trackStock?: boolean;
  sellingPriceMinor?: number;
  costPriceMinor?: number | null;
  taxRatePercent?: number | null;
  lowStockThreshold?: number;
  /** Create only: the stock the product starts with, recorded as an opening entry. */
  openingQuantity?: number;
}

export interface CatalogServiceInput {
  name?: string;
  categoryId?: string | null;
  description?: string | null;
  billingUnit?: BillingUnit;
  rateMinor?: number;
  durationMinutes?: number | null;
  taxRatePercent?: number | null;
  isActive?: boolean;
}

export interface CatalogMaterialInput {
  name?: string;
  categoryId?: string | null;
  notes?: string | null;
  unit?: string;
  trackStock?: boolean;
  purchaseCostMinor?: number | null;
  lowStockThreshold?: number;
  batchReference?: string | null;
  /** `YYYY-MM-DD`. */
  expiryDate?: string | null;
  supplierName?: string | null;
  openingQuantity?: number;
}

/** The three record kinds that carry a photo gallery, as their API paths name them. */
export type GalleryKind = 'items' | 'services' | 'materials';

export interface Category {
  id: string;
  kind: CategoryKind;
  name: string;
  archived: boolean;
  archivedAt: string | null;
  usageCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  merchantId?: string;
  merchantName?: string | null;
  subjectType: StockSubjectType;
  subjectId: string;
  subjectName: string;
  type: StockMovementType;
  reason: StockAdjustmentReason | null;
  /** Signed: negative removed stock. */
  delta: number;
  balanceAfter: number;
  note: string | null;
  actorType: 'merchant' | 'admin' | 'system';
  actorLabel: string;
  createdAt: string;
}

export interface LowStockRow {
  id: string;
  type: StockSubjectType;
  merchantId: string;
  merchantName?: string | null;
  name: string;
  unit: string;
  quantity: number;
  lowStockThreshold: number;
  isOutOfStock: boolean;
}

export interface Business {
  id: string;
  merchantId: string;
  name: string | null;
  logoUrl: string | null;
  category: string | null;
  taxNumber: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  };
  contact: {
    email: string | null;
    countryCode: string | null;
    phone: string | null;
    website: string | null;
  };
  currency: string;
  invoice: {
    showLogo: boolean;
    showAddress: boolean;
    showTaxNumber: boolean;
    footerNote: string | null;
  };
  defaultPaymentTermsDays: number | null;
  lowStockAlertsEnabled: boolean;
  status: string;
  /** Guidance for the app's setup prompts, never a gate. */
  completion: { total: number; completed: number; percent: number; missing: string[] };
  createdAt: string;
  updatedAt: string;
}

export interface CatalogSummary {
  items: { active: number; archived: number; lowStock: number; outOfStock: number };
  services: { active: number; inactive: number; archived: number };
  materials: { active: number; archived: number; lowStock: number; expiringSoon: number };
  categories: number;
}

export interface CatalogListQuery {
  merchantId?: string;
  search?: string;
  archived?: boolean;
  lowStock?: boolean;
  /** Used by the Phase 3 lists; ignored by the catalog endpoints. */
  outstanding?: boolean;
  page?: number;
  limit?: number;
  sort?: string;
}

/* ------------------ Phase 3: customers, suppliers, purchases ----------------- */

export type ContactChannel = 'sms' | 'whatsapp' | 'both' | 'none';
export type ContactLanguage = 'en' | 'hi';
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'cheque' | 'other';
export type PaymentStatus = 'unpaid' | 'partially_paid' | 'fully_paid';
/** What a client displays: the stored status, plus the time-derived overdue case. */
export type PaymentState = PaymentStatus | 'overdue';
export type PurchaseStatus = 'recorded' | 'cancelled';
export type PayableType = 'purchase' | 'order';

export interface PostalAddress {
  line1: string | null;
  line2?: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface Customer {
  id: string;
  countryCode: string;
  phone: string;
  phoneE164: string;
  firstName: string;
  lastName: string;
  fullName: string;
  gender: Gender;
  email: string | null;
  address: PostalAddress;
  notes: string | null;
  tags: string[];
  dateOfBirth: string | null;
  companyName: string | null;
  preferredChannel: ContactChannel;
  language: ContactLanguage;
  /** Projection of their unpaid orders; zero until Phase 4 creates any. */
  outstandingMinor: number;
  orderCount: number;
  lastOrderAt: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  /** Present on admin reads, which span merchants. */
  merchantId?: string;
  merchantName?: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  countryCode: string | null;
  phone: string | null;
  phoneE164: string | null;
  email: string | null;
  address: PostalAddress;
  taxNumber: string | null;
  notes: string | null;
  outstandingMinor: number;
  purchaseCount: number;
  totalPurchasedMinor: number;
  lastPurchaseAt: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  merchantId?: string;
  merchantName?: string | null;
}

export interface PurchaseLine {
  subjectType: StockSubjectType;
  subjectId: string;
  /** Snapshot taken when the purchase was recorded, not a live join. */
  name: string;
  unit: string;
  quantity: number;
  unitCostMinor: number;
  lineTotalMinor: number;
}

export interface Purchase {
  id: string;
  reference: string;
  supplierId: string;
  supplierName: string;
  lines: PurchaseLine[];
  subtotalMinor: number;
  additionalCostMinor: number;
  totalMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  purchaseDate: string;
  dueDate: string | null;
  notes: string | null;
  status: PurchaseStatus;
  cancelledAt: string | null;
  cancelledReason: string | null;
  received: boolean;
  receivedAt: string | null;
  paymentStatus: PaymentStatus;
  paymentState: PaymentState;
  createdAt: string;
  updatedAt: string;
  merchantId?: string;
  merchantName?: string | null;
}

export interface PaymentEntry {
  id: string;
  payableType: PayableType;
  payableId: string;
  payableReference: string;
  direction: 'in' | 'out';
  amountMinor: number;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
  notes: string | null;
  /** Which instalment of a plan this settled, where the payable has one. */
  installmentNumber: number | null;
  /** What was still outstanding after this entry, so a row reads on its own. */
  balanceAfterMinor: number;
  actorType: 'merchant' | 'admin' | 'system';
  actorLabel: string;
  createdAt: string;
  merchantId?: string;
  merchantName?: string | null;
}

/** Where an order or purchase stands after one of its payments was corrected or deleted. */
export interface PayableSummary {
  type: PayableType;
  id: string;
  reference: string;
  totalMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  paymentStatus: PaymentStatus;
}

/** What a payment correction may send. Only changed fields need to be included. */
export interface PaymentCorrectionInput {
  amountMinor?: number;
  reference?: string | null;
  notes?: string | null;
  /** Why it was wrong, kept in the audit trail. */
  reason?: string;
}

/** The delivery fields an administrator may change; null clears one. */
export interface OrderDeliveryInput {
  deliveryDate?: string | null;
  deliveryTime?: string | null;
  deliveryLocation?: string | null;
}

export interface RelationshipListQuery {
  merchantId?: string;
  search?: string;
  archived?: boolean;
  outstanding?: boolean;
  page?: number;
  limit?: number;
  sort?: string;
}

export interface PurchaseListQuery extends RelationshipListQuery {
  supplierId?: string;
  status?: PurchaseStatus;
  paymentStatus?: PaymentStatus;
  overdue?: boolean;
  received?: boolean;
}

export interface RelationshipSummary {
  customers: { active: number; archived: number; withOutstanding: number };
  suppliers: { active: number; archived: number; withOutstanding: number };
  purchases: { recorded: number; cancelled: number; awaitingStock: number; overdue: number };
  outstandingPayableMinor: number;
}

/* ----------------------- Phase 4: orders and instalments ---------------------- */

export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'in_progress'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'returned';

export type OrderLineType = 'item' | 'service';
export type DiscountType = 'none' | 'amount' | 'percent';
export type InstallmentStatus = 'pending' | 'partially_paid' | 'paid';

export interface OrderLine {
  lineType: OrderLineType;
  subjectId: string;
  /** Snapshot taken when the order was written, not a live join. */
  name: string;
  unit: string | null;
  billingUnit: string | null;
  quantity: number;
  unitRateMinor: number;
  durationMinutes: number | null;
  lineTotalMinor: number;
}

export interface Installment {
  number: number;
  amountMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  dueDate: string;
  status: InstallmentStatus;
  /** Derived from the due date at read time, never stored. */
  isOverdue: boolean;
  isNextDue: boolean;
  notes: string | null;
  reminderSentAt: string | null;
}

export interface Order {
  id: string;
  reference: string;
  /** Null for an anonymous counter sale, which the API allows. */
  customerId: string | null;
  customerName: string | null;
  lines: OrderLine[];
  subtotalMinor: number;
  discountType: DiscountType;
  discountPercent: number | null;
  discountMinor: number;
  taxPercent: number | null;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  status: OrderStatus;
  stockCommitted: boolean;
  stockCommittedAt: string | null;
  orderDate: string;
  dueDate: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  returnedAt: string | null;
  returnedReason: string | null;
  notes: string | null;
  /** Calendar day, `YYYY-MM-DD`. Older API versions omit the delivery fields. */
  deliveryDate?: string | null;
  /** 24-hour `HH:mm`. */
  deliveryTime?: string | null;
  deliveryLocation?: string | null;
  /** The settled state: only ever unpaid, partially paid or fully paid. */
  paymentStatus: PaymentStatus;
  /** What to display: the above with the clock folded in, so overdue needs no write. */
  paymentState: PaymentState;
  installments: Installment[];
  nextDueInstallment: Installment | null;
  createdAt: string;
  updatedAt: string;
  merchantId?: string;
  merchantName?: string | null;
}

export interface OrderListQuery {
  merchantId?: string;
  search?: string;
  customerId?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  overdue?: boolean;
  open?: boolean;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

/** Receivables rolled up per merchant: the unit an administrator acts on. */
export interface AdminReceivable {
  merchantId: string;
  merchantName: string | null;
  orderCount: number;
  outstandingMinor: number;
  overdueMinor: number;
  overdueOrders: number;
  dueSoonMinor: number;
  nextDueDate: string | null;
}

export interface AdminInstallment {
  orderId: string;
  merchantId: string;
  merchantName: string | null;
  reference: string;
  customerName: string | null;
  number: number;
  amountMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  dueDate: string;
  status: InstallmentStatus;
  isOverdue: boolean;
}

export interface OrderSummary {
  orders: Record<OrderStatus | 'total', number>;
  salesMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
  overdueOrders: number;
  installments: { pending: number; overdue: number };
}

/** One entry of a plan being sent to the server. */
export interface InstallmentInput {
  amountMinor: number;
  dueDate: string;
  notes?: string;
}

/* ---------------------------- units of measurement --------------------------- */

export type UnitAppliesTo = 'item' | 'material';

/** The picker section a unit appears under, matching the merchant app. */
export type UnitGroup = 'weight' | 'volume' | 'count' | 'length' | 'other';

/** An admin-managed unit. Records store its `code`, which never changes. */
export interface MeasurementUnit {
  id: string;
  code: string;
  name: string;
  /** Shown after a quantity, for example "kg" or "pieces". */
  symbol: string;
  /** Optional Material Icons name, for example "scale" or "water_drop". */
  icon: string | null;
  group: UnitGroup;
  wholeNumbersOnly: boolean;
  appliesTo: UnitAppliesTo[];
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** How many records refer to this unit. Present on the admin list. */
  usage?: { items: number; materials: number; orders: number; purchases: number };
}

export interface MeasurementUnitInput {
  code?: string;
  name: string;
  symbol: string;
  /** A Material Icons name; null clears the icon. */
  icon: string | null;
  group: UnitGroup;
  wholeNumbersOnly: boolean;
  appliesTo: UnitAppliesTo[];
  isActive: boolean;
  sortOrder?: number;
}
