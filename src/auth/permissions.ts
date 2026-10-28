/**
 * Permission strings used by the admin UI.
 *
 * These mirror the server catalogue. Hiding a control here is a convenience for the
 * admin, never a security boundary — the API enforces the same permission
 * independently (PRD section 26).
 */
export const PERMISSIONS = {
  MERCHANT_VIEW: 'merchant.view',
  MERCHANT_CREATE: 'merchant.create',
  MERCHANT_EDIT: 'merchant.edit',
  MERCHANT_SUSPEND: 'merchant.suspend',
  ROLE_VIEW: 'role.view',
  ROLE_MANAGE: 'role.manage',
  ADMIN_VIEW: 'admin.view',
  ADMIN_MANAGE: 'admin.manage',
  AUDIT_VIEW: 'audit.view',
} as const;

export type PermissionName = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Readable labels for permission strings shown in the role matrix. */
export function describePermission(permission: string): string {
  const [resource, action] = permission.split('.');
  if (!resource || !action) return permission;

  const resourceLabels: Record<string, string> = {
    merchant: 'merchants',
    business: 'businesses',
    customer: 'customers',
    supplier: 'suppliers',
    item: 'items',
    service: 'services',
    material: 'raw materials',
    stock: 'stock',
    unit: 'units of measurement',
    purchase: 'purchases',
    order: 'orders',
    payment: 'payments',
    installment: 'installments',
    reminder: 'reminders',
    report: 'reports',
    admin: 'admins',
    role: 'roles',
    audit: 'audit history',
  };

  const actionLabels: Record<string, string> = {
    view: 'View',
    create: 'Create',
    edit: 'Edit',
    suspend: 'Suspend',
    archive: 'Archive',
    delete: 'Permanently delete',
    cancel: 'Cancel',
    manage: 'Manage',
    adjust: 'Adjust',
    export: 'Export',
  };

  return `${actionLabels[action] ?? action} ${resourceLabels[resource] ?? resource}`;
}

/* ------------------------------ Phase 2: catalog ----------------------------- */

export const CATALOG_PERMISSIONS = {
  BUSINESS_VIEW: 'business.view',
  BUSINESS_EDIT: 'business.edit',
  ITEM_VIEW: 'item.view',
  ITEM_MANAGE: 'item.manage',
  ITEM_DELETE: 'item.delete',
  SERVICE_VIEW: 'service.view',
  SERVICE_MANAGE: 'service.manage',
  SERVICE_DELETE: 'service.delete',
  MATERIAL_VIEW: 'material.view',
  MATERIAL_MANAGE: 'material.manage',
  MATERIAL_DELETE: 'material.delete',
  STOCK_VIEW: 'stock.view',
  STOCK_ADJUST: 'stock.adjust',
  UNIT_MANAGE: 'unit.manage',
} as const;

/* ------------------ Phase 3: customers, suppliers, purchases ----------------- */

export const RELATIONSHIP_PERMISSIONS = {
  CUSTOMER_VIEW: 'customer.view',
  CUSTOMER_CREATE: 'customer.create',
  CUSTOMER_EDIT: 'customer.edit',
  CUSTOMER_ARCHIVE: 'customer.archive',
  SUPPLIER_VIEW: 'supplier.view',
  SUPPLIER_MANAGE: 'supplier.manage',
  PURCHASE_VIEW: 'purchase.view',
  PURCHASE_MANAGE: 'purchase.manage',
  PAYMENT_VIEW: 'payment.view',
  PAYMENT_MANAGE: 'payment.manage',
} as const;

/* ------------------ Phase 4: orders, payments and instalments ----------------- */

export const ORDER_PERMISSIONS = {
  ORDER_VIEW: 'order.view',
  ORDER_EDIT: 'order.edit',
  ORDER_CANCEL: 'order.cancel',
  PAYMENT_VIEW: 'payment.view',
  PAYMENT_MANAGE: 'payment.manage',
  INSTALLMENT_VIEW: 'installment.view',
  INSTALLMENT_MANAGE: 'installment.manage',
} as const;
