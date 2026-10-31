import { bpsToInputString, formatBps, MAX_RATE_BPS, parseRateToBps } from '@/domain/rates';

const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('parseRateToBps', () => {
  it.each([
    ['19.99', 1999],
    ['19.99%', 1999],
    [' 22.99 % ', 2299],
    ['0', 0],
    ['100', MAX_RATE_BPS],
    ['7.5', 750],
  ])('%s → %d', (input, bps) => {
    expect(parseRateToBps(input)).toBe(bps);
  });

  it('parses fr-CA', () => {
    expect(parseRateToBps('19,99 %', 'fr-CA')).toBe(1999);
  });

  it.each(['-1', '100.01', 'abc', '', '19.999'])('rejects %p', (input) => {
    expect(parseRateToBps(input)).toBeNull();
  });
});

describe('formatting', () => {
  it('round-trips through the input string', () => {
    for (const bps of [0, 5, 750, 1999, 10000]) {
      expect(parseRateToBps(bpsToInputString(bps))).toBe(bps);
      expect(parseRateToBps(bpsToInputString(bps, 'fr-CA'), 'fr-CA')).toBe(bps);
    }
    expect(bpsToInputString(1999)).toBe('19.99');
    expect(bpsToInputString(5, 'fr-CA')).toBe('0,05');
  });

  it('formats for display', () => {
    expect(formatBps(1999)).toBe('19.99%');
    expect(plain(formatBps(1999, 'fr-CA'))).toBe('19,99 %');
  });
});
