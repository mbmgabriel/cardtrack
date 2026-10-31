import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';

import { ListRow, Panel, RowDivider } from '@/components/page-kit';

import { backups, repos } from '@/db';
import { parseBackup, type Backup } from '@/db/backup';
import { todayISO } from '@/domain/dates';
import { runDailyJobs } from '@/features/background/daily-jobs';
import { shareTextFile } from '@/features/export/share-file';

const JSON_TYPES = ['application/json', 'text/json', 'text/plain', 'application/octet-stream'];

/** Settings → Your data: back up everything to a file, or restore from one. */
export function DataSection() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [pending, setPending] = useState<Backup | null>(null);

  const backUp = async () => {
    try {
      const shared = await shareTextFile(
        `cardtrack-backup-${todayISO()}.json`,
        JSON.stringify(backups.exportAll()),
        { mimeType: 'application/json', UTI: 'public.json' },
      );
      if (!shared) Alert.alert(t('backup.title'), t('exportCsv.unavailable'));
    } catch (e) {
      Alert.alert(t('backup.title'), e instanceof Error ? e.message : String(e));
    }
  };

  const pickBackup = async () => {
    try {
      const picked = await getDocumentAsync({ type: JSON_TYPES, copyToCacheDirectory: true });
      if (picked.canceled) return;
      const result = parseBackup(await new File(picked.assets[0].uri).text());
      if (result.ok) setPending(result.backup);
      else Alert.alert(t('backup.restoreTitle'), t(`backup.problems.${result.problem}`));
    } catch {
      Alert.alert(t('backup.restoreTitle'), t('backup.problems.notJson'));
    }
  };

  const restore = () => {
    if (!pending) return;
    try {
      backups.restore(pending);
      repos.categories.seedDefaults();
      runDailyJobs();
      Alert.alert(t('backup.restoreTitle'), t('backup.restored'));
    } catch {
      Alert.alert(t('backup.restoreTitle'), t('backup.problems.damaged'));
    }
    setPending(null);
  };

  const counts = pending ? backups.counts(pending) : undefined;

  return (
    <>
      <Panel title={t('backup.section')} padded={false}>
        <ListRow
          icon="content-save-outline"
          title={t('backup.backUp')}
          description={t('backup.backUpHelp')}
          onPress={() => void backUp()}
        />
        <RowDivider />
        <ListRow
          icon="backup-restore"
          title={t('backup.restore')}
          description={t('backup.restoreHelp')}
          onPress={() => void pickBackup()}
        />
      </Panel>
      <Portal>
        <Dialog visible={pending != null} onDismiss={() => setPending(null)}>
          <Dialog.Title>{t('backup.confirmTitle')}</Dialog.Title>
          <Dialog.Content>
            {pending && counts ? (
              <Text variant="bodyMedium">
                {t('backup.confirmBody', {
                  date: pending.exportedAt.slice(0, 10),
                  accounts: counts.accounts,
                  transactions: counts.transactions,
                })}
              </Text>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPending(null)}>{t('common.cancel')}</Button>
            <Button textColor={theme.colors.error} onPress={restore}>
              {t('backup.replace')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}
