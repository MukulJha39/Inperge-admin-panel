import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { deleteUnit, fetchUnits, updateUnit } from '../api/endpoints';
import type { MeasurementUnit, UnitGroup } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CATALOG_PERMISSIONS } from '../auth/permissions';
import { Button, IconButton } from '../components/Button';
import { Chip } from '../components/Chip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DataTable, type Column } from '../components/DataTable';
import { EditIcon, EyeIcon, PlusIcon, ShieldOffIcon, TrashIcon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { MaterialIcon } from '../components/MaterialIcon';
import { InlineAlert } from '../components/States';
import { useToast } from '../components/Toast';
import { refreshCatalogMeta } from '../utils/useCatalogMeta';
import { UnitFormDrawer } from './UnitFormDrawer';

/** The merchant app's picker sections, in its order. */
const GROUPS: Array<{ value: UnitGroup; label: string }> = [
  { value: 'weight', label: 'By weight' },
  { value: 'volume', label: 'Liquid' },
  { value: 'count', label: 'By count' },
  { value: 'length', label: 'By length' },
  { value: 'other', label: 'Other' },
];

function groupLabel(group: UnitGroup): string {
  return GROUPS.find((entry) => entry.value === group)?.label ?? 'Other';
}

function usageTotal(unit: MeasurementUnit): number {
  const usage = unit.usage;
  return usage ? usage.items + usage.materials + usage.orders + usage.purchases : 0;
}

/**
 * Units of measurement merchants choose for the products they sell and the raw materials
 * they buy.
 *
 * A unit in use can be renamed or deactivated but not deleted, so past orders and
 * purchases always read the way they did when they were recorded.
 */
export function UnitsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const canManage = can(CATALOG_PERMISSIONS.UNIT_MANAGE);

  const [units, setUnits] = useState<MeasurementUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MeasurementUnit | null>(null);
  const [deleting, setDeleting] = useState<MeasurementUnit | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchUnits(controller.signal);
        if (!cancelled) setUnits(result.units);
      } catch (requestError) {
        if (cancelled || (requestError instanceof DOMException && requestError.name === 'AbortError')) return;
        setUnits([]);
        setError(requestError instanceof ApiError ? requestError.message : 'Could not load units. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadToken]);

  /** Reloads this list and the vocabulary every other screen reads. */
  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
    void refreshCatalogMeta();
  }, []);

  const activeCount = useMemo(() => units.filter((unit) => unit.isActive).length, [units]);

  async function toggleActive(unit: MeasurementUnit) {
    setBusy(true);
    try {
      await updateUnit(unit.id, { isActive: !unit.isActive });
      toast.success(
        unit.isActive ? 'Unit deactivated' : 'Unit activated',
        unit.isActive
          ? `${unit.name} is hidden from new choices. Existing records keep it.`
          : `${unit.name} can be chosen again.`,
      );
      reload();
    } catch (toggleError) {
      toast.error('Could not change this unit', toggleError instanceof ApiError ? toggleError.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteUnit(deleting.id);
      toast.success('Unit deleted', `${deleting.name} has been removed.`);
      setDeleting(null);
      reload();
    } catch (deleteError) {
      toast.error('Could not delete this unit', deleteError instanceof ApiError ? deleteError.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<MeasurementUnit>[] = [
    {
      key: 'name',
      header: 'Unit',
      grow: true,
      render: (unit) => (
        <div className="row gap-3">
          <span className="unit-tile__icon" style={{ width: 36, height: 36, flexShrink: 0 }}>
            {unit.icon ? <MaterialIcon name={unit.icon} size={20} /> : null}
          </span>
          <div className="stack gap-1">
            <span className="text-medium">{unit.name}</span>
          </div>
        </div>
      ),
    },
    { key: 'code', header: 'Code', render: (unit) => <span className="text-xs text-muted">{unit.code}</span> },
    {
      key: 'symbol',
      header: 'Shown as',
      render: (unit) => <span className="text-numeric">12 {unit.symbol}</span>,
    },
    {
      key: 'group',
      header: 'Section',
      render: (unit) => groupLabel(unit.group),
    },
    {
      key: 'appliesToProducts',
      header: 'For products',
      render: (unit) => unit.appliesTo.includes('item') ? 'Yes' : '—',
    },
    {
      key: 'appliesToMaterials',
      header: 'For raw materials',
      render: (unit) => unit.appliesTo.includes('material') ? 'Yes' : '—',
    },
    {
      key: 'wholeNumbersOnly',
      header: 'Quantities',
      render: (unit) => (unit.wholeNumbersOnly ? 'Whole numbers' : 'Decimals allowed'),
    },
    { key: 'productsUsed', header: 'Products using unit', numeric: true, render: (unit) => unit.usage?.items ?? 0 },
    { key: 'materialsUsed', header: 'Raw materials using unit', numeric: true, render: (unit) => unit.usage?.materials ?? 0 },
    { key: 'ordersUsed', header: 'Orders using unit', numeric: true, render: (unit) => unit.usage?.orders ?? 0 },
    { key: 'purchasesUsed', header: 'Purchases using unit', numeric: true, render: (unit) => unit.usage?.purchases ?? 0 },
    {
      key: 'status',
      header: 'Status',
      render: (unit) =>
        unit.isActive ? (
          <Chip tone="success" dot>
            Active
          </Chip>
        ) : (
          <Chip dot>Inactive</Chip>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Units of measurement"
        description="The units merchants choose for the products they sell and the raw materials they buy."
        badge={loading ? null : <Chip tone="brand">{activeCount} active</Chip>}
        {...(canManage && !loading && !error
          ? {
              actions: (
                <Button variant="primary" icon={<PlusIcon size={14} />} onClick={() => setCreating(true)}>
                  New unit
                </Button>
              ),
            }
          : {})}
      />

      <section className="card">
        <DataTable
          caption="Units of measurement"
          columns={columns}
          rows={units}
          rowKey={(unit) => unit.id}
          loading={loading}
          error={error}
          onRetry={reload}
          empty={{
            title: 'No units yet',
            message: 'Add a unit so merchants can describe their stock.',
            ...(canManage ? { action: { label: 'New unit', onClick: () => setCreating(true) } } : {}),
          }}
          {...(canManage
            ? {
                rowActions: (unit: MeasurementUnit) => (
                  <>
                    <IconButton label={`Edit ${unit.name}`} icon={<EditIcon />} onClick={() => setEditing(unit)} />
                    <IconButton
                      label={unit.isActive ? `Deactivate ${unit.name}` : `Activate ${unit.name}`}
                      icon={unit.isActive ? <ShieldOffIcon /> : <EyeIcon />}
                      disabled={busy}
                      onClick={() => void toggleActive(unit)}
                    />
                    {usageTotal(unit) === 0 ? (
                      <IconButton label={`Delete ${unit.name}`} icon={<TrashIcon />} onClick={() => setDeleting(unit)} />
                    ) : null}
                  </>
                ),
              }
            : {})}
        />
      </section>

      {!loading && !error && units.length > 0 ? (
        <section className="card" style={{ marginTop: 'var(--space-4)', padding: 'var(--space-5)' }}>
          <div className="stack gap-1" style={{ marginBottom: 'var(--space-5)' }}>
            <h2 className="unit-group__title" style={{ margin: 0 }}>
              As merchants see it
            </h2>
            <span className="text-sm text-muted">
              The app&rsquo;s &ldquo;Choose unit&rdquo; sheet, built from these units. Inactive units are faded here
              and hidden in the app.
            </span>
          </div>
          <div className="unit-groups">
            {GROUPS.map((group) => {
              const members = units
                .filter((unit) => (unit.group ?? 'other') === group.value)
                .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
              if (members.length === 0) return null;
              return (
                <div key={group.value}>
                  <h3 className="unit-group__title">{group.label}</h3>
                  <div className="unit-grid">
                    {members.map((unit) => {
                      const tile = (
                        <>
                          <span className="unit-tile__icon">
                            {unit.icon ? <MaterialIcon name={unit.icon} size={22} /> : null}
                          </span>
                          <span className="unit-tile__label">{unit.symbol}</span>
                        </>
                      );
                      const className = `unit-tile${unit.isActive ? '' : ' unit-tile--inactive'}`;
                      return canManage ? (
                        <button
                          key={unit.id}
                          type="button"
                          className={className}
                          title={`Edit ${unit.name}`}
                          onClick={() => setEditing(unit)}
                        >
                          {tile}
                        </button>
                      ) : (
                        <div key={unit.id} className={className} title={unit.name}>
                          {tile}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <div style={{ marginTop: 'var(--space-4)' }}>
        <InlineAlert tone="info">
          A unit in use cannot be deleted, so past orders and purchases always read correctly. Deactivate
          it instead: it disappears from new choices, and records that already use it keep it.
        </InlineAlert>
      </div>

      <UnitFormDrawer
        unit={editing}
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={reload}
      />

      <ConfirmDialog
        open={deleting !== null}
        destructive
        busy={busy}
        title={`Delete ${deleting?.name ?? 'this unit'}?`}
        message="No record uses this unit, so deleting it changes nothing for merchants. This cannot be undone."
        confirmLabel="Delete unit"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
