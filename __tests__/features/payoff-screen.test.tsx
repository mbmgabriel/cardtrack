import { fireEvent, screen } from '@testing-library/react-native';

import PayoffScreen from '@/app/payoff';
import { renderWithProviders } from '@/utils/test-utils';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('@/domain/dates', () => ({
  ...jest.requireActual('@/domain/dates'),
  todayISO: () => '2026-10-31',
}));
jest.mock('@/features/pro/use-pro', () => ({ usePro: jest.fn() }));
jest.mock('@/features/payoff/use-payoff', () => ({
  usePayoff: jest.fn(),
  setPayoffExtra: jest.fn(),
  setPayoffMinimum: jest.fn(),
  setPayoffStrategy: jest.fn(),
  startTracking: jest.fn(),
  stopTracking: jest.fn(),
}));

const { usePro } = jest.requireMock<{ usePro: jest.Mock }>('@/features/pro/use-pro');
const payoff = jest.requireMock<{
  usePayoff: jest.Mock;
  setPayoffExtra: jest.Mock;
  setPayoffStrategy: jest.Mock;
  setPayoffMinimum: jest.Mock;
  startTracking: jest.Mock;
  stopTracking: jest.Mock;
}>('@/features/payoff/use-payoff');

const account = (id: string, name: string) => ({
  id,
  name,
  currency: 'CAD',
  color: '#1565C0',
  imagePath: null,
  last4: null,
});
const debts = [
  {
    id: 'visa',
    name: 'TD Visa',
    balanceCents: 300000,
    aprBps: 1999,
    minimumCents: 9000,
    estimated: true,
    account: account('visa', 'TD Visa'),
  },
  {
    id: 'car',
    name: 'Car loan',
    balanceCents: 1200000,
    aprBps: 699,
    minimumCents: 35000,
    estimated: false,
    account: account('car', 'Car loan'),
  },
];

describe('PayoffScreen', () => {
  it('is a Pro feature', async () => {
    usePro.mockReturnValue(false);
    payoff.usePayoff.mockReturnValue({
      owedNow: {},
      baselines: {},
      debts,
      strategy: 'avalanche',
      extraCents: 0,
    });
    await renderWithProviders(<PayoffScreen />);
    expect(screen.getByText('Plan your way out of debt')).toBeTruthy();
    expect(screen.queryByText('Your plan')).toBeNull();
  });

  it('answers when, next to minimums only, with the plan step by step', async () => {
    usePro.mockReturnValue(true);
    payoff.usePayoff.mockReturnValue({
      owedNow: {},
      baselines: {},
      debts,
      strategy: 'avalanche',
      extraCents: 10000,
    });
    await renderWithProviders(<PayoffScreen />);
    expect(screen.getByLabelText(/^Your plan, \w{3} \d{4}, \$[\d,.]+ interest$/)).toBeTruthy();
    expect(screen.getByLabelText(/^Minimums only, \w{3} \d{4}/)).toBeTruthy();
    expect(screen.getByText(/^Paying this much saves \$[\d,.]+ in interest/)).toBeTruthy();

    // One number to set: minimums ($90 + $350) plus $100 extra.
    expect(screen.getByLabelText('$540.00 a month')).toBeTruthy();
    expect(screen.getByText('$440.00 in minimum payments + $100.00 extra')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Pay $25.00 more a month' }));
    expect(payoff.setPayoffExtra).toHaveBeenLastCalledWith(12500);
    await fireEvent.press(screen.getByRole('button', { name: 'Pay $25.00 less a month' }));
    expect(payoff.setPayoffExtra).toHaveBeenLastCalledWith(7500);

    // Steps: the Visa (19.99%) goes first, and its payment then moves to the car loan.
    const steps = screen.getAllByRole('button', { name: /^\d\. / });
    expect(steps[0].props.accessibilityLabel).toMatch(/^1\. TD Visa, paid off/);
    expect(steps[1].props.accessibilityLabel).toMatch(/^2\. Car loan, paid off/);
    expect(
      screen.getByText('Its payment moves to Car loan: $540.00 a month now goes there.'),
    ).toBeTruthy();
    expect(screen.getByText('Debt-free!')).toBeTruthy();
    expect(screen.getByText(/1 minimum payment is our estimate/)).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Smallest balance first' }));
    expect(payoff.setPayoffStrategy).toHaveBeenCalledWith('snowball');
  });

  it('lets the user type the monthly amount, but not below the minimums', async () => {
    usePro.mockReturnValue(true);
    payoff.usePayoff.mockReturnValue({
      owedNow: {},
      baselines: {},
      debts,
      strategy: 'avalanche',
      extraCents: 0,
    });
    await renderWithProviders(<PayoffScreen />);
    await fireEvent.press(screen.getByRole('button', { name: '$440.00 a month' }));
    const field = screen.getAllByLabelText('a month').at(-1)!;
    await fireEvent.changeText(field, '300');
    expect(screen.getByText("That's less than your minimum payments ($440.00).")).toBeTruthy();
    await fireEvent.changeText(field, '600');
    await fireEvent.press(screen.getByText('Save'));
    expect(payoff.setPayoffExtra).toHaveBeenLastCalledWith(16000);
  });

  it("lets the user enter a debt's real minimum", async () => {
    usePro.mockReturnValue(true);
    payoff.usePayoff.mockReturnValue({
      owedNow: {},
      baselines: {},
      debts,
      strategy: 'avalanche',
      extraCents: 0,
    });
    await renderWithProviders(<PayoffScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /^\d\. TD Visa/ }));
    await fireEvent.changeText(screen.getByLabelText('Monthly minimum'), '120');
    await fireEvent.press(screen.getByText('Save'));
    expect(payoff.setPayoffMinimum).toHaveBeenCalledWith('visa', 12000);
  });

  it('says so when minimums never catch up with the interest', async () => {
    usePro.mockReturnValue(true);
    payoff.usePayoff.mockReturnValue({
      owedNow: {},
      baselines: {},
      debts: [{ ...debts[0], balanceCents: 1000000, aprBps: 2400, minimumCents: 10000 }],
      strategy: 'avalanche',
      extraCents: 0,
    });
    await renderWithProviders(<PayoffScreen />);
    expect(screen.getByText(/won't get out of debt/)).toBeTruthy();
    expect(screen.getByText("The minimum doesn't cover this debt's interest.")).toBeTruthy();
  });

  it('starts tracking the plan from today', async () => {
    usePro.mockReturnValue(true);
    payoff.usePayoff.mockReturnValue({
      owedNow: {},
      baselines: {},
      debts,
      strategy: 'avalanche',
      extraCents: 10000,
    });
    await renderWithProviders(<PayoffScreen />);
    await fireEvent.press(screen.getByText('Track my progress'));
    expect(payoff.startTracking).toHaveBeenCalledWith(
      'CAD',
      expect.objectContaining({
        startedOn: '2026-10-31',
        monthlyCents: 54000,
        debtIds: ['visa', 'car'],
        balances: expect.arrayContaining([1500000]),
      }),
    );
  });

  it.each([
    [1300000, /^On track$/],
    [1400000, /^Behind by \$1,0\d\d\.\d\d$/],
    [1200000, /^Ahead by \$9\d\d\.\d\d$/],
  ])('compares what is owed now (%s) with the tracked plan', async (owed, headline) => {
    usePro.mockReturnValue(true);
    payoff.usePayoff.mockReturnValue({
      // Started a month and a day ago: the plan expected a little under $13,000 by today.
      owedNow: { visa: owed - 1000000, car: 1000000 },
      baselines: {
        CAD: {
          startedOn: '2026-09-30',
          monthlyCents: 54000,
          debtIds: ['visa', 'car'],
          balances: [1500000, 1300000, 1100000],
        },
      },
      debts,
      strategy: 'avalanche',
      extraCents: 10000,
    });
    await renderWithProviders(<PayoffScreen />);
    expect(screen.getByText(headline)).toBeTruthy();
    expect(screen.queryByText('Track my progress')).toBeNull();
    await fireEvent.press(screen.getByText('Stop tracking'));
    expect(payoff.stopTracking).toHaveBeenCalledWith('CAD');
  });
});
