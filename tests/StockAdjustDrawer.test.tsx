import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import { ToastProvider } from '../src/components/Toast';
import { StockAdjustDrawer, type StockSubject } from '../src/pages/StockAdjustDrawer';
import { resetCatalogMetaCache } from '../src/utils/useCatalogMeta';

jest.mock('../src/api/endpoints');

const mocked = endpoints as jest.Mocked<typeof endpoints>;

const SUBJECT: StockSubject = {
  id: 'item-1',
  name: 'Masala Chai',
  unit: 'piece',
  quantity: 10,
  subjectType: 'item',
};

function renderDrawer(subject: StockSubject | null = SUBJECT, onAdjusted = jest.fn()) {
  const onClose = jest.fn();
  render(
    <ToastProvider>
      <StockAdjustDrawer subject={subject} onClose={onClose} onAdjusted={onAdjusted} />
    </ToastProvider>,
  );
  return { onClose, onAdjusted };
}

function movementResponse(balanceAfter: number) {
  return {
    item: { ...SUBJECT, quantity: balanceAfter } as never,
    movement: {
      id: 'mv-1',
      subjectType: 'item' as const,
      subjectId: 'item-1',
      subjectName: 'Masala Chai',
      type: 'adjustment' as const,
      reason: 'damaged' as const,
      delta: balanceAfter - SUBJECT.quantity,
      balanceAfter,
      note: null,
      actorType: 'admin' as const,
      actorLabel: 'Super Admin',
      createdAt: new Date().toISOString(),
    },
  };
}

beforeEach(() => {
  resetCatalogMetaCache();
  mocked.adjustStock.mockReset();
});

describe('StockAdjustDrawer', () => {
  it('shows the current quantity and asks what happened', () => {
    renderDrawer();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/currently 10 pieces/)).toBeInTheDocument();
    expect(screen.getByLabelText('What happened')).toHaveValue('remove');
    expect(screen.getByLabelText('Reason')).toBeInTheDocument();
  });

  it('renders nothing when there is no subject', () => {
    renderDrawer(null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('requires an amount before calling the API', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Record adjustment' }));

    expect(screen.getByText('Enter how much stock changed.')).toBeInTheDocument();
    expect(mocked.adjustStock).not.toHaveBeenCalled();
  });

  it('refuses an amount of zero or less', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.type(screen.getByLabelText(/Amount in/), '0');
    await user.click(screen.getByRole('button', { name: 'Record adjustment' }));

    expect(screen.getByText('Enter an amount greater than zero.')).toBeInTheDocument();
    expect(mocked.adjustStock).not.toHaveBeenCalled();
  });

  it('refuses more than three decimal places', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.type(screen.getByLabelText(/Amount in/), '1.0005');
    await user.click(screen.getByRole('button', { name: 'Record adjustment' }));

    expect(screen.getByText('Use at most three decimal places.')).toBeInTheDocument();
    expect(mocked.adjustStock).not.toHaveBeenCalled();
  });

  it('refuses to remove more than is available, and says how much there is', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.type(screen.getByLabelText(/Amount in/), '15');
    await user.click(screen.getByRole('button', { name: 'Record adjustment' }));

    expect(screen.getByText('Only 10 pieces is available.')).toBeInTheDocument();
    expect(mocked.adjustStock).not.toHaveBeenCalled();
  });

  it('allows adding more than the current quantity', async () => {
    const user = userEvent.setup();
    mocked.adjustStock.mockResolvedValue(movementResponse(25));
    renderDrawer();

    await user.selectOptions(screen.getByLabelText('What happened'), 'add');
    await user.type(screen.getByLabelText(/Amount in/), '15');
    await user.selectOptions(screen.getByLabelText('Reason'), 'found');
    await user.click(screen.getByRole('button', { name: 'Record adjustment' }));

    await waitFor(() =>
      expect(mocked.adjustStock).toHaveBeenCalledWith('item', 'item-1', {
        change: 15,
        reason: 'found',
      }),
    );
  });

  it('sends a negative change when stock went down', async () => {
    const user = userEvent.setup();
    mocked.adjustStock.mockResolvedValue(movementResponse(6));
    const { onAdjusted, onClose } = renderDrawer();

    await user.type(screen.getByLabelText(/Amount in/), '4');
    await user.selectOptions(screen.getByLabelText('Reason'), 'damaged');
    await user.type(screen.getByLabelText(/^Note/), 'Reported by the merchant');
    await user.click(screen.getByRole('button', { name: 'Record adjustment' }));

    await waitFor(() =>
      expect(mocked.adjustStock).toHaveBeenCalledWith('item', 'item-1', {
        change: -4,
        reason: 'damaged',
        note: 'Reported by the merchant',
      }),
    );
    expect(onAdjusted).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('previews the resulting quantity before submitting', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.type(screen.getByLabelText(/Amount in/), '3');

    expect(screen.getByText('New quantity: 7 pieces')).toBeInTheDocument();
  });

  it('keeps what was entered when the server refuses the change', async () => {
    const user = userEvent.setup();
    mocked.adjustStock.mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'There is not enough stock. Available: 2 piece.'),
    );
    const { onClose } = renderDrawer();

    await user.type(screen.getByLabelText(/Amount in/), '4');
    await user.click(screen.getByRole('button', { name: 'Record adjustment' }));

    await waitFor(() => expect(screen.getByText(/not enough stock/i)).toBeInTheDocument());

    // The drawer stays open with the values intact, so the admin can correct and retry.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Amount in/)).toHaveValue(4);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('explains that the change is recorded in the merchant ledger', () => {
    renderDrawer();

    expect(screen.getByText(/written to the merchant/i)).toBeInTheDocument();
    expect(screen.getByText(/appears in their app/i)).toBeInTheDocument();
  });
});
