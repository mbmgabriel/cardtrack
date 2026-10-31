import { netWorth, safeToSpend, type PositionAccount } from '@/domain/position';

const acct = (overrides: Partial<PositionAccount>): PositionAccount => ({
  type: 'debit',
  currency: 'CAD',
  isArchived: false,
  balanceCents: 0,
  availableCreditCents: null,
  ...overrides,
});

const chequing = acct({ type: 'debit', balanceCents: 250000 });
const savings = acct({ type: 'savings', balanceCents: 500000 });
const visa = acct({ type: 'credit', balanceCents: 40000, availableCreditCents: 57500 });
const loan = acct({ type: 'loan', balanceCents: 1200000 });

describe('netWorth', () => {
  it('is what you hold minus what you owe, broken down by type', () => {
    expect(netWorth([chequing, savings, visa, loan])).toEqual([
      {
        currency: 'CAD',
        assetsCents: 750000,
        debtsCents: 1240000,
        netCents: -490000,
        assets: [
          { type: 'savings', cents: 500000 },
          { type: 'debit', cents: 250000 },
        ],
        debts: [
          { type: 'loan', cents: 1200000 },
          { type: 'credit', cents: 40000 },
        ],
      },
    ]);
  });

  it('counts overdrafts and credit balances the right way, skips archived, splits currencies', () => {
    const result = netWorth([
      acct({ type: 'debit', balanceCents: -5000 }),
      acct({ type: 'credit', balanceCents: -2000 }),
      acct({ type: 'debit', balanceCents: 99999, isArchived: true }),
      acct({ type: 'cash', currency: 'USD', balanceCents: 1000 }),
    ]);
    expect(result.map((r) => [r.currency, r.assetsCents, r.debtsCents, r.netCents])).toEqual([
      ['CAD', -5000, -2000, -3000],
      ['USD', 1000, 0, 1000],
    ]);
  });
});

describe('safeToSpend', () => {
  it('takes card payments and bills due in the next 30 days off spending cash', () => {
    const [result] = safeToSpend(
      [chequing, savings, visa, loan],
      [
        { currency: 'CAD', owedCents: 40000, daysUntil: 3 },
        // Due later than the window: not yet.
        { currency: 'CAD', owedCents: 9999, daysUntil: 45 },
      ],
      [
        { currency: 'CAD', amountCents: -150000, accountType: 'debit', daysUntil: 1 }, // rent
        { currency: 'CAD', amountCents: -45000, accountType: 'debit', daysUntil: 20 }, // loan payment
        // On a credit card: adds to the card, paid through its own due date.
        { currency: 'CAD', amountCents: -1699, accountType: 'credit', daysUntil: 5 },
        // Expected income is never counted.
        { currency: 'CAD', amountCents: 300000, accountType: 'debit', daysUntil: 14 },
        // Outside the window.
        { currency: 'CAD', amountCents: -8000, accountType: 'debit', daysUntil: 31 },
      ],
    );
    expect(result).toEqual({
      currency: 'CAD',
      cashCents: 250000,
      paymentsDueCents: 40000,
      billsCents: 195000,
      safeCents: 15000,
      availableCreditCents: 57500,
      savingsCents: 500000,
    });
  });

  it('can come out negative (a shortfall)', () => {
    const [result] = safeToSpend(
      [acct({ type: 'debit', balanceCents: 10000 })],
      [{ currency: 'CAD', owedCents: 30000, daysUntil: -2 }],
      [],
    );
    expect(result.safeCents).toBe(-20000);
  });

  it('only covers currencies that have spending money', () => {
    expect(safeToSpend([savings, visa], [], [])).toEqual([]);
  });
});
