import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { AccountForm } from '@/features/accounts/account-form';
import { defaultAccountFormValues } from '@/features/accounts/account-form-schema';
import { renderWithProviders } from '@/utils/test-utils';

// The native picker can't render in Jest; a stub keeps the rest of the form testable.
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native');
  const Picker = (props: object) => <View testID="date-picker" {...props} />;
  return { __esModule: true, default: Picker, DateTimePickerAndroid: { open: jest.fn() } };
});

const defaults = defaultAccountFormValues({ currency: 'CAD', today: '2026-10-29' });

async function renderForm(onSubmit = jest.fn()) {
  await renderWithProviders(
    <AccountForm defaultValues={defaults} submitLabel="Add account" onSubmit={onSubmit} />,
  );
  return onSubmit;
}

describe('AccountForm', () => {
  it('shows credit fields and the card-number notice for a credit card', async () => {
    await renderForm();
    expect(screen.getByLabelText('Amount owed')).toBeTruthy();
    expect(screen.getByLabelText('Credit limit')).toBeTruthy();
    expect(screen.getByLabelText('Statement closing day')).toBeTruthy();
    expect(screen.getByLabelText('Interest rate (APR %)')).toBeTruthy();
    expect(screen.getByText(/We never store your full card number/)).toBeTruthy();
  });

  it('hides credit fields for chequing and card fields for savings', async () => {
    await renderForm();
    await fireEvent.press(screen.getByText('Chequing'));
    expect(screen.getByLabelText('Balance')).toBeTruthy();
    expect(screen.queryByLabelText('Credit limit')).toBeNull();
    expect(screen.getByLabelText('Last 4 digits (optional)')).toBeTruthy();

    await fireEvent.press(screen.getByText('Savings'));
    expect(screen.queryByLabelText('Last 4 digits (optional)')).toBeNull();
    expect(screen.queryByText(/We never store your full card number/)).toBeNull();
  });

  it('blocks submit and shows translated errors', async () => {
    const onSubmit = await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Last 4 digits (optional)'), '12');
    await fireEvent.press(screen.getByText('Add account'));
    expect(await screen.findByText('Enter a name for this account.')).toBeTruthy();
    expect(screen.getByText('Enter exactly 4 digits, or leave blank.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the entered values', async () => {
    const onSubmit = await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Account name'), 'TD Aeroplan Visa');
    await fireEvent.press(screen.getByText('Visa'));
    await fireEvent.changeText(screen.getByLabelText('Last 4 digits (optional)'), '1234');
    await fireEvent.changeText(screen.getByLabelText('Amount owed'), '500');
    await fireEvent.changeText(screen.getByLabelText('Credit limit'), '5000');
    await fireEvent.press(screen.getByLabelText('Colour 3 of 10'));
    await fireEvent.press(screen.getByText('Add account'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: 'TD Aeroplan Visa',
      network: 'visa',
      last4: '1234',
      openingBalance: '500',
      creditLimit: '5000',
      color: '#2E7D32',
    });
  });
});
