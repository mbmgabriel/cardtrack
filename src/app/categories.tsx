import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import {
  Button,
  Dialog,
  HelperText,
  Icon,
  List,
  Portal,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { GroupedSeparator, groupedRow, RoundButton } from '@/components/page-kit';
import { repos } from '@/db';
import type { Category } from '@/db/schema';
import { ACCOUNT_COLORS } from '@/features/accounts/colors';
import { categoryLabel } from '@/features/categories/category-label';
import { useCategories } from '@/features/categories/use-categories';
import { readableTextColor } from '@/utils/color';

type Editing = { category: Category | null; name: string; color: string };

export default function CategoriesScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const categories = useCategories();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [nameError, setNameError] = useState(false);

  const startEdit = (category: Category | null) => {
    setNameError(false);
    setEditing({
      category,
      name: category ? categoryLabel(category, t) : '',
      color: category?.color ?? ACCOUNT_COLORS[0],
    });
  };

  const save = () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (name === '') {
      setNameError(true);
      return;
    }
    if (!editing.category) {
      repos.categories.create({ name, color: editing.color });
    } else {
      // Keep the stored default name when it still matches the translation, so it stays translated.
      const unchanged = name === categoryLabel(editing.category, t);
      repos.categories.update(editing.category.id, {
        ...(unchanged ? {} : { name }),
        color: editing.color,
      });
    }
    setEditing(null);
  };

  const remove = () => {
    if (!deleting) return;
    repos.categories.delete(deleting.id);
    setDeleting(null);
    setEditing(null);
  };

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title: t('categoryManager.title') }} />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={categories}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={GroupedSeparator}
        ListHeaderComponent={
          <Text variant="bodySmall" style={[styles.help, { color: theme.colors.onSurfaceVariant }]}>
            {t('categoryManager.builtInHelp')}
          </Text>
        }
        renderItem={({ item, index }) => (
          <List.Item
            title={categoryLabel(item, t)}
            description={item.isSystem ? t('categoryManager.builtIn') : undefined}
            onPress={() => startEdit(item)}
            accessibilityRole="button"
            style={[
              styles.item,
              {
                backgroundColor: theme.colors.elevation.level1,
                borderColor: theme.colors.outlineVariant,
              },
              groupedRow(index, categories.length),
            ]}
            titleStyle={styles.itemTitle}
            left={() => (
              <View style={[styles.icon, { backgroundColor: item.color }]}>
                <Icon source={item.icon} size={20} color={readableTextColor(item.color)} />
              </View>
            )}
            right={(props) => <List.Icon {...props} icon="pencil-outline" />}
          />
        )}
      />
      <View style={styles.fab}>
        <RoundButton
          primary
          icon="plus"
          label={t('categoryManager.add')}
          onPress={() => startEdit(null)}
        />
      </View>

      <Portal>
        <Dialog visible={editing != null} onDismiss={() => setEditing(null)}>
          <Dialog.Title>
            {editing?.category ? t('categoryManager.editTitle') : t('categoryManager.newTitle')}
          </Dialog.Title>
          {editing ? (
            <Dialog.Content style={styles.dialog}>
              <TextInput
                mode="outlined"
                label={t('categoryManager.name')}
                accessibilityLabel={t('categoryManager.name')}
                value={editing.name}
                onChangeText={(name) => setEditing({ ...editing, name })}
                error={nameError}
                maxLength={40}
                autoCapitalize="words"
              />
              {nameError ? (
                <HelperText type="error">{t('categoryManager.nameRequired')}</HelperText>
              ) : null}
              <Text variant="labelLarge">{t('categoryManager.color')}</Text>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel={t('categoryManager.color')}
                style={styles.swatches}>
                {ACCOUNT_COLORS.map((color, index) => {
                  const selected = color === editing.color;
                  return (
                    <Pressable
                      key={color}
                      onPress={() => setEditing({ ...editing, color })}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={t('accountForm.colorOption', {
                        index: index + 1,
                        count: ACCOUNT_COLORS.length,
                      })}
                      style={[
                        styles.swatch,
                        { backgroundColor: color },
                        selected && { borderColor: theme.colors.onSurface },
                      ]}>
                      {selected ? (
                        <Icon source="check" size={20} color={readableTextColor(color)} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </Dialog.Content>
          ) : null}
          <Dialog.Actions>
            {editing?.category && !editing.category.isSystem ? (
              <Button
                textColor={theme.colors.error}
                onPress={() => setDeleting(editing.category)}
                style={styles.deleteButton}>
                {t('common.delete')}
              </Button>
            ) : null}
            <Button onPress={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button onPress={save}>{t('common.save')}</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={deleting != null} onDismiss={() => setDeleting(null)}>
          <Dialog.Title>
            {t('categoryManager.deleteTitle', { name: deleting ? categoryLabel(deleting, t) : '' })}
          </Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {t('categoryManager.deleteBody', {
                count: deleting ? repos.categories.countTransactions(deleting.id) : 0,
              })}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleting(null)}>{t('common.cancel')}</Button>
            <Button textColor={theme.colors.error} onPress={remove}>
              {t('common.delete')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingBottom: 112 },
  help: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12 },
  item: { minHeight: 64, paddingLeft: 16, marginHorizontal: 16 },
  itemTitle: { fontWeight: '600' },
  icon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', right: 20, bottom: 20 },
  dialog: { gap: 8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'transparent',
    borderWidth: 3,
  },
  deleteButton: { marginRight: 'auto' },
});
