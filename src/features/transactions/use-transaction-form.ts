import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch, type FieldError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { repos } from '@/db';
import type { Account } from '@/db/schema';
import { isTransferType, TYPE_DIRECTION } from '@/domain/transactions';
import { useLocale } from '@/i18n/use-locale';

import {
  directionForType,
  isLinkedTransfer,
  transactionFormSchema,
  type TransactionFormValues,
} from './transaction-form-schema';

type Options = {
  defaultValues: TransactionFormValues;
  accounts: readonly Account[];
  /** Editing one side of a transfer: account, type and direction are fixed. */
  linkedEdit?: boolean;
};

/**
 * The transaction form's state and rules, shared by the one-page form (editing) and the step-by-
 * step flow (adding): validation, and how changing the type, account or payee updates the rest.
 */
export function useTransactionForm({ defaultValues, accounts, linkedEdit = false }: Options) {
  const { t } = useTranslation();
  const locale = useLocale();
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema(locale)),
    defaultValues,
    mode: 'onBlur',
  });
  const { control, setValue, getValues } = form;

  const [type, accountId, otherAccountId, payee, direction] = useWatch({
    control,
    name: ['type', 'accountId', 'otherAccountId', 'payee', 'direction'],
  });
  const account = accounts.find((a) => a.id === accountId);
  const otherAccount = accounts.find((a) => a.id === otherAccountId);
  const linked = isLinkedTransfer({ type, otherAccountId });
  // Same rule the save uses: the type decides the sign, unless it's linked or open-ended.
  const flow = linked ? direction : (TYPE_DIRECTION[type] ?? direction);

  const errorText = (error: FieldError | undefined) => (error?.message ? t(error.message) : '');

  /**
   * Fill in what we remember about a payee: its category always; its type and account only when
   * asked (the step-by-step flow has already had the user choose those).
   */
  const pickPayee = (name: string, remember: { type?: boolean; account?: boolean } = {}) => {
    setValue('payee', name, { shouldValidate: true });
    const memory = repos.transactions.payeeMemory(name);
    if (!memory) return;
    if (memory.categoryId) setValue('categoryId', memory.categoryId);
    if (remember.type && !linkedEdit && !isTransferType(memory.type)) {
      setValue('type', memory.type);
      setValue('otherAccountId', '');
    }
    if (remember.account && !linkedEdit && accounts.some((a) => a.id === memory.accountId)) {
      setValue('accountId', memory.accountId);
    }
  };

  const changeType = (next: TransactionFormValues['type']) => {
    setValue('type', next);
    setValue('direction', directionForType(next, account?.type, getValues('direction')));
    if (!isTransferType(next)) setValue('otherAccountId', '');
  };

  const changeAccount = (next: string) => {
    setValue('accountId', next);
    const nextType = accounts.find((a) => a.id === next)?.type;
    setValue('direction', directionForType(getValues('type'), nextType, getValues('direction')));
    if (getValues('otherAccountId') === next) setValue('otherAccountId', '');
  };

  return {
    form,
    values: { type, accountId, otherAccountId, payee, direction },
    account,
    otherAccount,
    linked,
    flow,
    errorText,
    suggestions: repos.transactions.payeeSuggestions(payee),
    pickPayee,
    changeType,
    changeAccount,
  };
}
