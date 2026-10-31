import { fireEvent, screen } from '@testing-library/react-native';

import ReportsScreen from '@/app/(tabs)/reports';
import { renderWithProviders } from '@/utils/test-utils';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { navigate: jest.fn(), push: jest.fn() },
}));
jest.mock('@/domain/dates', () => ({
  ...jest.requireActual('@/domain/dates'),
  todayISO: () => '2026-10-15',
}));
jest.mock('@/features/navigation/dock-tab-bar', () => ({ useDockInset: () => 100 }));
jest.mock('@/features/transactions/use-transactions', () => ({
  useAccountMap: () =>
    new Map([
      ['visa', { id: 'visa', name: 'TD Visa', currency: 'CAD' }],
      ['chq', { id: 'chq', name: 'Chequing', currency: 'CAD' }],
    ]),
}));
jest.mock('@/features/categories/use-categories', () => ({
  useCategoryMap: () =>
    new Map([
      ['dining', { id: 'dining', name: 'Dining', icon: 'silverware', isSystem: false }],
      ['groceries', { id: 'groceries', name: 'Groceries', icon: 'cart', isSystem: false }],
    ]),
}));
jest.mock('@/features/reports/use-position', () => ({
  usePosition: () => ({
    netWorth: [
      {
        currency: 'CAD',
        assetsCents: 750000,
        debtsCents: 40000,
        netCents: 710000,
        assets: [{ type: 'savings', cents: 500000 }],
        debts: [{ type: 'credit', cents: 40000 }],
      },
    ],
    safeToSpend: [
      {
        currency: 'CAD',
        cashCents: 250000,
        paymentsDueCents: 40000,
        billsCents: 195000,
        safeCents: 15000,
        availableCreditCents: 57500,
        savingsCents: 500000,
      },
    ],
  }),
}));
jest.mock('@/features/reports/use-report', () => ({ useReport: jest.fn() }));

const { useReport } = jest.requireMock<{ useReport: jest.Mock }>('@/features/reports/use-report');

const report = {
  total: 60000,
  byCategory: [
    { key: 'dining', cents: 40000, share: 0.67 },
    { key: 'groceries', cents: 20000, share: 0.33 },
  ],
  byAccount: [{ key: 'visa', cents: 60000, share: 1 }],
  payees: [{ key: 'tims', payee: 'Tim Hortons', cents: 4000, share: 0.07, count: 8 }],
  months: [
    { month: '2026-08', cents: 50000 },
    { month: '2026-09', cents: 50000 },
    { month: '2026-10', cents: 60000 },
  ],
  previous: {
    total: 50000,
    byCategory: [
      { key: 'dining', cents: 20000, share: 0.4 },
      { key: 'groceries', cents: 30000, share: 0.6 },
    ],
    byAccount: [{ key: 'visa', cents: 50000, share: 1 }],
  },
};

describe('ReportsScreen', () => {
  it('answers where you stand, where it went and how it is trending', async () => {
    useReport.mockReturnValue(report);
    await renderWithProviders(<ReportsScreen />);

    // 1. Where you stand.
    expect(screen.getByText('Where you stand')).toBeTruthy();
    expect(screen.getByText('You have $7,100.00 more than you owe.')).toBeTruthy();
    expect(screen.getByLabelText('Spending cash +$2,500.00')).toBeTruthy();
    expect(screen.getByLabelText('Card payments due −$400.00')).toBeTruthy();
    expect(screen.getByLabelText('Bills from your accounts −$1,950.00')).toBeTruthy();
    expect(screen.getByText(/Not counted: \$575\.00 available credit/)).toBeTruthy();

    // 2. Where it went: compared with the same days last month.
    expect(screen.getByText('20% more than Sep 1 – Sep 15.')).toBeTruthy();
    expect(screen.getByText('Dining ↑ $200.00')).toBeTruthy();
    expect(screen.getByText('Groceries ↓ $100.00')).toBeTruthy();
    expect(screen.getByText('+$200.00 vs. before')).toBeTruthy();

    // 3. Trend.
    expect(screen.getByText('You spend about $500.00 a month.')).toBeTruthy();
    expect(screen.getByText('October is 20% above your average so far.')).toBeTruthy();
  });

  it('asks for this month so far against the same days of last month', async () => {
    useReport.mockReturnValue(report);
    await renderWithProviders(<ReportsScreen />);
    expect(useReport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: '2026-10-01',
        previous: { from: '2026-09-01', to: '2026-09-15' },
      }),
    );
    // All time has nothing to compare with.
    await fireEvent.press(screen.getByRole('button', { name: 'All time' }));
    expect(useReport).toHaveBeenLastCalledWith(expect.objectContaining({ previous: undefined }));
  });

  it('leaves the payoff planner to its own page', async () => {
    useReport.mockReturnValue(report);
    await renderWithProviders(<ReportsScreen />);
    expect(screen.queryByText(/debt payoff/i)).toBeNull();
  });
});
