# Quartermaster

A mobile app for the people who keep a logistics site running: they inspect what comes
through the gate and, later, keep track of where every machine and tool is — **with or
without a connection**. The interface is original 32-bit-style pixel art, designed to
stay readable outdoors.

The app is built as modules. Each module has its own domain rules, tables and screens,
and its records carry their own code prefix:

| Module | Prefix | Status |
|---|---|---|
| **Inspections** — container checklist, photos, signatures, verdict, PDF report | `INS-` | In development |
| **Equipment** — where each machine or tool is: in the warehouse, or reserved by a team or a person | `EQ-` | Planned after v1.0 |

> **Status: in development.** Phase F1 (project setup) is done. The domain rules are
> complete and tested; the backend and the screens come next. See [Roadmap](#roadmap).

## Inspections module: features (planned)

- **Form as data.** The 62 questions live in [`catalog/questions.json`](catalog/questions.json).
  Changing a question is editing that file, not the code.
- **Dry and reefer containers.** Choosing the unit type switches the matching questions on.
- **Pass / Fail / N/A stamps**, with a mandatory note on every failure.
- **Offline first.** Everything is saved on the phone first and synced when there is signal.
- **Two roles.** Inspectors see their own inspections; supervisors see all of them.
  Enforced by row-level security in the database, not by hiding buttons.
- **PDF report** generated on the phone.
- **English and Spanish.**

## Tech stack

| Layer | Choice |
|---|---|
| App | React Native · Expo SDK 58 · Expo Router · TypeScript |
| Domain rules | Plain TypeScript, no framework (`src/inspection/`) |
| Local data | SQLite on the phone |
| Backend | Supabase: PostgreSQL, Auth, Storage, row-level security |
| Tests | Jest (`jest-expo`) |
| CI | GitHub Actions: lint, typecheck, tests |

Everything used is free: open-source libraries, free tiers and OFL fonts.

## Getting started

Requirements: Node.js 24 and the **Expo Go** app on your phone.

```bash
npm install
npm start                # scan the QR code with Expo Go
```

To run the backend on your own free Supabase project:

```bash
cp .env.example .env                  # your project's URL and keys (never commit .env)
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --remote         # applies supabase/migrations
npm run seed                          # loads the invented demo data
npm run test:db                       # access tests against that project
```

In the Supabase dashboard, switch off "Allow new users to sign up": accounts are created
by invitation only.

| Command | What it does |
|---|---|
| `npm start` | Starts the development server |
| `npm test` | Unit tests of the domain rules and the demo data (run by CI) |
| `npm run typecheck` | Type-checks the whole project |
| `npm run lint` | Lints the code |
| `npm run test:db` | Access tests against a real Supabase project: they sign in as temporary users and try what each role must not do |
| `npm run seed` | Loads the demo data; running it again replaces it |
| `npm run gen:catalog` | Writes the catalog migration from `catalog/questions.json` |
| `npm run gen:demo-images` | Redraws the placeholder photos and signatures (Python 3) |

## Project structure

```
quartermaster/
├── src/
│   ├── app/            # screens (Expo Router: one file = one screen)
│   ├── inspection/     # inspection rules: pure TypeScript, no React Native, no Supabase
│   └── demo/           # the invented demo data, used by the seed and the demo mode
├── catalog/            # questions.json: the inspection form as data
├── tests/              # one test file per domain module, one describe per rule
├── tests-db/           # access tests against a real Supabase project (not in CI)
├── supabase/           # database configuration and migrations
├── scripts/            # catalog migration generator and demo seed
├── tools/              # pixel-art generators (sprites and demo images)
├── assets/demo/        # placeholder photos and signatures
└── .github/workflows/  # CI
```

The inspection domain has five files:

| Module | Responsibility |
|---|---|
| `model.ts` | The domain types. No logic |
| `catalog.ts` | Loads the catalog and checks that it is well formed |
| `form.ts` | Visibility, steps, pending problems, completion |
| `review.ts` | Findings, verdict, history, home, report content |
| `sync.ts` | The outbox and the conflict rule for offline sync |

Every function is pure: it receives everything it needs (including "today" and "now")
and returns a new value. That is why the rules are tested without a phone or a server.

## Roadmap

- [x] **F0 · Design** — architecture, open questions, pixel-art mock-up
- [x] **F1 · Setup** — Expo app, domain package with its 102 tests, CI
- [x] **F2 · Backend** — schema, row-level security, write functions, storage rules, access tests, demo seed
- [ ] **F3 · Frontend** — pixel-art kit, form, photos and signatures, directory, history and PDF, offline sync
- [ ] **F4 · Security** — threat model, adversarial access tests, dependency and secret scanning
- [ ] **F5 · Polish and release** — accessibility, Android APK, screenshots (v1.0)
- [ ] **Next module · Equipment** — its own design phase after v1.0

## What I learned

*Written as the project progresses.*

## License

[MIT](LICENSE)
