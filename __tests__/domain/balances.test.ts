import {
  utilizationRating,
  availableCreditCents,
  countsTowardBalance,
  isHighUtilization,
  owedCents,
  pendingHoldsCents,
  postedBalanceCents,
  summarizeAccount,
  totalsByCurrency,
  totalsFromTransactions,
  utilization,
  type BalanceAccount,
} from '@/domain/balances';
import { isLiabilityAccount } from '@/domain/types';

const visa: BalanceAccount = {
  type: 'credit',
  openingBalanceCents: -50000, // owed $500 at the start
  creditLimitCents: 500000, // $5,000 limit
};

const chequing: BalanceAccount = {
  type: 'debit',
  openingBalanceCents: 200000, // $2,000 in the account
  creditLimitCents: null,
};

describe('totalsFromTransactions', () => {
  const opened = '2026-10-01';

  it('sums posted and pending separately and ignores void', () => {
    expect(
      totalsFromTransactions(
        [
          { date: '2026-10-02', amountCents: -2000, status: 'posted' },
          { date: '2026-10-02', amountCents: 500, status: 'posted' },
          { date: '2026-10-03', amountCents: -100, status: 'pending' },
          { date: '2026-10-03', amountCents: -99999, status: 'void' },
        ],
        opened,
      ),
    ).toEqual({ postedCents: -1500, pendingCents: -100 });
  });

  it('ignores anything dated before the opening-balance date; the date itself counts', () => {
    expect(
      totalsFromTransactions(
        [
          { date: '2026-09-30', amountCents: -7000, status: 'posted' },
          { date: '2026-09-30', amountCents: -300, status: 'pending' },
          { date: '2025-12-31', amountCents: -1, status: 'posted' },
          { date: '2026-10-01', amountCents: -2000, status: 'posted' },
          { date: '2026-10-01', amountCents: -100, status: 'pending' },
        ],
        opened,
      ),
    ).toEqual({ postedCents: -2000, pendingCents: -100 });
  });

  it('countsTowardBalance compares calendar dates', () => {
    expect(countsTowardBalance('2026-10-01', opened)).toBe(true);
    expect(countsTowardBalance('2026-11-15', opened)).toBe(true);
    expect(countsTowardBalance('2026-09-30', opened)).toBe(false);
  });

  it('is zero for no transactions', () => {
    expect(totalsFromTransactions([], opened)).toEqual({ postedCents: 0, pendingCents: 0 });
  });
});

describe('credit account', () => {
  // Purchase $120.00, refund $20.00, payment $100.00 → owed 500 + 120 − 20 − 100 = $500.
  const totals = { postedCents: -12000 + 2000 + 10000, pendingCents: -5420 };

  it('posted balance = opening + posted', () => {
    expect(postedBalanceCents(visa, totals)).toBe(-50000);
  });

  it('owed is the negated balance, shown positive', () => {
    expect(owedCents(visa, totals)).toBe(50000);
  });

  it('purchases increase owed and payments decrease it', () => {
    expect(owedCents(visa, { postedCents: -2500, pendingCents: 0 })).toBe(52500);
    expect(owedCents(visa, { postedCents: 50000, pendingCents: 0 })).toBe(0);
  });

  it('overpayment gives a negative owed (credit balance)', () => {
    expect(owedCents(visa, { postedCents: 60000, pendingCents: 0 })).toBe(-10000);
  });

  it('pending holds do not change owed but reduce available credit', () => {
    expect(pendingHoldsCents(totals)).toBe(5420);
    // 5000 − 500 − 54.20
    expect(availableCreditCents(visa, totals)).toBe(444580);
  });

  it('utilization = owed / limit, warning above 30%', () => {
    expect(utilization(visa, totals)).toBeCloseTo(0.1);
    expect(isHighUtilization(0.1)).toBe(false);
    expect(isHighUtilization(0.3)).toBe(false);
    expect(isHighUtilization(0.31)).toBe(true);
    expect(isHighUtilization(null)).toBe(false);
  });

  it('a credit balance counts as 0% utilization', () => {
    expect(utilization(visa, { postedCents: 60000, pendingCents: 0 })).toBe(0);
  });

  it('no or zero limit gives null available credit and utilization', () => {
    const noLimit = { ...visa, creditLimitCents: null };
    expect(availableCreditCents(noLimit, totals)).toBeNull();
    expect(utilization(noLimit, totals)).toBeNull();
    expect(utilization({ ...visa, creditLimitCents: 0 }, totals)).toBeNull();
  });

  it('rejects float amounts', () => {
    expect(() => postedBalanceCents({ ...visa, openingBalanceCents: 1.5 }, totals)).toThrow();
    expect(() => availableCreditCents({ ...visa, creditLimitCents: 0.5 }, totals)).toThrow();
  });

  it('summarizes as a liability', () => {
    expect(summarizeAccount(visa, totals)).toEqual({
      balanceCents: 50000,
      isLiability: true,
      pendingHoldsCents: 5420,
      availableCreditCents: 444580,
      utilization: 0.1,
    });
  });
});

describe('debit account', () => {
  it('balance = opening + posted; deposits add, withdrawals subtract', () => {
    const totals = { postedCents: 150000 - 30000, pendingCents: -1000 };
    expect(postedBalanceCents(chequing, totals)).toBe(320000);
    expect(summarizeAccount(chequing, totals)).toEqual({
      balanceCents: 320000,
      isLiability: false,
      pendingHoldsCents: 1000,
      availableCreditCents: null,
      utilization: null,
    });
  });

  it('can go negative (overdraft)', () => {
    expect(postedBalanceCents(chequing, { postedCents: -250000, pendingCents: 0 })).toBe(-50000);
  });

  it('a pending refund gives negative holds', () => {
    expect(pendingHoldsCents({ postedCents: 0, pendingCents: 500 })).toBe(-500);
    expect(pendingHoldsCents({ postedCents: 0, pendingCents: 0 })).toBe(0);
  });
});

describe('isLiabilityAccount', () => {
  it('is true only for credit and lines of credit', () => {
    expect(isLiabilityAccount('credit')).toBe(true);
    expect(isLiabilityAccount('line_of_credit')).toBe(true);
    for (const type of ['debit', 'savings', 'prepaid', 'cash'] as const) {
      expect(isLiabilityAccount(type)).toBe(false);
    }
  });
});

describe('totalsByCurrency', () => {
  it('groups per currency without FX conversion', () => {
    const zero = { postedCents: 0, pendingCents: 0 };
    const result = totalsByCurrency([
      { currency: 'CAD', account: visa, totals: { postedCents: 0, pendingCents: -1000 } },
      { currency: 'CAD', account: chequing, totals: zero },
      {
        currency: 'CAD',
        account: { type: 'line_of_credit', openingBalanceCents: -100000, creditLimitCents: null },
        totals: zero,
      },
      {
        currency: 'USD',
        account: { type: 'credit', openingBalanceCents: -2000, creditLimitCents: 100000 },
        totals: zero,
      },
    ]);
    expect(result).toEqual([
      {
        currency: 'CAD',
        owedCents: 150000,
        cashCents: 200000,
        creditLimitCents: 500000,
        availableCreditCents: 449000,
        pendingHoldsCents: 1000,
      },
      {
        currency: 'USD',
        owedCents: 2000,
        cashCents: 0,
        creditLimitCents: 100000,
        availableCreditCents: 98000,
        pendingHoldsCents: 0,
      },
    ]);
  });

  it('is empty with no accounts', () => {
    expect(totalsByCurrency([])).toEqual([]);
  });
});

describe('utilizationRating', () => {
  it('reads utilization against the 30% guideline', () => {
    expect(utilizationRating(0)).toBe('excellent');
    expect(utilizationRating(0.09)).toBe('excellent');
    expect(utilizationRating(0.1)).toBe('good');
    expect(utilizationRating(0.3)).toBe('good');
    expect(utilizationRating(0.31)).toBe('fair');
    expect(utilizationRating(0.5)).toBe('fair');
    expect(utilizationRating(0.51)).toBe('high');
    expect(utilizationRating(1.2)).toBe('high');
  });
});
