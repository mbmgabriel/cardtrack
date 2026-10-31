import { fireEvent, screen } from '@testing-library/react-native';

import { DockTabBar } from '@/features/navigation/dock-tab-bar';
import { renderWithProviders } from '@/utils/test-utils';

const routes = [
  { key: 'home-1', name: 'index' },
  { key: 'activity-1', name: 'activity' },
];
const tabs = {
  index: { label: 'Home', activeIcon: 'view-dashboard' },
  activity: { label: 'Activity', activeIcon: 'receipt-text' },
} as const;

function renderDock(emitted: { defaultPrevented: boolean } = { defaultPrevented: false }) {
  const emitter = { emit: jest.fn(() => emitted) };
  const navigateToTab = jest.fn();
  const onAdd = jest.fn();
  return renderWithProviders(
    <DockTabBar
      state={{ index: 0, routes }}
      descriptors={{}}
      emitter={emitter as never}
      navigateToTab={navigateToTab}
      insets={{ top: 0, right: 0, bottom: 20, left: 0 }}
      tabs={tabs}
      addLabel="Add transaction"
      onAdd={onAdd}
    />,
  ).then(() => ({ emitter, navigateToTab, onAdd }));
}

describe('DockTabBar', () => {
  it('marks the current tab and switches tabs', async () => {
    const { emitter, navigateToTab } = await renderDock();
    expect(screen.getByRole('tab', { name: 'Home' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    await fireEvent.press(screen.getByRole('tab', { name: 'Activity' }));
    expect(emitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabPress', target: 'activity-1' }),
    );
    expect(navigateToTab).toHaveBeenCalledWith('activity-1');
  });

  it('stays put on the current tab or when a screen prevents the switch', async () => {
    const { navigateToTab } = await renderDock({ defaultPrevented: true });
    await fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
    await fireEvent.press(screen.getByRole('tab', { name: 'Activity' }));
    expect(navigateToTab).not.toHaveBeenCalled();
  });

  it('has a labelled add button', async () => {
    const { onAdd } = await renderDock();
    await fireEvent.press(screen.getByRole('button', { name: 'Add transaction' }));
    expect(onAdd).toHaveBeenCalled();
  });
});
