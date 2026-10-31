import { fireEvent, screen } from '@testing-library/react-native';

import { MonthColumns } from '@/components/month-columns';
import { RankedBars } from '@/components/ranked-bars';
import { renderWithProviders } from '@/utils/test-utils';

const format = (cents: number) => `$${(cents / 100).toFixed(2)}`;

describe('RankedBars', () => {
  it('prints and speaks the name, amount and share of each row', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <RankedBars
        locale="en-CA"
        rows={[
          { key: 'g', label: 'Groceries', value: '$70.00', share: 0.875, ratio: 1, onPress },
          {
            key: 'd',
            label: 'Dining',
            value: '$10.00',
            share: 0.125,
            ratio: 0.14,
            detail: '2 transactions',
          },
        ]}
      />,
    );
    expect(screen.getByText('88%')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Groceries, $70.00, 88%'));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByLabelText('Dining, $10.00, 13%, 2 transactions')).toBeTruthy();
  });
});

describe('MonthColumns', () => {
  const months = [
    { month: '2026-09', cents: 200 },
    { month: '2026-10', cents: 7800 },
  ];

  it('shows the latest month, and another when tapped', async () => {
    await renderWithProviders(<MonthColumns months={months} format={format} locale="en-CA" />);
    expect(screen.getByText('$78.00')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('September 2026, $2.00'));
    expect(screen.getByText('September 2026')).toBeTruthy();
    expect(screen.getByText('$2.00')).toBeTruthy();
  });

  it('has a table view with every month', async () => {
    await renderWithProviders(<MonthColumns months={months} format={format} locale="en-CA" />);
    await fireEvent.press(screen.getByText('Table'));
    expect(screen.getAllByText('October 2026')).toHaveLength(2);
    expect(screen.getAllByText('$78.00')).toHaveLength(2);
    expect(screen.getByText('$2.00')).toBeTruthy();
  });
});
