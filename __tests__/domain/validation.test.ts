import {
  assertValidLast4,
  currencyCodeSchema,
  hexColorSchema,
  isValidLast4,
} from '@/domain/validation';

describe('last4', () => {
  it('accepts exactly four digits', () => {
    expect(isValidLast4('1234')).toBe(true);
    expect(isValidLast4('0000')).toBe(true);
  });

  it.each(['123', '12345', '4111111111111111', '12a4', ' 1234', ''])('rejects %p', (value) => {
    expect(isValidLast4(value)).toBe(false);
    expect(() => assertValidLast4(value)).toThrow(RangeError);
  });

  it('allows a missing value', () => {
    expect(() => assertValidLast4(null)).not.toThrow();
    expect(() => assertValidLast4(undefined)).not.toThrow();
  });
});

describe('other field schemas', () => {
  it('hex colours', () => {
    expect(hexColorSchema.safeParse('#1565C0').success).toBe(true);
    expect(hexColorSchema.safeParse('1565C0').success).toBe(false);
    expect(hexColorSchema.safeParse('#FFF').success).toBe(false);
  });

  it('currency codes', () => {
    expect(currencyCodeSchema.safeParse('CAD').success).toBe(true);
    expect(currencyCodeSchema.safeParse('cad').success).toBe(false);
    expect(currencyCodeSchema.safeParse('CA').success).toBe(false);
  });
});
