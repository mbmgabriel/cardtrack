import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Icon, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ListRow, Panel, RowDivider } from '@/components/page-kit';
import { setProForTesting, usePro } from '@/features/pro/use-pro';

/**
 * CardTrack Pro: what it adds and how to get it. Purchases arrive with RevenueCat in Phase 11
 * (PLAN.md §8); until then a development build can switch Pro on to test the Pro features.
 */
export default function ProScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const pro = usePro();
  const fg = theme.colors.inverseOnSurface;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.flex}>
      <Stack.Screen options={{ title: t('pro.title'), presentation: 'modal' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.hero, { backgroundColor: theme.colors.inverseSurface }]}>
          <View style={[styles.badge, { borderColor: fg }]}>
            <Icon source="crown-outline" size={28} color={fg} />
          </View>
          <Text style={[styles.heroTitle, { color: fg }]} accessibilityRole="header">
            {t('pro.title')}
          </Text>
          <Text style={[styles.heroText, { color: fg }]}>
            {pro ? t('pro.unlocked') : t('pro.tagline')}
          </Text>
        </View>

        <Panel title={t('pro.includes')} padded={false}>
          <ListRow
            icon="flag-checkered"
            title={t('pro.payoff')}
            description={t('pro.payoffHelp')}
          />
          <RowDivider />
          <ListRow
            icon="palette-swatch-outline"
            title={t('pro.cardArt')}
            description={t('pro.cardArtHelp')}
          />
        </Panel>

        {pro ? null : (
          <View style={styles.buy}>
            <Button
              mode="contained"
              icon="lock-open-variant-outline"
              disabled
              style={styles.rounded}
              contentStyle={styles.tall}
              labelStyle={styles.buyLabel}>
              {t('pro.unlock')}
            </Button>
            <Text
              variant="bodySmall"
              style={[styles.center, { color: theme.colors.onSurfaceVariant }]}>
              {t('pro.comingSoon')}
            </Text>
          </View>
        )}

        {/* Development builds only, until purchases exist. */}
        {__DEV__ ? (
          <Button
            mode="outlined"
            icon="flask-outline"
            onPress={() => setProForTesting(!pro)}
            style={styles.rounded}
            contentStyle={styles.tall}>
            {pro ? t('pro.lockForTesting') : t('pro.unlockForTesting')}
          </Button>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, gap: 16 },
  hero: { borderRadius: 28, padding: 24, gap: 8, alignItems: 'flex-start' },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  heroTitle: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  heroText: { fontSize: 15, opacity: 0.8 },
  buy: { gap: 8 },
  rounded: { borderRadius: 16 },
  tall: { minHeight: 52 },
  buyLabel: { fontSize: 16, fontWeight: '600' },
  center: { textAlign: 'center' },
});
