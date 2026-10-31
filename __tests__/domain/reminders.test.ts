import {
  MAX_REMINDERS,
  planReminders,
  type ChargeSource,
  type DueSource,
  type ReminderSettings,
} from '@/domain/reminders';

const settings: ReminderSettings = {
  enabled: true,
  dueDaysBefore: 3,
  recurringEnabled: true,
  hour: 9,
};
const morning = { date: '2026-10-30', minutes: 8 * 60 };

// Statement day 15 / offset 21: the cycle closing Oct 15 is due Nov 5.
const visaDue: DueSource = {
  statementId: 's-oct',
  accountName: 'TD Visa',
  currency: 'CAD',
  dueDate: '2026-11-05',
  amountCents: 40000,
};

const netflix: ChargeSource = {
  ruleId: 'r1',
  payee: 'Netflix',
  accountName: 'TD Visa',
  currency: 'CAD',
  amountCents: -1699,
  date: '2026-11-03',
  remindDaysBefore: 2,
};

describe('planReminders', () => {
  it('reminds N days before a payment is due and on the day', () => {
    expect(planReminders([visaDue], [], settings, morning)).toEqual([
      { id: 'due:s-oct:3', kind: 'due', fireDate: '2026-11-02', daysBefore: 3, source: visaDue },
      { id: 'due:s-oct:0', kind: 'due', fireDate: '2026-11-05', daysBefore: 0, source: visaDue },
    ]);
  });

  it('reminds before recurring charges', () => {
    expect(planReminders([], [netflix], settings, morning)).toEqual([
      {
        id: 'charge:r1:2026-11-03',
        kind: 'charge',
        fireDate: '2026-11-01',
        daysBefore: 2,
        source: netflix,
      },
    ]);
  });

  it('skips reminders whose time has passed, but keeps later ones today', () => {
    const due = { ...visaDue, dueDate: '2026-10-30' };
    expect(planReminders([due], [], settings, morning).map((r) => r.fireDate)).toEqual([
      '2026-10-30',
    ]);
    expect(planReminders([due], [], settings, { date: '2026-10-30', minutes: 9 * 60 })).toEqual([]);
  });

  it('a 0-day setting gives a single reminder on the day', () => {
    expect(planReminders([visaDue], [], { ...settings, dueDaysBefore: 0 }, morning)).toHaveLength(
      1,
    );
  });

  it('respects the switches', () => {
    expect(planReminders([visaDue], [netflix], { ...settings, enabled: false }, morning)).toEqual(
      [],
    );
    expect(
      planReminders([visaDue], [netflix], { ...settings, recurringEnabled: false }, morning).every(
        (r) => r.kind === 'due',
      ),
    ).toBe(true);
  });

  it('stays within the horizon and the iOS limit, soonest first', () => {
    const far = { ...visaDue, statementId: 'far', dueDate: '2027-03-01' };
    expect(planReminders([far], [], settings, morning)).toEqual([]);

    const many = Array.from({ length: 80 }, (_, i) => ({
      ...netflix,
      ruleId: `r${String(i).padStart(2, '0')}`,
      date: '2026-11-20',
    }));
    const planned = planReminders([visaDue], many, settings, morning);
    expect(planned).toHaveLength(MAX_REMINDERS);
    expect(planned[0].id).toBe('due:s-oct:3');
  });
});
