import { fireEvent, screen } from '@testing-library/react-native';

import type { ColumnMapping } from '@/domain/csv';
import { MappingEditor } from '@/features/import/mapping-editor';
import { renderWithProviders } from '@/utils/test-utils';

const rows = [
  ['Date', 'Description', 'Amount'],
  ['10/03/2026', 'NETFLIX.COM', '-16.99'],
];
const mapping: ColumnMapping = {
  hasHeader: true,
  dateCol: 0,
  dateFormat: 'MM/DD/YYYY',
  payeeCol: 1,
  amountCol: null,
  debitCol: 2,
  creditCol: 2,
  invertSign: false,
};

describe('MappingEditor', () => {
  it('labels columns with their header names', async () => {
    await renderWithProviders(<MappingEditor rows={rows} mapping={mapping} onChange={jest.fn()} />);
    expect(screen.getAllByText('3 · Amount').length).toBeGreaterThan(0);
  });

  it('labels columns with sample values when there is no header', async () => {
    await renderWithProviders(
      <MappingEditor
        rows={rows.slice(1)}
        mapping={{ ...mapping, hasHeader: false }}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getAllByText('2 · NETFLIX.COM').length).toBeGreaterThan(0);
  });

  it('switches between one amount column and debit/credit columns', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<MappingEditor rows={rows} mapping={mapping} onChange={onChange} />);
    expect(screen.getByText('Debit (money out) column')).toBeTruthy();
    await fireEvent.press(screen.getByText('One column'));
    expect(onChange).toHaveBeenLastCalledWith({
      ...mapping,
      amountCol: 2,
      debitCol: null,
      creditCol: null,
    });
  });

  it('toggles the header and sign switches', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<MappingEditor rows={rows} mapping={mapping} onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText('Flip the sign of every amount'));
    expect(onChange).toHaveBeenLastCalledWith({ ...mapping, invertSign: true });
    await fireEvent.press(screen.getByLabelText('First row is column names'));
    expect(onChange).toHaveBeenLastCalledWith({ ...mapping, hasHeader: false });
  });
});
