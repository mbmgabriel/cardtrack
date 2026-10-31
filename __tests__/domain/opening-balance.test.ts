import { openingBalanceForDisplay, openingBalanceToStored } from '@/domain/balances';
import { hasCardDetails } from '@/domain/types';

describe('opening balance entry', () => {
  it('stores owed amounts on credit and LOC as negative', () => {
    expect(openingBalanceToStored('credit', 50000)).toBe(-50000);
    expect(openingBalanceToStored('line_of_credit', 1)).toBe(-1);
    expect(openingBalanceToStored('credit', -2000)).toBe(2000); // credit balance
    expect(Object.is(openingBalanceToStored('credit', 0), 0)).toBe(true); // no -0
  });

  it('stores other balances as entered', () => {
    expect(openingBalanceToStored('debit', 200000)).toBe(200000);
    expect(openingBalanceToStored('savings', -500)).toBe(-500);
  });

  it('display is the inverse', () => {
    for (const type of ['credit', 'debit'] as const) {
      for (const cents of [0, 1, -1, 50000]) {
        expect(openingBalanceForDisplay(type, openingBalanceToStored(type, cents))).toBe(cents);
      }
    }
  });

  it('rejects fractional cents', () => {
    expect(() => openingBalanceToStored('credit', 1.5)).toThrow();
  });
});

describe('hasCardDetails', () => {
  it('applies to card-based accounts only', () => {
    expect(['credit', 'debit', 'prepaid'].every((t) => hasCardDetails(t as never))).toBe(true);
    expect(['savings', 'line_of_credit', 'cash'].some((t) => hasCardDetails(t as never))).toBe(
      false,
    );
  });
});
