import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { updateAdminItem, updateAdminMaterial, updateAdminService } from '../api/endpoints';
import type { BillingUnit, CatalogItem, CatalogMaterial, CatalogService } from '../api/types';
import { Button } from '../components/Button';
import { ImageGallery } from '../components/CatalogImages';
import { Drawer } from '../components/Drawer';
import { SelectField, TextField } from '../components/Field';
import { InlineAlert } from '../components/States';
import { useToast } from '../components/Toast';
import { billingUnitLabel, formatQuantity, unitOptions } from '../utils/format';
import { useCatalogMeta } from '../utils/useCatalogMeta';

/* ------------------------------- money inputs ------------------------------ */

/**
 * Money is stored in whole minor units, so the input shows major units and converts
 * once, on submit. Nothing keeps a partially converted value around.
 */
export function minorToInput(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '';
  return (minor / 100).toFixed(2);
}

export function inputToMinor(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  const parsed = Number(trimmed);
  if (Number.isNaN(parsed) || parsed < 0) return Number.NaN;
  // Rounded to the nearest minor unit, so a typed third decimal cannot silently vanish.
  return Math.round(parsed * 100);
}

function moneyError(text: string, { required = false } = {}): string | undefined {
  const value = inputToMinor(text);
  if (value === null) return required ? 'Enter an amount.' : undefined;
  if (Number.isNaN(value)) return 'Enter an amount of zero or more.';
  return undefined;
}

function quantityError(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;

  const parsed = Number(trimmed);
  if (Number.isNaN(parsed) || parsed < 0) return 'Enter a quantity of zero or more.';
  if (Math.abs(parsed * 1000 - Math.round(parsed * 1000)) > 1e-6) {
    return 'Use at most three decimal places.';
  }
  return undefined;
}

function nameError(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return 'Enter a name.';
  if (trimmed.length > 120) return 'Use 120 characters or fewer.';
  return undefined;
}

/* ------------------------------ shared drawer ----------------------------- */

interface EditDrawerShellProps {
  title: string;
  description: string;
  busy: boolean;
  formId: string;
  formError: string | null;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
}

function EditDrawerShell({
  title,
  description,
  busy,
  formId,
  formError,
  onClose,
  onSubmit,
  children,
}: EditDrawerShellProps) {
  return (
    <Drawer
      open
      title={title}
      description={description}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" form={formId} type="submit" loading={busy}>
            Save changes
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

/** Shows current stock without offering to change it here. */
function StockReadout({
  quantity,
  totalReceived,
  unit,
  trackStock,
}: {
  quantity: number;
  totalReceived: number;
  unit: string;
  trackStock: boolean;
}) {
  if (!trackStock) {
    return <InlineAlert tone="info">Stock is not tracked for this record.</InlineAlert>;
  }

  return (
    <InlineAlert tone="info">
      Available now: <strong>{formatQuantity(quantity, unit)}</strong>. Received in total:{' '}
      <strong>{formatQuantity(totalReceived, unit)}</strong>. Stock changes only through a stock
      adjustment, so every movement keeps a reason and a history.
    </InlineAlert>
  );
}

/* ---------------------------------- items --------------------------------- */

export function ItemEditDrawer({
  item,
  onClose,
  onSaved,
}: {
  item: CatalogItem | null;
  onClose: () => void;
  onSaved: (updated: CatalogItem) => void;
}) {
  const toast = useToast();
  const { meta } = useCatalogMeta();

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('piece');
  const [sellingPrice, setSellingPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [threshold, setThreshold] = useState('');
  const [description, setDescription] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setSku(item.sku ?? '');
    setUnit(item.unit);
    setSellingPrice(minorToInput(item.sellingPriceMinor));
    setCostPrice(minorToInput(item.costPriceMinor));
    setThreshold(String(item.lowStockThreshold));
    setDescription(item.description ?? '');
    setFieldErrors({});
    setFormError(null);
  }, [item]);

  if (!item) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!item || saving) return;

    const errors: Record<string, string> = {};
    const nameIssue = nameError(name);
    const sellingIssue = moneyError(sellingPrice, { required: true });
    const costIssue = moneyError(costPrice);
    const thresholdIssue = quantityError(threshold);

    if (nameIssue) errors.name = nameIssue;
    if (sellingIssue) errors.sellingPriceMinor = sellingIssue;
    if (costIssue) errors.costPriceMinor = costIssue;
    if (thresholdIssue) errors.lowStockThreshold = thresholdIssue;

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const result = await updateAdminItem(item.id, {
        name: name.trim(),
        sku: sku.trim() || null,
        unit,
        sellingPriceMinor: inputToMinor(sellingPrice) ?? 0,
        costPriceMinor: inputToMinor(costPrice),
        lowStockThreshold: threshold.trim() === '' ? 0 : Number(threshold),
        description: description.trim() || null,
      });

      toast.success('Product updated', `${result.item.name} was saved.`);
      onSaved(result.item);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const issues = error.fieldErrors();
        if (Object.keys(issues).length > 0) setFieldErrors(issues);
        setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditDrawerShell
      title="Edit product"
      description={`${item.name}${item.merchantName ? ` — ${item.merchantName}` : ''}`}
      busy={saving}
      formId="item-form"
      formError={formError}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <ImageGallery record={item} name={item.name} />

      <StockReadout
        quantity={item.quantity}
        totalReceived={item.totalReceived}
        unit={item.unit}
        trackStock={item.trackStock}
      />

      <TextField
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={120}
        {...(fieldErrors.name ? { error: fieldErrors.name } : {})}
      />

      <TextField
        label="SKU"
        optional
        value={sku}
        onChange={(event) => setSku(event.target.value)}
        maxLength={60}
        hint="Unique within this merchant's catalog."
        {...(fieldErrors.sku ? { error: fieldErrors.sku } : {})}
      />

      <SelectField
        label="Unit"
        options={unitOptions(meta.units, 'item', item.unit)}
        value={unit}
        onChange={(event) => setUnit(event.target.value)}
        {...(fieldErrors.unit ? { error: fieldErrors.unit } : {})}
      />

      <TextField
        label="Selling price"
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        value={sellingPrice}
        onChange={(event) => setSellingPrice(event.target.value)}
        {...(fieldErrors.sellingPriceMinor ? { error: fieldErrors.sellingPriceMinor } : {})}
      />

      <TextField
        label="Cost price"
        optional
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        value={costPrice}
        onChange={(event) => setCostPrice(event.target.value)}
        {...(fieldErrors.costPriceMinor ? { error: fieldErrors.costPriceMinor } : {})}
      />

      <TextField
        label="Low stock threshold"
        type="number"
        step="0.001"
        min="0"
        inputMode="decimal"
        value={threshold}
        onChange={(event) => setThreshold(event.target.value)}
        hint="The merchant is warned at or below this quantity."
        {...(fieldErrors.lowStockThreshold ? { error: fieldErrors.lowStockThreshold } : {})}
      />

      <TextField
        label="Description"
        optional
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={1000}
      />
    </EditDrawerShell>
  );
}

/* -------------------------------- services -------------------------------- */

export function ServiceEditDrawer({
  service,
  onClose,
  onSaved,
}: {
  service: CatalogService | null;
  onClose: () => void;
  onSaved: (updated: CatalogService) => void;
}) {
  const toast = useToast();
  const { meta } = useCatalogMeta();

  const [name, setName] = useState('');
  const [billingUnit, setBillingUnit] = useState<BillingUnit>('one_time');
  const [rate, setRate] = useState('');
  const [duration, setDuration] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [description, setDescription] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!service) return;
    setName(service.name);
    setBillingUnit(service.billingUnit);
    setRate(minorToInput(service.rateMinor));
    setDuration(service.durationMinutes === null ? '' : String(service.durationMinutes));
    setIsActive(service.isActive);
    setDescription(service.description ?? '');
    setFieldErrors({});
    setFormError(null);
  }, [service]);

  if (!service) return null;

  // Only time-based billing carries a duration, so the field appears only then.
  const supportsDuration =
    meta.billingUnits.find((option) => option.value === billingUnit)?.supportsDuration ?? false;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!service || saving) return;

    const errors: Record<string, string> = {};
    const nameIssue = nameError(name);
    const rateIssue = moneyError(rate, { required: true });

    if (nameIssue) errors.name = nameIssue;
    if (rateIssue) errors.rateMinor = rateIssue;
    if (supportsDuration && duration.trim() !== '') {
      const parsed = Number(duration);
      if (!Number.isInteger(parsed) || parsed < 1) {
        errors.durationMinutes = 'Enter a whole number of minutes.';
      }
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const result = await updateAdminService(service.id, {
        name: name.trim(),
        billingUnit,
        rateMinor: inputToMinor(rate) ?? 0,
        durationMinutes: supportsDuration && duration.trim() !== '' ? Number(duration) : null,
        isActive,
        description: description.trim() || null,
      });

      toast.success('Service updated', `${result.service.name} was saved.`);
      onSaved(result.service);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const issues = error.fieldErrors();
        if (Object.keys(issues).length > 0) setFieldErrors(issues);
        setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditDrawerShell
      title="Edit service"
      description={`${service.name}${service.merchantName ? ` — ${service.merchantName}` : ''}`}
      busy={saving}
      formId="service-form"
      formError={formError}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <ImageGallery record={service} name={service.name} />

      <InlineAlert tone="info">
        A service has no stock. Selling one never changes a quantity.
      </InlineAlert>

      <TextField
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={120}
        {...(fieldErrors.name ? { error: fieldErrors.name } : {})}
      />

      <SelectField
        label="How it is billed"
        options={meta.billingUnits.map((option) => ({
          value: option.value,
          label: billingUnitLabel(option.value),
        }))}
        value={billingUnit}
        onChange={(event) => setBillingUnit(event.target.value as BillingUnit)}
        {...(fieldErrors.billingUnit ? { error: fieldErrors.billingUnit } : {})}
      />

      <TextField
        label="Rate"
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        value={rate}
        onChange={(event) => setRate(event.target.value)}
        {...(fieldErrors.rateMinor ? { error: fieldErrors.rateMinor } : {})}
      />

      {supportsDuration ? (
        <TextField
          label="Typical duration in minutes"
          optional
          type="number"
          step="1"
          min="1"
          inputMode="numeric"
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
          {...(fieldErrors.durationMinutes ? { error: fieldErrors.durationMinutes } : {})}
        />
      ) : null}

      <SelectField
        label="Availability"
        options={[
          { value: 'active', label: 'Offered to customers' },
          { value: 'inactive', label: 'Temporarily off the menu' },
        ]}
        value={isActive ? 'active' : 'inactive'}
        onChange={(event) => setIsActive(event.target.value === 'active')}
        hint="Taking a service off the menu keeps its history."
      />

      <TextField
        label="Description"
        optional
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={1000}
      />
    </EditDrawerShell>
  );
}

/* -------------------------------- materials ------------------------------- */

export function MaterialEditDrawer({
  material,
  onClose,
  onSaved,
}: {
  material: CatalogMaterial | null;
  onClose: () => void;
  onSaved: (updated: CatalogMaterial) => void;
}) {
  const toast = useToast();
  const { meta } = useCatalogMeta();

  const [name, setName] = useState('');
  const [unit, setUnit] = useState('kilogram');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [threshold, setThreshold] = useState('');
  const [batchReference, setBatchReference] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!material) return;
    setName(material.name);
    setUnit(material.unit);
    setPurchaseCost(minorToInput(material.purchaseCostMinor));
    setThreshold(String(material.lowStockThreshold));
    setBatchReference(material.batchReference ?? '');
    setSupplierName(material.supplierName ?? '');
    setNotes(material.notes ?? '');
    setFieldErrors({});
    setFormError(null);
  }, [material]);

  if (!material) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!material || saving) return;

    const errors: Record<string, string> = {};
    const nameIssue = nameError(name);
    const costIssue = moneyError(purchaseCost);
    const thresholdIssue = quantityError(threshold);

    if (nameIssue) errors.name = nameIssue;
    if (costIssue) errors.purchaseCostMinor = costIssue;
    if (thresholdIssue) errors.lowStockThreshold = thresholdIssue;

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const result = await updateAdminMaterial(material.id, {
        name: name.trim(),
        unit,
        purchaseCostMinor: inputToMinor(purchaseCost),
        lowStockThreshold: threshold.trim() === '' ? 0 : Number(threshold),
        batchReference: batchReference.trim() || null,
        supplierName: supplierName.trim() || null,
        notes: notes.trim() || null,
      });

      toast.success('Raw material updated', `${result.material.name} was saved.`);
      onSaved(result.material);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const issues = error.fieldErrors();
        if (Object.keys(issues).length > 0) setFieldErrors(issues);
        setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditDrawerShell
      title="Edit raw material"
      description={`${material.name}${material.merchantName ? ` — ${material.merchantName}` : ''}`}
      busy={saving}
      formId="material-form"
      formError={formError}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <ImageGallery record={material} name={material.name} />

      <StockReadout
        quantity={material.quantity}
        totalReceived={material.totalReceived}
        unit={material.unit}
        trackStock={material.trackStock}
      />

      <TextField
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={120}
        {...(fieldErrors.name ? { error: fieldErrors.name } : {})}
      />

      <SelectField
        label="Unit of measurement"
        options={unitOptions(meta.units, 'material', material.unit)}
        value={unit}
        onChange={(event) => setUnit(event.target.value)}
        {...(fieldErrors.unit ? { error: fieldErrors.unit } : {})}
      />

      <TextField
        label="Purchase cost per unit"
        optional
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        value={purchaseCost}
        onChange={(event) => setPurchaseCost(event.target.value)}
        {...(fieldErrors.purchaseCostMinor ? { error: fieldErrors.purchaseCostMinor } : {})}
      />

      <TextField
        label="Low stock threshold"
        type="number"
        step="0.001"
        min="0"
        inputMode="decimal"
        value={threshold}
        onChange={(event) => setThreshold(event.target.value)}
        {...(fieldErrors.lowStockThreshold ? { error: fieldErrors.lowStockThreshold } : {})}
      />

      <TextField
        label="Batch reference"
        optional
        value={batchReference}
        onChange={(event) => setBatchReference(event.target.value)}
        maxLength={60}
      />

      <TextField
        label="Supplier"
        optional
        value={supplierName}
        onChange={(event) => setSupplierName(event.target.value)}
        maxLength={120}
        hint="Suppliers become records of their own in a later phase."
      />

      <TextField
        label="Notes"
        optional
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        maxLength={1000}
      />
    </EditDrawerShell>
  );
}
