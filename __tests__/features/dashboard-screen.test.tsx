import { fireEvent, screen } from '@testing-library/react-native';

import DashboardScreen from '@/app/(tabs)/index';
import type { Account } from '@/db/schema';
import { summarizeAccount } from '@/domain/balances';
import { buildTimeline } from '@/features/dashboard/dashboard-data';
import { getFocusedCard } from '@/features/dashboard/focused-card';
import { setHideBalances, useDashboard } from '@/features/dashboard/use-dashboard';
import { renderWithProviders } from '@/utils/test-utils';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { navigate: jest.fn(), push: jest.fn() },
}));
jest.mock('@/features/dashboard/use-dashboard', () => ({
  useDashboard: jest.fn(),
  setHideBalances: jest.fn(),
}));
jest.mock('@/features/categories/use-categories', () => ({ useCategoryMap: () => new Map() }));
jest.mock('@/features/payoff/payoff-summary-card', () => ({ PayoffSummaryCard: () => null }));

const mockRouter = jest.requireMock<{ router: { navigate: jest.Mock; push: jest.Mock } }>(
  'expo-router',
).router;

const visa: Account = {
  id: 'visa',
  name: 'TD Visa',
  institution: 'TD',
  type: 'credit',
  network: 'visa',
  last4: '1234',
  currency: 'CAD',
  color: '#1565C0',
  creditLimitCents: 100000,
  openingBalanceCents: -40000,
  openingBalanceDate: '2026-10-01',
  statementDay: 15,
  dueDayOffset: 21,
  interestRateBps: null,
  isArchived: false,
  imagePath: null,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
};
const visaSummary = summarizeAccount(visa, { postedCents: 0, pendingCents: -2500 });

const coffee = {
  id: 'tx-1',
  accountId: 'visa',
  payee: 'Starfuel Coffee',
  amountCents: -540,
  date: '2026-10-30',
  status: 'posted',
  categoryId: null,
} as never;

const view = {
  recent: [coffee],
  timeline: buildTimeline(
    [
      {
        account: visa,
        owedCents: 40000,
        dueDate: '2026-11-02',
        statementEnd: '2026-10-12',
        daysUntil: 3,
        urgency: 'urgent' as const,
      },
    ],
    [
      {
        rule: { id: 'r', payee: 'Netflix', amountCents: -1699, accountId: 'visa' } as never,
        account: visa,
        date: '2026-11-03',
        daysUntil: 4,
      },
    ],
  ),
  totals: [
    {
      currency: 'CAD',
      owedCents: 40000,
      cashCents: 120000,
      pendingHoldsCents: 2500,
      availableCreditCents: 57500,
      creditLimitCents: 100000,
      utilization: 0.4,
      hasLiability: true,
      hasCash: true,
    },
  ],
  monthlyRecurring: new Map([['CAD', 1699]]),
  spending: [
    {
      currency: 'CAD',
      thisMonthCents: 15000,
      lastMonthToDateCents: 10000,
      lastMonthCents: 30000,
      change: 0.5,
    },
  ],
};

/** One card: the wallet has no "All cards" slide and everything follows that card. */
const data = {
  hasAccounts: true,
  cards: [{ account: visa, summary: visaSummary }],
  all: view,
  byCard: new Map([['visa', view]]),
};

const amex: Account = { ...visa, id: 'amex', name: 'Amex Gold', last4: '9876', color: '#B8860B' };
const twoCards = {
  ...data,
  cards: [...data.cards, { account: amex, summary: visaSummary }],
  all: { ...view, totals: [{ ...view.totals[0], owedCents: 80000 }] },
  byCard: new Map([
    ['visa', view],
    ['amex', view],
  ]),
};

beforeEach(() => jest.clearAllMocks());

describe('DashboardScreen', () => {
  it('guides the user to add a first card when there are no accounts', async () => {
    jest.mocked(useDashboard).mockReturnValue({ ...data, hasAccounts: false } as never);
    await renderWithProviders(<DashboardScreen />);
    await fireEvent.press(screen.getByText('Add your first card'));
    expect(mockRouter.push).toHaveBeenCalledWith('/account/new');
  });

  it('shows the wallet, totals, timeline and pace', async () => {
    jest.mocked(useDashboard).mockReturnValue(data as never);
    await renderWithProviders(<DashboardScreen />);
    // Wallet card, spoken in full.
    expect(
      screen.getByLabelText(
        /^TD Visa, ending in 1234, Owed \$400\.00, \$575\.00 available, 40% used/,
      ),
    ).toBeTruthy();
    // The balance card follows the (only) card.
    expect(screen.getByLabelText('Owed on TD Visa $400.00')).toBeTruthy();
    expect(screen.getAllByText('$575.00 available').length).toBeGreaterThan(0);
    // Credit used, spelled out as well as drawn.
    expect(
      screen.getByLabelText('Credit used 40%, Fair · above the 30% guideline, $575.00 available'),
    ).toBeTruthy();
    expect(screen.getByText('$25.00 in pending holds')).toBeTruthy();
    // Timeline.
    expect(screen.getByText('TD Visa payment due')).toBeTruthy();
    expect(screen.getByText('Due in 3 days')).toBeTruthy();
    expect(screen.getByText('Netflix')).toBeTruthy();
    expect(screen.getByText('≈ $16.99 a month in recurring charges')).toBeTruthy();
    // Pace.
    expect(screen.getByText('Up 50% vs. the same days last month ($100.00)')).toBeTruthy();
    expect(screen.getByText('Last month: $300.00')).toBeTruthy();
  });

  it('taps through to the account, held transactions and this month', async () => {
    jest.mocked(useDashboard).mockReturnValue(data as never);
    await renderWithProviders(<DashboardScreen />);

    await fireEvent.press(screen.getByLabelText(/^TD Visa, ending in 1234/));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/account/[id]',
      params: { id: 'visa' },
    });

    await fireEvent.press(screen.getByText('$25.00 in pending holds'));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith({
      pathname: '/activity',
      params: expect.objectContaining({ statuses: 'pending', accountIds: 'visa' }),
    });

    await fireEvent.press(screen.getByLabelText(/spending, \$150\.00/));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith({
      pathname: '/activity',
      params: expect.objectContaining({
        preset: 'thisMonth',
        types: 'purchase,refund,fee,interest',
        accountIds: 'visa',
      }),
    });
  });

  it('records a payment and shares the focused card with the tab bar', async () => {
    jest.mocked(useDashboard).mockReturnValue(data as never);
    await renderWithProviders(<DashboardScreen />);
    expect(getFocusedCard()).toBe('visa');

    // From the balance card's quick action (Coming up offers the same).
    await fireEvent.press(screen.getAllByLabelText('Record a payment to TD Visa')[0]);
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/transaction/new',
      params: { accountId: 'visa', type: 'payment', amountCents: '40000' },
    });
  });

  it('shares no card while "All cards" is centred', async () => {
    jest.mocked(useDashboard).mockReturnValue(twoCards as never);
    await renderWithProviders(<DashboardScreen />);
    expect(getFocusedCard()).toBeNull();
  });

  it('lists recent activity for the focused card', async () => {
    jest.mocked(useDashboard).mockReturnValue(data as never);
    await renderWithProviders(<DashboardScreen />);
    expect(screen.getByText('Recent activity')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/^Starfuel Coffee, -\$5\.40/));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/transaction/[id]',
      params: { id: 'tx-1' },
    });
    await fireEvent.press(screen.getByText('View all'));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith({
      pathname: '/activity',
      params: expect.objectContaining({ accountIds: 'visa' }),
    });
  });

  it('lights the bell when a payment is due soon', async () => {
    jest.mocked(useDashboard).mockReturnValue(data as never);
    await renderWithProviders(<DashboardScreen />);
    expect(screen.getByLabelText(/^A payment is due soon/)).toBeTruthy();
  });

  it('shows empty hints when nothing is coming up, spent or recorded', async () => {
    jest.mocked(useDashboard).mockReturnValue({
      ...data,
      byCard: new Map([
        [
          'visa',
          {
            timeline: [],
            spending: [],
            recent: [],
            monthlyRecurring: new Map(),
            totals: [{ ...view.totals[0], pendingHoldsCents: 0 }],
          },
        ],
      ]),
    } as never);
    await renderWithProviders(<DashboardScreen />);
    expect(screen.getByText(/Nothing due and no recurring charges/)).toBeTruthy();
    expect(screen.getByText('Nothing spent yet this month.')).toBeTruthy();
    expect(screen.getByText('No transactions yet.')).toBeTruthy();
    expect(screen.queryByText(/in pending holds/)).toBeNull();
  });

  it('starts with every card in the pocket, raises one on tap and puts it back', async () => {
    jest.mocked(useDashboard).mockReturnValue(twoCards as never);
    await renderWithProviders(<DashboardScreen />);
    expect(screen.getByLabelText('Total owed $800.00')).toBeTruthy();

    // Tapping a card in the stack raises it; everything below follows it.
    await fireEvent.press(screen.getByLabelText(/^Amex Gold, ending in 9876/));
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Owed on Amex Gold $400.00')).toBeTruthy();
    expect(
      screen.getByLabelText(/^Amex Gold, ending in 9876/).props.accessibilityState,
    ).toMatchObject({ selected: true });

    // Tapping the raised card opens it.
    await fireEvent.press(screen.getByLabelText(/^Amex Gold, ending in 9876/));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/account/[id]',
      params: { id: 'amex' },
    });

    await fireEvent.press(
      screen.getByRole('button', { name: 'Put the card back with the others' }),
    );
    expect(screen.getByLabelText('Total owed $800.00')).toBeTruthy();
  });

  it('hides every amount when asked, and remembers the choice', async () => {
    jest.mocked(useDashboard).mockReturnValue({ ...data, hideBalances: true } as never);
    await renderWithProviders(<DashboardScreen />);
    expect(screen.getByLabelText('Owed on TD Visa amount hidden')).toBeTruthy();
    expect(screen.queryByText('$400.00')).toBeNull();
    expect(screen.queryByText('-$5.40')).toBeNull();
    expect(screen.getByLabelText(/^Starfuel Coffee, amount hidden/)).toBeTruthy();

    const toggle = screen.getByRole('switch', { name: 'Hide the balance' });
    expect(toggle.props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(toggle);
    expect(setHideBalances).toHaveBeenCalledWith(false);
  });

  it('offers round quick actions for the raised card', async () => {
    jest.mocked(useDashboard).mockReturnValue(data as never);
    await renderWithProviders(<DashboardScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Pay' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/transaction/new',
      params: { type: 'payment', accountId: 'visa', amountCents: '40000' },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Transfer' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/transaction/new',
      params: { type: 'transfer', accountId: 'visa' },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Import' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/import/[accountId]',
      params: { accountId: 'visa' },
    });
  });
});
