import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { Account } from '@/db/schema';
import {
  defaultRecurringFormValues,
  type RecurringFormValues,
} from '@/features/recurring/recurring-form-schema';
import { RecurringStepper } from '@/features/recurring/recurring-stepper';
import { renderWithProviders } from '@/utils/test-utils';

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native');
  const Picker = (props: object) => <View testID="date-picker" {...props} />;
  return { __esModule: true, default: Picker, DateTimePickerAndroid: { open: jest.fn() } };
});

const account = (id: string, name: string, last4: string | null) =>
  ({
    id,
    name,
    type: 'credit',
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

const accounts = [account('visa', 'Visa', '1234'), account('amex', 'Amex', '9876')];

describe('RecurringStepper', () => {
  it('adds a subscription one question at a time', async () => {
    const onSubmit = jest.fn((_values: RecurringFormValues) => true);
    const onDone = jest.fn();
    await renderWithProviders(
      <RecurringStepper
        defaultValues={defaultRecurringFormValues({ accountId: 'visa', today: '2026-10-31' })}
        accounts={accounts}
        categories={[]}
        onSubmit={onSubmit}
        onDone={onDone}
      />,
    );
    expect(screen.getByText('How much is it?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Next'));
    expect(await screen.findByText(/Enter an amount greater than zero/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Amount'), '16.99');
    await fireEvent.press(screen.getByText('Next'));

    expect(await screen.findByText('Who is it?')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Payee'), 'Netflix');
    await fireEvent.press(screen.getByText('Next'));

    // Picking the card moves on by itself.
    expect(await screen.findByText('Which card or account?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Amex, ending in 9876' }));
    expect(await screen.findByText('How often?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Monthly' }));
    await fireEvent.press(screen.getByText('Next'));

    expect(await screen.findByText('Final touches')).toBeTruthy();
    expect(screen.getByText('−$16.99')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: '3 days before' }));
    await fireEvent.press(screen.getByText('Save recurring payment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      amount: '16.99',
      direction: 'out',
      payee: 'Netflix',
      accountId: 'amex',
      frequency: 'monthly',
      remindDaysBefore: '3',
    });
    await waitFor(() => expect(onDone).toHaveBeenCalled(), { timeout: 2000 });
  });
});
