import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../src/components/Toast';
import { CatalogDeleteDialog, type DeletableRecord } from '../src/pages/CatalogDeleteDialog';

jest.mock('../src/api/endpoints', () => ({
  deleteAdminItem: jest.fn(),
  deleteAdminService: jest.fn(),
  deleteAdminMaterial: jest.fn(),
}));

import { deleteAdminItem, deleteAdminService } from '../src/api/endpoints';

const ITEM: DeletableRecord = {
  id: 'item-1',
  name: 'Masala Chai Packet',
  quantity: 19,
  unit: 'piece',
  trackStock: true,
};

function renderDialog(
  record: DeletableRecord | null,
  overrides: { kind?: 'item' | 'service'; onDeleted?: jest.Mock; onClose?: jest.Mock } = {},
) {
  const onDeleted = overrides.onDeleted ?? jest.fn();
  const onClose = overrides.onClose ?? jest.fn();
  render(
    <MemoryRouter>
      <ToastProvider>
        <CatalogDeleteDialog
          kind={overrides.kind ?? 'item'}
          record={record}
          onClose={onClose}
          onDeleted={onDeleted}
        />
      </ToastProvider>
    </MemoryRouter>,
  );
  return { onDeleted, onClose };
}

describe('CatalogDeleteDialog', () => {
  beforeEach(() => {
    (deleteAdminItem as jest.Mock).mockReset();
    (deleteAdminService as jest.Mock).mockReset();
  });

  it('stays shut until there is something to delete', () => {
    renderDialog(null);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('names the record and says the deletion cannot be undone', () => {
    renderDialog(ITEM);

    expect(screen.getByRole('heading', { name: 'Permanently delete Masala Chai Packet?' })).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(screen.getByText(/archive it instead/i)).toBeInTheDocument();
  });

  it('warns about stock that would go with it', () => {
    renderDialog(ITEM);
    expect(screen.getByText(/19 pieces/)).toBeInTheDocument();
  });

  it('says nothing about stock for a record that holds none', () => {
    renderDialog({ id: 'service-1', name: 'Phone Repair' }, { kind: 'service' });
    expect(screen.queryByText(/in stock/i)).not.toBeInTheDocument();
  });

  it('deletes on confirmation and tells the caller to refresh', async () => {
    const user = userEvent.setup();
    (deleteAdminItem as jest.Mock).mockResolvedValue({ deleted: true, name: ITEM.name });
    const { onDeleted, onClose } = renderDialog(ITEM);

    await user.click(screen.getByRole('button', { name: 'Delete product' }));

    await waitFor(() => expect(deleteAdminItem).toHaveBeenCalledWith('item-1'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('deletes nothing when the answer is to keep it', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog(ITEM);

    await user.click(screen.getByRole('button', { name: 'Keep it' }));

    expect(deleteAdminItem).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  /*
   * The case this dialog exists for: the API refuses because the record is still
   * referenced. The refusal has to stay on screen with its advice, rather than closing the
   * dialog or flashing past in a toast.
   */
  it('keeps the refusal on screen when the record is still in use', async () => {
    const user = userEvent.setup();
    const { ApiError } = jest.requireActual('../src/api/client');
    (deleteAdminItem as jest.Mock).mockRejectedValue(
      new ApiError(
        409,
        'RECORD_IN_USE',
        'This item is used by 1 order and cannot be deleted. Archive it instead to hide it without losing that history.',
      ),
    );
    const { onDeleted, onClose } = renderDialog(ITEM);

    await user.click(screen.getByRole('button', { name: 'Delete product' }));

    expect(await screen.findByText(/used by 1 order/)).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // The confirm turns into a way out rather than offering to try the same thing again.
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete product' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    expect(deleteAdminItem).toHaveBeenCalledTimes(1);
  });

  it('reports an ordinary failure without claiming the record is in use', async () => {
    const user = userEvent.setup();
    const { ApiError } = jest.requireActual('../src/api/client');
    (deleteAdminItem as jest.Mock).mockRejectedValue(
      new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.'),
    );
    renderDialog(ITEM);

    await user.click(screen.getByRole('button', { name: 'Delete product' }));

    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
    // Still offers to try, because this one might work next time.
    expect(screen.getByRole('button', { name: 'Delete product' })).toBeInTheDocument();
  });

  it('sends each kind to its own endpoint', async () => {
    const user = userEvent.setup();
    (deleteAdminService as jest.Mock).mockResolvedValue({ deleted: true, name: 'Phone Repair' });
    renderDialog({ id: 'service-1', name: 'Phone Repair' }, { kind: 'service' });

    await user.click(screen.getByRole('button', { name: 'Delete service' }));

    await waitFor(() => expect(deleteAdminService).toHaveBeenCalledWith('service-1'));
    expect(deleteAdminItem).not.toHaveBeenCalled();
  });
});
