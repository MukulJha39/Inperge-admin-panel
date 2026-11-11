import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, api, lastListQuery, type DownloadedFile } from '../api/client';
import { fetchExportColumns, type ExportColumnInfo } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { REPORT_PERMISSIONS } from '../auth/permissions';
import { amountsHidden } from '../utils/amountMask';
import { useFocusTrap } from '../utils/useFocusTrap';
import { Button } from './Button';
import { DownloadIcon, ShareIcon } from './Icon';
import { InlineAlert } from './States';
import { useToast } from './Toast';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Whether this browser can hand a file to the system share sheet (WhatsApp, email, …). */
function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function' || typeof File === 'undefined') {
    return false;
  }
  try {
    return navigator.canShare({ files: [new File([''], 'report.xlsx', { type: XLSX_TYPE })] });
  } catch {
    return false;
  }
}

function saveFile({ blob, fileName }: DownloadedFile): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick, once the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* ------------------------- remembered choices, per report ------------------------- */

interface ExportChoice {
  columns: string[];
  maskAmounts: boolean;
}

const choiceKey = (report: string) => `inperge.admin.export.${report}`;

function readChoice(report: string): Partial<ExportChoice> | null {
  try {
    const raw = localStorage.getItem(choiceKey(report));
    return raw ? (JSON.parse(raw) as Partial<ExportChoice>) : null;
  } catch {
    return null;
  }
}

function saveChoice(report: string, choice: ExportChoice): void {
  try {
    localStorage.setItem(choiceKey(report), JSON.stringify(choice));
  } catch {
    // Private mode: the choice simply lasts for this visit.
  }
}

/* ---------------------------------- dialog ---------------------------------- */

interface ExportDialogProps {
  report: string;
  listPath: string;
  title: string;
  onClose: () => void;
}

/**
 * Chooses what goes into the file before it is made: which columns, and whether any
 * amounts are written out or masked as ₹ XxXx. The last choice for each report is
 * remembered, so a regular export is two clicks.
 */
function ExportDialog({ report, listPath, title, onClose }: ExportDialogProps) {
  const toast = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [columns, setColumns] = useState<ExportColumnInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [maskAmounts, setMaskAmounts] = useState(false);
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const [shareable] = useState(canShareFiles);

  useFocusTrap(dialogRef, {
    active: true,
    onEscape: () => {
      if (!busy) onClose();
    },
  });

  useEffect(() => {
    const controller = new AbortController();
    fetchExportColumns(report, controller.signal)
      .then((result) => {
        const remembered = readChoice(report);
        const keys = result.columns.map((column) => column.key);
        const kept = (remembered?.columns ?? []).filter((key) => keys.includes(key));
        setColumns(result.columns);
        setSelected(new Set(kept.length > 0 ? kept : keys));
        // Hidden amounts on screen start the file hidden too; otherwise the last choice.
        setMaskAmounts(amountsHidden() || Boolean(remembered?.maskAmounts));
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadError(error instanceof ApiError ? error.message : 'Could not load the columns. Please try again.');
      });
    return () => controller.abort();
  }, [report]);

  const hasAmounts = useMemo(
    () => (columns ?? []).some((column) => column.kind === 'money' && selected.has(column.key)),
    [columns, selected],
  );

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function run(mode: 'download' | 'share') {
    if (!columns || busy || selected.size === 0) return;
    // In the report's own order, whatever order they were ticked in.
    const chosen = columns.filter((column) => selected.has(column.key)).map((column) => column.key);
    saveChoice(report, { columns: chosen, maskAmounts });

    setBusy(mode);
    try {
      const file = await api.download(`/admin/exports/${report}`, {
        ...lastListQuery(listPath),
        // So times in the file read as the reader's own clock.
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
        ...(chosen.length < columns.length ? { columns: chosen.join(',') } : {}),
        ...(hasAmounts && maskAmounts ? { maskAmounts: 'true' } : {}),
      });

      if (mode === 'share') {
        const shared = new File([file.blob], file.fileName, { type: XLSX_TYPE });
        try {
          await navigator.share({ files: [shared], title: `${title} — Inperge`, text: `${title} report from Inperge` });
          onClose();
        } catch (error) {
          // Closing the share sheet is not a failure.
          if (error instanceof DOMException && error.name === 'AbortError') return;
          // A browser can refuse a share it said it could do; the file is saved instead.
          saveFile(file);
          toast.success('Excel downloaded', 'Sharing was not available, so the file was saved instead.');
          onClose();
        }
        return;
      }

      saveFile(file);
      toast.success('Excel downloaded', `${file.fileName} — attach it to WhatsApp or email to share it.`);
      onClose();
    } catch (error) {
      toast.error('Could not export', error instanceof ApiError ? error.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return createPortal(
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div ref={dialogRef} className="dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="dialog__body stack gap-4">
          <div>
            <h2 className="dialog__title" id={titleId}>
              Export {title.toLowerCase()} to Excel
            </h2>
            <p className="text-sm text-secondary">The file follows the filters on screen and includes every page.</p>
          </div>

          {loadError ? <InlineAlert tone="error">{loadError}</InlineAlert> : null}
          {!columns && !loadError ? <p className="text-sm text-muted">Loading columns…</p> : null}

          {columns ? (
            <>
              <fieldset className="export-fieldset">
                <legend className="row-between">
                  <span className="field__label">
                    Columns <span className="field__optional">{selected.size} of {columns.length}</span>
                  </span>
                  <span className="row gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(columns.map((column) => column.key)))}>
                      Select all
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                      Clear
                    </Button>
                  </span>
                </legend>
                <div className="export-fields">
                  {columns.map((column) => (
                    <label key={column.key} className="export-field">
                      <input type="checkbox" checked={selected.has(column.key)} onChange={() => toggle(column.key)} />
                      <span>{column.header}</span>
                      {column.kind === 'money' ? <span className="export-field__tag">₹</span> : null}
                    </label>
                  ))}
                </div>
                {selected.size === 0 ? (
                  <span className="field__error" role="alert">
                    Choose at least one column.
                  </span>
                ) : null}
              </fieldset>

              {hasAmounts ? (
                <fieldset className="export-fieldset">
                  <legend className="field__label">Amounts</legend>
                  <div className="row gap-2 wrap">
                    <label className="checkbox">
                      <input type="radio" name={`${titleId}-amounts`} checked={!maskAmounts} onChange={() => setMaskAmounts(false)} />
                      Show amounts
                    </label>
                    <label className="checkbox">
                      <input type="radio" name={`${titleId}-amounts`} checked={maskAmounts} onChange={() => setMaskAmounts(true)} />
                      Mask as ₹ XxXx
                    </label>
                  </div>
                  <span className="field__hint">
                    {maskAmounts
                      ? 'Every amount in the file is written as ₹ XxXx — for sharing without prices.'
                      : 'Amounts are written as numbers in rupees, so they add up in Excel.'}
                  </span>
                </fieldset>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="dialog__footer">
          <Button variant="ghost" onClick={onClose} disabled={Boolean(busy)}>
            Cancel
          </Button>
          {shareable ? (
            <Button
              variant="secondary"
              icon={<ShareIcon />}
              loading={busy === 'share'}
              disabled={!columns || selected.size === 0 || busy === 'download'}
              onClick={() => void run('share')}
            >
              Share
            </Button>
          ) : null}
          <Button
            icon={<DownloadIcon />}
            loading={busy === 'download'}
            disabled={!columns || selected.size === 0 || busy === 'share'}
            onClick={() => void run('download')}
          >
            Download Excel
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------------------------------- button ---------------------------------- */

interface ExportButtonProps {
  /** The export to download, as `/admin/exports/<report>` names it. */
  report: string;
  /** The list the page shows, whose current filters the file should follow. */
  listPath: string;
  /** What the file is, such as "Orders". */
  title: string;
}

/**
 * Exports the list on screen to Excel — the same filters, every page — after the reader
 * chooses the columns and whether amounts are shown or masked. Where the browser can,
 * the file goes straight to the share sheet (WhatsApp, email, …).
 * Shown only to administrators with report.export.
 */
export function ExportButton({ report, listPath, title }: ExportButtonProps) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);

  // Exporting needs report.export as well as the list itself; without it, no button.
  if (!can(REPORT_PERMISSIONS.REPORT_EXPORT)) return null;

  return (
    <>
      <Button variant="secondary" icon={<DownloadIcon />} onClick={() => setOpen(true)}>
        Excel
      </Button>
      {open ? <ExportDialog report={report} listPath={listPath} title={title} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
