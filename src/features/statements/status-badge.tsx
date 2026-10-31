import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { Text, useTheme, type MD3Theme } from 'react-native-paper';

import type { StatementStatus } from '@/domain/types';
import { statusColors } from '@/theme';

export function statusColor(status: StatementStatus, theme: MD3Theme): string {
  switch (status) {
    case 'paid':
      return statusColors(theme).success;
    case 'due':
      return statusColors(theme).warning;
    case 'overdue':
      return theme.colors.error;
    case 'open':
      return theme.colors.onSurfaceVariant;
  }
}

/** Outlined status label; the text carries the meaning, the colour reinforces it. */
export function StatusBadge({ status }: { status: StatementStatus }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const color = statusColor(status, theme);
  return (
    <Text variant="labelMedium" style={[styles.badge, { color, borderColor: color }]}>
      {t(`statementStatuses.${status}`)}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'center',
    overflow: 'hidden',
  },
});
