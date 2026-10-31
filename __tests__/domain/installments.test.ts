import {
  evenInstallmentCents,
  installmentAmountCents,
  installmentStatus,
  monthlyInstallmentsByAccount,
  upcomingInstallments,
} from '@/domain/installments';

// $1,000 over 3 months: $333.34, $333.34, then $333.32 to come out even.
const laptop = {
  principalCents: 100000,
  months: 3,
  monthlyCents: evenInstallmentCents(100000, 3),
  monthlyFeeCents: 0,
  firstPaymentDate: '2026-09-15',
};

describe('installments', () => {
  it('splits a purchase evenly, rounding up so the last one comes in under', () => {
    expect(evenInstallmentCents(100000, 3)).toBe(33334);
    expect(installmentAmountCents(laptop, 0)).toBe(33334);
    expect(installmentAmountCents(laptop, 2)).toBe(33332);
  });

  it('counts the instalments whose date has passed', () => {
    expect(installmentStatus(laptop, '2026-09-14')).toMatchObject({
      paidCount: 0,
      remainingCount: 3,
      remainingCents: 100000,
      nextDate: '2026-09-15',
      lastDate: '2026-11-15',
    });
    expect(installmentStatus(laptop, '2026-10-15')).toMatchObject({
      paidCount: 2,
      remainingCount: 1,
      remainingCents: 33332,
      nextDate: '2026-11-15',
      done: false,
    });
    expect(installmentStatus(laptop, '2026-12-01')).toMatchObject({
      paidCount: 3,
      remainingCents: 0,
      nextDate: null,
      done: true,
      progress: 1,
    });
  });

  it('keeps month-end dates in short months', () => {
    const plan = { ...laptop, firstPaymentDate: '2026-01-31' };
    expect(installmentStatus(plan, '2026-02-01').nextDate).toBe('2026-02-28');
  });

  it('lists the instalments coming up, with fees', () => {
    const withFee = { ...laptop, monthlyFeeCents: 500 };
    expect(
      upcomingInstallments([withFee], '2026-10-01', 30).map((u) => [
        u.date,
        u.number,
        u.amountCents,
      ]),
    ).toEqual([['2026-10-15', 2, 33834]]);
  });

  it('totals what each card is still billed per month', () => {
    const totals = monthlyInstallmentsByAccount(
      [
        { ...laptop, accountId: 'visa' },
        { ...laptop, accountId: 'visa', monthlyFeeCents: 100 },
        { ...laptop, accountId: 'amex', firstPaymentDate: '2025-01-01' }, // finished
      ],
      '2026-10-01',
    );
    expect(totals).toEqual(new Map([['visa', 33334 * 2 + 100]]));
  });
});
