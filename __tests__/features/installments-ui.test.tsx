import { fireEvent, screen } from '@testing-library/react-native';

import { ComingUp } from '@/features/dashboard/coming-up';
import { buildTimeline } from '@/features/dashboard/dashboard-data';
import { InstallmentsTab } from '@/features/installments/installments-tab';
import { PayoffSummaryCard } from '@/features/payoff/payoff-summary-card';
import { renderWithProviders } from '@/utils/test-utils';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn() },
}));
jest.mock('@/domain/dates', () => ({
  ...jest.requireActual('@/domain/dates'),
  todayISO: () => '2026-10-31',
}));
jest.mock('@/db', () => ({ repos: { installments: { listByAccount: jest.fn() } } }));
jest.mock('@/db/live', () => ({ useLiveData: (read: () => unknown) => read() }));
jest.mock('@/features/pro/use-pro', () => ({ usePro: jest.fn() }));
jest.mock('@/features/payoff/use-payoff', () => ({ usePayoff: jest.fn() }));

const mockRouter = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router').router;
const repos = jest.requireMock<{ repos: { installments: { listByAccount: jest.Mock } } }>(
  '@/db',
).repos;
const { usePro } = jest.requireMock<{ usePro: jest.Mock }>('@/features/pro/use-pro');
const { usePayoff } = jest.requireMock<{ usePayoff: jest.Mock }>('@/features/payoff/use-payoff');

const plan = (overrides: object) => ({
  id: 'p',
  accountId: 'visa',
  description: 'Laptop',
  principalCents: 120000,
  months: 12,
  monthlyCents: 10000,
  monthlyFeeCents: 0,
  firstPaymentDate: '2026-07-15',
  notes: null,
  createdAt: '',
  updatedAt: '2026-07-01',
  ...overrides,
});
const visa = { id: 'visa', name: 'TD Visa', color: '#1565C0', currency: 'CAD' } as never;

beforeEach(() => jest.clearAllMocks());

describe('Installments tab', () => {
  it('shows running plans with how far along they are, then finished ones', async () => {
    repos.installments.listByAccount.mockReturnValue([
      plan({}),
      plan({ id: 'old', description: 'Phone', months: 3, firstPaymentDate: '2025-01-10' }),
    ]);
    await renderWithProviders(<InstallmentsTab accountId="visa" currency="CAD" />);
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getByText('$100.00 a month')).toBeTruthy();
    expect(
      screen.getByLabelText('Laptop, 4 of 12 paid · $800.00 left · ends Jun 2027'),
    ).toBeTruthy();
    expect(screen.getByText('Finished')).toBeTruthy();
    expect(screen.getByLabelText('Phone, Paid off Mar 2025')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText(/^Laptop/));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/installment/[id]',
      params: { id: 'p' },
    });
  });

  it('explains instalment plans when there are none', async () => {
    repos.installments.listByAccount.mockReturnValue([]);
    await renderWithProviders(<InstallmentsTab accountId="visa" currency="CAD" />);
    expect(screen.getByText('No installment plans')).toBeTruthy();
  });
});

describe('Coming up', () => {
  it('lists the next instalment with its number', async () => {
    const days = buildTimeline([], [], [
      {
        plan: plan({}),
        account: visa,
        date: '2026-11-15',
        number: 5,
        amountCents: 10000,
        daysUntil: 15,
      },
    ] as never);
    await renderWithProviders(
      <ComingUp
        days={days}
        today="2026-10-31"
        locale="en-CA"
        onOpenAccount={jest.fn()}
        onRecordPayment={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Laptop installment, 5 of 12 · TD Visa, $100.00')).toBeTruthy();
  });
});

describe('PayoffSummaryCard', () => {
  const debts = [
    {
      id: 'visa',
      name: 'TD Visa',
      balanceCents: 300000,
      aprBps: 1999,
      minimumCents: 20000,
      estimated: true,
      account: visa,
    },
  ];

  it('is hidden when nothing is owed', async () => {
    usePro.mockReturnValue(true);
    usePayoff.mockReturnValue({
      debts: [],
      owedNow: {},
      baselines: {},
      strategy: 'avalanche',
      extraCents: 0,
    });
    await renderWithProviders(<PayoffSummaryCard />);
    expect(screen.queryByText('Debt-free plan')).toBeNull();
  });

  it('teases Pro for free users', async () => {
    usePro.mockReturnValue(false);
    usePayoff.mockReturnValue({
      debts,
      owedNow: {},
      baselines: {},
      strategy: 'avalanche',
      extraCents: 0,
    });
    await renderWithProviders(<PayoffSummaryCard />);
    await fireEvent.press(screen.getByRole('button', { name: /^Debt-free plan/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/pro');
  });

  it('shows the debt-free date, or progress when a plan is tracked', async () => {
    usePro.mockReturnValue(true);
    usePayoff.mockReturnValue({
      debts,
      owedNow: { visa: 300000 },
      baselines: {},
      strategy: 'avalanche',
      extraCents: 0,
    });
    await renderWithProviders(<PayoffSummaryCard />);
    expect(screen.getByText(/^\$3,000\.00 owed · debt-free by \w{3} \d{4}$/)).toBeTruthy();

    usePayoff.mockReturnValue({
      debts,
      owedNow: { visa: 300000 },
      baselines: {
        CAD: {
          startedOn: '2026-10-31',
          monthlyCents: 20000,
          debtIds: ['visa'],
          balances: [300000, 290000],
        },
      },
      strategy: 'avalanche',
      extraCents: 0,
    });
    await renderWithProviders(<PayoffSummaryCard />);
    expect(screen.getByText('On track')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^On track/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/payoff');
  });
});
