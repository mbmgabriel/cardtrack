# CardTrack

A private, offline-first mobile app for tracking credit cards, debit/chequing accounts, transactions, pre-authorized payments, statements and due dates. All data stays on the device.

See [PLAN.md](PLAN.md) for the full product spec and build phases.

## Requirements

- Node.js 22+
- The **Expo Go** app on your phone (App Store / Google Play), or an iOS Simulator / Android Emulator

## Getting started

```bash
npm install
npm start
```

Scan the QR code with your phone's camera (iOS) or the Expo Go app (Android). Your phone and computer must be on the same network; if they aren't, run `npx expo start --tunnel`.

Press `i` or `a` in the terminal to open the iOS Simulator or Android Emulator instead.

## Scripts

| Command                 | What it does                           |
| ----------------------- | -------------------------------------- |
| `npm start`             | Start the Expo dev server              |
| `npm run typecheck`     | TypeScript check (`tsc --noEmit`)      |
| `npm run lint`          | ESLint (Expo config + Prettier)        |
| `npm run format`        | Format all files with Prettier         |
| `npm test`              | Run Jest tests                         |
| `npm run test:coverage` | Run tests with a coverage report       |
| `npm run db:generate`   | Create a migration from schema changes |

Add libraries with `npx expo install <package>` so versions stay compatible with the Expo SDK.

## Project structure

```
src/
  app/          # expo-router screens (file-based routes)
    (tabs)/     # Home, Accounts, Activity, Reports, Settings
  components/   # shared UI components
  db/           # SQLite schema, migrations, repositories (Phase 1)
  domain/       # pure business logic: money, balances, dates, dedupe (Phase 1)
  features/     # feature-specific components and hooks
  i18n/         # i18next setup and locale files (en-CA, fr-CA)
  theme/        # React Native Paper (Material 3) light/dark themes
  utils/        # helpers, incl. test-utils for component tests
__tests__/      # Jest tests
```

## Database

SQLite on the device via expo-sqlite + Drizzle ORM. The schema is in `src/db/schema.ts`.

1. Edit the schema.
2. Run `npm run db:generate` — this writes a new SQL migration into `drizzle/`. Commit it.
3. The app applies pending migrations on launch, then seeds the built-in categories.

Screens use the repositories in `src/db/repositories/` (via `repos` from `@/db`), never SQL directly.
Repository tests run against an in-memory SQLite (better-sqlite3) with the real migrations applied.

## Conventions

Money is always stored as integer cents, full card numbers are never stored (last 4 digits only), and every user-facing string goes through i18n. See PLAN.md §3 for the full list.
