import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { Account } from '@/db/schema';
import { RecurringForm } from '@/features/recurring/recurring-form';
import { defaultRecurringFormValues } from '@/features/recurring/recurring-form-schema';
import { renderWithProviders } from '@/utils/test-utils';

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native');
  const Picker = (props: object) => <View testID="date-picker" {...props} />;
  return { __esModule: true, default: Picker, DateTimePickerAndroid: { open: jest.fn() } };
});

const visa = {
  id: 'visa',
  name: 'Visa',
  type: 'credit',
  currency: 'CAD',
} as Account;

async function renderForm(mode: 'new' | 'edit' = 'new') {
  const onSubmit = jest.fn();
  await renderWithProviders(
    <RecurringForm
      mode={mode}
      defaultValues={defaultRecurringFormValues({ accountId: 'visa', today: '2026-10-30' })}
      accounts={[visa]}
      categories={[]}
      submitLabel="Save"
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

describe('RecurringForm', () => {
  it('saves a monthly charge and previews the next date', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 30), advanceTimers: true });
    const onSubmit = await renderForm();
    expect(screen.getByText('Next: Oct 30, 2026')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Payee'), 'Netflix');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '16.99');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      payee: 'Netflix',
      amount: '16.99',
      frequency: 'monthly',
      autoCreate: true,
    });
    jest.useRealTimers();
  });

  it('shows the end date only when the switch is on, and Active only when editing', async () => {
    await renderForm();
    expect(screen.queryByText('End date')).toBeNull();
    expect(screen.queryByLabelText(/^Active/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Ends on a date'));
    expect(screen.getByText('End date')).toBeTruthy();
  });

  it('shows validation errors', async () => {
    const onSubmit = await renderForm('edit');
    expect(screen.getByLabelText(/^Active/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Enter who charges you or pays you.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
