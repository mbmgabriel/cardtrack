import type { ColumnMapping } from '@/domain/csv';

export type MappingPreset = {
  id: string;
  name: string;
  /** Lower-case words that identify the bank in an account's institution field. */
  matches: readonly string[];
  mapping: ColumnMapping;
};

const SPLIT = { amountCol: null } as const;
const SIGNED = { debitCol: null, creditCol: null } as const;

/**
 * Typical layouts of Canadian bank CSV exports. Banks change these without notice, so they are
 * only starting points — the user checks the preview and adjusts before importing (PLAN.md §6).
 */
export const MAPPING_PRESETS: readonly MappingPreset[] = [
  {
    id: 'td',
    name: 'TD',
    matches: ['td', 'toronto-dominion', 'toronto dominion'],
    // Date, Description, Debit, Credit, Balance — no header.
    mapping: {
      hasHeader: false,
      dateCol: 0,
      dateFormat: 'MM/DD/YYYY',
      payeeCol: 1,
      ...SPLIT,
      debitCol: 2,
      creditCol: 3,
      invertSign: false,
    },
  },
  {
    id: 'rbc',
    name: 'RBC',
    matches: ['rbc', 'royal bank'],
    // Account Type, Account Number, Transaction Date, Cheque Number, Description 1, Description 2, CAD$, USD$.
    mapping: {
      hasHeader: true,
      dateCol: 2,
      dateFormat: 'MM/DD/YYYY',
      payeeCol: 4,
      amountCol: 6,
      ...SIGNED,
      invertSign: false,
    },
  },
  {
    id: 'cibc',
    name: 'CIBC',
    matches: ['cibc'],
    // Date, Description, Debit, Credit[, Card] — no header.
    mapping: {
      hasHeader: false,
      dateCol: 0,
      dateFormat: 'YYYY-MM-DD',
      payeeCol: 1,
      ...SPLIT,
      debitCol: 2,
      creditCol: 3,
      invertSign: false,
    },
  },
  {
    id: 'scotiabank',
    name: 'Scotiabank',
    matches: ['scotia', 'bns', 'bank of nova scotia'],
    // Date, Amount, -, Type, Description — no header.
    mapping: {
      hasHeader: false,
      dateCol: 0,
      dateFormat: 'MM/DD/YYYY',
      payeeCol: 4,
      amountCol: 1,
      ...SIGNED,
      invertSign: false,
    },
  },
  {
    id: 'bmo',
    name: 'BMO',
    matches: ['bmo', 'bank of montreal'],
    // A preamble line, then Card, Transaction Type, Date Posted, Transaction Amount, Description.
    mapping: {
      hasHeader: false,
      dateCol: 2,
      dateFormat: 'YYYYMMDD',
      payeeCol: 4,
      amountCol: 3,
      ...SIGNED,
      invertSign: false,
    },
  },
  {
    id: 'tangerine',
    name: 'Tangerine',
    matches: ['tangerine'],
    // Date, Transaction, Name, Memo, Amount.
    mapping: {
      hasHeader: true,
      dateCol: 0,
      dateFormat: 'MM/DD/YYYY',
      payeeCol: 2,
      amountCol: 4,
      ...SIGNED,
      invertSign: false,
    },
  },
  {
    id: 'amex',
    name: 'Amex Canada',
    matches: ['amex', 'american express'],
    // Date, Date Processed, Description, Cardmember, Amount — charges are positive.
    mapping: {
      hasHeader: true,
      dateCol: 0,
      dateFormat: 'D MMM YYYY',
      payeeCol: 2,
      amountCol: 4,
      ...SIGNED,
      invertSign: true,
    },
  },
];

/** The preset whose bank name appears in the account's institution, e.g. "TD Canada Trust" → TD. */
export function presetForInstitution(institution: string): MappingPreset | undefined {
  const words = institution
    .toLowerCase()
    .split(/[^a-z-]+/)
    .filter(Boolean);
  const text = institution.toLowerCase();
  return MAPPING_PRESETS.find((p) =>
    p.matches.some((m) =>
      m.includes(' ') ? text.includes(m) : words.some((w) => w.startsWith(m)),
    ),
  );
}
