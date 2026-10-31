import {
  splitFormattedCents,
  assertCents,
  centsToInputString,
  decimalSeparator,
  formatCents,
  isCents,
  parseMoneyToCents,
  sumCents,
} from '@/domain/money';

// Intl output uses NBSP / narrow NBSP in some locales; normalize for readable assertions.
const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('isCents / assertCents', () => {
  it('accepts safe integers only', () => {
    expect(isCents(0)).toBe(true);
    expect(isCents(-12345)).toBe(true);
    expect(isCents(1.5)).toBe(false);
    expect(isCents(NaN)).toBe(false);
    expect(isCents(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isCents('100')).toBe(false);
  });

  it('throws with the field name', () => {
    expect(() => assertCents(12.34, 'limit')).toThrow(/limit must be an integer/);
    expect(() => assertCents(1234)).not.toThrow();
  });
});

describe('sumCents', () => {
  it('adds signed cents exactly', () => {
    expect(sumCents([-1999, 500, 1])).toBe(-1498);
    expect(sumCents([])).toBe(0);
    expect(sumCents(new Set([10, 20]))).toBe(30);
  });

  it('rejects floats and overflow', () => {
    expect(() => sumCents([1, 0.1])).toThrow(TypeError);
    expect(() => sumCents([Number.MAX_SAFE_INTEGER, 1])).toThrow(/total/);
  });
});

describe('decimalSeparator', () => {
  it('knows en-CA and fr-CA', () => {
    expect(decimalSeparator('en-CA')).toBe('.');
    expect(decimalSeparator('fr-CA')).toBe(',');
  });

  it('works without formatToParts, which Hermes lacks', () => {
    const original = Intl.NumberFormat.prototype.formatToParts;
    // @ts-expect-error simulating the Hermes runtime
    delete Intl.NumberFormat.prototype.formatToParts;
    try {
      expect(decimalSeparator('en-CA')).toBe('.');
      expect(decimalSeparator('fr-CA')).toBe(',');
      expect(parseMoneyToCents('1 234,56', 'fr-CA')).toBe(123456);
    } finally {
      Intl.NumberFormat.prototype.formatToParts = original;
    }
  });
});

describe('parseMoneyToCents (en-CA)', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['0.01', 1],
    ['.99', 99],
    ['12.', 1200],
    ['1,234.56', 123456],
    ['1,234,567.89', 123456789],
    ['$54.20', 5420],
    ['  $ 54.20 CAD ', 5420],
    ['+5', 500],
    ['0', 0],
    ['-0.00', 0],
  ])('%s → %d', (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it.each([
    ['-12.34', -1234],
    ['−12.34', -1234],
    ['-$12.34', -1234],
    ['$-12.34', -1234],
    ['12.34-', -1234],
    ['(12.34)', -1234],
    ['($1,000.00)', -100000],
  ])('negative %s → %d', (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['$'],
    ['-'],
    ['.'],
    ['12.345'],
    ['1.2.3'],
    ['12,34'],
    ['1,23,456'],
    ['12a'],
    ['--5'],
    ['99999999999999999999'],
  ])('rejects %p', (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });

  it('never produces float error (0.1 + 0.2 style)', () => {
    expect(parseMoneyToCents('0.29')).toBe(29);
    expect(parseMoneyToCents('1.13')).toBe(113);
    expect(parseMoneyToCents('4.35')).toBe(435);
  });
});

describe('parseMoneyToCents (fr-CA)', () => {
  it.each([
    ['12,50', 1250],
    ['1 234,56', 123456],
    ['1 234,56 $', 123456],
    ['1 234,56', 123456],
    ['1.234,56', 123456],
    ['-54,20', -5420],
    ['12.50', 1250],
    ['12.5', 1250],
    ['1.234', 123400],
  ])('%s → %d', (input, expected) => {
    expect(parseMoneyToCents(input, 'fr-CA')).toBe(expected);
  });

  it('rejects malformed grouping', () => {
    expect(parseMoneyToCents('12,345', 'fr-CA')).toBeNull();
    expect(parseMoneyToCents('1.23.4', 'fr-CA')).toBeNull();
  });
});

describe('formatCents', () => {
  it('formats CAD in en-CA', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(-5420)).toBe('-$54.20');
    expect(formatCents(0)).toBe('$0.00');
  });

  it('formats CAD in fr-CA', () => {
    expect(plain(formatCents(123456, 'CAD', 'fr-CA'))).toBe('1 234,56 $');
  });

  it('formats other currencies', () => {
    expect(formatCents(1000, 'USD', 'en-CA')).toBe('US$10.00');
  });

  it('rejects non-integer cents', () => {
    expect(() => formatCents(1.5)).toThrow(TypeError);
  });
});

describe('centsToInputString', () => {
  it('round-trips through the parser', () => {
    for (const cents of [0, 1, 99, 100, 5420, -5420, 123456789]) {
      expect(parseMoneyToCents(centsToInputString(cents))).toBe(cents);
      expect(parseMoneyToCents(centsToInputString(cents, 'fr-CA'), 'fr-CA')).toBe(cents);
    }
  });

  it('formats without grouping', () => {
    expect(centsToInputString(123456)).toBe('1234.56');
    expect(centsToInputString(-5)).toBe('-0.05');
    expect(centsToInputString(5420, 'fr-CA')).toBe('54,20');
  });
});

describe('splitFormattedCents', () => {
  it('splits off the cents in both locales', () => {
    expect(splitFormattedCents('$2,490.39')).toEqual({
      whole: '$2,490',
      fraction: '.39',
      suffix: '',
    });
    expect(splitFormattedCents('2 490,39 $', 'fr-CA')).toEqual({
      whole: '2 490',
      fraction: ',39',
      suffix: ' $',
    });
    expect(splitFormattedCents('-$5.40')).toEqual({ whole: '-$5', fraction: '.40', suffix: '' });
  });

  it('leaves amounts without two-digit cents whole', () => {
    expect(splitFormattedCents('¥1,200', 'en-CA')).toEqual({
      whole: '¥1,200',
      fraction: '',
      suffix: '',
    });
  });
});
