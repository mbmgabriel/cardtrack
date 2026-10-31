import { fireEvent, screen } from '@testing-library/react-native';

import { ListRow, PageHeader, Panel, Pill } from '@/components/page-kit';
import { renderWithProviders } from '@/utils/test-utils';

describe('page kit', () => {
  it('a page header names the page and offers labelled round buttons', async () => {
    const onAdd = jest.fn();
    await renderWithProviders(
      <PageHeader
        title="Accounts"
        subtitle="3 accounts"
        actions={[
          { icon: 'archive-outline', label: 'Show archived', selected: true, onPress: jest.fn() },
          { icon: 'plus', label: 'Add account', primary: true, onPress: onAdd },
        ]}
      />,
    );
    expect(screen.getByRole('header', { name: 'Accounts' })).toBeTruthy();
    expect(screen.getByText('3 accounts')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Show archived' }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Add account' }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('a toggle row is a switch the whole row flips', async () => {
    const onToggle = jest.fn();
    await renderWithProviders(
      <Panel title="Reminders" padded={false}>
        <ListRow
          icon="bell-outline"
          title="Reminders"
          description="Before due dates"
          toggle={{ value: false, onToggle }}
        />
      </Panel>,
    );
    const row = screen.getByRole('switch', { name: 'Reminders, Before due dates' });
    expect(row.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(row);
    expect(onToggle).toHaveBeenCalled();
  });

  it('a fact row reads its value, and a pill reports whether it is on', async () => {
    await renderWithProviders(
      <>
        <ListRow title="Credit limit" value="$1,000.00" />
        <Pill label="Pending" selected onPress={jest.fn()} />
      </>,
    );
    expect(screen.getByLabelText('Credit limit, $1,000.00')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pending' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
  });
});
