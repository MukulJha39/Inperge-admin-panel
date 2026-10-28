import { api } from './client';
import type {
  AdminAccount,
  AdminListQuery,
  AdminMember,
  AdminStatus,
  RoleInput,
  BillingUnit,
  Business,
  CatalogItem,
  CatalogListQuery,
  CatalogMaterial,
  CatalogService,
  CatalogSummary,
  Category,
  LowStockRow,
  StockAdjustmentReason,
  StockMovement,
  StockSubjectType,
  AuditEntry,
  ContactChannel,
  ContactLanguage,
  Customer,
  Gender,
  Merchant,
  MerchantListQuery,
  MerchantStatus,
  Paginated,
  PayableType,
  PaymentEntry,
  PaymentMethod,
  PermissionGroup,
  Purchase,
  PurchaseListQuery,
  RelationshipListQuery,
  RelationshipSummary,
  Supplier,
  RoleWithPermissions,
  Tokens,
  AdminInstallment,
  AdminReceivable,
  InstallmentInput,
  Order,
  OrderListQuery,
  OrderStatus,
  OrderSummary,
  MeasurementUnit,
  MeasurementUnitInput,
} from './types';

/* --------------------------------- auth --------------------------------- */

export function login(email: string, password: string) {
  return api.post<{ admin: AdminAccount; tokens: Tokens }>(
    '/admin/auth/login',
    { email, password },
    { anonymous: true },
  );
}

export function fetchCurrentAdmin(signal?: AbortSignal) {
  return api.get<{ admin: AdminAccount }>('/admin/auth/me', signal ? { signal } : undefined);
}

/**
 * Correcting your own display name. Only the name: the email address is the sign-in
 * identity and the role decides what the account reaches, so both are changed by someone
 * else on the admin team screen.
 */
export function updateOwnProfile(name: string) {
  return api.patch<{ admin: AdminAccount }>('/admin/auth/me', { name });
}

export function logout() {
  return api.post<{ loggedOut: boolean }>('/admin/auth/logout');
}

/* ------------------------------- merchants ------------------------------- */

export function fetchMerchants(query: MerchantListQuery, signal?: AbortSignal) {
  return api.get<Paginated<Merchant>>('/admin/merchants', {
    query: {
      search: query.search,
      status: query.status,
      gender: query.gender,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    },
    ...(signal ? { signal } : {}),
  });
}

export function fetchMerchant(id: string, signal?: AbortSignal) {
  return api.get<{ merchant: Merchant }>(`/admin/merchants/${id}`, signal ? { signal } : undefined);
}

/**
 * Name and gender only. The verified phone number is not editable, and the API
 * rejects it outright — the UI never offers it.
 */
export function updateMerchant(
  id: string,
  input: { firstName?: string; lastName?: string; gender?: Gender },
) {
  return api.patch<{ merchant: Merchant }>(`/admin/merchants/${id}`, input);
}

export function updateMerchantStatus(id: string, status: MerchantStatus, reason?: string) {
  return api.patch<{ merchant: Merchant }>(`/admin/merchants/${id}/status`, {
    status,
    ...(reason ? { reason } : {}),
  });
}

/* ----------------------------- roles & audit ----------------------------- */

export function fetchRoles(signal?: AbortSignal) {
  return api.get<{ roles: RoleWithPermissions[]; permissionGroups: PermissionGroup[] }>(
    '/admin/roles',
    signal ? { signal } : undefined,
  );
}

export function createRole(input: RoleInput) {
  return api.post<{ role: RoleWithPermissions }>('/admin/roles', input);
}

export function updateRole(id: string, input: Partial<RoleInput>) {
  return api.patch<{ role: RoleWithPermissions }>(`/admin/roles/${id}`, input);
}

/**
 * The API refuses this for a seeded role, and for one an admin still holds; the panel
 * hides the control in both cases, but the refusal is what actually protects the data.
 */
export function deleteRole(id: string) {
  return api.delete<{ deleted: boolean }>(`/admin/roles/${id}`);
}

/* ------------------------------- admin team ------------------------------- */

export function fetchAdmins(query: AdminListQuery, signal?: AbortSignal) {
  return api.get<Paginated<AdminMember>>('/admin/admins', {
    query: {
      search: query.search,
      status: query.status,
      roleId: query.roleId,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    },
    ...(signal ? { signal } : {}),
  });
}

/**
 * The starting password is a way in, not a credential: the API marks the account as
 * needing a change, and refuses everything else until the member has chosen their own.
 */
export function createAdminMember(input: {
  name: string;
  email: string;
  roleId: string;
  password: string;
}) {
  return api.post<{ admin: AdminMember }>('/admin/admins', input);
}

export function updateAdminMember(
  id: string,
  input: { name?: string; email?: string; roleId?: string },
) {
  return api.patch<{ admin: AdminMember }>(`/admin/admins/${id}`, input);
}

/** Suspending revokes every session the member has, at once. */
export function updateAdminMemberStatus(id: string, status: AdminStatus, reason?: string) {
  return api.patch<{ admin: AdminMember }>(`/admin/admins/${id}/status`, {
    status,
    ...(reason ? { reason } : {}),
  });
}

export function resetAdminMemberPassword(id: string, password: string) {
  return api.post<{ admin: AdminMember }>(`/admin/admins/${id}/reset-password`, { password });
}

/** The one admin endpoint that works while a forced password change is outstanding. */
export function changeOwnPassword(currentPassword: string, newPassword: string) {
  return api.post<{ passwordChanged: boolean }>('/admin/auth/change-password', {
    currentPassword,
    newPassword,
  });
}

export function fetchAuditLogs(
  query: {
    targetType?: string;
    targetId?: string;
    actorType?: string;
    /** Who performed the action, which is what "my own activity" asks for. */
    actorId?: string;
    action?: string;
    page?: number;
    limit?: number;
  },
  signal?: AbortSignal,
) {
  return api.get<Paginated<AuditEntry>>('/admin/audit-logs', {
    query,
    ...(signal ? { signal } : {}),
  });
}

/* ------------------------------ Phase 2: catalog ----------------------------- */

export function fetchAdminItems(query: CatalogListQuery, signal?: AbortSignal) {
  return api.get<Paginated<CatalogItem>>('/admin/items', {
    query: { ...query },
    ...(signal ? { signal } : {}),
  });
}

export function fetchAdminServices(query: CatalogListQuery, signal?: AbortSignal) {
  return api.get<Paginated<CatalogService>>('/admin/services', {
    query: { ...query },
    ...(signal ? { signal } : {}),
  });
}

export function fetchAdminMaterials(query: CatalogListQuery, signal?: AbortSignal) {
  return api.get<Paginated<CatalogMaterial>>('/admin/materials', {
    query: { ...query },
    ...(signal ? { signal } : {}),
  });
}

export function fetchAdminLowStock(query: CatalogListQuery, signal?: AbortSignal) {
  return api.get<Paginated<LowStockRow>>('/admin/low-stock', {
    query: { ...query },
    ...(signal ? { signal } : {}),
  });
}

export function fetchAdminStockMovements(
  query: { merchantId?: string; subjectType?: StockSubjectType; subjectId?: string; page?: number; limit?: number },
  signal?: AbortSignal,
) {
  return api.get<Paginated<StockMovement>>('/admin/stock-movements', {
    query: { ...query },
    ...(signal ? { signal } : {}),
  });
}

/**
 * Stock is never part of a details update: the API refuses it, so the drawer does not
 * offer it either. Quantity changes go through adjustStock.
 */
export function updateAdminItem(
  id: string,
  input: {
    name?: string;
    sku?: string | null;
    unit?: string;
    sellingPriceMinor?: number;
    costPriceMinor?: number | null;
    lowStockThreshold?: number;
    categoryId?: string | null;
    description?: string | null;
  },
) {
  return api.patch<{ item: CatalogItem }>(`/admin/items/${id}`, input);
}

export function updateAdminService(
  id: string,
  input: {
    name?: string;
    billingUnit?: BillingUnit;
    rateMinor?: number;
    durationMinutes?: number | null;
    isActive?: boolean;
    description?: string | null;
  },
) {
  return api.patch<{ service: CatalogService }>(`/admin/services/${id}`, input);
}

export function updateAdminMaterial(
  id: string,
  input: {
    name?: string;
    unit?: string;
    purchaseCostMinor?: number | null;
    lowStockThreshold?: number;
    batchReference?: string | null;
    supplierName?: string | null;
    notes?: string | null;
  },
) {
  return api.patch<{ material: CatalogMaterial }>(`/admin/materials/${id}`, input);
}

export function setAdminItemArchived(id: string, archived: boolean) {
  return api.post<{ item: CatalogItem }>(`/admin/items/${id}/${archived ? 'archive' : 'restore'}`);
}

export function setAdminServiceArchived(id: string, archived: boolean) {
  return api.post<{ service: CatalogService }>(
    `/admin/services/${id}/${archived ? 'archive' : 'restore'}`,
  );
}

export function setAdminMaterialArchived(id: string, archived: boolean) {
  return api.post<{ material: CatalogMaterial }>(
    `/admin/materials/${id}/${archived ? 'archive' : 'restore'}`,
  );
}

/**
 * Permanently removes a catalog record, together with its stock ledger and its image.
 *
 * The API refuses with `RECORD_IN_USE` when any order or purchase still references the
 * record, because deleting it would leave that history pointing at nothing. Archiving is
 * the answer in that case, and the refusal says so.
 */
export function deleteAdminItem(id: string) {
  return api.delete<{ deleted: boolean; name: string; stockMovementsDeleted: number }>(
    `/admin/items/${id}`,
  );
}

export function deleteAdminService(id: string) {
  return api.delete<{ deleted: boolean; name: string }>(`/admin/services/${id}`);
}

export function deleteAdminMaterial(id: string) {
  return api.delete<{ deleted: boolean; name: string; stockMovementsDeleted: number }>(
    `/admin/materials/${id}`,
  );
}

/** A signed adjustment with a reason, recorded in the merchant's stock ledger. */
export function adjustStock(
  subjectType: StockSubjectType,
  subjectId: string,
  input: { change: number; reason: StockAdjustmentReason; note?: string },
) {
  return api.post<{ item?: CatalogItem; material?: CatalogMaterial; movement: StockMovement }>(
    `/admin/stock/${subjectType}/${subjectId}/adjust`,
    input,
  );
}

export function fetchMerchantBusiness(merchantId: string, signal?: AbortSignal) {
  return api.get<{ business: Business }>(
    `/admin/merchants/${merchantId}/business`,
    signal ? { signal } : undefined,
  );
}

export function updateMerchantBusiness(merchantId: string, input: Record<string, unknown>) {
  return api.patch<{ business: Business }>(`/admin/merchants/${merchantId}/business`, input);
}

export function fetchMerchantCatalogSummary(merchantId: string, signal?: AbortSignal) {
  return api.get<{ summary: CatalogSummary }>(
    `/admin/merchants/${merchantId}/catalog-summary`,
    signal ? { signal } : undefined,
  );
}

export function fetchMerchantCategories(merchantId: string, signal?: AbortSignal) {
  return api.get<{ categories: Category[] }>(
    `/admin/merchants/${merchantId}/categories`,
    signal ? { signal } : undefined,
  );
}

/* ------------------ Phase 3: customers, suppliers, purchases ----------------- */

export function fetchAdminCustomers(query: RelationshipListQuery, signal?: AbortSignal) {
  return api.get<Paginated<Customer>>('/admin/customers', {
    query: { ...query },
    ...(signal ? { signal } : {}),
  });
}

export function fetchAdminCustomer(id: string, signal?: AbortSignal) {
  return api.get<{ customer: Customer }>(
    `/admin/customers/${id}`,
    signal ? { signal } : undefined,
  );
}

/**
 * A customer phone number is editable, unlike a merchant verified sign-in number: it
 * was typed by the merchant, and merchants mistype numbers.
 */
export function updateAdminCustomer(
  id: string,
  input: {
    firstName?: string;
    lastName?: string;
    gender?: Gender;
    countryCode?: string;
    phone?: string;
    email?: string | null;
    addressLine1?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
    companyName?: string | null;
    notes?: string | null;
    tags?: string[];
    preferredChannel?: ContactChannel;
    language?: ContactLanguage;
  },
) {
  return api.patch<{ customer: Customer }>(`/admin/customers/${id}`, input);
}

export function setAdminCustomerArchived(id: string, archived: boolean) {
  return api.post<{ customer: Customer }>(
    `/admin/customers/${id}/${archived ? 'archive' : 'restore'}`,
  );
}

export function fetchAdminSuppliers(query: RelationshipListQuery, signal?: AbortSignal) {
  return api.get<Paginated<Supplier>>('/admin/suppliers', {
    query: { ...query },
    ...(signal ? { signal } : {}),
  });
}

export function fetchAdminSupplier(id: string, signal?: AbortSignal) {
  return api.get<{ supplier: Supplier }>(
    `/admin/suppliers/${id}`,
    signal ? { signal } : undefined,
  );
}

export function updateAdminSupplier(
  id: string,
  input: {
    name?: string;
    contactPerson?: string | null;
    countryCode?: string | null;
    phone?: string | null;
    email?: string | null;
    addressLine1?: string | null;
    city?: string | null;
    taxNumber?: string | null;
    notes?: string | null;
  },
) {
  return api.patch<{ supplier: Supplier }>(`/admin/suppliers/${id}`, input);
}

export function setAdminSupplierArchived(id: string, archived: boolean) {
  return api.post<{ supplier: Supplier }>(
    `/admin/suppliers/${id}/${archived ? 'archive' : 'restore'}`,
  );
}

export function fetchAdminPurchases(query: PurchaseListQuery, signal?: AbortSignal) {
  return api.get<Paginated<Purchase>>('/admin/purchases', {
    query: { ...query },
    ...(signal ? { signal } : {}),
  });
}

/** The purchase and its payment entries together: a detail view needs both. */
export function fetchAdminPurchase(id: string, signal?: AbortSignal) {
  return api.get<{ purchase: Purchase; payments: PaymentEntry[] }>(
    `/admin/purchases/${id}`,
    signal ? { signal } : undefined,
  );
}

export function cancelAdminPurchase(id: string, reason?: string) {
  return api.post<{ purchase: Purchase }>(`/admin/purchases/${id}/cancel`, {
    ...(reason ? { reason } : {}),
  });
}

/** Goes through the same payment engine a merchant uses, recorded as an admin action. */
export function recordAdminPurchasePayment(
  id: string,
  input: {
    amountMinor: number;
    method: PaymentMethod;
    reference?: string;
    paidAt?: string;
    notes?: string;
  },
) {
  return api.post<{ payment: PaymentEntry; purchase: Purchase }>(
    `/admin/purchases/${id}/payments`,
    input,
  );
}

export function fetchAdminPayments(
  query: {
    merchantId?: string;
    payableType?: PayableType;
    payableId?: string;
    method?: PaymentMethod;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
    sort?: string;
  },
  signal?: AbortSignal,
) {
  return api.get<Paginated<PaymentEntry>>('/admin/payments', {
    query: { ...query },
    ...(signal ? { signal } : {}),
  });
}

export function fetchMerchantRelationshipSummary(merchantId: string, signal?: AbortSignal) {
  return api.get<{ summary: RelationshipSummary }>(
    `/admin/merchants/${merchantId}/relationship-summary`,
    signal ? { signal } : undefined,
  );
}

/* ----------------------- Phase 4: orders and instalments ---------------------- */

export function fetchAdminOrders(query: OrderListQuery, signal?: AbortSignal) {
  return api.get<Paginated<Order>>('/admin/orders', {
    query: { ...query },
    ...(signal ? { signal } : {}),
  });
}

/**
 * The order, its payment entries and what it may become next.
 *
 * `allowedTransitions` comes from the server so the panel never keeps its own copy of the
 * lifecycle map — a second copy is one that can disagree.
 */
export function fetchAdminOrder(id: string, signal?: AbortSignal) {
  return api.get<{
    order: Order;
    payments: PaymentEntry[];
    allowedTransitions: OrderStatus[];
  }>(`/admin/orders/${id}`, signal ? { signal } : undefined);
}

export function transitionAdminOrder(id: string, status: OrderStatus, reason?: string) {
  return api.post<{ order: Order; allowedTransitions: OrderStatus[] }>(
    `/admin/orders/${id}/status`,
    { status, ...(reason ? { reason } : {}) },
  );
}

/** Cancelling has its own permission, so it has its own endpoint. */
export function cancelAdminOrder(id: string, reason?: string) {
  return api.post<{ order: Order }>(`/admin/orders/${id}/cancel`, {
    ...(reason ? { reason } : {}),
  });
}

/** Goes through the same payment engine a merchant uses, recorded as an admin action. */
export function recordAdminOrderPayment(
  id: string,
  input: {
    amountMinor: number;
    method: PaymentMethod;
    reference?: string;
    paidAt?: string;
    notes?: string;
    installmentNumber?: number;
  },
) {
  return api.post<{ payment: PaymentEntry; order: Order }>(`/admin/orders/${id}/payments`, input);
}

/** A plan is replaced wholesale, because it has to add up to the order total. */
export function setAdminInstallmentPlan(id: string, installments: InstallmentInput[]) {
  return api.put<{ order: Order }>(`/admin/orders/${id}/installments`, { installments });
}

export function fetchAdminInstallments(
  query: {
    merchantId?: string;
    overdue?: boolean;
    withinDays?: number;
    page?: number;
    limit?: number;
  },
  signal?: AbortSignal,
) {
  return api.get<Paginated<AdminInstallment>>('/admin/installments', {
    query: { ...query },
    ...(signal ? { signal } : {}),
  });
}

export function fetchAdminReceivables(
  query: { merchantId?: string; overdue?: boolean; page?: number; limit?: number },
  signal?: AbortSignal,
) {
  return api.get<Paginated<AdminReceivable>>('/admin/receivables', {
    query: { ...query },
    ...(signal ? { signal } : {}),
  });
}

export function fetchMerchantOrderSummary(merchantId: string, signal?: AbortSignal) {
  return api.get<{ summary: OrderSummary }>(
    `/admin/merchants/${merchantId}/order-summary`,
    signal ? { signal } : undefined,
  );
}

/* ---------------------------- units of measurement --------------------------- */

export function fetchUnits(signal?: AbortSignal) {
  return api.get<{ units: MeasurementUnit[] }>('/admin/units', signal ? { signal } : undefined);
}

export function createUnit(input: MeasurementUnitInput) {
  return api.post<{ unit: MeasurementUnit }>('/admin/units', input);
}

/** The code is fixed once created, so it is never sent on an update. */
export function updateUnit(id: string, input: Partial<Omit<MeasurementUnitInput, 'code'>>) {
  return api.patch<{ unit: MeasurementUnit }>(`/admin/units/${id}`, input);
}

export function deleteUnit(id: string) {
  return api.delete<{ deleted: boolean }>(`/admin/units/${id}`);
}
