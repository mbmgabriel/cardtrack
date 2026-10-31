import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { Button, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-kit';
import { repos } from '@/db';
import { AccountTile } from '@/features/accounts/account-tile';
import { mergeVisibleOrder, moveItem } from '@/features/accounts/reorder';
import { useAccounts } from '@/features/accounts/use-accounts';
import { useDockInset } from '@/features/navigation/dock-tab-bar';
import { useLocale } from '@/i18n/use-locale';

export default function AccountsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const dockInset = useDockInset();
  const [showArchived, setShowArchived] = useState(false);
  const [reordering, setReordering] = useState(false);
  const all = useAccounts({ includeArchived: true });
  const items = showArchived ? all : all.filter((i) => !i.account.isArchived);
  const hasArchived = all.some((i) => i.account.isArchived);

  const addAccount = () => router.push('/account/new');

  const move = (from: number, to: number) => {
    const visible = moveItem(
      items.map((i) => i.account.id),
      from,
      to,
    );
    repos.accounts.reorder(
      mergeVisibleOrder(
        all.map((i) => i.account.id),
        visible,
      ),
    );
  };

  if (items.length === 0 && !showArchived) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
        <EmptyState icon="credit-card-plus-outline" message={t('empty.accounts')} />
        <View style={styles.emptyActions}>
          <Button mode="contained" icon="plus" onPress={addAccount} contentStyle={styles.button}>
            {t('accounts.addFirst')}
          </Button>
          {hasArchived ? (
            <Button onPress={() => setShowArchived(true)}>{t('accounts.showArchived')}</Button>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.account.id}
        contentContainerStyle={[styles.list, { paddingBottom: dockInset }]}
        ListHeaderComponent={
          <PageHeader
            title={t('tabs.accounts')}
            subtitle={t('accounts.count', { count: items.length })}
            actions={[
              ...(hasArchived
                ? [
                    {
                      icon: 'archive-outline',
                      label: t('accounts.showArchived'),
                      selected: showArchived,
                      onPress: () => setShowArchived((v) => !v),
                    },
                  ]
                : []),
              ...(items.length > 1
                ? [
                    {
                      icon: reordering ? 'check' : 'swap-vertical',
                      label: reordering ? t('common.done') : t('accounts.reorder'),
                      selected: reordering,
                      onPress: () => setReordering((v) => !v),
                    },
                  ]
                : []),
              ...(!reordering
                ? [
                    {
                      icon: 'flag-checkered',
                      label: t('payoff.title'),
                      onPress: () => router.push('/payoff'),
                    },
                    { icon: 'plus', label: t('accounts.add'), primary: true, onPress: addAccount },
                  ]
                : []),
            ]}
          />
        }
        renderItem={({ item, index }) => (
          <AccountTile
            {...item}
            locale={locale}
            onPress={() =>
              router.push({ pathname: '/account/[id]', params: { id: item.account.id } })
            }
            reorder={
              reordering
                ? {
                    onMoveUp: () => move(index, index - 1),
                    onMoveDown: () => move(index, index + 1),
                    canMoveUp: index > 0,
                    canMoveDown: index < items.length - 1,
                  }
                : undefined
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: 16, paddingTop: 8, gap: 12 },
  emptyActions: { padding: 24, gap: 8, alignItems: 'center' },
  button: { minHeight: 48 },
});
