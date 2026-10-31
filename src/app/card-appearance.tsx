import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Icon, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Panel } from '@/components/page-kit';
import { repos } from '@/db';
import type { Account } from '@/db/schema';
import { CardFace } from '@/features/accounts/card-face';
import { useAccounts } from '@/features/accounts/use-accounts';
import { deleteCardArt, pickCardArt } from '@/features/card-art/card-art';
import { usePro } from '@/features/pro/use-pro';

/** Card appearance (Pro): give each card a picture of the user's choosing as its background. */
export default function CardAppearanceScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const pro = usePro();
  const accounts = useAccounts();

  const choose = async (account: Account) => {
    if (!pro) {
      router.push('/pro');
      return;
    }
    try {
      const path = await pickCardArt(account.id);
      if (!path) return;
      repos.accounts.setImagePath(account.id, path);
      deleteCardArt(account.imagePath);
    } catch (e) {
      Alert.alert(t('cardArt.failed'), e instanceof Error ? e.message : String(e));
    }
  };

  const remove = (account: Account) => {
    repos.accounts.setImagePath(account.id, null);
    deleteCardArt(account.imagePath);
  };

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.flex}>
      <Stack.Screen options={{ title: t('cardArt.title') }} />
      <ScrollView
        contentContainerStyle={styles.container}
        contentInsetAdjustmentBehavior="automatic">
        {/* A photo of a real card shows its full number, which CardTrack never keeps. */}
        <View
          style={[styles.notice, { backgroundColor: theme.colors.secondaryContainer }]}
          accessible
          accessibilityRole="text">
          <Icon source="shield-alert-outline" size={22} color={theme.colors.onSecondaryContainer} />
          <Text
            variant="bodyMedium"
            style={[styles.flex, { color: theme.colors.onSecondaryContainer }]}>
            {t('cardArt.notice')}
          </Text>
        </View>

        {pro ? null : (
          <Panel>
            <Text variant="titleMedium" style={styles.bold}>
              {t('cardArt.proTitle')}
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('cardArt.proBody')}
            </Text>
            <Button
              mode="contained"
              icon="crown-outline"
              onPress={() => router.push('/pro')}
              style={styles.rounded}
              contentStyle={styles.tall}>
              {t('cardArt.seePro')}
            </Button>
          </Panel>
        )}

        {accounts.map(({ account }) => (
          <Panel key={account.id}>
            <CardFace account={account} scale={0.8} />
            <View style={styles.actions}>
              <Button
                mode="contained-tonal"
                icon={pro ? 'image-plus' : 'lock-outline'}
                onPress={() => void choose(account)}
                accessibilityLabel={t('cardArt.chooseFor', { name: account.name })}
                style={[styles.rounded, styles.flex]}
                contentStyle={styles.tall}>
                {account.imagePath ? t('cardArt.replace') : t('cardArt.choose')}
              </Button>
              {account.imagePath ? (
                <Button
                  mode="text"
                  icon="image-remove"
                  onPress={() => remove(account)}
                  accessibilityLabel={t('cardArt.removeFor', { name: account.name })}
                  contentStyle={styles.tall}>
                  {t('cardArt.remove')}
                </Button>
              ) : null}
            </View>
          </Panel>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, gap: 14, paddingBottom: 32 },
  notice: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 18, alignItems: 'center' },
  bold: { fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rounded: { borderRadius: 16 },
  tall: { minHeight: 48 },
});
