import '@/i18n';

import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, PaperProvider, Text, useTheme } from 'react-native-paper';

import { useDatabaseSetup } from '@/db/use-database-setup';
import { useDailyJobsOnForeground } from '@/features/background/daily-jobs';
import { useReminderSync } from '@/features/reminders/use-reminder-sync';
import { getThemes } from '@/theme';

export default function RootLayout() {
  const scheme = useColorScheme();
  const { paper, navigation } = getThemes(scheme);

  return (
    <GestureHandlerRootView style={styles.flex}>
      <PaperProvider theme={paper}>
        <ThemeProvider value={navigation}>
          <DatabaseGate>
            <Stack
              // Detail screens: the header melts into the grey page, as on the tabs.
              screenOptions={{
                headerStyle: { backgroundColor: paper.colors.background },
                headerShadowVisible: false,
                headerTitleStyle: { fontWeight: '700' },
                contentStyle: { backgroundColor: paper.colors.background },
              }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
          </DatabaseGate>
          <StatusBar style="auto" />
        </ThemeProvider>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}

function DatabaseGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { ready, error } = useDatabaseSetup();
  const { colors } = useTheme();

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text variant="titleMedium">{t('startup.dbErrorTitle')}</Text>
        <Text variant="bodyMedium" style={styles.detail}>
          {error.message}
        </Text>
      </View>
    );
  }
  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator accessibilityLabel={t('startup.loading')} />
      </View>
    );
  }
  return <ReadyApp>{children}</ReadyApp>;
}

/** Background work that needs the database to be ready. */
function ReadyApp({ children }: { children: React.ReactNode }) {
  useDailyJobsOnForeground();
  useReminderSync();
  return children;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  detail: { textAlign: 'center' },
});
