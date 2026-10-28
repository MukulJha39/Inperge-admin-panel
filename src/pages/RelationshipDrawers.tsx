import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import {
  recordAdminPurchasePayment,
  updateAdminCustomer,
  updateAdminSupplier,
} from '../api/endpoints';
import type {
  ContactChannel,
  ContactLanguage,
  Customer,
  Gender,
  PaymentEntry,
  PaymentMethod,
  Purchase,
  Supplier,
} from '../api/types';
import { Button } from '../components/Button';
import { Drawer } from '../components/Drawer';
import { SelectField, TextField } from '../components/Field';
import { InlineAlert } from '../components/States';
import { useToast } from '../components/Toast';
import { formatMoneyMinor } from '../utils/format';
import {
  CONTACT_CHANNEL_OPTIONS,
  CONTACT_LANGUAGE_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  parseAmountToMinor,
} from '../utils/paymentFormat';

const GENDER_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

/** Maps the server's field errors onto the inputs they belong to. */
function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  return error.fieldErrors();
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/* -------------------------------- customer -------------------------------- */

interface CustomerDrawerProps {
  customer: Customer | null;
  onClose: () => void;
  onSaved: (updated: Customer) => void;
}

/**
 * Edits a merchant's customer on their behalf.
 *
 * The phone number is editable here, unlike a merchant's own verified sign-in number:
 * it was typed by the merchant, and a mistyped customer number is exactly the kind of
 * thing support is asked to fix.
 */
export function CustomerDrawer({ customer, onClose, onSaved }: CustomerDrawerProps) {
  const toast = useToast();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<Gender>('female');
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [city, setCity] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [notes, setNotes] = useState('');
  const [preferredChannel, setPreferredChannel] = useState<ContactChannel>('none');
  const [language, setLanguage] = useState<ContactLanguage>('en');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!customer) return;
    setFirstName(customer.firstName);
    setLastName(customer.lastName);
    setGender(customer.gender);
    setCountryCode(customer.countryCode);
    setPhone(customer.phone);
    setEmail(customer.email ?? '');
    setCompanyName(customer.companyName ?? '');
    setCity(customer.address.city ?? '');
    setAddressLine1(customer.address.line1 ?? '');
    setNotes(customer.notes ?? '');
    setPreferredChannel(customer.preferredChannel);
    setLanguage(customer.language);
    setFieldErrors({});
    setFormError(null);
  }, [customer]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!customer || saving) return;

    setSaving(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const { customer: updated } = await updateAdminCustomer(customer.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender,
        countryCode,
        phone: phone.trim(),
        email: email.trim() || null,
        companyName: companyName.trim() || null,
        city: city.trim() || null,
        addressLine1: addressLine1.trim() || null,
        notes: notes.trim() || null,
        preferredChannel,
        language,
      });

      toast.success(`${updated.fullName} saved`);
      onSaved(updated);
      onClose();
    } catch (error) {
      // Nothing typed is cleared: the drawer keeps its own state.
      setFieldErrors(fieldErrorsFrom(error));
      setFormError(messageFrom(error, 'Could not save this customer. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={Boolean(customer)}
      title="Edit customer"
      {...(customer ? { description: `${customer.fullName} · ${customer.merchantName ?? ''}` } : {})}
      busy={saving}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" loading={saving}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="customer-form" className="form" onSubmit={submit}>
        {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}

        <div className="form__row">
          <TextField
            label="First name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            {...(fieldErrors.firstName ? { error: fieldErrors.firstName } : {})}
            disabled={saving}
          />
          <TextField
            label="Last name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            {...(fieldErrors.lastName ? { error: fieldErrors.lastName } : {})}
            disabled={saving}
          />
        </div>

        <div className="form__row">
          <TextField
            label="Country code"
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value)}
            {...(fieldErrors.countryCode ? { error: fieldErrors.countryCode } : {})}
            disabled={saving}
          />
          <TextField
            label="Phone number"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            {...(fieldErrors.phone ? { error: fieldErrors.phone } : {})}
            hint="Editable: a customer's number was typed, not verified."
            disabled={saving}
          />
        </div>

        <SelectField
          label="Gender"
          value={gender}
          options={GENDER_OPTIONS}
          onChange={(event) => setGender(event.target.value as Gender)}
          {...(fieldErrors.gender ? { error: fieldErrors.gender } : {})}
          disabled={saving}
        />

        <TextField
          label="Email"
          optional
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          {...(fieldErrors.email ? { error: fieldErrors.email } : {})}
          disabled={saving}
        />

        <TextField
          label="Business or company"
          optional
          value={companyName}
          onChange={(event) => setCompanyName(event.target.value)}
          {...(fieldErrors.companyName ? { error: fieldErrors.companyName } : {})}
          disabled={saving}
        />

        <TextField
          label="Street address"
          optional
          value={addressLine1}
          onChange={(event) => setAddressLine1(event.target.value)}
          {...(fieldErrors.addressLine1 ? { error: fieldErrors.addressLine1 } : {})}
          disabled={saving}
        />

        <TextField
          label="City"
          optional
          value={city}
          onChange={(event) => setCity(event.target.value)}
          {...(fieldErrors.city ? { error: fieldErrors.city } : {})}
          disabled={saving}
        />

        <div className="form__row">
          <SelectField
            label="Preferred channel"
            value={preferredChannel}
            options={CONTACT_CHANNEL_OPTIONS}
            onChange={(event) => setPreferredChannel(event.target.value as ContactChannel)}
            disabled={saving}
          />
          <SelectField
            label="Language"
            value={language}
            options={CONTACT_LANGUAGE_OPTIONS}
            onChange={(event) => setLanguage(event.target.value as ContactLanguage)}
            disabled={saving}
          />
        </div>

        <TextField
          label="Notes"
          optional
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          {...(fieldErrors.notes ? { error: fieldErrors.notes } : {})}
          disabled={saving}
        />
      </form>
    </Drawer>
  );
}

/* -------------------------------- supplier -------------------------------- */

interface SupplierDrawerProps {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: (updated: Supplier) => void;
}

export function SupplierDrawer({ supplier, onClose, onSaved }: SupplierDrawerProps) {
  const toast = useToast();

  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [notes, setNotes] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supplier) return;
    setName(supplier.name);
    setContactPerson(supplier.contactPerson ?? '');
    setCountryCode(supplier.countryCode ?? '+91');
    setPhone(supplier.phone ?? '');
    setEmail(supplier.email ?? '');
    setAddressLine1(supplier.address.line1 ?? '');
    setCity(supplier.address.city ?? '');
    setTaxNumber(supplier.taxNumber ?? '');
    setNotes(supplier.notes ?? '');
    setFieldErrors({});
    setFormError(null);
  }, [supplier]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supplier || saving) return;

    setSaving(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const trimmedPhone = phone.trim();
      const { supplier: updated } = await updateAdminSupplier(supplier.id, {
        name: name.trim(),
        contactPerson: contactPerson.trim() || null,
        // The code only means something alongside a number, so both clear together.
        phone: trimmedPhone || null,
        countryCode: trimmedPhone ? countryCode : null,
        email: email.trim() || null,
        addressLine1: addressLine1.trim() || null,
        city: city.trim() || null,
        taxNumber: taxNumber.trim() || null,
        notes: notes.trim() || null,
      });

      toast.success(`${updated.name} saved`);
      onSaved(updated);
      onClose();
    } catch (error) {
      setFieldErrors(fieldErrorsFrom(error));
      setFormError(messageFrom(error, 'Could not save this supplier. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={Boolean(supplier)}
      title="Edit supplier"
      {...(supplier ? { description: `${supplier.name} · ${supplier.merchantName ?? ''}` } : {})}
      busy={saving}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="supplier-form" loading={saving}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="supplier-form" className="form" onSubmit={submit}>
        {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}

        <TextField
          label="Supplier name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          {...(fieldErrors.name ? { error: fieldErrors.name } : {})}
          disabled={saving}
        />

        <TextField
          label="Contact person"
          optional
          value={contactPerson}
          onChange={(event) => setContactPerson(event.target.value)}
          {...(fieldErrors.contactPerson ? { error: fieldErrors.contactPerson } : {})}
          disabled={saving}
        />

        <div className="form__row">
          <TextField
            label="Country code"
            optional
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value)}
            {...(fieldErrors.countryCode ? { error: fieldErrors.countryCode } : {})}
            disabled={saving}
          />
          <TextField
            label="Phone number"
            optional
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            {...(fieldErrors.phone ? { error: fieldErrors.phone } : {})}
            disabled={saving}
          />
        </div>

        <TextField
          label="Email"
          optional
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          {...(fieldErrors.email ? { error: fieldErrors.email } : {})}
          disabled={saving}
        />

        <TextField
          label="Street address"
          optional
          value={addressLine1}
          onChange={(event) => setAddressLine1(event.target.value)}
          {...(fieldErrors.addressLine1 ? { error: fieldErrors.addressLine1 } : {})}
          disabled={saving}
        />

        <TextField
          label="City"
          optional
          value={city}
          onChange={(event) => setCity(event.target.value)}
          {...(fieldErrors.city ? { error: fieldErrors.city } : {})}
          disabled={saving}
        />

        <TextField
          label="Tax number"
          optional
          value={taxNumber}
          onChange={(event) => setTaxNumber(event.target.value)}
          {...(fieldErrors.taxNumber ? { error: fieldErrors.taxNumber } : {})}
          disabled={saving}
        />

        <TextField
          label="Notes"
          optional
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          {...(fieldErrors.notes ? { error: fieldErrors.notes } : {})}
          disabled={saving}
        />
      </form>
    </Drawer>
  );
}

/* --------------------------- record a payment ----------------------------- */

interface PaymentDrawerProps {
  purchase: Purchase | null;
  onClose: () => void;
  onRecorded: (result: { purchase: Purchase; payment: PaymentEntry }) => void;
}

/**
 * Records a payment against a purchase, through the same engine the merchant app uses.
 *
 * The outstanding amount is shown, and an amount above it is refused by the server
 * rather than capped — a merchant who typed an extra zero needs telling, not a receipt
 * for a different number.
 */
export function PaymentDrawer({ purchase, onClose, onRecorded }: PaymentDrawerProps) {
  const toast = useToast();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!purchase) return;
    setAmount('');
    setMethod('cash');
    setReference('');
    setNotes('');
    setFieldErrors({});
    setFormError(null);
  }, [purchase]);

  const amountMinor = useMemo(() => parseAmountToMinor(amount), [amount]);

  const remaining = useMemo(() => {
    if (!purchase || amountMinor === null) return null;
    return purchase.outstandingMinor - amountMinor;
  }, [purchase, amountMinor]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!purchase || saving) return;

    if (amountMinor === null || amountMinor <= 0) {
      setFieldErrors({ amountMinor: 'Enter an amount greater than zero.' });
      return;
    }
    if (amountMinor > purchase.outstandingMinor) {
      setFieldErrors({
        amountMinor: `That is more than the ${formatMoneyMinor(purchase.outstandingMinor)} outstanding.`,
      });
      return;
    }

    setSaving(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const result = await recordAdminPurchasePayment(purchase.id, {
        amountMinor,
        method,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });

      toast.success(`${formatMoneyMinor(amountMinor)} recorded against ${purchase.reference}`);
      onRecorded(result);
      onClose();
    } catch (error) {
      setFieldErrors(fieldErrorsFrom(error));
      setFormError(messageFrom(error, 'Could not record this payment. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={Boolean(purchase)}
      title="Record a payment"
      {...(purchase ? { description: `${purchase.reference} · ${purchase.supplierName}` } : {})}
      busy={saving}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="payment-form" loading={saving}>
            Record payment
          </Button>
        </>
      }
    >
      <form id="payment-form" className="form" onSubmit={submit}>
        {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}

        {purchase ? (
          <InlineAlert tone="info">
            {formatMoneyMinor(purchase.paidMinor)} of {formatMoneyMinor(purchase.totalMinor)} paid.{' '}
            {formatMoneyMinor(purchase.outstandingMinor)} outstanding.
          </InlineAlert>
        ) : null}

        <TextField
          label="Amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          {...(fieldErrors.amountMinor ? { error: fieldErrors.amountMinor } : {})}
          inputMode="decimal"
          disabled={saving}
        />

        <SelectField
          label="How was it paid?"
          value={method}
          options={PAYMENT_METHOD_OPTIONS}
          onChange={(event) => setMethod(event.target.value as PaymentMethod)}
          {...(fieldErrors.method ? { error: fieldErrors.method } : {})}
          disabled={saving}
        />

        <TextField
          label="Reference"
          optional
          hint="Transaction id, cheque number, UPI reference."
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          {...(fieldErrors.reference ? { error: fieldErrors.reference } : {})}
          disabled={saving}
        />

        <TextField
          label="Notes"
          optional
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          {...(fieldErrors.notes ? { error: fieldErrors.notes } : {})}
          disabled={saving}
        />

        {remaining !== null && remaining >= 0 ? (
          <p className="text-sm text-muted">
            {remaining === 0
              ? 'This settles the purchase in full.'
              : `${formatMoneyMinor(remaining)} will remain outstanding.`}
          </p>
        ) : null}
      </form>
    </Drawer>
  );
}
