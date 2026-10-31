import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'react-native-paper';

import { useAccountMap } from '@/features/transactions/use-transactions';
import { useFocusedCard } from '@/features/dashboard/focused-card';
import { DockTabBar, type DockTab } from '@/features/navigation/dock-tab-bar';

const TABS = [
  { name: 'index', key: 'home', activeIcon: 'view-dashboard' },
  {
    name: 'accounts/index',
    key: 'accounts',
    activeIcon: 'credit-card-multiple',
  },
  { name: 'activity', key: 'activity', activeIcon: 'receipt-text' },
  { name: 'reports', key: 'reports', activeIcon: 'chart-box' },
  { name: 'settings', key: 'settings', activeIcon: 'cog' },
] as const;

export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const focusedCardId = useFocusedCard();
  const accounts = useAccountMap();
  const dockTabs: Record<string, DockTab> = Object.fromEntries(
    TABS.map(({ name, key, activeIcon }) => [name, { label: t(`tabs.${key}`), activeIcon }]),
  );

  return (
    <Tabs
      tabBar={(props) => {
        // On Home, the add button adds to the card centred in the wallet.
        const onHome = props.state.routes[props.state.index]?.name === 'index';
        const card = onHome && focusedCardId ? accounts.get(focusedCardId) : undefined;
        return (
          <DockTabBar
            {...props}
            tabs={dockTabs}
            addLabel={card ? t('dashboard.addTo', { name: card.name }) : t('transactions.add')}
            onAdd={() =>
              router.push({
                pathname: '/transaction/new',
                params: card ? { accountId: card.id } : {},
              })
            }
          />
        );
      }}
      screenOptions={{ sceneStyle: { backgroundColor: theme.colors.background } }}>
      {TABS.map(({ name, key }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: t(`tabs.${key}`),
            // Every tab draws its own large title; content scrolls under the floating dock.
            headerShown: false,
          }}
        />
      ))}
    </Tabs>
  );
}
