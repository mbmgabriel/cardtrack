import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { Account, Category } from '@/db/schema';
import { TransactionForm } from '@/features/transactions/transaction-form';
import { defaultTransactionFormValues } from '@/features/transactions/transaction-form-schema';
import { renderWithProviders } from '@/utils/test-utils';

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native');
  const Picker = (props: object) => <View testID="date-picker" {...props} />;
  return { __esModule: true, default: Picker, DateTimePickerAndroid: { open: jest.fn() } };
});

// The form reads payee history through the repositories; stub them instead of opening SQLite.
jest.mock('@/db', () => ({
  repos: {
    transactions: {
      payeeSuggestions: (text: string) =>
        'costco'.startsWith(text.toLowerCase()) ? [{ payee: 'Costco', uses: 3 }] : [],
      payeeMemory: (payee: string) =>
        payee === 'Costco'
          ? { accountId: 'chq', type: 'purchase', categoryId: 'sys-groceries' }
          : undefined,
    },
  },
}));

const account = (id: string, name: string, type: Account['type']): Account => ({
  id,
  name,
  type,
  institution: '',
  network: null,
  last4: null,
  currency: 'CAD',
  color: '#1565C0',
  creditLimitCents: null,
  openingBalanceCents: 0,
  openingBalanceDate: '2026-10-01',
  statementDay: null,
  dueDayOffset: null,
  interestRateBps: null,
  isArchived: false,
  imagePath: null,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
});

const accounts = [account('visa', 'Visa', 'credit'), account('chq', 'Chequing', 'debit')];
const categories: Category[] = [
  {
    id: 'sys-groceries',
    name: 'Groceries',
    icon: 'cart-outline',
    color: '#2E7D32',
    parentId: null,
    isSystem: true,
    sortOrder: 0,
  },
];

async function renderForm(props: Partial<Parameters<typeof TransactionForm>[0]> = {}) {
  const onSubmit = jest.fn();
  await renderWithProviders(
    <TransactionForm
      mode="new"
      defaultValues={defaultTransactionFormValues({ accountId: 'visa', today: '2026-10-20' })}
      accounts={accounts}
      categories={categories}
      submitLabel="Save"
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return onSubmit;
}

describe('TransactionForm', () => {
  it('saves a purchase with amount and payee', async () => {
    const onSubmit = await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Amount'), '12.50');
    await fireEvent.changeText(screen.getByLabelText('Payee'), 'Tim Hortons');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      amount: '12.50',
      payee: 'Tim Hortons',
      accountId: 'visa',
      type: 'purchase',
      status: 'posted',
    });
  });

  it('shows errors and does not save without amount and payee', async () => {
    const onSubmit = await renderForm();
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText(/Enter an amount greater than zero/)).toBeTruthy();
    expect(screen.getByText('Enter who you paid or who paid you.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('a previous payee fills its category, and the account when allowed', async () => {
    const onSubmit = await renderForm({ rememberAccount: true });
    await fireEvent.changeText(screen.getByLabelText('Amount'), '80');
    await fireEvent.changeText(screen.getByLabelText('Payee'), 'cos');
    await fireEvent.press(screen.getByText('Costco'));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      payee: 'Costco',
      categoryId: 'sys-groceries',
      accountId: 'chq',
    });
  });

  it('a payment offers the other account and a direction once linked', async () => {
    await renderForm();
    expect(screen.queryByText('Your other account (optional)')).toBeNull();
    await fireEvent.press(screen.getByText('Payment'));
    expect(screen.getByText('Your other account (optional)')).toBeTruthy();
    expect(screen.queryByText('Direction')).toBeNull();
    await fireEvent.press(screen.getAllByText('Chequing')[1]);
    expect(screen.getByText('From Chequing')).toBeTruthy();
    expect(screen.getByLabelText('Payee (optional)')).toBeTruthy();
  });

  it('editing a linked transfer hides account and type', async () => {
    await renderForm({ mode: 'edit', linkedAccountName: 'Chequing' });
    expect(screen.getByText(/linked with Chequing/)).toBeTruthy();
    expect(screen.queryByText('Type')).toBeNull();
    expect(screen.getByText('Void')).toBeTruthy();
  });

  it('picks the account from the card row and shows which way the money goes', async () => {
    const onSubmit = await renderForm();
    expect(screen.getByRole('radio', { name: 'Visa' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByText('Money out')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Refund' }));
    expect(screen.getByText('Money in')).toBeTruthy();

    await fireEvent.press(screen.getByRole('radio', { name: 'Chequing' }));
    await fireEvent.changeText(screen.getByLabelText('Amount'), '20');
    await fireEvent.changeText(screen.getByLabelText('Payee'), 'Shop');
    await fireEvent.press(screen.getByRole('radio', { name: 'Groceries' }));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      accountId: 'chq',
      type: 'refund',
      categoryId: 'sys-groceries',
    });
  });

  it('keeps notes tucked away until asked for, but shows existing ones', async () => {
    await renderForm();
    expect(screen.queryByLabelText('Notes (optional)')).toBeNull();
    await fireEvent.press(screen.getByText('Add a note'));
    expect(screen.getByLabelText('Notes (optional)')).toBeTruthy();
  });

  it('opens with notes showing when editing a transaction that has them', async () => {
    await renderForm({
      mode: 'edit',
      defaultValues: {
        ...defaultTransactionFormValues({ accountId: 'visa', today: '2026-10-20' }),
        notes: 'Split with Sam',
      },
    });
    expect(screen.getByDisplayValue('Split with Sam')).toBeTruthy();
    expect(screen.queryByText('Add a note')).toBeNull();
  });
});
