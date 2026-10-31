import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { Account, Category } from '@/db/schema';
import {
  defaultTransactionFormValues,
  type TransactionFormValues,
} from '@/features/transactions/transaction-form-schema';
import { TransactionStepper } from '@/features/transactions/transaction-stepper';
import { renderWithProviders } from '@/utils/test-utils';

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native');
  const Picker = (props: object) => <View testID="date-picker" {...props} />;
  return { __esModule: true, default: Picker, DateTimePickerAndroid: { open: jest.fn() } };
});

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

const account = (id: string, name: string, type: Account['type'], last4: string | null) =>
  ({
    id,
    name,
    type,
    last4,
    institution: '',
    network: null,
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
  }) satisfies Account;

const accounts = [
  account('visa', 'Visa', 'credit', '1234'),
  account('chq', 'Chequing', 'debit', null),
];
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

async function renderStepper(props: Partial<Parameters<typeof TransactionStepper>[0]> = {}) {
  const onSubmit = jest.fn((_values: TransactionFormValues) => true);
  const onDone = jest.fn();
  await renderWithProviders(
    <TransactionStepper
      defaultValues={defaultTransactionFormValues({ accountId: 'visa', today: '2026-10-20' })}
      accounts={accounts}
      categories={categories}
      onSubmit={onSubmit}
      onDone={onDone}
      {...props}
    />,
  );
  return { onSubmit, onDone };
}

const next = () => fireEvent.press(screen.getByText('Next'));

describe('TransactionStepper', () => {
  it('walks through one question at a time and saves', async () => {
    const { onSubmit, onDone } = await renderStepper();
    expect(screen.getByText('How much?')).toBeTruthy();
    expect(screen.getByText('Step 1 of 5')).toBeTruthy();

    // An amount is required before moving on.
    await next();
    expect(await screen.findByText(/Enter an amount greater than zero/)).toBeTruthy();
    expect(screen.getByText('How much?')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Amount'), '12.50');
    await next();
    expect(await screen.findByText('What kind of transaction?')).toBeTruthy();

    // Picking a type moves on by itself; so does picking the card for a plain purchase.
    await fireEvent.press(screen.getByRole('radio', { name: 'Purchase' }));
    expect(await screen.findByText('Which card or account?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Chequing' }));
    expect(await screen.findByText('Who was it with?')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Payee'), 'Tim Hortons');
    await next();
    expect(await screen.findByText('Final touches')).toBeTruthy();
    expect(screen.getByText('−$12.50')).toBeTruthy();
    expect(screen.getByText('Tim Hortons')).toBeTruthy();

    await fireEvent.press(screen.getByText('Save transaction'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      amount: '12.50',
      type: 'purchase',
      accountId: 'chq',
      payee: 'Tim Hortons',
    });
    expect(await screen.findByText('Saved')).toBeTruthy();
    await waitFor(() => expect(onDone).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('a payment asks for the other account and makes the payee optional', async () => {
    const { onSubmit } = await renderStepper({
      defaultValues: {
        ...defaultTransactionFormValues({ accountId: 'visa', today: '2026-10-20' }),
        amount: '500',
      },
    });
    await next();
    await fireEvent.press(await screen.findByRole('radio', { name: 'Payment' }));
    expect(await screen.findByText('Your other account (optional)')).toBeTruthy();
    // Choosing the card doesn't skip ahead: there's more to answer here.
    await fireEvent.press(screen.getByRole('radio', { name: 'Visa, ending in 1234' }));
    // Chequing appears as the account and as the other account; pick the other one.
    await fireEvent.press(screen.getAllByRole('radio', { name: 'Chequing' })[1]);
    expect(screen.getByText('From Chequing')).toBeTruthy();
    await next();
    expect(await screen.findByText('Add a description?')).toBeTruthy();
    await next();
    await fireEvent.press(await screen.findByText('Save transaction'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      type: 'payment',
      accountId: 'visa',
      otherAccountId: 'chq',
      payee: '',
    });
  });

  it('a recent payee fills its category and moves on; the review jumps back to a step', async () => {
    await renderStepper({
      defaultValues: {
        ...defaultTransactionFormValues({ accountId: 'visa', today: '2026-10-20' }),
        amount: '80',
      },
      initialStep: 'payee',
    });
    expect(screen.getByText('Recent')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Costco' }));
    expect(await screen.findByText('Final touches')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Groceries' }).props.accessibilityState).toMatchObject(
      { selected: true },
    );
    // The payee memory doesn't override the card already chosen.
    expect(screen.getByRole('button', { name: 'Change Visa' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Change Purchase' }));
    expect(await screen.findByText('What kind of transaction?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Back'));
    expect(await screen.findByText('How much?')).toBeTruthy();
  });

  it('stays on the review if saving fails', async () => {
    const { onDone } = await renderStepper({
      onSubmit: jest.fn(() => false),
      defaultValues: {
        ...defaultTransactionFormValues({ accountId: 'visa', today: '2026-10-20' }),
        amount: '5',
        payee: 'Cafe',
      },
      initialStep: 'details',
    });
    await fireEvent.press(screen.getByText('Save transaction'));
    await waitFor(() => expect(screen.getByText('Final touches')).toBeTruthy());
    expect(screen.queryByText('Saved')).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });
});
