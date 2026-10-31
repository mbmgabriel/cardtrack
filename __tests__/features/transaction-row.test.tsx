import { fireEvent, screen } from '@testing-library/react-native';

import type { Transaction } from '@/db/schema';
import { TransactionRow } from '@/features/transactions/transaction-row';
import { renderWithProviders } from '@/utils/test-utils';

const base: Transaction = {
  id: 't1',
  accountId: 'visa',
  date: '2026-10-10',
  postedDate: null,
  payee: 'Petro-Canada',
  amountCents: -5420,
  type: 'purchase',
  status: 'posted',
  categoryId: null,
  notes: null,
  recurringId: null,
  statementId: null,
  transferGroupId: null,
  importBatchId: null,
  dedupeHash: 'h',
  isReconciled: false,
  createdAt: '',
  updatedAt: '',
};

async function renderRow(overrides: Partial<Transaction> = {}, extra: object = {}) {
  const actions = {
    onPress: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    onMarkPosted: jest.fn(),
  };
  await renderWithProviders(
    <TransactionRow
      transaction={{ ...base, ...overrides }}
      currency="CAD"
      locale="en-CA"
      {...actions}
      {...extra}
    />,
  );
  return actions;
}

describe('TransactionRow', () => {
  it('shows payee, signed amount and owed running balance', async () => {
    await renderRow({}, { runningBalanceCents: -15420, isLiability: true });
    expect(screen.getByText('Petro-Canada')).toBeTruthy();
    expect(screen.getByText('-$54.20')).toBeTruthy();
    expect(screen.getByText('Owed $154.20')).toBeTruthy();
    expect(screen.getByText('Uncategorized')).toBeTruthy();
  });

  it('shows money in with a plus and a pending badge instead of a balance', async () => {
    await renderRow({ amountCents: 2500, status: 'pending' }, { runningBalanceCents: null });
    expect(screen.getByText('+$25.00')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('exposes edit, delete and mark posted as accessibility actions', async () => {
    const actions = await renderRow({ status: 'pending' });
    const row = screen.getByLabelText(/Petro-Canada, -\$54\.20/);
    expect(row.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual([
      'edit',
      'delete',
      'markPosted',
    ]);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'markPosted' } });
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    expect(actions.onMarkPosted).toHaveBeenCalled();
    expect(actions.onDelete).toHaveBeenCalled();
    await fireEvent.press(row);
    expect(actions.onPress).toHaveBeenCalled();
  });

  it('does not offer mark posted for posted rows', async () => {
    await renderRow();
    const row = screen.getByLabelText(/Petro-Canada/);
    expect(row.props.accessibilityActions).toHaveLength(2);
  });
});
