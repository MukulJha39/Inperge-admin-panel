import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { updateMerchant } from '../api/endpoints';
import { ERROR_CODES, type Gender, type Merchant } from '../api/types';
import { Button } from '../components/Button';
import { Drawer } from '../components/Drawer';
import { LockedField, SelectField, TextField } from '../components/Field';
import { InlineAlert } from '../components/States';
import { useToast } from '../components/Toast';
import { GENDER_OPTIONS, formatPhone } from '../utils/format';

interface MerchantFormDrawerProps {
  merchant: Merchant | null;
  onClose: () => void;
  onSaved: (merchant: Merchant) => void;
}

interface FormState {
  firstName: string;
  lastName: string;
  gender: Gender;
}

/**
 * Edits the parts of a merchant an admin may correct: first name, last name, gender.
 *
 * The verified phone number is shown as a locked field. It is not editable anywhere,
 * and the API rejects it even if a request tried (PRD section 4).
 */
export function MerchantFormDrawer({ merchant, onClose, onSaved }: MerchantFormDrawerProps) {
  const toast = useToast();

  const [form, setForm] = useState<FormState>({ firstName: '', lastName: '', gender: 'male' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load the record into the form each time a different merchant is opened.
  useEffect(() => {
    if (!merchant) return;
    setForm({ firstName: merchant.firstName, lastName: merchant.lastName, gender: merchant.gender });
    setFieldErrors({});
    setFormError(null);
  }, [merchant]);

  if (!merchant) return null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!form.firstName.trim()) errors.firstName = 'First name is required.';
    else if (form.firstName.trim().length > 60) errors.firstName = 'Use 60 characters or fewer.';
    if (!form.lastName.trim()) errors.lastName = 'Last name is required.';
    else if (form.lastName.trim().length > 60) errors.lastName = 'Use 60 characters or fewer.';
    if (!form.gender) errors.gender = 'Gender is required.';

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!merchant || !validate() || saving) return;

    setSaving(true);
    try {
      const { merchant: updated } = await updateMerchant(merchant.id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        gender: form.gender,
      });

      toast.success('Merchant updated', `${updated.fullName} was saved.`);
      onSaved(updated);
      onClose();
    } catch (error) {
      // The drawer deliberately stays open so nothing typed is lost.
      if (error instanceof ApiError) {
        const issues = error.fieldErrors();
        if (Object.keys(issues).length > 0) setFieldErrors(issues);

        setFormError(
          error.code === ERROR_CODES.PHONE_IMMUTABLE
            ? 'A verified phone number cannot be changed.'
            : error.message,
        );
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open
      title="Edit merchant"
      description="Correct the merchant's name or gender. Their verified phone number is fixed."
      busy={saving}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" form="merchant-form" type="submit" loading={saving}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="merchant-form" className="stack gap-5" onSubmit={handleSubmit} noValidate>
        {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}

        <TextField
          label="First name"
          value={form.firstName}
          onChange={(event) => update('firstName', event.target.value)}
          maxLength={60}
          autoComplete="off"
          {...(fieldErrors.firstName ? { error: fieldErrors.firstName } : {})}
        />

        <TextField
          label="Last name"
          value={form.lastName}
          onChange={(event) => update('lastName', event.target.value)}
          maxLength={60}
          autoComplete="off"
          {...(fieldErrors.lastName ? { error: fieldErrors.lastName } : {})}
        />

        <SelectField
          label="Gender"
          options={GENDER_OPTIONS}
          value={form.gender}
          onChange={(event) => update('gender', event.target.value as Gender)}
          {...(fieldErrors.gender ? { error: fieldErrors.gender } : {})}
        />

        <LockedField
          label="Verified phone number"
          value={formatPhone(merchant.countryCode, merchant.phone)}
          hint="Captured during phone verification. It identifies the merchant and can never be changed."
        />
      </form>
    </Drawer>
  );
}
