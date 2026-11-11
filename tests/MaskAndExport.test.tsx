import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as client from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import * as auth from '../src/auth/AuthContext';
import { ExportButton } from '../src/components/ExportButton';
import { ToastProvider } from '../src/components/Toast';
import { MASKED_AMOUNT, amountsHidden, setAmountsHidden, useAmountsHidden } from '../src/utils/amountMask';
import { compactMoneyMinor } from '../src/utils/dashboardMath';
import { formatMoneyMinor } from '../src/utils/format';

afterEach(() => {
  setAmountsHidden(false);
  jest.restoreAllMocks();
});

describe('hide amounts', () => {
  it('masks every money figure while on, and only money', () => {
    expect(formatMoneyMinor(4_500)).toMatch(/45\.00/);

    setAmountsHidden(true);
    expect(formatMoneyMinor(4_500)).toBe(MASKED_AMOUNT);
    expect(formatMoneyMinor(0)).toBe(MASKED_AMOUNT);
    expect(compactMoneyMinor(12_500_000)).toBe(MASKED_AMOUNT);
    // "Not set" stays distinguishable from an amount.
    expect(formatMoneyMinor(null)).toBe('—');

    setAmountsHidden(false);
    expect(formatMoneyMinor(4_500)).toMatch(/45\.00/);
  });

  it('remembers the choice in this browser and tells subscribers', () => {
    const { result } = renderHook(() => useAmountsHidden());
    expect(result.current).toBe(false);

    act(() => setAmountsHidden(true));

    expect(result.current).toBe(true);
    expect(amountsHidden()).toBe(true);
    expect(localStorage.getItem('inperge.admin.hideAmounts')).toBe('true');
  });
});

describe('ExportButton', () => {
  const COLUMNS: endpoints.ExportColumnInfo[] = [
    { key: 'order', header: 'Order', kind: 'text' },
    { key: 'customer', header: 'Customer', kind: 'text' },
    { key: 'total', header: 'Total', kind: 'money' },
    { key: 'paid', header: 'Paid', kind: 'money' },
  ];

  function renderButton() {
    return render(
      <ToastProvider>
        <ExportButton report="orders" listPath="/admin/orders" title="Orders" />
      </ToastProvider>,
    );
  }

  /** Signed in with or without report.export. */
  function allow(canExport: boolean) {
    jest
      .spyOn(auth, 'useAuth')
      .mockReturnValue({ can: (...permissions: string[]) => canExport || !permissions.includes('report.export') } as never);
  }

  function mockDownload() {
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    return jest
      .spyOn(client.api, 'download')
      .mockResolvedValue({ blob: new Blob(['x']), fileName: 'inperge-orders-2026-11-11.xlsx' });
  }

  /** Opens the dialog and waits for its columns. */
  async function openDialog(user: ReturnType<typeof userEvent.setup>) {
    renderButton();
    await user.click(screen.getByRole('button', { name: 'Excel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Export orders to Excel' });
    await within(dialog).findByLabelText('Order');
    return dialog;
  }

  beforeEach(() => {
    allow(true);
    localStorage.clear();
    URL.createObjectURL = jest.fn(() => 'blob:report');
    URL.revokeObjectURL = jest.fn();
    jest.spyOn(endpoints, 'fetchExportColumns').mockResolvedValue({ report: 'orders', title: 'Orders', columns: COLUMNS });
  });

  it('asks before downloading, with every column ticked and amounts shown', async () => {
    const user = userEvent.setup();
    const download = mockDownload();
    jest.spyOn(client, 'lastListQuery').mockReturnValue({ merchantId: 'm-1', status: 'completed' });

    const dialog = await openDialog(user);
    expect(download).not.toHaveBeenCalled();
    for (const column of COLUMNS) expect(within(dialog).getByLabelText(new RegExp(`^${column.header}`))).toBeChecked();
    expect(within(dialog).getByLabelText('Show amounts')).toBeChecked();

    await user.click(within(dialog).getByRole('button', { name: 'Download Excel' }));

    await waitFor(() =>
      expect(download).toHaveBeenCalledWith('/admin/exports/orders', {
        merchantId: 'm-1',
        status: 'completed',
        utcOffsetMinutes: expect.any(Number),
      }),
    );
    expect(await screen.findByText('Excel downloaded')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sends only the chosen columns, and masks amounts when asked', async () => {
    const user = userEvent.setup();
    const download = mockDownload();
    jest.spyOn(client, 'lastListQuery').mockReturnValue({});

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByLabelText('Customer'));
    await user.click(within(dialog).getByLabelText(/^Paid/));
    await user.click(within(dialog).getByLabelText('Mask as ₹ XxXx'));
    await user.click(within(dialog).getByRole('button', { name: 'Download Excel' }));

    await waitFor(() =>
      expect(download).toHaveBeenCalledWith(
        '/admin/exports/orders',
        expect.objectContaining({ columns: 'order,total', maskAmounts: 'true' }),
      ),
    );
  });

  it('offers the amounts choice only when a chosen column has amounts', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByLabelText(/^Total/));
    expect(within(dialog).getByLabelText('Mask as ₹ XxXx')).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText(/^Paid/));
    expect(within(dialog).queryByLabelText('Mask as ₹ XxXx')).not.toBeInTheDocument();
  });

  it('needs at least one column', async () => {
    const user = userEvent.setup();
    const download = mockDownload();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('button', { name: 'Clear' }));

    expect(within(dialog).getByText('Choose at least one column.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Download Excel' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Select all' }));
    expect(within(dialog).getByRole('button', { name: 'Download Excel' })).toBeEnabled();
    expect(download).not.toHaveBeenCalled();
  });

  it('remembers the last choice for the report', async () => {
    const user = userEvent.setup();
    mockDownload();

    const first = await openDialog(user);
    await user.click(within(first).getByLabelText('Customer'));
    await user.click(within(first).getByLabelText('Mask as ₹ XxXx'));
    await user.click(within(first).getByRole('button', { name: 'Download Excel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Excel' }));
    const second = await screen.findByRole('dialog');
    await within(second).findByLabelText('Order');
    expect(within(second).getByLabelText('Customer')).not.toBeChecked();
    expect(within(second).getByLabelText('Order')).toBeChecked();
    expect(within(second).getByLabelText('Mask as ₹ XxXx')).toBeChecked();
  });

  it('starts masked while amounts are hidden on screen', async () => {
    const user = userEvent.setup();
    setAmountsHidden(true);

    const dialog = await openDialog(user);

    expect(within(dialog).getByLabelText('Mask as ₹ XxXx')).toBeChecked();
  });

  it('explains a refused export and keeps the dialog open', async () => {
    const user = userEvent.setup();
    jest.spyOn(client.api, 'download').mockRejectedValue(
      new client.ApiError(403, 'FORBIDDEN', 'Your role does not allow this action.'),
    );

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Download Excel' }));

    expect(await screen.findByText('Your role does not allow this action.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('is not offered without report.export', () => {
    allow(false);
    renderButton();
    expect(screen.queryByRole('button', { name: 'Excel' })).not.toBeInTheDocument();
  });

  it('offers Share only where the browser can share files', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    // jsdom has no Web Share API.
    expect(within(dialog).queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });
});

describe('lastListQuery', () => {
  it('remembers the filters a list last asked for, without paging', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { items: [], meta: {} } }),
    })) as unknown as typeof fetch;

    await client.api.get('/admin/payments', { query: { page: 3, limit: 50, method: 'upi', from: '2026-11-01' } });

    expect(client.lastListQuery('/admin/payments')).toEqual({ method: 'upi', from: '2026-11-01' });
    expect(client.lastListQuery('/admin/never-fetched')).toEqual({});
  });
});
