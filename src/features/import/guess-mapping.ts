import { detectDateFormat, parseCsvAmount, parseCsvDate, type ColumnMapping } from '@/domain/csv';

/** Look at this many rows when guessing. */
const SAMPLE = 25;

/**
 * A best guess for a file nobody has mapped yet: the first column that reads as dates, the
 * column of numbers (or a debit/credit pair when amounts are split), and the most "wordy"
 * column as the payee. The user always confirms it in the preview.
 */
export function guessMapping(rows: readonly string[][]): ColumnMapping {
  const sample = rows.slice(0, SAMPLE);
  const width = sample.reduce((max, r) => Math.max(max, r.length), 0);
  const columns = Array.from({ length: width }, (_, c) => sample.map((r) => r[c] ?? ''));

  // Date column and format: the column where the most cells read as one format.
  let dateCol = 0;
  let dateFormat: ColumnMapping['dateFormat'] = 'YYYY-MM-DD';
  let bestDates = -1;
  columns.forEach((cells, c) => {
    const dated = cells.filter((v) => detectDateFormat([v]) != null);
    const format = detectDateFormat(dated);
    if (format && dated.length > bestDates) {
      bestDates = dated.length;
      dateCol = c;
      dateFormat = format;
    }
  });

  // A header row is a first row whose date cell doesn't read as a date while later ones do.
  const hasHeader =
    sample.length > 1 &&
    parseCsvDate(sample[0][dateCol] ?? '', dateFormat) == null &&
    parseCsvDate(sample[1][dateCol] ?? '', dateFormat) != null;
  // Judge the other columns only on rows that are real transactions (their date reads).
  const body = sample.filter((r) => parseCsvDate(r[dateCol] ?? '', dateFormat) != null);
  const filled = (c: number) => body.filter((r) => (r[c] ?? '').trim() !== '');
  const numeric = (c: number) => filled(c).filter((r) => parseCsvAmount(r[c]) != null).length;

  const candidates = columns
    .map((_, c) => c)
    .filter((c) => c !== dateCol && filled(c).length > 0 && numeric(c) === filled(c).length);

  // Amount columns that are always full read as a signed amount; ones with gaps are a debit/credit
  // pair. Balance columns are also always full, so prefer the left-most.
  const full = candidates.filter((c) => filled(c).length === body.length);
  const partial = candidates.filter((c) => filled(c).length < body.length);
  const split = full.length === 0 || partial.length >= 2 ? partial.slice(0, 2) : [];

  const payeeCol =
    columns
      .map((cells, c) => ({
        c,
        score: body.reduce((sum, r) => sum + ((r[c] ?? '').match(/[A-Za-z]/g)?.length ?? 0), 0),
      }))
      .filter(({ c }) => c !== dateCol && !candidates.includes(c))
      .sort((a, b) => b.score - a.score)[0]?.c ?? (dateCol === 0 ? 1 : 0);

  return {
    hasHeader,
    dateCol,
    dateFormat,
    payeeCol,
    amountCol: split.length === 2 ? null : (full[0] ?? candidates[0] ?? null),
    debitCol: split.length === 2 ? split[0] : null,
    creditCol: split.length === 2 ? split[1] : null,
    invertSign: false,
  };
}
