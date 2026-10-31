import { fireEvent, screen } from '@testing-library/react-native';

import type { Account } from '@/db/schema';
import { summarizeAccount } from '@/domain/balances';
import { AccountTile } from '@/features/accounts/account-tile';
import { renderWithProviders } from '@/utils/test-utils';

const visa: Account = {
  id: 'v',
  name: 'TD Aeroplan Visa',
  institution: 'TD',
  type: 'credit',
  network: 'visa',
  last4: '1234',
  currency: 'CAD',
  color: '#1565C0',
  creditLimitCents: 500000,
  openingBalanceCents: -50000,
  openingBalanceDate: '2026-10-01',
  statementDay: 15,
  dueDayOffset: 21,
  interestRateBps: 1999,
  isArchived: false,
  imagePath: null,
  sortOrder: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const chequing: Account = {
  ...visa,
  id: 'c',
  name: 'Chequing',
  type: 'debit',
  network: null,
  last4: null,
  creditLimitCents: null,
  openingBalanceCents: 234567,
  statementDay: null,
  dueDayOffset: null,
  interestRateBps: null,
};

const zero = { postedCents: 0, pendingCents: 0 };

describe('AccountTile', () => {
  it('shows owed, masked last 4, available credit and utilization for a credit card', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <AccountTile
        account={visa}
        summary={summarizeAccount(visa, zero)}
        locale="en-CA"
        onPress={onPress}
      />,
    );
    expect(screen.getByText('Owed')).toBeTruthy();
    expect(screen.getByText('$500.00')).toBeTruthy();
    expect(screen.getByText('TD · Visa · •• 1234')).toBeTruthy();
    expect(screen.getByText('$4,500.00 available')).toBeTruthy();
    expect(screen.getByText('10% used')).toBeTruthy();

    const button = screen.getByRole('button');
    expect(button.props.accessibilityLabel).toBe(
      'TD Aeroplan Visa, TD, Visa, ending in 1234, Owed $500.00, $4,500.00 available, 10% used',
    );
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalled();
  });

  it('flags utilization over 30% in text, not only colour', async () => {
    const totals = { postedCents: -150000, pendingCents: 0 }; // owed $2,000 of $5,000
    await renderWithProviders(
      <AccountTile account={visa} summary={summarizeAccount(visa, totals)} locale="en-CA" />,
    );
    expect(screen.getByText(/40% used/)).toBeTruthy();
    expect(screen.getByRole('button').props.accessibilityLabel).toMatch(/High utilization$/);
  });

  it('shows a plain balance for chequing, with no credit details', async () => {
    await renderWithProviders(
      <AccountTile account={chequing} summary={summarizeAccount(chequing, zero)} locale="en-CA" />,
    );
    expect(screen.getByText('Balance')).toBeTruthy();
    expect(screen.getByText('$2,345.67')).toBeTruthy();
    expect(screen.queryByText(/available/)).toBeNull();
  });

  it('marks archived accounts', async () => {
    const archived = { ...chequing, isArchived: true };
    await renderWithProviders(
      <AccountTile account={archived} summary={summarizeAccount(archived, zero)} locale="en-CA" />,
    );
    expect(screen.getByText('Archived')).toBeTruthy();
  });

  it('formats for fr-CA', async () => {
    await renderWithProviders(
      <AccountTile account={chequing} summary={summarizeAccount(chequing, zero)} locale="fr-CA" />,
    );
    expect(screen.getByText(/2[\s  ]345,67[\s  ]\$/)).toBeTruthy();
  });

  it('shows labelled move buttons in reorder mode', async () => {
    const onMoveUp = jest.fn();
    await renderWithProviders(
      <AccountTile
        account={visa}
        summary={summarizeAccount(visa, zero)}
        locale="en-CA"
        reorder={{ onMoveUp, onMoveDown: jest.fn(), canMoveUp: true, canMoveDown: false }}
      />,
    );
    await fireEvent.press(screen.getByLabelText('Move TD Aeroplan Visa up'));
    expect(onMoveUp).toHaveBeenCalled();
    expect(screen.getByLabelText('Move TD Aeroplan Visa down')).toBeDisabled();
  });
});
