import fs from 'fs';
import path from 'path';

import { applyMapping, parseCsvRows } from '@/domain/csv';
import { guessMapping } from '@/features/import/guess-mapping';
import { MAPPING_PRESETS, presetForInstitution } from '@/features/import/presets';

const fixture = (name: string) =>
  parseCsvRows(fs.readFileSync(path.join(__dirname, '../fixtures', name), 'utf8'));
const preset = (id: string) => MAPPING_PRESETS.find((p) => p.id === id)!.mapping;

describe('presetForInstitution', () => {
  it.each([
    ['TD Canada Trust', 'td'],
    ['td', 'td'],
    ['Royal Bank of Canada', 'rbc'],
    ['CIBC', 'cibc'],
    ['Scotiabank', 'scotiabank'],
    ['BMO Bank of Montreal', 'bmo'],
    ['Tangerine', 'tangerine'],
    ['American Express', 'amex'],
  ])('%s → %s', (institution, id) => {
    expect(presetForInstitution(institution)?.id).toBe(id);
  });

  it('does not match on fragments of other words', () => {
    expect(presetForInstitution('Desjardins')).toBeUndefined();
    expect(presetForInstitution('Ottawa Credit Union')).toBeUndefined();
    expect(presetForInstitution('')).toBeUndefined();
  });
});

describe('presets read their sample files', () => {
  it('TD', () => {
    expect(applyMapping(fixture('td-visa.csv'), preset('td')).rows).toHaveLength(6);
  });

  it('Tangerine', () => {
    const { rows, problems } = applyMapping(fixture('tangerine.csv'), preset('tangerine'));
    expect(problems).toEqual([]);
    expect(rows.map((r) => [r.payee, r.amountCents])).toEqual([
      ['Hydro One', -12033],
      ['Interest Paid', 107],
      ['Metro, Inc.', -8710],
    ]);
  });

  it('BMO skips the preamble and totals', () => {
    expect(applyMapping(fixture('bmo-with-preamble.csv'), preset('bmo')).rows).toHaveLength(2);
  });

  it('RBC', () => {
    expect(applyMapping(fixture('rbc-chequing.csv'), preset('rbc')).rows).toHaveLength(3);
  });
});

describe('guessMapping', () => {
  it('finds split debit/credit columns without a header', () => {
    expect(guessMapping(fixture('td-visa.csv'))).toEqual({
      hasHeader: false,
      dateCol: 0,
      dateFormat: 'MM/DD/YYYY',
      payeeCol: 1,
      amountCol: null,
      debitCol: 2,
      creditCol: 3,
      invertSign: false,
    });
  });

  it('finds a header and a signed amount column', () => {
    expect(guessMapping(fixture('tangerine.csv'))).toMatchObject({
      hasHeader: true,
      dateCol: 0,
      payeeCol: 2,
      amountCol: 4,
      debitCol: null,
    });
  });

  it('finds compact dates among preamble lines', () => {
    expect(guessMapping(fixture('bmo-with-preamble.csv'))).toMatchObject({
      dateCol: 2,
      dateFormat: 'YYYYMMDD',
      amountCol: 3,
    });
  });

  it('copes with an empty file', () => {
    expect(guessMapping([])).toMatchObject({ dateCol: 0, payeeCol: 1, amountCol: null });
  });
});
