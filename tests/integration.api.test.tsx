/**
 * Cross-surface integration: the real admin app against a running API.
 *
 * Nothing is mocked. This is the check that the admin panel and backend actually agree
 * on the Phase 1 contract, including that RBAC is enforced by the server rather than
 * only hidden in the UI.
 *
 * Requires the stack to be up:
 *   api/   npm run seed && npm run dev      (http://localhost:4100)
 *
 * Run with:  npm run test:integration
 *
 * That script selects tests/env/jsdomWithNodeGlobals.js as the test environment, which
 * exposes Node's fetch and streams to jsdom. The default suite stays on plain jsdom so
 * it has no open sockets to keep Jest alive.
 *
 * Each role signs in once per run and the session is reused, so the suite stays well
 * inside the API's sign-in rate limit.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../src/App';
import { tokenStore } from '../src/api/client';
import type { Tokens } from '../src/api/types';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:4100/api/v1';
const PASSWORD = process.env.SEED_PASSWORD || 'ChangeMe#12345';

const ADMINS = {
  super: 'admin@sellersdash.local',
  support: 'support@sellersdash.local',
  readonly: 'readonly@sellersdash.local',
  finance: 'finance@sellersdash.local',
};

const sessions = new Map<string, Tokens>();

async function apiLogin(email: string): Promise<Tokens> {
  const cached = sessions.get(email);
  if (cached) return cached;

  const response = await fetch(`${API_BASE}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = (await response.json()) as { data?: { tokens: Tokens }; error?: { message: string } };

  if (!response.ok || !body.data) {
    throw new Error(`Could not sign in as ${email}: ${body.error?.message ?? response.status}`);
  }

  sessions.set(email, body.data.tokens);
  return body.data.tokens;
}

async function authedFetch(email: string, path: string, init?: RequestInit): Promise<Response> {
  const tokens = await apiLogin(email);
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${tokens.accessToken}`,
    },
  });
}

/** Renders the real app with an existing session, as a returning admin would see it. */
async function openAppAs(email: string, options?: { route?: string; search?: string }) {
  tokenStore.write(await apiLogin(email));

  render(
    <MemoryRouter
      initialEntries={[options?.route ?? '/merchants']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );

  const user = userEvent.setup();

  // The live database grows with every run, so a row is located by searching for it
  // rather than by assuming it is on the first page.
  if (options?.search) {
    // Found by role rather than by label, so one helper serves every table.
    const box = await screen.findByRole('searchbox', undefined, { timeout: 15000 });
    await user.type(box, options.search);
  }

  return user;
}

async function firstMerchantId(email: string): Promise<string> {
  const response = await authedFetch(email, '/admin/merchants?limit=1');
  const body = (await response.json()) as { data: { items: Array<{ id: string }> } };
  const id = body.data.items[0]?.id;
  if (!id) throw new Error('The API returned no merchants. Seed the database first.');
  return id;
}

beforeAll(async () => {
  const health = await fetch(`${API_BASE.replace('/api/v1', '')}/health`).catch(() => null);
  if (!health || !health.ok) {
    throw new Error(
      `The API is not reachable at ${API_BASE}. Start it with "npm run dev" in api/ (and seed it) before running the integration suite.`,
    );
  }
});

afterEach(() => tokenStore.clear());

describe('signing in through the UI', () => {
  it('signs a super admin in and lands on merchants', async () => {
    tokenStore.clear();
    const user = userEvent.setup();

    render(
      <MemoryRouter
        initialEntries={['/login']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByLabelText('Email address')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Email address'), ADMINS.super);
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(
      () => expect(screen.getByRole('heading', { level: 1, name: 'Merchants' })).toBeInTheDocument(),
      { timeout: 15000 },
    );

    // The live database grows with every run of the app's own live suite, so a
    // seeded merchant is located by searching rather than by assuming page one.
    const box = await screen.findByRole('searchbox', undefined, { timeout: 15000 });
    await user.type(box, '9876500001');
    await waitFor(() => expect(screen.getByText('Anita Desai')).toBeInTheDocument(), { timeout: 15000 });
  }, 45000);
});

describe('merchants list against live data', () => {
  it('finds a seeded merchant by phone number and shows their details', async () => {
    await openAppAs(ADMINS.super, { search: '9876500001' });

    // This row comes from the database, not from a fixture.
    await waitFor(() => expect(screen.getByText('Anita Desai')).toBeInTheDocument(), { timeout: 15000 });
    expect(screen.getByText('+91 9876500001')).toBeInTheDocument();
  }, 45000);

  it('finds a merchant by name', async () => {
    await openAppAs(ADMINS.super, { search: 'Harper' });

    await waitFor(() => expect(screen.getByText('Jo Harper')).toBeInTheDocument(), { timeout: 15000 });
    expect(screen.getByText('+44 7700900123')).toBeInTheDocument();
  }, 45000);

  it('reflects a suspended merchant from the database', async () => {
    // Searched by phone number: names are not unique across a live database.
    await openAppAs(ADMINS.super, { search: '9876500003' });

    // Located by the phone number, which is unique, rather than by name: a merchant
    // registered through the app can share a name with a seeded one.
    await waitFor(
      () => expect(screen.getByText('+91 9876500003')).toBeInTheDocument(),
      { timeout: 15000 },
    );

    const row = screen.getByText('+91 9876500003').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Imran Shaikh')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('Suspended')).toBeInTheDocument();
  }, 45000);

  it('navigation shows only the sections the role can open', async () => {
    await openAppAs(ADMINS.super, { search: '9876500001' });

    await waitFor(() => expect(screen.getByText('Anita Desai')).toBeInTheDocument(), { timeout: 15000 });

    expect(screen.getByRole('link', { name: /Merchants/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Roles & permissions/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Audit history/ })).toBeInTheDocument();
  }, 45000);

  it('shows the verified phone number as locked in the edit drawer', async () => {
    const user = await openAppAs(ADMINS.super, { search: '9876500001' });

    // Header plus one row: the debounced search has landed, so the button below belongs
    // to the row React is holding rather than to one from the pre-search render.
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2), { timeout: 15000 });
    await user.click(screen.getByRole('button', { name: 'Edit Anita Desai' }));

    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByLabelText(/First name/)).toHaveValue('Anita');

    const phoneField = within(drawer).getByLabelText(/Verified phone number/);
    expect(phoneField).toHaveValue('+91 9876500001');
    expect(phoneField).toBeDisabled();
    expect(phoneField).toHaveAttribute('readonly');
    expect(within(drawer).getByText(/can never be changed/i)).toBeInTheDocument();
  }, 45000);
});

describe('RBAC across both surfaces', () => {
  it('hides every write control from a read-only admin', async () => {
    await openAppAs(ADMINS.readonly, { search: '9876500001' });

    await waitFor(() => expect(screen.getByText('Anita Desai')).toBeInTheDocument(), { timeout: 15000 });

    expect(screen.queryByRole('button', { name: 'Edit Anita Desai' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspend Anita Desai' })).not.toBeInTheDocument();

    // Administrative surfaces are not in this role's navigation at all.
    expect(screen.queryByRole('link', { name: /Audit history/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Roles & permissions/ })).not.toBeInTheDocument();
  }, 45000);

  it('lets a support admin edit a merchant but not suspend one', async () => {
    await openAppAs(ADMINS.support, { search: '9876500001' });

    await waitFor(() => expect(screen.getByText('Anita Desai')).toBeInTheDocument(), { timeout: 15000 });

    expect(screen.getByRole('button', { name: 'Edit Anita Desai' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspend Anita Desai' })).not.toBeInTheDocument();
  }, 45000);

  it('refuses a read-only admin at the API, not just in the UI', async () => {
    const merchantId = await firstMerchantId(ADMINS.super);

    const response = await authedFetch(ADMINS.readonly, `/admin/merchants/${merchantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Nope' }),
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  }, 45000);

  it('refuses the audit trail to a read-only admin at the API', async () => {
    const response = await authedFetch(ADMINS.readonly, '/admin/audit-logs');
    expect(response.status).toBe(403);
  }, 45000);
});

describe('phone immutability end to end', () => {
  it('refuses a phone number change even from a super admin', async () => {
    const merchantId = await firstMerchantId(ADMINS.super);

    const response = await authedFetch(ADMINS.super, `/admin/merchants/${merchantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9000000000' }),
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('PHONE_IMMUTABLE');
  }, 45000);

  it('reports the phone number as not editable in the merchant contract', async () => {
    const response = await authedFetch(ADMINS.super, '/admin/merchants?limit=1');
    const body = (await response.json()) as {
      data: { items: Array<{ phoneEditable: boolean; countryCode: string; phone: string }> };
    };

    const merchant = body.data.items[0];
    expect(merchant?.phoneEditable).toBe(false);
    // Country code and national number stay separate fields.
    expect(merchant?.countryCode).toMatch(/^\+\d+$/);
    expect(merchant?.phone).toMatch(/^\d+$/);
  }, 45000);
});

/* --------------------------- Phase 2: catalog & stock -------------------------- */

describe('catalog against live data', () => {
  it('lists seeded items with their real stock state', async () => {
    await openAppAs(ADMINS.super, { route: '/items', search: 'Masala Chai' });

    await waitFor(() => expect(screen.getByText('Masala Chai Packet')).toBeInTheDocument(), {
      timeout: 15000,
    });

    const row = screen.getByText('Masala Chai Packet').closest('tr') as HTMLElement;
    // Available and received both read 24, so the row is asserted as a whole.
    expect(row).toHaveTextContent('24 pieces');
    // Prices come back as whole minor units and are formatted only for display.
    expect(row).toHaveTextContent(/45\.00/);
  }, 45000);

  it('marks a low item as needing attention', async () => {
    await openAppAs(ADMINS.super, { route: '/items', search: 'Cold Drink' });

    await waitFor(() => expect(screen.getByText('Cold Drink 500ml')).toBeInTheDocument(), {
      timeout: 15000,
    });

    const row = screen.getByText('Cold Drink 500ml').closest('tr') as HTMLElement;
    expect(within(row).getByText('Low stock')).toBeInTheDocument();
  }, 45000);

  it('shows services with their billing and availability', async () => {
    await openAppAs(ADMINS.super, { route: '/services', search: 'Phone Repair' });

    await waitFor(() => expect(screen.getByText('Phone Repair')).toBeInTheDocument(), {
      timeout: 15000,
    });

    const row = screen.getByText('Phone Repair').closest('tr') as HTMLElement;
    expect(within(row).getByText('Per hour')).toBeInTheDocument();
    expect(within(row).getByText(/600\.00/)).toBeInTheDocument();
    expect(within(row).getByText('Offered')).toBeInTheDocument();
  }, 45000);

  it('keeps a fractional material quantity exactly', async () => {
    await openAppAs(ADMINS.super, { route: '/materials', search: 'Sugar' });

    await waitFor(() => expect(screen.getByText('Sugar')).toBeInTheDocument(), { timeout: 15000 });

    const row = screen.getByText('Sugar').closest('tr') as HTMLElement;
    // A fraction survives the round trip, because quantities are stored in thousandths.
    // Asserted as a pattern rather than an exact figure: seeded purchases receive stock
    // into this material, so the total is not a fixed number.
    expect(row.textContent).toMatch(/\d+\.\d+ kg/);
  }, 45000);

  it('lists what needs attention across merchants', async () => {
    await openAppAs(ADMINS.super, { route: '/low-stock' });

    await waitFor(() => expect(screen.getByText('Biscuit Pack')).toBeInTheDocument(), {
      timeout: 15000,
    });

    const row = screen.getByText('Biscuit Pack').closest('tr') as HTMLElement;
    expect(within(row).getByText('Out of stock')).toBeInTheDocument();
  }, 45000);
});

describe('stock adjustment end to end', () => {
  /**
   * Adjusts up and then back down, so the suite leaves the item exactly as it found it.
   *
   * This runs against a shared development database. A test that only ever subtracted
   * would quietly consume the fixture: two units a run, until the item hit zero and the
   * ledger rightly refused to drive it negative. Covering both signs is also the better
   * test — a sign error in either direction would show.
   */
  it('records adjustments in both directions and writes them to the ledger', async () => {
    const itemsResponse = await authedFetch(ADMINS.super, '/admin/items?search=Masala&limit=1');
    const items = (await itemsResponse.json()) as {
      data: { items: Array<{ id: string; quantity: number }> };
    };
    const item = items.data.items[0];
    expect(item).toBeTruthy();

    async function adjust(change: number, reason: string, note: string) {
      const response = await authedFetch(ADMINS.super, `/admin/stock/item/${item!.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ change, reason, note }),
      });
      expect(response.status).toBe(200);
      return (await response.json()) as {
        data: {
          item: { quantity: number };
          movement: { delta: number; balanceAfter: number; actorType: string };
        };
      };
    }

    const up = await adjust(2, 'found', 'Integration check: up');
    expect(up.data.movement.delta).toBe(2);
    expect(up.data.movement.balanceAfter).toBe(item!.quantity + 2);
    expect(up.data.movement.actorType).toBe('admin');
    expect(up.data.item.quantity).toBe(item!.quantity + 2);

    const down = await adjust(-2, 'damaged', 'Integration check: down');
    expect(down.data.movement.delta).toBe(-2);
    // Back where it started, so the next run of this suite starts from the same place.
    expect(down.data.movement.balanceAfter).toBe(item!.quantity);
    expect(down.data.item.quantity).toBe(item!.quantity);

    // Both movements are in the ledger, newest first, attributed to the admin who made them.
    const ledger = await authedFetch(ADMINS.super, `/admin/stock-movements?subjectId=${item!.id}`);
    const movements = (await ledger.json()) as {
      data: {
        items: Array<{ delta: number; reason: string; actorType: string; note: string | null }>;
      };
    };
    expect(movements.data.items[0]).toMatchObject({
      delta: -2,
      reason: 'damaged',
      actorType: 'admin',
      note: 'Integration check: down',
    });
    expect(movements.data.items[1]).toMatchObject({
      delta: 2,
      reason: 'found',
      note: 'Integration check: up',
    });
  }, 45000);

  it('refuses a stock quantity sent to the details endpoint', async () => {
    const itemsResponse = await authedFetch(ADMINS.super, '/admin/items?limit=1');
    const items = (await itemsResponse.json()) as { data: { items: Array<{ id: string }> } };
    const itemId = items.data.items[0]?.id;

    const response = await authedFetch(ADMINS.super, `/admin/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 9999 }),
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/stock adjustment/i);
  }, 45000);

  it('refuses a stock adjustment from a read-only admin', async () => {
    const itemsResponse = await authedFetch(ADMINS.super, '/admin/items?limit=1');
    const items = (await itemsResponse.json()) as { data: { items: Array<{ id: string }> } };
    const itemId = items.data.items[0]?.id;

    const response = await authedFetch(ADMINS.readonly, `/admin/stock/item/${itemId}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ change: -1, reason: 'lost' }),
    });

    expect(response.status).toBe(403);
  }, 45000);
});

describe('business profile against live data', () => {
  it('shows the seeded business on the merchant drill-down', async () => {
    const user = await openAppAs(ADMINS.super, { search: '9876500001' });

    // Header plus one row: the debounced search has landed, so the link below is the one
    // React is holding rather than one from the pre-search render.
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2), { timeout: 15000 });
    await user.click(screen.getByRole('link', { name: 'Anita Desai' }));

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Business' })).toBeInTheDocument(), {
      timeout: 15000,
    });
    await user.click(screen.getByRole('tab', { name: 'Business' }));

    await waitFor(() => expect(screen.getByText('Desai General Store')).toBeInTheDocument(), {
      timeout: 15000,
    });
    expect(screen.getByText('Pune')).toBeInTheDocument();
    expect(screen.getByText('Grocery')).toBeInTheDocument();
  }, 60000);

  it('serves the catalog vocabulary instead of making the panel hard-code it', async () => {
    const response = await authedFetch(ADMINS.super, '/admin/catalog/meta');
    const body = (await response.json()) as {
      data: { units: Array<{ value: string; wholeNumbersOnly: boolean }>; currencies: string[] };
    };

    expect(response.status).toBe(200);
    expect(body.data.units).toEqual(
      expect.arrayContaining([{ value: 'piece', wholeNumbersOnly: true }]),
    );
    expect(body.data.currencies).toContain('INR');
  }, 45000);
});


describe('customers, suppliers and purchases against live data', () => {
  it('lists the seeded customers with the merchant who owns them', async () => {
    await openAppAs(ADMINS.super, { route: '/customers', search: 'Kavita' });

    await waitFor(() => expect(screen.getByText('Kavita Joshi')).toBeInTheDocument(), {
      timeout: 15000,
    });

    const row = screen.getByText('Kavita Joshi').closest('tr');
    expect(row).not.toBeNull();
    // The row names the business whose customer this is.
    expect(within(row as HTMLElement).getByRole('link', { name: 'Anita Desai' })).toBeInTheDocument();
  }, 60000);

  it('shows what a supplier is still owed, from real purchases', async () => {
    await openAppAs(ADMINS.super, { route: '/suppliers', search: 'Krishna' });

    await waitFor(() => expect(screen.getByText('Krishna Dairy')).toBeInTheDocument(), {
      timeout: 15000,
    });

    const row = screen.getByText('Krishna Dairy').closest('tr');
    expect(row).not.toBeNull();
    // The seeded purchase from this supplier is part paid, so something is owed.
    expect(within(row as HTMLElement).queryByText('Settled')).not.toBeInTheDocument();
  }, 60000);

  it('opens a purchase and shows its lines and payments', async () => {
    const user = await openAppAs(ADMINS.super, { route: '/purchases', search: 'Deccan' });

    // Wait for the debounced search to land before touching a row: clicking a button
    // from the pre-search render hits an element React has already detached.
    await waitFor(
      () => expect(screen.getAllByRole('button', { name: /^PUR-\d{4}$/ })).toHaveLength(2),
      { timeout: 15000 },
    );

    await user.click(screen.getAllByRole('button', { name: /^PUR-\d{4}$/ })[0]!);

    await waitFor(
      () => expect(screen.getByText('What was bought')).toBeInTheDocument(),
      { timeout: 15000 },
    );

    // Totals are stated rather than left to be added up.
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    // By heading, because the navigation also has a "Payments" entry.
    expect(screen.getByRole('heading', { name: 'Payments' })).toBeInTheDocument();
  }, 60000);

  it('reports the overdue purchase as overdue, derived from its due date', async () => {
    const response = await authedFetch(ADMINS.super, '/admin/purchases?overdue=true');
    const body = (await response.json()) as {
      data: { items: Array<{ paymentStatus: string; paymentState: string; dueDate: string }> };
    };

    expect(response.status).toBe(200);
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);

    const overdue = body.data.items[0]!;
    // Stored as part paid; shown as overdue because the due date has passed. Nothing
    // had to write to the row for that to be true.
    expect(overdue.paymentState).toBe('overdue');
    expect(overdue.paymentStatus).not.toBe('fully_paid');
    expect(new Date(overdue.dueDate).getTime()).toBeLessThan(Date.now());
  }, 45000);

  it('keeps the stored paid amount equal to the sum of its payment entries', async () => {
    const purchases = await authedFetch(ADMINS.super, '/admin/purchases?paymentStatus=partially_paid');
    const purchaseBody = (await purchases.json()) as {
      data: { items: Array<{ id: string; paidMinor: number }> };
    };

    const purchase = purchaseBody.data.items[0];
    expect(purchase).toBeDefined();

    const detail = await authedFetch(ADMINS.super, `/admin/purchases/${purchase!.id}`);
    const detailBody = (await detail.json()) as {
      data: { purchase: { paidMinor: number }; payments: Array<{ amountMinor: number }> };
    };

    const summed = detailBody.data.payments.reduce((total, entry) => total + entry.amountMinor, 0);
    expect(detailBody.data.purchase.paidMinor).toBe(summed);
  }, 45000);

  it('refuses an overpayment at the API with the outstanding amount named', async () => {
    const purchases = await authedFetch(ADMINS.super, '/admin/purchases?paymentStatus=partially_paid');
    const body = (await purchases.json()) as {
      data: { items: Array<{ id: string; outstandingMinor: number }> };
    };
    const purchase = body.data.items[0];
    expect(purchase).toBeDefined();

    const response = await authedFetch(
      ADMINS.super,
      `/admin/purchases/${purchase!.id}/payments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountMinor: purchase!.outstandingMinor + 100_000, method: 'cash' }),
      },
    );

    expect(response.status).toBe(409);
    const error = (await response.json()) as { error: { meta: { outstanding: number } } };
    expect(error.error.meta.outstanding).toBe(purchase!.outstandingMinor);
  }, 45000);

  it('shows a merchant customers, suppliers and purchases in their drill-down', async () => {
    const user = await openAppAs(ADMINS.super, { search: '9876500001' });

    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2), { timeout: 15000 });
    await user.click(screen.getByRole('link', { name: 'Anita Desai' }));

    await waitFor(
      () => expect(screen.getByRole('tab', { name: 'Customers' })).toBeInTheDocument(),
      { timeout: 15000 },
    );

    // The summary above the tabs states the shape of the business. It loads on its own,
    // so it is waited for rather than assumed to be present with the tabs.
    await waitFor(() => expect(screen.getByText('Owed to suppliers')).toBeInTheDocument(), {
      timeout: 15000,
    });

    await user.click(screen.getByRole('tab', { name: 'Customers' }));
    await waitFor(() => expect(screen.getByText('Kavita Joshi')).toBeInTheDocument(), {
      timeout: 15000,
    });

    await user.click(screen.getByRole('tab', { name: 'Suppliers' }));
    await waitFor(() => expect(screen.getByText('Deccan Wholesale')).toBeInTheDocument(), {
      timeout: 15000,
    });

    await user.click(screen.getByRole('tab', { name: 'Purchases' }));
    await waitFor(
      () => expect(screen.getAllByRole('button', { name: /^PUR-\d{4}$/ }).length).toBeGreaterThan(0),
      { timeout: 15000 },
    );
    // This merchant's own purchases, so the supplier is one of theirs. More than one
    // purchase can come from the same supplier, so the name appears more than once.
    expect(screen.getAllByText('Deccan Wholesale').length).toBeGreaterThan(0);
  }, 90000);
});

describe('Phase 3 RBAC across both surfaces', () => {
  it('hides every relationship write control from a read-only admin', async () => {
    await openAppAs(ADMINS.readonly, { route: '/customers', search: 'Kavita' });

    await waitFor(() => expect(screen.getByText('Kavita Joshi')).toBeInTheDocument(), {
      timeout: 15000,
    });

    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Archive / })).not.toBeInTheDocument();
  }, 60000);

  it('refuses a read-only admin at the API, not just in the UI', async () => {
    const customers = await authedFetch(ADMINS.readonly, '/admin/customers?search=Kavita');
    const body = (await customers.json()) as { data: { items: Array<{ id: string }> } };
    const customer = body.data.items[0];
    expect(customer).toBeDefined();

    const edit = await authedFetch(ADMINS.readonly, `/admin/customers/${customer!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: 'Nope' }),
    });

    // Hiding the control was a courtesy; this is the boundary.
    expect(edit.status).toBe(403);
  }, 45000);

  it('lets a support admin edit a customer but not cancel a purchase', async () => {
    const customers = await authedFetch(ADMINS.support, '/admin/customers?search=Kavita');
    const customerBody = (await customers.json()) as { data: { items: Array<{ id: string }> } };
    const customer = customerBody.data.items[0];
    expect(customer).toBeDefined();

    const edit = await authedFetch(ADMINS.support, `/admin/customers/${customer!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: 'Pune' }),
    });
    expect(edit.status).toBe(200);

    const purchases = await authedFetch(ADMINS.support, '/admin/purchases');
    const purchaseBody = (await purchases.json()) as { data: { items: Array<{ id: string }> } };
    const purchase = purchaseBody.data.items[0];
    expect(purchase).toBeDefined();

    const cancel = await authedFetch(ADMINS.support, `/admin/purchases/${purchase!.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Should not be allowed' }),
    });
    expect(cancel.status).toBe(403);
  }, 60000);

  it('serves the payment vocabulary rather than making the panel hard-code it', async () => {
    const response = await authedFetch(ADMINS.super, '/admin/catalog/meta');
    const body = (await response.json()) as {
      data: { paymentMethods: string[]; paymentStates: string[]; contactChannels: string[] };
    };

    expect(response.status).toBe(200);
    expect(body.data.paymentMethods).toEqual(
      expect.arrayContaining(['cash', 'upi', 'bank_transfer']),
    );
    expect(body.data.paymentStates).toEqual(
      expect.arrayContaining(['unpaid', 'partially_paid', 'fully_paid', 'overdue']),
    );
    expect(body.data.contactChannels).toEqual(expect.arrayContaining(['sms', 'whatsapp']));
  }, 45000);
});

describe('orders, instalments and receivables against live data', () => {
  it('lists the seeded orders with the merchant who owns them', async () => {
    // Searched by the seeded customer's name rather than by reference: every merchant's
    // references start at ORD-0001, so a reference is not specific to one of them.
    await openAppAs(ADMINS.super, { route: '/orders', search: 'Kavita' });

    await waitFor(
      () => expect(screen.getAllByRole('button', { name: /^ORD-\d{4}$/ })).toHaveLength(1),
      { timeout: 15000 },
    );

    const row = screen.getAllByRole('button', { name: /^ORD-\d{4}$/ })[0]!.closest('tr');
    expect(row).not.toBeNull();
    // The row names the business whose order this is.
    expect(within(row as HTMLElement).getByRole('link', { name: 'Anita Desai' })).toBeInTheDocument();
  }, 60000);

  it('opens an order and shows its lines, totals and payment timeline', async () => {
    const user = await openAppAs(ADMINS.super, { route: '/orders', search: 'Kavita' });

    // Wait for the debounced search to land before touching a row: clicking a button from
    // the pre-search render hits an element React has already detached.
    await waitFor(
      () => expect(screen.getAllByRole('button', { name: /^ORD-\d{4}$/ })).toHaveLength(1),
      { timeout: 15000 },
    );

    await user.click(screen.getAllByRole('button', { name: /^ORD-\d{4}$/ })[0]!);

    await waitFor(() => expect(screen.getByText('What was sold')).toBeInTheDocument(), {
      timeout: 15000,
    });

    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    // By heading, because the navigation also has a "Payments" entry.
    expect(screen.getByRole('heading', { name: 'Payments' })).toBeInTheDocument();
  }, 60000);

  it('reports the overdue order as overdue, derived from its due date', async () => {
    const response = await authedFetch(ADMINS.super, '/admin/orders?overdue=true');
    const body = (await response.json()) as {
      data: { items: Array<{ paymentStatus: string; paymentState: string; dueDate: string }> };
    };

    expect(response.status).toBe(200);
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);

    const overdue = body.data.items[0]!;
    // Stored as unpaid or part paid; shown as overdue because the due date has passed.
    // Nothing had to write to the row for that to be true.
    expect(overdue.paymentState).toBe('overdue');
    expect(overdue.paymentStatus).not.toBe('fully_paid');
    expect(new Date(overdue.dueDate).getTime()).toBeLessThan(Date.now());
  }, 45000);

  it('keeps an order stored paid amount equal to the sum of its payment entries', async () => {
    const orders = await authedFetch(ADMINS.super, '/admin/orders?paymentStatus=partially_paid');
    const orderBody = (await orders.json()) as {
      data: { items: Array<{ id: string; paidMinor: number }> };
    };

    const order = orderBody.data.items[0];
    expect(order).toBeDefined();

    const detail = await authedFetch(ADMINS.super, `/admin/orders/${order!.id}`);
    const detailBody = (await detail.json()) as {
      data: { order: { paidMinor: number }; payments: Array<{ amountMinor: number }> };
    };

    const summed = detailBody.data.payments.reduce((total, entry) => total + entry.amountMinor, 0);
    expect(detailBody.data.order.paidMinor).toBe(summed);
  }, 45000);

  it('keeps an instalment plan adding up to the order it belongs to', async () => {
    const response = await authedFetch(ADMINS.super, '/admin/installments');
    const body = (await response.json()) as { data: { items: Array<{ orderId: string }> } };

    expect(response.status).toBe(200);
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);

    const detail = await authedFetch(ADMINS.super, `/admin/orders/${body.data.items[0]!.orderId}`);
    const detailBody = (await detail.json()) as {
      data: {
        order: {
          totalMinor: number;
          paidMinor: number;
          installments: Array<{ amountMinor: number; paidMinor: number }>;
        };
      };
    };

    const order = detailBody.data.order;
    const planned = order.installments.reduce((total, entry) => total + entry.amountMinor, 0);
    // The plan adds up to the order, and what the plan says has been paid agrees with the
    // order's own total: paying all of it settles the order, which is the whole point.
    expect(planned).toBe(order.totalMinor);
    expect(order.installments.reduce((total, entry) => total + entry.paidMinor, 0)).toBe(
      order.paidMinor,
    );
  }, 45000);

  it('refuses an order overpayment at the API with the outstanding amount named', async () => {
    const orders = await authedFetch(ADMINS.super, '/admin/orders?paymentStatus=unpaid&open=true');
    const body = (await orders.json()) as {
      data: { items: Array<{ id: string; outstandingMinor: number }> };
    };
    const order = body.data.items[0];
    expect(order).toBeDefined();

    const response = await authedFetch(ADMINS.super, `/admin/orders/${order!.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountMinor: order!.outstandingMinor + 100_000, method: 'cash' }),
    });

    expect(response.status).toBe(409);
    const errorBody = (await response.json()) as { error: { meta?: { outstanding: number } } };
    expect(errorBody.error.meta?.outstanding).toBe(order!.outstandingMinor);
  }, 45000);

  it('refuses a transition that is not on the lifecycle map, and says what is', async () => {
    const orders = await authedFetch(ADMINS.super, '/admin/orders?status=completed');
    const body = (await orders.json()) as { data: { items: Array<{ id: string }> } };
    const order = body.data.items[0];
    expect(order).toBeDefined();

    // A completed order may only be returned, so confirming it again is refused.
    const response = await authedFetch(ADMINS.super, `/admin/orders/${order!.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'confirmed' }),
    });

    expect(response.status).toBe(409);
    const errorBody = (await response.json()) as { error: { meta?: { allowed: string[] } } };
    expect(errorBody.error.meta?.allowed).toEqual(['returned']);
  }, 45000);

  it('sends a cancellation to its own endpoint so the gate cannot be bypassed', async () => {
    const orders = await authedFetch(ADMINS.super, '/admin/orders?open=true');
    const body = (await orders.json()) as { data: { items: Array<{ id: string }> } };
    const order = body.data.items[0];
    expect(order).toBeDefined();

    const response = await authedFetch(ADMINS.super, `/admin/orders/${order!.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });

    expect(response.status).toBe(422);
  }, 45000);

  it('rolls receivables up per merchant, worst first', async () => {
    await openAppAs(ADMINS.super, { route: '/receivables' });

    await waitFor(
      // By heading, because the navigation also has a "Receivables" entry.
      () => expect(screen.getByRole('heading', { name: 'Receivables' })).toBeInTheDocument(),
      { timeout: 15000 },
    );

    // The seeded merchant has an overdue order, so a row naming them is present.
    await waitFor(
      () => expect(screen.getAllByRole('link', { name: 'Anita Desai' }).length).toBeGreaterThan(0),
      { timeout: 15000 },
    );
  }, 60000);

  it('counts one merchant order figures from real records', async () => {
    const merchantId = await firstMerchantId(ADMINS.super);
    const response = await authedFetch(
      ADMINS.super,
      `/admin/merchants/${merchantId}/order-summary`,
    );
    const body = (await response.json()) as {
      data: {
        summary: {
          orders: Record<string, number>;
          salesMinor: number;
          outstandingMinor: number;
          overdueMinor: number;
        };
      };
    };

    expect(response.status).toBe(200);
    const summary = body.data.summary;
    // Every status is present with a zero rather than absent, so a client can render the
    // whole lifecycle without knowing which keys might be missing.
    for (const status of [
      'draft',
      'confirmed',
      'in_progress',
      'ready',
      'completed',
      'cancelled',
      'returned',
    ]) {
      expect(typeof summary.orders[status]).toBe('number');
    }
    expect(summary.orders.total).toBeGreaterThanOrEqual(summary.orders.draft!);
    expect(summary.outstandingMinor).toBeGreaterThanOrEqual(summary.overdueMinor);
  }, 45000);
});

describe('Phase 4 RBAC across both surfaces', () => {
  it('hides every order write control from a read-only admin', async () => {
    const user = await openAppAs(ADMINS.readonly, { route: '/orders', search: 'Kavita' });

    await waitFor(
      () => expect(screen.getAllByRole('button', { name: /^ORD-\d{4}$/ })).toHaveLength(1),
      { timeout: 15000 },
    );

    await user.click(screen.getAllByRole('button', { name: /^ORD-\d{4}$/ })[0]!);
    await waitFor(() => expect(screen.getByText('What was sold')).toBeInTheDocument(), {
      timeout: 15000,
    });

    expect(screen.queryByRole('button', { name: 'Record a payment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
    expect(screen.queryByText('Move this order on')).not.toBeInTheDocument();
  }, 60000);

  it('refuses a read-only admin at the API, not just in the UI', async () => {
    const orders = await authedFetch(ADMINS.readonly, '/admin/orders?open=true');
    const body = (await orders.json()) as { data: { items: Array<{ id: string }> } };
    const order = body.data.items[0];
    expect(order).toBeDefined();

    const attempts: Array<[string, RequestInit]> = [
      [
        `/admin/orders/${order!.id}/status`,
        { method: 'POST', body: JSON.stringify({ status: 'completed' }) },
      ],
      [`/admin/orders/${order!.id}/cancel`, { method: 'POST', body: JSON.stringify({}) }],
      [
        `/admin/orders/${order!.id}/payments`,
        { method: 'POST', body: JSON.stringify({ amountMinor: 100, method: 'cash' }) },
      ],
    ];

    for (const [path, init] of attempts) {
      const response = await authedFetch(ADMINS.readonly, path, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      });
      // Hiding the control was a courtesy; this is the boundary.
      expect(response.status).toBe(403);
    }
  }, 60000);

  it('lets finance read receivables but not move an order on', async () => {
    const orders = await authedFetch(ADMINS.finance, '/admin/orders?open=true');
    const body = (await orders.json()) as { data: { items: Array<{ id: string }> } };
    const order = body.data.items[0];
    expect(order).toBeDefined();

    const receivables = await authedFetch(ADMINS.finance, '/admin/receivables');
    expect(receivables.status).toBe(200);

    const move = await authedFetch(ADMINS.finance, `/admin/orders/${order!.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    expect(move.status).toBe(403);
  }, 60000);

  it('serves the order vocabulary rather than making the panel hard-code the lifecycle', async () => {
    const response = await authedFetch(ADMINS.super, '/admin/catalog/meta');
    const body = (await response.json()) as {
      data: {
        orderStatuses: Array<{
          value: string;
          allowedNext: string[];
          holdsStock: boolean;
          terminal: boolean;
        }>;
        orderLineTypes: string[];
        discountTypes: string[];
        limits: { maxInstallments: number };
      };
    };

    expect(response.status).toBe(200);

    const draft = body.data.orderStatuses.find((entry) => entry.value === 'draft');
    expect(draft?.allowedNext).toEqual(expect.arrayContaining(['confirmed']));
    expect(draft?.holdsStock).toBe(false);

    const cancelled = body.data.orderStatuses.find((entry) => entry.value === 'cancelled');
    expect(cancelled?.terminal).toBe(true);
    expect(cancelled?.allowedNext).toEqual([]);

    expect(body.data.orderLineTypes).toEqual(['item', 'service']);
    expect(body.data.discountTypes).toEqual(['none', 'amount', 'percent']);
    expect(body.data.limits.maxInstallments).toBe(36);
  }, 45000);
});
