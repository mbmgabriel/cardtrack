import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChoiceRow } from '@/components/choice-row';
import { ListRow, PageHeader, Panel, RowDivider } from '@/components/page-kit';
import { repos } from '@/db';
import { useLiveData } from '@/db/live';
import { DataSection } from '@/features/backup/data-section';
import { useDockInset } from '@/features/navigation/dock-tab-bar';
import { requestReminderPermission, sendTestReminder } from '@/features/reminders/scheduler';

const DUE_DAY_OPTIONS = [1, 3, 5, 7] as const;

export default function SettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const dockInset = useDockInset();
  const settings = useLiveData(() => repos.settings.getAll(), ['settings']);
  const autoPending = settings.recurring_auto_status === 'pending';
  const pro = settings.pro_unlocked;
  const muted = { color: theme.colors.onSurfaceVariant };

  const toggleReminders = async () => {
    if (settings.reminders_enabled) {
      repos.settings.set('reminders_enabled', false);
      return;
    }
    if (await requestReminderPermission()) repos.settings.set('reminders_enabled', true);
    else Alert.alert(t('settings.reminders'), t('settings.remindersDenied'));
  };

  const testReminder = async () => {
    const sent = await sendTestReminder();
    Alert.alert(
      t('settings.reminders'),
      sent ? t('settings.testSent') : t('settings.remindersDenied'),
    );
  };

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: dockInset }]}>
        <PageHeader title={t('tabs.settings')} />

        <Panel padded={false}>
          <ListRow
            icon="crown-outline"
            title={t('pro.settingsRow')}
            value={pro ? t('pro.statusPro') : t('pro.statusFree')}
            onPress={() => router.push('/pro')}
          />
          <RowDivider />
          <ListRow
            icon="palette-swatch-outline"
            title={t('cardArt.settingsRow')}
            description={t('cardArt.settingsHelp')}
            onPress={() => router.push('/card-appearance')}
          />
        </Panel>

        <Panel padded={false}>
          <ListRow
            icon="shape-outline"
            title={t('settings.categories')}
            description={t('settings.categoriesHelp')}
            onPress={() => router.push('/categories')}
          />
          <RowDivider />
          <ListRow
            icon="autorenew"
            title={t('settings.autoPending')}
            description={t('settings.autoPendingHelp')}
            toggle={{
              value: autoPending,
              onToggle: () =>
                repos.settings.set('recurring_auto_status', autoPending ? 'posted' : 'pending'),
            }}
          />
        </Panel>

        <Panel title={t('settings.reminders')} padded={false}>
          <ListRow
            icon="bell-outline"
            title={t('settings.remindersEnabled')}
            description={t('settings.remindersHelp')}
            toggle={{ value: settings.reminders_enabled, onToggle: () => void toggleReminders() }}
          />
          {settings.reminders_enabled ? (
            <>
              <RowDivider />
              <View style={styles.block}>
                <Text variant="titleMedium" style={styles.bold}>
                  {t('settings.dueDaysBefore')}
                </Text>
                <View style={styles.bleed}>
                  <ChoiceRow
                    label={t('settings.dueDaysBefore')}
                    value={String(settings.reminder_due_days_before)}
                    onChange={(v) => repos.settings.set('reminder_due_days_before', Number(v))}
                    options={DUE_DAY_OPTIONS.map((n) => ({
                      value: String(n),
                      label: t('settings.dueDaysOption', { count: n }),
                    }))}
                  />
                </View>
                <Text variant="bodySmall" style={muted}>
                  {t('settings.dueDaysHelp')}
                </Text>
              </View>
              <RowDivider />
              <ListRow
                icon="calendar-sync-outline"
                title={t('settings.recurringReminders')}
                description={t('settings.recurringRemindersHelp')}
                toggle={{
                  value: settings.reminder_recurring_enabled,
                  onToggle: () =>
                    repos.settings.set(
                      'reminder_recurring_enabled',
                      !settings.reminder_recurring_enabled,
                    ),
                }}
              />
              <View style={styles.block}>
                <Button
                  mode="contained-tonal"
                  icon="bell-ring-outline"
                  onPress={() => void testReminder()}
                  style={styles.button}
                  contentStyle={styles.buttonContent}>
                  {t('settings.testReminder')}
                </Button>
              </View>
            </>
          ) : null}
        </Panel>

        <DataSection />

        <Text variant="bodyMedium" style={[styles.soon, muted]}>
          {t('empty.settings')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, paddingTop: 8, gap: 14 },
  block: { paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  bleed: { marginHorizontal: -16 },
  bold: { fontWeight: '600' },
  button: { borderRadius: 16 },
  buttonContent: { minHeight: 48 },
  soon: { textAlign: 'center', padding: 24 },
});
