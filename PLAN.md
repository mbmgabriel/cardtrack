# CardTrack — Build Plan for Claude Code

> Working name: **CardTrack** (rename anytime). A private, offline-first mobile app for tracking every credit card, debit/chequing account, and their transactions, pre-authorized payments, statements and due dates in one place.

---

## 0. How to use this plan with Claude Code

1. Create an empty folder, put this file in it as `PLAN.md`.
2. Start Claude Code in that folder and paste:

```
Read PLAN.md fully. Then build the app phase by phase.
Rules:
- Do ONE phase at a time. At the end of each phase: run typecheck, lint and tests, fix failures,
  tick the phase's checkboxes in PLAN.md, summarize what you did, and STOP for my review.
- Follow the "Conventions" section strictly (money as integer cents, no full card numbers, etc.).
- Use the latest stable Expo SDK and the library versions it recommends (`npx expo install`).
- If something in the plan is unclear or conflicts, ask me before improvising.
Start with Phase 0.
```

3. After each phase, test on your phone with **Expo Go** (scan the QR code), then tell Claude Code "continue to Phase N".

---

## 1. Product summary

**Problem:** People with several cards (e.g., a Visa, an Amex, a store card, a chequing debit card) can't easily see all transactions, pending pre-authorizations, recurring pre-authorized debits (PADs), statement balances and due dates in one place.

**v1 scope (MVP):**
- User adds each account/card separately (name, institution, type, last 4 digits, limit, statement & due dates).
- Under each account: a list of transactions the user enters manually **or imports from a bank CSV**.
- Pre-authorized items: (a) **pending holds** (e.g., gas station / hotel holds) and (b) **recurring pre-authorized payments** (Netflix, gym, insurance PAD).
- Statements: record each statement cycle, closing balance, minimum payment, due date; mark as paid; reconcile.
- Dashboard: total owed, available credit, upcoming due dates, upcoming recurring charges, spending this month.
- Reports: spending by category, by card, by month.
- Reminders: payment due, recurring charge coming up.
- Privacy: everything stored on-device, biometric app lock, export/backup.

**Out of scope for v1:** bank login/aggregation, cloud sync, multi-user, receipt OCR, budgeting envelopes. (Listed in §10 as future.)

**Target users:** Canada first (CAD default, fr-CA ready), works anywhere (multi-currency per account).

---

## 2. Tech stack

| Concern | Choice |
|---|---|
| Framework | **Expo (React Native) + TypeScript (strict)** |
| Navigation | **expo-router** (file-based) |
| Local DB | **expo-sqlite** + **Drizzle ORM** (with drizzle-kit migrations, `useLiveQuery` for reactive lists) |
| Forms & validation | react-hook-form + zod |
| UI | React Native Paper (Material 3) — light/dark theme |
| Charts | victory-native (or react-native-gifted-charts if simpler) |
| Dates | date-fns |
| CSV | papaparse + expo-document-picker + expo-file-system |
| Security | expo-local-authentication (Face ID / fingerprint), expo-secure-store |
| Notifications | expo-notifications (local only) |
| Sharing/export | expo-sharing |
| i18n | i18next + react-i18next (en-CA now, fr-CA strings file stubbed) |
| Tests | Jest + jest-expo + @testing-library/react-native |
| Lint/format | ESLint (expo config) + Prettier |
| Build/publish | **EAS Build + EAS Submit** |

No backend in v1. No network calls except Expo updates.

---

## 3. Conventions (Claude Code must follow)

1. **Money = integer cents** (`amount_cents: number`). Never store floats. Format with `Intl.NumberFormat(locale, { style: 'currency', currency })`.
2. **Sign convention** (from the user's point of view):
   - Negative = money out / debt increases (purchase, fee, interest, cash advance, withdrawal).
   - Positive = money in / debt decreases (refund, payment to card, deposit).
   - Credit account **balance owed** = `-(opening_balance + sum(posted amounts))` shown as a positive "Owed" number.
   - Debit/chequing **balance** = `opening_balance + sum(posted amounts)`.
3. **Never store full card numbers, CVV, PINs, or expiry.** Only `last4` (validate exactly 4 digits). Show a notice in the add-card form.
4. Dates stored as ISO strings `YYYY-MM-DD` (transaction dates) or ISO timestamps (created/updated).
5. IDs: UUID v4 strings (`expo-crypto` `randomUUID`).
6. All DB access goes through `src/db/repositories/*` — screens never write raw SQL.
7. Business logic (balances, due dates, recurrence, CSV parsing, dedupe) lives in pure functions under `src/domain/` with unit tests.
8. Every user-facing string goes through i18n `t()`.
9. Accessibility: labels on all touchables, minimum 44pt touch targets, works with large font sizes.

---

## 4. Data model (SQLite via Drizzle)

### `accounts`
| column | type | notes |
|---|---|---|
| id | text PK | uuid |
| name | text | "TD Aeroplan Visa" |
| institution | text | "TD", "RBC", "Amex", free text |
| type | text | `credit` \| `debit` (chequing) \| `savings` \| `line_of_credit` \| `loan` \| `prepaid` \| `cash` _(a `loan` is owed like a card but has no card details, limit or statement; its monthly payment is a recurring payment)_ |
| network | text null | `visa` \| `mastercard` \| `amex` \| `interac` \| `other` |
| last4 | text null | exactly 4 digits |
| currency | text | default `CAD` |
| color | text | hex for card tile |
| credit_limit_cents | int null | credit / LOC only |
| opening_balance_cents | int | signed, per §3 |
| opening_balance_date | text | |
| statement_day | int null | 1–31 day the statement closes |
| due_day_offset | int null | days after statement close payment is due (e.g., 21) |
| interest_rate_bps | int null | APR in basis points (19.99% = 1999) |
| is_archived | int | 0/1 |
| sort_order | int | |
| created_at / updated_at | text | |

### `transactions`
| column | type | notes |
|---|---|---|
| id | text PK | |
| account_id | text FK | cascade delete (with confirm) |
| date | text | transaction date |
| posted_date | text null | |
| payee | text | merchant |
| amount_cents | int | signed per §3 |
| type | text | `purchase` \| `refund` \| `payment` \| `transfer` \| `fee` \| `interest` \| `cash_advance` \| `deposit` \| `withdrawal` \| `adjustment` |
| status | text | `pending` (pre-auth hold) \| `posted` \| `void` |
| category_id | text FK null | |
| notes | text null | |
| recurring_id | text FK null | created from a recurring rule |
| statement_id | text FK null | assigned to a statement cycle |
| transfer_group_id | text null | links both sides of a card payment from chequing |
| import_batch_id | text FK null | |
| dedupe_hash | text | hash(account_id, date, amount_cents, normalized payee) |
| is_reconciled | int | 0/1 |
| created_at / updated_at | text | |

Indexes: `(account_id, date desc)`, `(category_id)`, `(status)`, `(dedupe_hash)`.

### `categories`
`id, name, icon, color, parent_id null, is_system, sort_order`
Seed: Groceries, Dining, Gas & Transit, Shopping, Bills & Utilities, Subscriptions, Travel, Health, Entertainment, Housing, Insurance, Education, Fees & Interest, Income, Transfers, Other.

### `installment_plans` (instalment plans on a card or line of credit)

`id, account_id, description, principal_cents, months, monthly_cents, monthly_fee_cents, first_payment_date, notes`
— a purchase billed in equal monthly parts (e.g. 12 × $100). The purchase itself is part of the card's balance; the plan only says how it's billed. An instalment counts as paid once its date has passed; the last one takes any rounding.

### `recurring_rules` (pre-authorized payments / subscriptions)
`id, account_id, payee, amount_cents, category_id, frequency (weekly|biweekly|monthly|quarterly|yearly), interval, anchor_date, next_date, end_date null, auto_create (0/1), remind_days_before, is_active, notes`

### `statements`
`id, account_id, period_start, period_end, closing_balance_cents, minimum_payment_cents, due_date, amount_paid_cents, status (open|due|paid|overdue), notes`

### `import_batches`
`id, account_id, file_name, imported_at, row_count, skipped_duplicates`

### `csv_mappings`
`id, institution, name, date_col, date_format, payee_col, amount_col null, debit_col null, credit_col null, invert_sign, has_header`

### `settings` (key/value)
`currency_default, locale, app_lock_enabled, lock_timeout_seconds, theme, first_day_of_week, onboarding_done`

---

## 5. Screens & navigation (expo-router)

```
app/
  _layout.tsx              # theme, i18n, DB init/migrations, app-lock gate
  (onboarding)/index.tsx   # welcome → privacy note → add first account
  (tabs)/
    _layout.tsx            # tabs: Home, Accounts, Activity, Reports, Settings
    index.tsx              # Dashboard
    accounts/index.tsx     # card tiles list (drag to reorder, archived toggle)
    activity.tsx           # all transactions across accounts, search + filters
    reports.tsx
    settings.tsx
  account/[id]/index.tsx   # account detail: header balance/limit/utilization, tabs: Transactions | Pending | Recurring | Statements
  account/[id]/edit.tsx
  account/new.tsx
  transaction/new.tsx      # ?accountId=
  transaction/[id].tsx     # view/edit
  recurring/new.tsx, recurring/[id].tsx
  statement/new.tsx, statement/[id].tsx   # reconcile view
  import/[accountId].tsx   # CSV import wizard
  categories.tsx
  lock.tsx                 # biometric unlock screen
```

**Dashboard widgets:** Total owed (credit), Total cash (debit/savings), Available credit + overall utilization %, Next 3 payment due dates (colored by urgency), Upcoming recurring charges (next 14 days), Pending holds total, This month's spending vs last month.

**Transaction quick-add:** FAB on every list → amount pad first, then payee (autocomplete from history, auto-suggest last category for that payee), account, date (default today), type, status, category. Save in ≤3 taps for repeats.

---

## 6. Build phases

Each phase ends with: `npx tsc --noEmit`, `npm run lint`, `npm test` all green, checkboxes ticked, short summary, **stop for review**.

### Phase 0 — Project setup
- [x] `npx create-expo-app` with TypeScript + expo-router template
- [x] Install all libs from §2 via `npx expo install`
- [x] ESLint, Prettier, Jest (jest-expo) configured; `npm run test|lint|typecheck` scripts
- [x] Folder structure: `src/{db,domain,components,features,i18n,theme,utils}`
- [x] Paper theme (light/dark), i18n with `en-CA.json` + empty `fr-CA.json`
- [x] Git init + `.gitignore`; `README.md` with run instructions
- **Done when:** app runs in Expo Go showing 5 empty tabs.

### Phase 1 — Database & domain core
- [x] Drizzle schema for all tables in §4, migrations, runs on app start
- [x] Seed default categories once
- [x] Repositories: accounts, transactions, categories, recurring, statements, settings
- [x] `src/domain/money.ts` (parse user input → cents, format), `balances.ts` (balance, owed, available credit, utilization), `dates.ts` (statement period for a given date, next due date from `statement_day` + `due_day_offset`, handles short months), `dedupe.ts`
- [x] Unit tests for every domain function (incl. Feb/31st edge cases, negative/positive signs)
- **Done when:** tests ≥ 90% coverage on `src/domain`.

### Phase 2 — Accounts
- [x] Add/edit/archive/delete account (confirm dialog shows # of transactions to be deleted)
- [x] Form fields change by type (limit/statement/due/APR only for credit & LOC)
- [x] last4 validation + "we never store your full card number" notice
- [x] Accounts tab: card-style tiles (color, network, name, ••1234, balance/owed, utilization bar), reorder, show archived _(reorder uses up/down buttons in a Reorder mode; drag-to-reorder not yet built)_
- **Done when:** can create a Visa and a chequing account and see correct opening balances.

### Phase 3 — Transactions
- [x] Quick-add flow (§5), edit, delete, duplicate
- [x] Account detail → Transactions tab: grouped by date, running balance, swipe actions (edit/delete/mark posted) _(swipe actions are also exposed as screen-reader actions)_
- [x] **Pending tab:** pending holds, "mark posted" with optional final amount (holds often differ, e.g., gas $1 → $54.20), "void"
- [x] **Card payment / transfer:** paying the Visa from chequing creates two linked transactions (`transfer_group_id`); editing one updates both _(choose type Payment/Transfer + "your other account" in quick-add; amount, dates, status, notes and category are mirrored; deleting one deletes both; an existing single transaction can't be linked afterwards)_
- [x] Activity tab: all accounts, search (payee/notes/amount), filters (account, category, type, status, date range) _(shows the 500 most recent matches; FlashList in Phase 10)_
- [x] Payee autocomplete + remembered category per payee
- [x] Category management screen _(Settings → Categories)_
- **Done when:** balances on dashboard & tiles update live after any add/edit/delete.

### Phase 4 — Dashboard
- [x] All widgets from §5 using live queries _(spending = purchases + fees + interest − refunds, excluding transfers and void; this month so far is compared with the same days last month; upcoming recurring uses each rule's next date until Phase 5 adds `nextOccurrences`)_
- [x] Tap a widget → filtered list _(pending holds and spending open Activity pre-filtered; balances and available credit open Accounts; a due date or charge opens its account)_
- [x] Empty states that guide the user ("Add your first card")

### Phase 5 — Recurring / pre-authorized payments
- [x] CRUD recurring rules from account detail → Recurring tab _(pause = turn off Active; deleting a rule keeps the transactions it created)_
- [x] Domain: `nextOccurrences(rule, from, to)` with tests _(all dates computed from the anchor, so the 31st → Feb 28 → Mar 31)_
- [x] On app open: for rules with `auto_create`, generate due transactions (status `pending` until user confirms, or `posted` per setting); never double-create (idempotent) _(also runs when the app returns to the foreground and after saving a rule; new rules never back-fill past dates; setting in Settings)_
- [x] "Detect recurring" suggestion: same payee + similar amount ≥3 months → offer to create a rule _(monthly patterns only, ±$2 or 10%, roughly a month apart, seen in the last 45 days; shown on the account's Recurring tab, dismissable)_
- [x] Monthly total of subscriptions shown on dashboard
- **Done when:** a monthly Netflix rule shows on upcoming list and generates exactly one transaction per period.

### Phase 6 — Statements & reminders
- [x] Auto-create an `open` statement per credit account per cycle from `statement_day` _(from the opening-balance cycle, at most 12 back; runs on open/foreground and after saves; statements are only auto-created, so there is no `statement/new` screen)_
- [x] Statement detail: period, transactions in period, computed vs entered closing balance, difference highlighted
- [x] Enter minimum payment & due date (prefilled), record payments (link to card payment transactions), status `paid/overdue` computed _(`transactions.statement_id` marks a **payment toward** that statement; cycle membership is by date. Payments dated after closing and by the due date link automatically; others can be linked by hand. Status: open → due → paid when the balance is paid / overdue after the due date if the minimum isn't)_
- [x] Reconcile mode: checkbox each transaction against the paper/PDF statement; "Reconciled ✓" when difference = 0 _(previous closing balance + ticked posted transactions = statement closing balance)_
- [x] Local notifications: payment due (N days before + day of), recurring charge (remind_days_before), configurable in settings; rescheduled when data changes _(off until turned on in Settings; 9 a.m.; 60-day horizon, max 60 pending for the iOS limit; paid statements stop reminding; "Send a test reminder" in Settings)_
- **Done when:** a credit card with statement day 15 / offset 21 shows correct due date and fires a reminder.

### Phase 7 — CSV import
- [x] Import wizard: pick file → preview first 10 rows → map columns (date, payee, single amount OR debit/credit columns, sign inversion, date format) → save mapping per institution _(account screen → upload icon; unreadable lines such as preambles and totals are skipped and counted, never guessed; unknown files get a best-guess mapping)_
- [x] Preset mappings for common Canadian bank CSV exports (TD, RBC, CIBC, Scotiabank, BMO, Tangerine, Amex Canada) — treat presets as **editable starting points**, the user confirms with the preview
- [x] Dedupe with `dedupe_hash` against existing transactions; show "X new, Y duplicates skipped"
- [x] Auto-categorize by payee history; bulk-edit categories on the review screen _(store numbers and case ignored: "TIM HORTONS #1234" uses the category of "Tim Hortons")_
- [x] Undo an import (delete by `import_batch_id`)
- [x] Unit tests with sample CSV fixtures in `__tests__/fixtures/` _(fixtures are hand-written in each bank's typical layout, not real exports — check presets against real files)_
- **Done when:** importing the same file twice adds zero duplicates.

### Phase 8 — Reports, export & backup
- [x] Reports: spending by category (donut), by month (bar, 12 months), by card, top payees; date range + account filters _(category uses **ranked horizontal bars instead of a donut**: 16 categories are unreadable as donut slices; top 8 + "Other". Charts are plain views (no victory-native/Skia), one validated hue, every value printed or in a table view; rows open Activity pre-filtered; per currency)_
- [x] Export transactions to CSV (filtered) via share sheet _(Activity → "Export CSV" exports all matches of the current filters; text cells are guarded against spreadsheet formulas)_
- [x] Full backup to JSON file (all tables + schema version) and restore (with "this will replace your data" confirm and version migration) _(Settings → Your data; restore is one DB transaction, so a bad file changes nothing; money fields must be integers; schema version = migration count, with an upgrade-step chain for future migrations)_
- [ ] Optional: encrypt backup with a user passphrase _(not done — needs an audited JS crypto library such as @noble/ciphers, since Hermes has no WebCrypto; backup help text says the file is unencrypted)_

### Phase 9 — Security, settings & privacy
- [ ] App lock: Face ID/fingerprint with device passcode fallback; lock after timeout in background; hide app content in app switcher
- [ ] Settings: default currency, locale (en-CA / fr-CA), theme, reminder defaults, lock timeout, manage categories, backup/restore, delete all data
- [ ] In-app privacy page: data stays on device, no tracking, no full card numbers

### Phase 10 — Polish & QA
- [ ] Onboarding (3 screens) + sample-data toggle for demo
- [ ] Accessibility pass (screen reader labels, dynamic type, contrast)
- [ ] fr-CA translation filled in
- [ ] Performance: 10,000 transactions scroll smoothly (FlashList), seeded test
- [ ] Component tests for quick-add, import wizard, statement reconcile
- [ ] Error boundary + friendly error screens

### Phase 11 — Publish
- [ ] App name, icon, splash, bundle IDs (`ca.<yourdomain>.cardtrack`)
- [ ] `eas.json` profiles: development, preview, production
- [ ] Privacy policy page (host on your business website) — no data collected; mention PIPEDA
- [ ] App Store: Apple Developer account (US$99/yr), App Privacy = "Data Not Collected", screenshots, description
- [ ] Google Play: developer account (US$25 one-time), Data safety form, closed testing track (new personal accounts need testers for ~14 days before production)
- [ ] `eas build --platform all --profile production` → `eas submit`
- [ ] Add disclaimer: "Not affiliated with any bank. Not financial advice."

---

## 7. Key business rules (with test cases)

- **Statement period:** statement_day = 15 → period is 16th of previous month to 15th of this month. If statement_day = 31 and month has 30 days → use last day of month.
- **Due date:** period_end + due_day_offset days (Canadian cards: legal minimum grace period is 21 days — use 21 as the default).
- **Available credit:** credit_limit − owed − pending holds.
- **Utilization:** owed ÷ limit (show warning color above 30%).
- **Pending holds** count toward available credit but **not** posted balance.
- **Voided** transactions are excluded from everything but kept for history.
- **Opening balance date:** transactions dated *before* an account's `opening_balance_date` are excluded from its balance (the opening balance already includes them); transactions on that date count. They're still listed and still appear in reports. _(Decided after Phase 1.)_
- **Transfers** between the user's own accounts are excluded from spending reports.
- **Refunds** reduce spending in their category.
- **Multi-currency:** each account has one currency; totals on the dashboard are grouped per currency (no FX conversion in v1).

---

## 8. Monetization options (decide before Phase 11)

- **Free + one-time "Pro" unlock** (e.g., CA$7.99): unlimited accounts (free = 3), CSV import, reports, encrypted backup. Use RevenueCat or expo-in-app-purchases.
- Or **subscription** (CA$1.99/mo) once cloud sync exists.
- Avoid ads in a finance app — hurts trust.

**Decided so far:** a one-time **CardTrack Pro** unlock. First Pro feature: custom card artwork
(any picture as a card's background — artwork only, never a photo of a real card, per §3.3; pictures
stay on the device and aren't in backups). The gate and paywall exist (`pro_unlocked` setting, a
development-only switch); purchases are wired with RevenueCat in Phase 11. Price and which other
features are Pro (accounts limit, CSV import, reports, encrypted backup) are still open.

---

## 9. Definition of done for v1

- All phases 0–11 checked; tests, lint, typecheck green.
- Fresh install → add 3 cards → add/import 50 transactions → see correct balances, due dates, reports, and get a reminder notification.
- App works fully in airplane mode.
- Approved on App Store and Google Play.

---

## 10. Future (v2+)

- Optional encrypted cloud sync + web dashboard (Supabase or your own .NET API) and accounts
- Bank linking through a Canadian-capable aggregator (e.g., Flinks, Plaid) — requires backend, security review and compliance work
- Receipt photo attach + OCR
- Budgets per category, savings goals
- Rewards/points tracking per card (Aeroplan, Scene+, PC Optimum)
- Statement PDF import
- Home-screen widgets (upcoming due dates)
- Shared household accounts
