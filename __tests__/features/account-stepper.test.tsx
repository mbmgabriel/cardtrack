import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  defaultAccountFormValues,
  type AccountFormValues,
} from '@/features/accounts/account-form-schema';
import { AccountStepper } from '@/features/accounts/account-stepper';
import { renderWithProviders } from '@/utils/test-utils';

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native');
  const Picker = (props: object) => <View testID="date-picker" {...props} />;
  return { __esModule: true, default: Picker, DateTimePickerAndroid: { open: jest.fn() } };
});

async function renderStepper(onSubmit = jest.fn((_values: AccountFormValues) => true)) {
  const onDone = jest.fn();
  await renderWithProviders(
    <AccountStepper
      defaultValues={defaultAccountFormValues({ currency: 'CAD', today: '2026-10-31' })}
      onSubmit={onSubmit}
      onDone={onDone}
    />,
  );
  return { onSubmit, onDone };
}

const next = () => fireEvent.press(screen.getByText('Next'));

describe('AccountStepper', () => {
  it('adds a credit card step by step, with the card drawn as it fills in', async () => {
    const { onSubmit, onDone } = await renderStepper();
    expect(screen.getByText('What kind of account?')).toBeTruthy();
    expect(screen.getByText('Step 1 of 7')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Credit card' }));

    expect(await screen.findByText('What do you call it?')).toBeTruthy();
    // A name is required.
    await next();
    expect(await screen.findByText('Enter a name for this account.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Account name'), 'TD Visa');
    await fireEvent.changeText(screen.getByLabelText('Bank or issuer'), 'TD');
    // The (decorative) preview card shows the name as it's typed.
    expect(screen.getByText('TD Visa', { includeHiddenElements: true })).toBeTruthy();
    await next();

    expect(await screen.findByText('Card details')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Visa' }));
    await fireEvent.changeText(screen.getByLabelText('Last 4 digits (optional)'), '12');
    await next();
    expect(await screen.findByText('Enter exactly 4 digits, or leave blank.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Last 4 digits (optional)'), '1234');
    await next();

    expect(await screen.findByText('Pick a colour')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Colour 4 of 10' }));
    await next();

    expect(await screen.findByText('How much do you owe on it?')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Amount owed'), '400');
    await next();

    expect(await screen.findByText('Limit and statement')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Credit limit'), '1000');
    await fireEvent.changeText(screen.getByLabelText('Statement closing day'), '15');
    await next();

    expect(await screen.findByText('Final touches')).toBeTruthy();
    expect(screen.getByText('$400.00')).toBeTruthy();
    expect(screen.getByText('Statement closes on day 15')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add account'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      type: 'credit',
      name: 'TD Visa',
      institution: 'TD',
      network: 'visa',
      last4: '1234',
      color: '#6A1B9A',
      openingBalance: '400',
      creditLimit: '1000',
      statementDay: '15',
    });
    expect(await screen.findByText('Account added')).toBeTruthy();
    await waitFor(() => expect(onDone).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('skips card and credit questions for cash, and jumps back from the review', async () => {
    await renderStepper();
    await fireEvent.press(screen.getByRole('radio', { name: 'Cash' }));
    expect(await screen.findByText('Step 2 of 5')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Account name'), 'Wallet');
    await next();
    expect(await screen.findByText('Pick a colour')).toBeTruthy();
    await next();
    expect(await screen.findByText("What's in it right now?")).toBeTruthy();
    await next();
    expect(await screen.findByText('Final touches')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Change Cash' }));
    expect(await screen.findByText('What kind of account?')).toBeTruthy();
  });
});
