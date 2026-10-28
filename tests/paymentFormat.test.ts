import {
  CONTACT_CHANNEL_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  contactChannelLabel,
  minorToAmountInput,
  parseAmountToMinor,
  paymentMethodLabel,
  paymentStateLabel,
  paymentStateTone,
} from '../src/utils/paymentFormat';

describe('amount conversion', () => {
  it('reads rupees and returns whole paise', () => {
    expect(parseAmountToMinor('150')).toBe(15_000);
    expect(parseAmountToMinor('150.5')).toBe(15_050);
    expect(parseAmountToMinor('150.55')).toBe(15_055);
    expect(parseAmountToMinor('0.01')).toBe(1);
  });

  it('rounds a third decimal to the nearest paisa rather than dropping it', () => {
    // 150.555 is between two paise; it must not silently become 150.55.
    expect(parseAmountToMinor('150.555')).toBe(15_056);
    expect(parseAmountToMinor('150.554')).toBe(15_055);
  });

  it('rejects anything that is not a usable amount', () => {
    for (const input of ['', '   ', 'abc', '-5', '1e', 'Infinity']) {
      expect(parseAmountToMinor(input)).toBeNull();
    }
  });

  it('round-trips through the editable form', () => {
    for (const minor of [0, 1, 15_050, 273_600]) {
      expect(parseAmountToMinor(minorToAmountInput(minor))).toBe(minor);
    }
  });

  it('renders nothing for an absent amount', () => {
    expect(minorToAmountInput(null)).toBe('');
    expect(minorToAmountInput(undefined)).toBe('');
  });
});

describe('payment vocabulary', () => {
  it('labels every method the API serves', () => {
    expect(paymentMethodLabel('cash')).toBe('Cash');
    expect(paymentMethodLabel('upi')).toBe('UPI');
    expect(paymentMethodLabel('bank_transfer')).toBe('Bank transfer');
    // An unknown method from a newer server still reads as words.
    expect(paymentMethodLabel('crypto_wallet')).toBe('crypto wallet');
  });

  it('offers every method as a choice', () => {
    expect(PAYMENT_METHOD_OPTIONS.map((option) => option.value)).toEqual([
      'cash',
      'upi',
      'card',
      'bank_transfer',
      'cheque',
      'other',
    ]);
  });

  it('names each payment state', () => {
    expect(paymentStateLabel('unpaid')).toBe('Unpaid');
    expect(paymentStateLabel('partially_paid')).toBe('Part paid');
    expect(paymentStateLabel('fully_paid')).toBe('Paid');
    expect(paymentStateLabel('overdue')).toBe('Overdue');
  });

  it('gives overdue the tone that catches the eye', () => {
    expect(paymentStateTone('overdue')).toBe('danger');
    expect(paymentStateTone('fully_paid')).toBe('success');
    expect(paymentStateTone('partially_paid')).toBe('warning');
    expect(paymentStateTone('unpaid')).toBe('neutral');
  });

  it('names the contact channels', () => {
    expect(contactChannelLabel('whatsapp')).toBe('WhatsApp');
    expect(contactChannelLabel('both')).toBe('SMS and WhatsApp');
    expect(CONTACT_CHANNEL_OPTIONS).toHaveLength(4);
  });
});
