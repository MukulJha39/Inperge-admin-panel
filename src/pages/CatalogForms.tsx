import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import {
  createAdminCategory,
  createAdminItem,
  createAdminMaterial,
  createAdminService,
  fetchMerchantCategories,
  fetchMerchants,
  removeAdminImage,
  renameAdminCategory,
  reorderAdminImages,
  setAdminCategoryArchived,
  updateAdminItem,
  updateAdminMaterial,
  updateAdminService,
  uploadAdminImages,
} from '../api/endpoints';
import type {
  BillingUnit,
  CatalogImage,
  CatalogItem,
  CatalogMaterial,
  CatalogService,
  Category,
  CategoryKind,
  GalleryKind,
  Merchant,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CATALOG_PERMISSIONS } from '../auth/permissions';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { ImageManager, PhotoPicker, imagesOf } from '../components/CatalogImages';
import { Drawer } from '../components/Drawer';
import { SelectField, TextField } from '../components/Field';
import { InlineAlert } from '../components/States';
import { useToast } from '../components/Toast';
import { billingUnitLabel, formatQuantity, unitLabel, unitOptions } from '../utils/format';
import { useCatalogMeta } from '../utils/useCatalogMeta';
import { inputToMinor, minorToInput, moneyError, nameError, quantityError } from './CatalogDrawers';

/**
 * Creating and editing products, services and raw materials on a merchant's behalf.
 *
 * One form per kind serves both create and edit, with every field the merchant app has.
 * The server applies the same rules either way; the checks here only spare a round trip.
 * Photos are managed in the same drawer — live on an existing record, and uploaded right
 * after a new one is created.
 */

/** Which record a form drawer is open for, if any. */
export type FormTarget<T> =
  | { mode: 'create'; merchantId?: string; merchantName?: string | null }
  | { mode: 'edit'; record: T }
  | null;

/* ------------------------------ shared pieces ------------------------------ */

function percentError(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  if (Number.isNaN(value) || value < 0 || value > 100) return 'Enter a percentage between 0 and 100.';
  return undefined;
}

const optionalNumber = (text: string): number | null => (text.trim() === '' ? null : Number(text));

function CheckboxField({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <label className="checkbox">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        {label}
      </label>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

/** Lets a create started outside a merchant's page choose whose catalog it goes into. */
function MerchantField({ value, onChange, error }: { value: string; onChange: (id: string) => void; error?: string }) {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchMerchants({ limit: 50, sort: 'firstName', ...(search.trim() ? { search: search.trim() } : {}) }, controller.signal)
        .then((page) => setMerchants(page.items))
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  return (
    <div className="stack gap-2">
      <TextField
        label="Find the merchant"
        value={search}
        placeholder="Name or phone number"
        onChange={(event) => setSearch(event.target.value)}
      />
      <SelectField
        label="Merchant"
        value={value}
        placeholder="Choose a merchant"
        options={merchants.map((merchant) => ({
          value: merchant.id,
          label: `${merchant.fullName} · ${merchant.phoneE164}`,
        }))}
        onChange={(event) => onChange(event.target.value)}
        {...(error ? { error } : {})}
      />
    </div>
  );
}

const NEW_CATEGORY = '__new__';

/** The merchant's categories of one kind, with a way to add one without leaving the form. */
function CategoryField({
  merchantId,
  kind,
  value,
  onChange,
  error,
}: {
  merchantId: string | null;
  kind: CategoryKind;
  value: string;
  onChange: (categoryId: string) => void;
  error?: string;
}) {
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setCategories([]);
    if (!merchantId) return;
    const controller = new AbortController();
    fetchMerchantCategories(merchantId, controller.signal)
      .then((result) => setCategories(result.categories.filter((category) => category.kind === kind)))
      .catch(() => undefined);
    return () => controller.abort();
  }, [merchantId, kind]);

  const options = categories
    .filter((category) => !category.archived || category.id === value)
    .map((category) => ({ value: category.id, label: category.archived ? `${category.name} (archived)` : category.name }));

  async function addCategory() {
    if (!merchantId || saving) return;
    const name = newName.trim();
    if (!name) {
      setProblem('Enter a category name.');
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const result = await createAdminCategory(merchantId, { kind, name });
      setCategories((current) => [...current.filter((category) => category.id !== result.category.id), result.category]);
      onChange(result.category.id);
      setAdding(false);
      setNewName('');
      toast.success('Category added', result.category.name);
    } catch (requestError) {
      setProblem(requestError instanceof ApiError ? requestError.message : 'Could not add the category.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack gap-2">
      <SelectField
        label="Category"
        optional
        value={adding ? NEW_CATEGORY : value}
        disabled={!merchantId}
        options={[
          { value: '', label: 'No category' },
          ...options,
          { value: NEW_CATEGORY, label: '+ New category…' },
        ]}
        onChange={(event) => {
          if (event.target.value === NEW_CATEGORY) {
            setAdding(true);
            return;
          }
          setAdding(false);
          onChange(event.target.value);
        }}
        {...(error ? { error } : {})}
      />
      {adding ? (
        <div className="row gap-2 category-add">
          <TextField
            label="New category name"
            value={newName}
            maxLength={60}
            onChange={(event) => setNewName(event.target.value)}
            {...(problem ? { error: problem } : {})}
          />
          <Button size="sm" onClick={() => void addCategory()} loading={saving}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Photos: live on an existing record, staged on a new one. */
function PhotosSection<T extends { id: string; imageUrl: string | null; images?: CatalogImage[] }>({
  kind,
  record,
  name,
  staged,
  onStagedChange,
  onRecordChange,
}: {
  kind: GalleryKind;
  record: T | null;
  name: string;
  staged: File[];
  onStagedChange: (files: File[]) => void;
  onRecordChange: (record: T) => void;
}) {
  const failure = (error: unknown) =>
    new Error(error instanceof ApiError ? error.message : 'That did not work. Please try again.');

  if (!record) return <PhotoPicker files={staged} onChange={onStagedChange} />;

  return (
    <ImageManager
      record={record}
      name={name || record.id}
      onUpload={async (files) => {
        try {
          onRecordChange((await uploadAdminImages(kind, record.id, files)) as unknown as T);
        } catch (error) {
          throw failure(error);
        }
      }}
      onRemove={async (image) => {
        try {
          onRecordChange((await removeAdminImage(kind, record.id, image.id)) as unknown as T);
        } catch (error) {
          throw failure(error);
        }
      }}
      onMakeCover={async (image) => {
        const order = [image.id, ...imagesOf(record).map((entry) => entry.id).filter((id) => id !== image.id)];
        try {
          onRecordChange((await reorderAdminImages(kind, record.id, order)) as unknown as T);
        } catch (error) {
          throw failure(error);
        }
      }}
    />
  );
}

function FormDrawer({
  title,
  description,
  formId,
  submitLabel,
  saving,
  formError,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  description?: string;
  formId: string;
  submitLabel: string;
  saving: boolean;
  formError: string | null;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
}) {
  return (
    <Drawer
      open
      title={title}
      {...(description ? { description } : {})}
      busy={saving}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" form={formId} type="submit" loading={saving}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} className="stack gap-5" onSubmit={onSubmit} noValidate>
        {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}
        {children}
      </form>
    </Drawer>
  );
}

/** Shared create/edit bookkeeping: which merchant, the live record, errors, staged photos. */
function useFormState<T extends { id: string; merchantId: string; merchantName?: string | null }>(target: FormTarget<T>) {
  const [merchantId, setMerchantId] = useState('');
  const [record, setRecord] = useState<T | null>(null);
  const [staged, setStaged] = useState<File[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setRecord(target.mode === 'edit' ? target.record : null);
    setMerchantId(target.mode === 'edit' ? target.record.merchantId : target.merchantId ?? '');
    setStaged([]);
    setFieldErrors({});
    setFormError(null);
  }, [target]);

  const merchantName =
    target?.mode === 'edit' ? target.record.merchantName ?? null : target?.merchantName ?? null;
  const fixedMerchant = target?.mode === 'edit' || Boolean(target?.mode === 'create' && target.merchantId);

  const failed = useCallback((error: unknown) => {
    if (error instanceof ApiError) {
      const issues = error.fieldErrors();
      if (Object.keys(issues).length > 0) setFieldErrors(issues);
      setFormError(error.message);
    } else {
      setFormError('Something went wrong. Please try again.');
    }
  }, []);

  return {
    merchantId,
    setMerchantId,
    merchantName,
    fixedMerchant,
    record,
    setRecord,
    staged,
    setStaged,
    fieldErrors,
    setFieldErrors,
    formError,
    setFormError,
    saving,
    setSaving,
    failed,
  };
}

/** After a create, uploads the photos chosen in the form. A failure here keeps the record. */
async function uploadStaged<T>(
  kind: GalleryKind,
  created: T & { id: string },
  files: File[],
  toast: ReturnType<typeof useToast>,
): Promise<T> {
  if (files.length === 0) return created;
  try {
    return (await uploadAdminImages(kind, created.id, files)) as unknown as T;
  } catch (error) {
    toast.error(
      'Saved, but the photos were not uploaded',
      error instanceof ApiError ? error.message : 'Open the record and add them again.',
    );
    return created;
  }
}

function errorProps(errors: Record<string, string>, key: string) {
  return errors[key] ? { error: errors[key] } : {};
}

/* --------------------------------- products -------------------------------- */

export function ProductFormDrawer({
  target,
  onClose,
  onSaved,
}: {
  target: FormTarget<CatalogItem>;
  onClose: () => void;
  onSaved: (item: CatalogItem, created: boolean) => void;
}) {
  const toast = useToast();
  const { meta } = useCatalogMeta();
  const form = useFormState(target);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [unit, setUnit] = useState('');
  const [trackStock, setTrackStock] = useState(true);
  const [opening, setOpening] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [threshold, setThreshold] = useState('');
  const [description, setDescription] = useState('');

  const units = useMemo(() => unitOptions(meta.units, 'item', unit || undefined), [meta.units, unit]);

  useEffect(() => {
    if (!target) return;
    const item = target.mode === 'edit' ? target.record : null;
    setName(item?.name ?? '');
    setCategoryId(item?.categoryId ?? '');
    setSku(item?.sku ?? '');
    setBarcode(item?.barcode ?? '');
    setUnit(item?.unit ?? '');
    setTrackStock(item?.trackStock ?? true);
    setOpening('');
    setSellingPrice(item ? minorToInput(item.sellingPriceMinor) : '');
    setCostPrice(minorToInput(item?.costPriceMinor));
    setTaxRate(item?.taxRatePercent === null || item?.taxRatePercent === undefined ? '' : String(item.taxRatePercent));
    setThreshold(item ? String(item.lowStockThreshold) : '');
    setDescription(item?.description ?? '');
  }, [target]);

  // A new product starts on the first unit offered for products.
  useEffect(() => {
    if (!unit && units[0]) setUnit(units[0].value);
  }, [unit, units]);

  if (!target) return null;
  const editing = form.record;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.saving) return;
    form.setFormError(null);

    const errors: Record<string, string> = {};
    const checks: Array<[string, string | undefined]> = [
      ['name', nameError(name)],
      ['sellingPriceMinor', moneyError(sellingPrice, { required: true })],
      ['costPriceMinor', moneyError(costPrice)],
      ['taxRatePercent', percentError(taxRate)],
      ['lowStockThreshold', quantityError(threshold)],
      ['openingQuantity', editing ? undefined : quantityError(opening)],
      ['merchantId', form.merchantId ? undefined : 'Choose the merchant this product belongs to.'],
      ['unit', unit ? undefined : 'Choose a unit.'],
    ];
    for (const [key, issue] of checks) if (issue) errors[key] = issue;
    form.setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const input = {
      name: name.trim(),
      categoryId: categoryId || null,
      sku: sku.trim() || null,
      barcode: barcode.trim() || null,
      unit,
      trackStock,
      sellingPriceMinor: inputToMinor(sellingPrice) ?? 0,
      costPriceMinor: inputToMinor(costPrice),
      taxRatePercent: optionalNumber(taxRate),
      lowStockThreshold: threshold.trim() === '' ? 0 : Number(threshold),
      description: description.trim() || null,
    };

    form.setSaving(true);
    try {
      if (editing) {
        const result = await updateAdminItem(editing.id, input);
        toast.success('Product updated', `${result.item.name} was saved.`);
        onSaved(result.item, false);
      } else {
        const result = await createAdminItem(form.merchantId, {
          ...input,
          ...(trackStock && opening.trim() !== '' ? { openingQuantity: Number(opening) } : {}),
        });
        const withPhotos = await uploadStaged('items', result.item, form.staged, toast);
        toast.success('Product added', `${result.item.name} is now in the merchant's catalog.`);
        onSaved(withPhotos, true);
      }
      onClose();
    } catch (error) {
      form.failed(error);
    } finally {
      form.setSaving(false);
    }
  }

  return (
    <FormDrawer
      title={editing ? 'Edit product' : 'Add a product'}
      description={
        editing
          ? `${editing.name}${form.merchantName ? ` — ${form.merchantName}` : ''}`
          : form.merchantName
            ? `For ${form.merchantName}. It appears in their app straight away.`
            : 'It appears in the merchant’s app straight away.'
      }
      formId="product-form"
      submitLabel={editing ? 'Save changes' : 'Add product'}
      saving={form.saving}
      formError={form.formError}
      onClose={onClose}
      onSubmit={submit}
    >
      {!form.fixedMerchant ? (
        <MerchantField
          value={form.merchantId}
          onChange={form.setMerchantId}
          {...errorProps(form.fieldErrors, 'merchantId')}
        />
      ) : null}

      <PhotosSection
        kind="items"
        record={editing}
        name={name}
        staged={form.staged}
        onStagedChange={form.setStaged}
        onRecordChange={(updated) => {
          form.setRecord(updated);
          onSaved(updated, false);
        }}
      />

      {editing?.trackStock ? (
        <InlineAlert tone="info">
          Available now: <strong>{formatQuantity(editing.quantity, editing.unit)}</strong>. Use “Adjust
          stock” on the list to change it, so every movement keeps a reason.
        </InlineAlert>
      ) : null}

      <TextField label="Name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} {...errorProps(form.fieldErrors, 'name')} />

      <CategoryField
        merchantId={form.merchantId || null}
        kind="item"
        value={categoryId}
        onChange={setCategoryId}
        {...errorProps(form.fieldErrors, 'categoryId')}
      />

      <div className="field-grid">
        <TextField label="SKU" optional value={sku} maxLength={60} hint="Unique within this merchant." onChange={(event) => setSku(event.target.value)} {...errorProps(form.fieldErrors, 'sku')} />
        <TextField label="Barcode" optional value={barcode} maxLength={60} onChange={(event) => setBarcode(event.target.value)} {...errorProps(form.fieldErrors, 'barcode')} />
      </div>

      <div className="field-grid">
        <TextField label="Selling price (₹)" type="number" step="0.01" min="0" inputMode="decimal" value={sellingPrice} onChange={(event) => setSellingPrice(event.target.value)} {...errorProps(form.fieldErrors, 'sellingPriceMinor')} />
        <TextField label="Cost price (₹)" optional type="number" step="0.01" min="0" inputMode="decimal" value={costPrice} onChange={(event) => setCostPrice(event.target.value)} {...errorProps(form.fieldErrors, 'costPriceMinor')} />
        <TextField label="Tax rate (%)" optional type="number" step="0.01" min="0" max="100" inputMode="decimal" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} {...errorProps(form.fieldErrors, 'taxRatePercent')} />
      </div>

      <SelectField label="Unit" options={units} value={unit} onChange={(event) => setUnit(event.target.value)} {...errorProps(form.fieldErrors, 'unit')} />

      <CheckboxField
        label="Track stock for this product"
        hint="Off for things that are never counted, such as made-to-order goods."
        checked={trackStock}
        onChange={setTrackStock}
      />

      {trackStock ? (
        <div className="field-grid">
          {!editing ? (
            <TextField label={`Opening stock${unit ? ` (${unitLabel(unit)})` : ''}`} optional type="number" step="0.001" min="0" inputMode="decimal" value={opening} hint="Recorded as the first stock entry." onChange={(event) => setOpening(event.target.value)} {...errorProps(form.fieldErrors, 'openingQuantity')} />
          ) : null}
          <TextField label="Low stock alert at" optional type="number" step="0.001" min="0" inputMode="decimal" value={threshold} hint="Flagged at or below this quantity." onChange={(event) => setThreshold(event.target.value)} {...errorProps(form.fieldErrors, 'lowStockThreshold')} />
        </div>
      ) : null}

      <TextField label="Description" optional value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} {...errorProps(form.fieldErrors, 'description')} />
    </FormDrawer>
  );
}

/* --------------------------------- services -------------------------------- */

export function ServiceFormDrawer({
  target,
  onClose,
  onSaved,
}: {
  target: FormTarget<CatalogService>;
  onClose: () => void;
  onSaved: (service: CatalogService, created: boolean) => void;
}) {
  const toast = useToast();
  const { meta } = useCatalogMeta();
  const form = useFormState(target);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [billingUnit, setBillingUnit] = useState<BillingUnit>('one_time');
  const [rate, setRate] = useState('');
  const [duration, setDuration] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!target) return;
    const service = target.mode === 'edit' ? target.record : null;
    setName(service?.name ?? '');
    setCategoryId(service?.categoryId ?? '');
    setBillingUnit(service?.billingUnit ?? 'one_time');
    setRate(service ? minorToInput(service.rateMinor) : '');
    setDuration(service?.durationMinutes ? String(service.durationMinutes) : '');
    setTaxRate(service?.taxRatePercent === null || service?.taxRatePercent === undefined ? '' : String(service.taxRatePercent));
    setIsActive(service?.isActive ?? true);
    setDescription(service?.description ?? '');
  }, [target]);

  if (!target) return null;
  const editing = form.record;
  const supportsDuration = meta.billingUnits.find((option) => option.value === billingUnit)?.supportsDuration ?? false;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.saving) return;
    form.setFormError(null);

    const errors: Record<string, string> = {};
    const nameIssue = nameError(name);
    const rateIssue = moneyError(rate, { required: true });
    const taxIssue = percentError(taxRate);
    if (nameIssue) errors.name = nameIssue;
    if (rateIssue) errors.rateMinor = rateIssue;
    if (taxIssue) errors.taxRatePercent = taxIssue;
    if (!form.merchantId) errors.merchantId = 'Choose the merchant this service belongs to.';
    if (supportsDuration && duration.trim() !== '') {
      const minutes = Number(duration);
      if (!Number.isInteger(minutes) || minutes < 1) errors.durationMinutes = 'Enter a whole number of minutes.';
    }
    form.setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const input = {
      name: name.trim(),
      categoryId: categoryId || null,
      billingUnit,
      rateMinor: inputToMinor(rate) ?? 0,
      durationMinutes: supportsDuration && duration.trim() !== '' ? Number(duration) : null,
      taxRatePercent: optionalNumber(taxRate),
      isActive,
      description: description.trim() || null,
    };

    form.setSaving(true);
    try {
      if (editing) {
        const result = await updateAdminService(editing.id, input);
        toast.success('Service updated', `${result.service.name} was saved.`);
        onSaved(result.service, false);
      } else {
        const result = await createAdminService(form.merchantId, input);
        const withPhotos = await uploadStaged('services', result.service, form.staged, toast);
        toast.success('Service added', `${result.service.name} is now in the merchant's catalog.`);
        onSaved(withPhotos, true);
      }
      onClose();
    } catch (error) {
      form.failed(error);
    } finally {
      form.setSaving(false);
    }
  }

  return (
    <FormDrawer
      title={editing ? 'Edit service' : 'Add a service'}
      description={
        editing
          ? `${editing.name}${form.merchantName ? ` — ${form.merchantName}` : ''}`
          : form.merchantName
            ? `For ${form.merchantName}. It appears in their app straight away.`
            : 'It appears in the merchant’s app straight away.'
      }
      formId="service-form"
      submitLabel={editing ? 'Save changes' : 'Add service'}
      saving={form.saving}
      formError={form.formError}
      onClose={onClose}
      onSubmit={submit}
    >
      {!form.fixedMerchant ? (
        <MerchantField value={form.merchantId} onChange={form.setMerchantId} {...errorProps(form.fieldErrors, 'merchantId')} />
      ) : null}

      <PhotosSection
        kind="services"
        record={editing}
        name={name}
        staged={form.staged}
        onStagedChange={form.setStaged}
        onRecordChange={(updated) => {
          form.setRecord(updated);
          onSaved(updated, false);
        }}
      />

      <TextField label="Name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} {...errorProps(form.fieldErrors, 'name')} />

      <CategoryField merchantId={form.merchantId || null} kind="service" value={categoryId} onChange={setCategoryId} {...errorProps(form.fieldErrors, 'categoryId')} />

      <SelectField
        label="Billed"
        options={meta.billingUnits.map((option) => ({ value: option.value, label: billingUnitLabel(option.value) }))}
        value={billingUnit}
        onChange={(event) => setBillingUnit(event.target.value as BillingUnit)}
        {...errorProps(form.fieldErrors, 'billingUnit')}
      />

      <div className="field-grid">
        <TextField label="Rate (₹)" type="number" step="0.01" min="0" inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} {...errorProps(form.fieldErrors, 'rateMinor')} />
        {supportsDuration ? (
          <TextField label="Duration (minutes)" optional type="number" step="1" min="1" inputMode="numeric" value={duration} onChange={(event) => setDuration(event.target.value)} {...errorProps(form.fieldErrors, 'durationMinutes')} />
        ) : null}
        <TextField label="Tax rate (%)" optional type="number" step="0.01" min="0" max="100" inputMode="decimal" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} {...errorProps(form.fieldErrors, 'taxRatePercent')} />
      </div>

      <CheckboxField label="Offered" hint="Untick to take it off the menu for now without archiving it." checked={isActive} onChange={setIsActive} />

      <TextField label="Description" optional value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} {...errorProps(form.fieldErrors, 'description')} />
    </FormDrawer>
  );
}

/* ------------------------------- raw materials ----------------------------- */

export function MaterialFormDrawer({
  target,
  onClose,
  onSaved,
}: {
  target: FormTarget<CatalogMaterial>;
  onClose: () => void;
  onSaved: (material: CatalogMaterial, created: boolean) => void;
}) {
  const toast = useToast();
  const { meta } = useCatalogMeta();
  const form = useFormState(target);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [unit, setUnit] = useState('');
  const [trackStock, setTrackStock] = useState(true);
  const [opening, setOpening] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [threshold, setThreshold] = useState('');
  const [batchReference, setBatchReference] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');

  const units = useMemo(() => unitOptions(meta.units, 'material', unit || undefined), [meta.units, unit]);

  useEffect(() => {
    if (!target) return;
    const material = target.mode === 'edit' ? target.record : null;
    setName(material?.name ?? '');
    setCategoryId(material?.categoryId ?? '');
    setUnit(material?.unit ?? '');
    setTrackStock(material?.trackStock ?? true);
    setOpening('');
    setPurchaseCost(minorToInput(material?.purchaseCostMinor));
    setThreshold(material ? String(material.lowStockThreshold) : '');
    setBatchReference(material?.batchReference ?? '');
    setExpiryDate(material?.expiryDate ? material.expiryDate.slice(0, 10) : '');
    setSupplierName(material?.supplierName ?? '');
    setNotes(material?.notes ?? '');
  }, [target]);

  useEffect(() => {
    if (!unit && units[0]) setUnit(units[0].value);
  }, [unit, units]);

  if (!target) return null;
  const editing = form.record;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.saving) return;
    form.setFormError(null);

    const errors: Record<string, string> = {};
    const checks: Array<[string, string | undefined]> = [
      ['name', nameError(name)],
      ['purchaseCostMinor', moneyError(purchaseCost)],
      ['lowStockThreshold', quantityError(threshold)],
      ['openingQuantity', editing ? undefined : quantityError(opening)],
      ['merchantId', form.merchantId ? undefined : 'Choose the merchant this raw material belongs to.'],
      ['unit', unit ? undefined : 'Choose a unit.'],
    ];
    for (const [key, issue] of checks) if (issue) errors[key] = issue;
    form.setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const input = {
      name: name.trim(),
      categoryId: categoryId || null,
      unit,
      trackStock,
      purchaseCostMinor: inputToMinor(purchaseCost),
      lowStockThreshold: threshold.trim() === '' ? 0 : Number(threshold),
      batchReference: batchReference.trim() || null,
      expiryDate: expiryDate || null,
      supplierName: supplierName.trim() || null,
      notes: notes.trim() || null,
    };

    form.setSaving(true);
    try {
      if (editing) {
        const result = await updateAdminMaterial(editing.id, input);
        toast.success('Raw material updated', `${result.material.name} was saved.`);
        onSaved(result.material, false);
      } else {
        const result = await createAdminMaterial(form.merchantId, {
          ...input,
          ...(trackStock && opening.trim() !== '' ? { openingQuantity: Number(opening) } : {}),
        });
        const withPhotos = await uploadStaged('materials', result.material, form.staged, toast);
        toast.success('Raw material added', `${result.material.name} is now in the merchant's catalog.`);
        onSaved(withPhotos, true);
      }
      onClose();
    } catch (error) {
      form.failed(error);
    } finally {
      form.setSaving(false);
    }
  }

  return (
    <FormDrawer
      title={editing ? 'Edit raw material' : 'Add a raw material'}
      description={
        editing
          ? `${editing.name}${form.merchantName ? ` — ${form.merchantName}` : ''}`
          : form.merchantName
            ? `For ${form.merchantName}. It appears in their app straight away.`
            : 'It appears in the merchant’s app straight away.'
      }
      formId="material-form"
      submitLabel={editing ? 'Save changes' : 'Add raw material'}
      saving={form.saving}
      formError={form.formError}
      onClose={onClose}
      onSubmit={submit}
    >
      {!form.fixedMerchant ? (
        <MerchantField value={form.merchantId} onChange={form.setMerchantId} {...errorProps(form.fieldErrors, 'merchantId')} />
      ) : null}

      <PhotosSection
        kind="materials"
        record={editing}
        name={name}
        staged={form.staged}
        onStagedChange={form.setStaged}
        onRecordChange={(updated) => {
          form.setRecord(updated);
          onSaved(updated, false);
        }}
      />

      {editing?.trackStock ? (
        <InlineAlert tone="info">
          Available now: <strong>{formatQuantity(editing.quantity, editing.unit)}</strong>. Use “Adjust
          stock” on the list to change it, so every movement keeps a reason.
        </InlineAlert>
      ) : null}

      <TextField label="Name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} {...errorProps(form.fieldErrors, 'name')} />

      <CategoryField merchantId={form.merchantId || null} kind="material" value={categoryId} onChange={setCategoryId} {...errorProps(form.fieldErrors, 'categoryId')} />

      <div className="field-grid">
        <SelectField label="Unit" options={units} value={unit} onChange={(event) => setUnit(event.target.value)} {...errorProps(form.fieldErrors, 'unit')} />
        <TextField label="Purchase cost (₹)" optional type="number" step="0.01" min="0" inputMode="decimal" value={purchaseCost} hint="What one unit costs to buy." onChange={(event) => setPurchaseCost(event.target.value)} {...errorProps(form.fieldErrors, 'purchaseCostMinor')} />
      </div>

      <CheckboxField label="Track stock for this material" checked={trackStock} onChange={setTrackStock} />

      {trackStock ? (
        <div className="field-grid">
          {!editing ? (
            <TextField label={`Opening stock${unit ? ` (${unitLabel(unit)})` : ''}`} optional type="number" step="0.001" min="0" inputMode="decimal" value={opening} hint="Recorded as the first stock entry." onChange={(event) => setOpening(event.target.value)} {...errorProps(form.fieldErrors, 'openingQuantity')} />
          ) : null}
          <TextField label="Low stock alert at" optional type="number" step="0.001" min="0" inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} {...errorProps(form.fieldErrors, 'lowStockThreshold')} />
        </div>
      ) : null}

      <div className="field-grid">
        <TextField label="Batch reference" optional value={batchReference} maxLength={60} onChange={(event) => setBatchReference(event.target.value)} {...errorProps(form.fieldErrors, 'batchReference')} />
        <TextField label="Expiry date" optional type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} {...errorProps(form.fieldErrors, 'expiryDate')} />
      </div>

      <TextField label="Supplier" optional value={supplierName} maxLength={120} onChange={(event) => setSupplierName(event.target.value)} {...errorProps(form.fieldErrors, 'supplierName')} />

      <TextField label="Notes" optional value={notes} maxLength={1000} onChange={(event) => setNotes(event.target.value)} {...errorProps(form.fieldErrors, 'notes')} />
    </FormDrawer>
  );
}

/* ------------------------------- categories -------------------------------- */

const KIND_SECTIONS: Array<{ kind: CategoryKind; title: string; permission: string }> = [
  { kind: 'item', title: 'Product categories', permission: CATALOG_PERMISSIONS.ITEM_MANAGE },
  { kind: 'service', title: 'Service categories', permission: CATALOG_PERMISSIONS.SERVICE_MANAGE },
  { kind: 'material', title: 'Raw material categories', permission: CATALOG_PERMISSIONS.MATERIAL_MANAGE },
];

function CategoryRow({
  category,
  canManage,
  onChanged,
}: {
  category: Category;
  canManage: boolean;
  onChanged: (category: Category) => void;
}) {
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(category.name);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function run(action: () => Promise<{ category: Category }>, success: string) {
    setBusy(true);
    setProblem(null);
    try {
      const result = await action();
      onChanged(result.category);
      toast.success(success, result.category.name);
      setRenaming(false);
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : 'That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="category-row">
      {renaming ? (
        <form
          className="row gap-2 category-add"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) void run(() => renameAdminCategory(category.id, name.trim()), 'Category renamed');
          }}
        >
          <TextField
            label={`New name for ${category.name}`}
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            {...(problem ? { error: problem } : {})}
          />
          <Button size="sm" type="submit" loading={busy}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRenaming(false)} disabled={busy}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="row-between">
          <span className="row gap-2">
            <span className={category.archived ? 'text-secondary' : 'text-medium'}>{category.name}</span>
            {typeof category.usageCount === 'number' ? (
              <span className="text-xs text-muted">{category.usageCount} filed</span>
            ) : null}
            {category.archived ? <Chip>Archived</Chip> : null}
          </span>
          {canManage ? (
            <span className="row gap-1">
              <Button size="sm" variant="ghost" onClick={() => setRenaming(true)} disabled={busy}>
                Rename
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={busy}
                onClick={() =>
                  void run(
                    () => setAdminCategoryArchived(category.id, !category.archived),
                    category.archived ? 'Category restored' : 'Category archived',
                  )
                }
              >
                {category.archived ? 'Restore' : 'Archive'}
              </Button>
            </span>
          ) : null}
        </div>
      )}
      {problem && !renaming ? (
        <span className="field__error" role="alert">
          {problem}
        </span>
      ) : null}
    </li>
  );
}

function AddCategory({
  merchantId,
  kind,
  onAdded,
}: {
  merchantId: string;
  kind: CategoryKind;
  onAdded: (category: Category) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await createAdminCategory(merchantId, { kind, name: name.trim() });
      onAdded(result.category);
      toast.success('Category added', result.category.name);
      setName('');
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : 'Could not add the category.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="row gap-2 category-add" onSubmit={add}>
      <TextField
        label="Add a category"
        value={name}
        maxLength={60}
        placeholder="For example Groceries"
        onChange={(event) => setName(event.target.value)}
        {...(problem ? { error: problem } : {})}
      />
      <Button size="sm" type="submit" loading={busy} disabled={!name.trim()}>
        Add
      </Button>
    </form>
  );
}

/**
 * A merchant's categories, all three kinds, with add, rename, archive and restore. Each
 * kind is managed with the permission for the records it files.
 */
export function CategoryManagerDrawer({
  merchantId,
  merchantName,
  open,
  onClose,
  onChanged,
}: {
  merchantId: string;
  merchantName?: string | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    fetchMerchantCategories(merchantId, controller.signal)
      .then((result) => setCategories(result.categories))
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [open, merchantId]);

  if (!open) return null;

  function upsert(category: Category) {
    setCategories((current) => {
      const existing = current.find((entry) => entry.id === category.id);
      return existing
        ? current.map((entry) => (entry.id === category.id ? { ...existing, ...category } : entry))
        : [...current, category];
    });
    onChanged();
  }

  return (
    <Drawer
      open
      title="Categories"
      description={merchantName ? `${merchantName}'s catalog groups` : 'This merchant’s catalog groups'}
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="stack gap-6">
        {loading ? <p className="text-sm text-muted">Loading categories…</p> : null}
        {KIND_SECTIONS.map((section) => {
          const canManage = can(section.permission);
          const rows = categories
            .filter((category) => category.kind === section.kind)
            .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
          return (
            <section key={section.kind} className="stack gap-3">
              <h3 className="text-sm text-muted text-upper">{section.title}</h3>
              {rows.length === 0 ? (
                <p className="text-sm text-secondary">None yet.</p>
              ) : (
                <ul className="stack gap-2">
                  {rows.map((category) => (
                    <CategoryRow key={category.id} category={category} canManage={canManage} onChanged={upsert} />
                  ))}
                </ul>
              )}
              {canManage ? <AddCategory merchantId={merchantId} kind={section.kind} onAdded={upsert} /> : null}
            </section>
          );
        })}
      </div>
    </Drawer>
  );
}
