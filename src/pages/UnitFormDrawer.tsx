import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { createUnit, updateUnit } from '../api/endpoints';
import type { MeasurementUnit, UnitAppliesTo, UnitGroup } from '../api/types';
import { Button } from '../components/Button';
import { Drawer } from '../components/Drawer';
import { LockedField, SelectField, TextField } from '../components/Field';
import { MaterialIcon } from '../components/MaterialIcon';
import { InlineAlert } from '../components/States';
import { useToast } from '../components/Toast';

interface UnitFormDrawerProps {
  /** The unit being edited, or null when creating one. */
  unit: MeasurementUnit | null;
  open: boolean;
  onClose: () => void;
  onSaved: (unit: MeasurementUnit) => void;
}

const CODE_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

/** A Material Icons name, matching the API's rule. */
const ICON_PATTERN = /^[a-z0-9_]{1,40}$/;

/** The merchant app's picker sections, in its order. */
const GROUP_OPTIONS: Array<{ value: UnitGroup; label: string }> = [
  { value: 'weight', label: 'By weight' },
  { value: 'volume', label: 'Liquid' },
  { value: 'count', label: 'By count' },
  { value: 'length', label: 'By length' },
  { value: 'other', label: 'Other' },
];

/**
 * Material icons that suit units, starting with the ones the merchant app's default
 * units use. Any other Material Icons name can be typed in.
 */
const SUGGESTED_ICONS = [
  'scale', 'water_drop', 'category', 'inventory_2', 'all_inbox', 'widgets', 'filter_2',
  'grid_view', 'shopping_bag', 'local_drink', 'toll', 'description', 'straighten',
  'square_foot', 'monitor_weight', 'liquor', 'egg', 'local_shipping', 'layers', 'view_module',
  'crop_square', 'texture', 'grain', 'opacity', 'local_gas_station', 'propane_tank',
  'medication', 'cookie', 'bakery_dining', 'checkroom',
];

/** Suggests a code from the name: "Square metre" becomes "square_metre". */
function suggestCode(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[0-9_]+/, '')
    .slice(0, 40);
}

/**
 * Create or edit a unit of measurement.
 *
 * The code is what records store, so it is chosen once and then locked. Everything a
 * merchant sees — the name and the label after a quantity — can change at any time.
 */
export function UnitFormDrawer({ unit, open, onClose, onSaved }: UnitFormDrawerProps) {
  const toast = useToast();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [icon, setIcon] = useState('');
  const [group, setGroup] = useState<UnitGroup>('other');
  const [wholeNumbersOnly, setWholeNumbersOnly] = useState(false);
  const [forItems, setForItems] = useState(true);
  const [forMaterials, setForMaterials] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState('');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Reset to the unit being opened, so a cancelled edit never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setName(unit?.name ?? '');
    setCode(unit?.code ?? '');
    setCodeTouched(false);
    setSymbol(unit?.symbol ?? '');
    setIcon(unit?.icon ?? '');
    setGroup(unit?.group ?? 'other');
    setWholeNumbersOnly(unit?.wholeNumbersOnly ?? false);
    setForItems(unit ? unit.appliesTo.includes('item') : true);
    setForMaterials(unit ? unit.appliesTo.includes('material') : true);
    setIsActive(unit?.isActive ?? true);
    setSortOrder(unit ? String(unit.sortOrder) : '');
    setFormError(null);
    setFieldErrors({});
  }, [open, unit]);

  function handleNameChange(value: string) {
    setName(value);
    if (!unit && !codeTouched) setCode(suggestCode(value));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFormError(null);

    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Enter a name.';
    if (!symbol.trim()) errors.symbol = 'Enter the label shown after a quantity.';
    if (!unit && !CODE_PATTERN.test(code)) {
      errors.code = 'Use lowercase letters, numbers and underscores, starting with a letter.';
    }
    if (icon.trim() && !ICON_PATTERN.test(icon.trim())) {
      errors.icon = 'Use a Material icon name, for example "scale" or "water_drop".';
    }
    if (!forItems && !forMaterials) errors.appliesTo = 'Choose products, raw materials or both.';
    if (sortOrder.trim() !== '' && !/^\d+$/.test(sortOrder.trim())) {
      errors.sortOrder = 'Enter a whole number.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const appliesTo: UnitAppliesTo[] = [
      ...(forItems ? (['item'] as const) : []),
      ...(forMaterials ? (['material'] as const) : []),
    ];
    const fields = {
      name: name.trim(),
      symbol: symbol.trim(),
      icon: icon.trim() || null,
      group,
      wholeNumbersOnly,
      appliesTo,
      isActive,
      ...(sortOrder.trim() !== '' ? { sortOrder: Number(sortOrder.trim()) } : {}),
    };

    setSaving(true);
    try {
      const result = unit ? await updateUnit(unit.id, fields) : await createUnit({ ...fields, code });
      toast.success(
        unit ? 'Unit updated' : 'Unit added',
        `${result.unit.name} (${result.unit.symbol})`,
      );
      onSaved(result.unit);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors());
        setFormError(error.message);
      } else {
        setFormError('Could not save this unit. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      busy={saving}
      title={unit ? `Edit ${unit.name}` : 'New unit'}
      description={
        unit
          ? 'Renaming a unit updates how it reads everywhere. Records keep using it.'
          : 'Add a unit merchants can choose when they describe a product or raw material.'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="unit-form" loading={saving}>
            {unit ? 'Save changes' : 'Add unit'}
          </Button>
        </>
      }
    >
      <form id="unit-form" className="stack gap-5" onSubmit={handleSubmit} noValidate>
        {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}

        <TextField
          label="Name"
          value={name}
          onChange={(event) => handleNameChange(event.target.value)}
          placeholder="Square metre"
          maxLength={40}
          required
          {...(fieldErrors.name ? { error: fieldErrors.name } : {})}
        />

        <TextField
          label="Label after a quantity"
          value={symbol}
          onChange={(event) => setSymbol(event.target.value)}
          placeholder="m²"
          maxLength={12}
          required
          hint='Shown as "12 m²". Use a short symbol or a plural word such as "pieces".'
          {...(fieldErrors.symbol ? { error: fieldErrors.symbol } : {})}
        />

        <SelectField
          label="Section in the app"
          options={GROUP_OPTIONS}
          value={group}
          onChange={(event) => setGroup(event.target.value as UnitGroup)}
          hint="The heading this unit appears under in the merchant app's unit picker."
          {...(fieldErrors.group ? { error: fieldErrors.group } : {})}
        />

        <div className="stack gap-3">
          <div className="row gap-4" style={{ alignItems: 'flex-start' }}>
            <div className="unit-tile unit-tile--selected" style={{ width: 104, flexShrink: 0 }} aria-label="Preview">
              <span className="unit-tile__icon">
                {icon.trim() ? <MaterialIcon name={icon.trim()} size={22} /> : null}
              </span>
              <span className="unit-tile__label">{symbol.trim() || 'label'}</span>
            </div>
            <div style={{ flex: 1 }}>
              <TextField
                label="Icon"
                optional
                value={icon}
                onChange={(event) => setIcon(event.target.value.trim().toLowerCase())}
                placeholder="scale"
                maxLength={40}
                hint="A Material Icons name. The preview shows the tile exactly as merchants see it."
                {...(fieldErrors.icon ? { error: fieldErrors.icon } : {})}
              />
            </div>
          </div>
          <div className="unit-grid" role="group" aria-label="Suggested icons" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}>
            {SUGGESTED_ICONS.map((choice) => (
              <button
                key={choice}
                type="button"
                className={`unit-tile${icon === choice ? ' unit-tile--selected' : ''}`}
                style={{ minHeight: 56, padding: 'var(--space-2)' }}
                aria-pressed={icon === choice}
                title={choice}
                aria-label={`Use the ${choice.replace(/_/g, ' ')} icon`}
                onClick={() => setIcon(icon === choice ? '' : choice)}
              >
                <span className="unit-tile__icon" style={{ width: 36, height: 36 }}>
                  <MaterialIcon name={choice} size={20} />
                </span>
              </button>
            ))}
          </div>
        </div>

        {unit ? (
          <LockedField label="Code" value={unit.code} hint="Records store this code, so it never changes." />
        ) : (
          <TextField
            label="Code"
            value={code}
            onChange={(event) => {
              setCodeTouched(true);
              setCode(event.target.value.toLowerCase());
            }}
            placeholder="square_metre"
            maxLength={40}
            required
            hint="A permanent identifier. It cannot be changed after the unit is added."
            {...(fieldErrors.code ? { error: fieldErrors.code } : {})}
          />
        )}

        <div className="stack gap-2">
          <span className="field__label" style={{ marginBottom: 0 }}>
            Available for
          </span>
          <label className="checkbox">
            <input type="checkbox" checked={forItems} onChange={(event) => setForItems(event.target.checked)} />
            <span>Products merchants sell</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={forMaterials}
              onChange={(event) => setForMaterials(event.target.checked)}
            />
            <span>Raw materials</span>
          </label>
          {fieldErrors.appliesTo ? <span className="field__error">{fieldErrors.appliesTo}</span> : null}
        </div>

        <div className="stack gap-2">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={wholeNumbersOnly}
              onChange={(event) => setWholeNumbersOnly(event.target.checked)}
            />
            <span>Whole numbers only</span>
          </label>
          <span className="field__hint">
            For counted units such as pieces or boxes. Measured units such as kilograms allow decimals.
          </span>
          {fieldErrors.wholeNumbersOnly ? (
            <span className="field__error">{fieldErrors.wholeNumbersOnly}</span>
          ) : null}
        </div>

        <div className="stack gap-2">
          <label className="checkbox">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            <span>Active</span>
          </label>
          <span className="field__hint">
            Inactive units are hidden from new choices. Records already using them are unaffected.
          </span>
        </div>

        <TextField
          label="Display order"
          optional
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
          hint="Lower numbers appear first in pickers. Leave empty to add at the end."
          {...(fieldErrors.sortOrder ? { error: fieldErrors.sortOrder } : {})}
        />
      </form>
    </Drawer>
  );
}
