import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as endpoints from '../src/api/endpoints';
import type { CatalogImage, CatalogItem, CatalogMaterial, CatalogService, Category } from '../src/api/types';
import { AuthProvider } from '../src/auth/AuthContext';
import { ToastProvider } from '../src/components/Toast';
import {
  CategoryManagerDrawer,
  MaterialFormDrawer,
  ProductFormDrawer,
  ServiceFormDrawer,
} from '../src/pages/CatalogForms';
import { StockAdjustDrawer } from '../src/pages/StockAdjustDrawer';
import { resetCatalogMetaCache } from '../src/utils/useCatalogMeta';

jest.mock('../src/api/endpoints');

const mocked = endpoints as jest.Mocked<typeof endpoints>;

const META = {
  units: [
    { value: 'piece', name: 'Piece', symbol: 'pc', wholeNumbersOnly: true, appliesTo: ['item', 'material'], isActive: true },
    { value: 'kilogram', name: 'Kilogram', symbol: 'kg', wholeNumbersOnly: false, appliesTo: ['item', 'material'], isActive: true },
  ],
  unitGroups: [],
  billingUnits: [
    { value: 'one_time', supportsDuration: false },
    { value: 'hourly', supportsDuration: true },
  ],
  stockAdjustmentReasons: [],
  businessCategories: [],
  currencies: [],
};

const CATEGORIES: Category[] = [
  { id: 'cat-tea', kind: 'item', name: 'Tea', archived: false, archivedAt: null, usageCount: 2, createdAt: '', updatedAt: '' },
  { id: 'cat-old', kind: 'item', name: 'Old stock', archived: true, archivedAt: '', usageCount: 0, createdAt: '', updatedAt: '' },
  { id: 'cat-repair', kind: 'service', name: 'Repairs', archived: false, archivedAt: null, usageCount: 0, createdAt: '', updatedAt: '' },
];

function image(id: string, isCover = false): CatalogImage {
  return { id, url: `https://x/${id}.jpg`, thumbnailUrl: `https://x/t/${id}.jpg`, width: 1, height: 1, bytes: 1, isCover, createdAt: '' };
}

const ITEM: CatalogItem = {
  id: 'item-1',
  merchantId: 'merchant-1',
  merchantName: 'Anita Desai',
  name: 'Masala Chai',
  categoryId: 'cat-tea',
  categoryName: 'Tea',
  description: null,
  imageUrl: 'https://x/a.jpg',
  images: [image('a', true), image('b')],
  sku: 'CHAI-1',
  barcode: null,
  unit: 'piece',
  trackStock: true,
  quantity: 10,
  totalReceived: 10,
  lowStockThreshold: 2,
  isLowStock: false,
  isOutOfStock: false,
  sellingPriceMinor: 4_500,
  costPriceMinor: null,
  taxRatePercent: null,
  archived: false,
  archivedAt: null,
  createdAt: '',
  updatedAt: '',
};

/** Signed in as an administrator with every catalog permission. */
function signedIn() {
  mocked.fetchCurrentAdmin.mockResolvedValue({
    admin: {
      id: 'admin-1',
      name: 'Super Admin',
      email: 'admin@x',
      status: 'active',
      mustChangePassword: false,
      passwordChangedAt: null,
      lastLoginAt: null,
      createdAt: '',
      role: { id: 'r', slug: 'super_admin', name: 'Super', description: '' },
      permissions: ['item.manage', 'service.manage', 'material.manage', 'stock.adjust'],
    },
  } as never);
}

function renderWith(node: React.ReactNode) {
  return render(
    <AuthProvider>
      <ToastProvider>{node}</ToastProvider>
    </AuthProvider>,
  );
}

beforeEach(() => {
  resetCatalogMetaCache();
  localStorage.setItem('sellersdash.admin.accessToken', 'token');
  localStorage.setItem('sellersdash.admin.refreshToken', 'refresh');
  // jsdom has no Response class; the client only needs ok, status and json().
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: META }),
  })) as unknown as typeof fetch;
  mocked.fetchMerchantCategories.mockResolvedValue({ categories: CATEGORIES });
  mocked.fetchMerchants.mockResolvedValue({
    items: [{ id: 'merchant-9', fullName: 'Ravi Kumar', phoneE164: '+919800000000' }],
    meta: { page: 1, limit: 50, total: 1, totalPages: 1, hasNextPage: false },
  } as never);
  signedIn();
});

afterEach(() => localStorage.clear());

describe('ProductFormDrawer', () => {
  it("creates a product in the merchant's catalog with opening stock and photos", async () => {
    const user = userEvent.setup();
    const onSaved = jest.fn();
    const created = { ...ITEM, id: 'item-new', images: [] };
    mocked.createAdminItem.mockResolvedValue({ item: created });
    mocked.uploadAdminImages.mockResolvedValue({ ...created, images: [image('n', true)] });

    renderWith(
      <ProductFormDrawer
        target={{ mode: 'create', merchantId: 'merchant-1', merchantName: 'Anita Desai' }}
        onClose={jest.fn()}
        onSaved={onSaved}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Add a product' })).toHaveTextContent('For Anita Desai');
    await user.type(screen.getByLabelText('Name'), 'Ginger Tea');
    await user.type(screen.getByLabelText('Selling price (₹)'), '55');
    await user.type(screen.getByLabelText(/Opening stock/), '24');
    await waitFor(() => expect(screen.getByLabelText('Unit')).toHaveValue('piece'));

    const photo = new File(['x'], 'tea.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Choose photos to upload'), photo);

    await user.click(screen.getByRole('button', { name: 'Add product' }));

    await waitFor(() =>
      expect(mocked.createAdminItem).toHaveBeenCalledWith(
        'merchant-1',
        expect.objectContaining({ name: 'Ginger Tea', sellingPriceMinor: 5_500, openingQuantity: 24, unit: 'piece', trackStock: true }),
      ),
    );
    expect(mocked.uploadAdminImages).toHaveBeenCalledWith('items', 'item-new', [photo]);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'item-new' }), true);
  });

  it('asks which merchant when opened outside a merchant page', async () => {
    const user = userEvent.setup();
    renderWith(<ProductFormDrawer target={{ mode: 'create' }} onClose={jest.fn()} onSaved={jest.fn()} />);

    await user.type(screen.getByLabelText('Name'), 'Pen');
    await user.type(screen.getByLabelText('Selling price (₹)'), '10');
    await user.click(screen.getByRole('button', { name: 'Add product' }));

    expect(await screen.findByText('Choose the merchant this product belongs to.')).toBeInTheDocument();
    expect(mocked.createAdminItem).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.getByRole('option', { name: /Ravi Kumar/ })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Merchant'), 'merchant-9');
    mocked.createAdminItem.mockResolvedValue({ item: { ...ITEM, id: 'x' } });
    await user.click(screen.getByRole('button', { name: 'Add product' }));
    await waitFor(() => expect(mocked.createAdminItem).toHaveBeenCalledWith('merchant-9', expect.anything()));
  });

  it('edits every field, including the low-stock threshold, tax and category', async () => {
    const user = userEvent.setup();
    mocked.updateAdminItem.mockResolvedValue({ item: ITEM });

    renderWith(<ProductFormDrawer target={{ mode: 'edit', record: ITEM }} onClose={jest.fn()} onSaved={jest.fn()} />);

    expect(screen.getByLabelText('Name')).toHaveValue('Masala Chai');
    await waitFor(() => expect(screen.getByLabelText(/Category/)).toHaveValue('cat-tea'));
    // An archived category is not offered for new filing.
    expect(screen.queryByRole('option', { name: /Old stock/ })).not.toBeInTheDocument();

    const threshold = screen.getByLabelText(/Low stock alert at/);
    await user.clear(threshold);
    await user.type(threshold, '5');
    await user.type(screen.getByLabelText(/Tax rate/), '12');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mocked.updateAdminItem).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({ lowStockThreshold: 5, taxRatePercent: 12, categoryId: 'cat-tea' }),
      ),
    );
    expect(mocked.createAdminItem).not.toHaveBeenCalled();
  });

  it('manages photos on an existing product: make cover and remove', async () => {
    const user = userEvent.setup();
    const onSaved = jest.fn();
    mocked.reorderAdminImages.mockResolvedValue({ ...ITEM, images: [image('b', true), image('a')] });
    mocked.removeAdminImage.mockResolvedValue({ ...ITEM, images: [image('a', true)] });

    renderWith(<ProductFormDrawer target={{ mode: 'edit', record: ITEM }} onClose={jest.fn()} onSaved={onSaved} />);

    await user.click(screen.getByRole('button', { name: 'Make cover' }));
    await waitFor(() => expect(mocked.reorderAdminImages).toHaveBeenCalledWith('items', 'item-1', ['b', 'a']));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'item-1' }), false);

    await user.click(screen.getByRole('button', { name: 'Remove photo 2' }));
    await waitFor(() => expect(mocked.removeAdminImage).toHaveBeenCalledWith('items', 'item-1', 'a'));
  });

  it('adds a category without leaving the form', async () => {
    const user = userEvent.setup();
    mocked.createAdminCategory.mockResolvedValue({
      category: { id: 'cat-new', kind: 'item', name: 'Snacks', archived: false, archivedAt: null, createdAt: '', updatedAt: '' },
    });

    renderWith(<ProductFormDrawer target={{ mode: 'create', merchantId: 'merchant-1' }} onClose={jest.fn()} onSaved={jest.fn()} />);

    await waitFor(() => expect(screen.getByRole('option', { name: 'Tea' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/^Category/), '__new__');
    await user.type(screen.getByLabelText('New category name'), 'Snacks');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(mocked.createAdminCategory).toHaveBeenCalledWith('merchant-1', { kind: 'item', name: 'Snacks' }),
    );
    await waitFor(() => expect(screen.getByLabelText(/^Category/)).toHaveValue('cat-new'));
  });
});

describe('ServiceFormDrawer', () => {
  it('creates a service, with a duration only for time-based billing', async () => {
    const user = userEvent.setup();
    mocked.createAdminService.mockResolvedValue({ service: { id: 'svc-1', name: 'Repair' } as CatalogService });

    renderWith(<ServiceFormDrawer target={{ mode: 'create', merchantId: 'merchant-1' }} onClose={jest.fn()} onSaved={jest.fn()} />);

    await user.type(screen.getByLabelText('Name'), 'Phone repair');
    await user.type(screen.getByLabelText('Rate (₹)'), '600');
    expect(screen.queryByLabelText(/Duration/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('option', { name: /hour/i })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Billed'), 'hourly');
    await user.type(screen.getByLabelText(/Duration/), '60');
    await user.click(screen.getByRole('button', { name: 'Add service' }));

    await waitFor(() =>
      expect(mocked.createAdminService).toHaveBeenCalledWith(
        'merchant-1',
        expect.objectContaining({ name: 'Phone repair', rateMinor: 60_000, billingUnit: 'hourly', durationMinutes: 60, isActive: true }),
      ),
    );
  });
});

describe('MaterialFormDrawer', () => {
  it('creates a raw material with opening stock, batch and expiry', async () => {
    const user = userEvent.setup();
    mocked.createAdminMaterial.mockResolvedValue({ material: { id: 'mat-1', name: 'Sugar' } as CatalogMaterial });

    renderWith(<MaterialFormDrawer target={{ mode: 'create', merchantId: 'merchant-1' }} onClose={jest.fn()} onSaved={jest.fn()} />);

    await user.type(screen.getByLabelText('Name'), 'Sugar');
    await user.type(screen.getByLabelText(/Opening stock/), '12.5');
    await user.type(screen.getByLabelText(/Batch reference/), 'B-77');
    await user.type(screen.getByLabelText(/Expiry date/), '2027-01-31');
    await user.click(screen.getByRole('button', { name: 'Add raw material' }));

    await waitFor(() =>
      expect(mocked.createAdminMaterial).toHaveBeenCalledWith(
        'merchant-1',
        expect.objectContaining({ name: 'Sugar', openingQuantity: 12.5, batchReference: 'B-77', expiryDate: '2027-01-31' }),
      ),
    );
  });
});

describe('CategoryManagerDrawer', () => {
  it('lists categories by kind and renames, archives and adds them', async () => {
    const user = userEvent.setup();
    const onChanged = jest.fn();
    mocked.renameAdminCategory.mockResolvedValue({ category: { ...CATEGORIES[0]!, name: 'Teas' } });
    mocked.setAdminCategoryArchived.mockResolvedValue({ category: { ...CATEGORIES[0]!, name: 'Teas', archived: true } });
    mocked.createAdminCategory.mockResolvedValue({
      category: { id: 'cat-x', kind: 'material', name: 'Packaging', archived: false, archivedAt: null, createdAt: '', updatedAt: '' },
    });

    renderWith(<CategoryManagerDrawer merchantId="merchant-1" open onClose={jest.fn()} onChanged={onChanged} />);

    const products = await screen.findByText('Product categories');
    const productSection = products.closest('section')!;
    await waitFor(() => expect(within(productSection).getByText('Tea')).toBeInTheDocument());

    await user.click(within(productSection).getAllByRole('button', { name: 'Rename' })[0]!);
    const rename = screen.getByLabelText('New name for Tea');
    await user.clear(rename);
    await user.type(rename, 'Teas');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocked.renameAdminCategory).toHaveBeenCalledWith('cat-tea', 'Teas'));

    await user.click(within(productSection).getAllByRole('button', { name: 'Archive' })[0]!);
    await waitFor(() => expect(mocked.setAdminCategoryArchived).toHaveBeenCalledWith('cat-tea', true));

    const materialSection = screen.getByText('Raw material categories').closest('section')!;
    await user.type(within(materialSection).getByLabelText('Add a category'), 'Packaging');
    await user.click(within(materialSection).getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(mocked.createAdminCategory).toHaveBeenCalledWith('merchant-1', { kind: 'material', name: 'Packaging' }),
    );
    expect(onChanged).toHaveBeenCalled();
  });
});

describe('StockAdjustDrawer recount', () => {
  it('sets stock to a counted figure as a recount', async () => {
    const user = userEvent.setup();
    mocked.setAdminStockQuantity.mockResolvedValue({
      item: { ...ITEM, quantity: 7 },
      movement: { balanceAfter: 7 } as never,
    });

    renderWith(
      <StockAdjustDrawer
        subject={{ id: 'item-1', name: 'Masala Chai', unit: 'piece', quantity: 10, subjectType: 'item' }}
        onClose={jest.fn()}
        onAdjusted={jest.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText('What happened'), 'set');
    await user.type(screen.getByLabelText(/Counted quantity/), '7');
    await user.click(screen.getByRole('button', { name: 'Save count' }));

    await waitFor(() =>
      expect(mocked.setAdminStockQuantity).toHaveBeenCalledWith('item', 'item-1', { quantity: 7, reason: 'recount' }),
    );
    expect(mocked.adjustStock).not.toHaveBeenCalled();
  });
});
