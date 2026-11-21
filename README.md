# reservation-tool

Low-cost, autonomous table-booking tool for small restaurants (20–40 seats, no full-time host).
Pilot: **Les Oiseaux de Passage**, Montréal. A Mixed-Methods project.

## Where things are

| Path | What |
|---|---|
| `docs/01-data-model-and-availability.md` | Data model, booking statuses, availability rules |
| `config/les-oiseaux.json` | Pilot configuration: tables, combinations, hours, settings |
| `db/migrations/` | PostgreSQL schema, including the no-double-booking constraint |
| `src/availability.ts` | Availability engine (pure functions) |
| `src/bookings.ts` | Creating and releasing bookings safely |
| `app/staff/` | Restaurant screen (French): day view, check-in, walk-ins, phone bookings |
| `app/api/staff/` | Staff API used by the screen (and later by AI assistants) |
| `tests/` | Engine tests and database tests (200 simultaneous bookings) |

## Running the tests

```bash
npm install
npm test                                   # engine tests
DATABASE_URL=postgres://… npm test         # + database tests (PostgreSQL 16)
```

Every pull request runs the full suite automatically (GitHub Actions).

## Running the restaurant screen locally

```bash
cp .env.example .env.local   # set DATABASE_URL, STAFF_PIN, SESSION_SECRET
npm run seed                 # creates the tables and loads config/les-oiseaux.json
npm run dev                  # http://localhost:3000/staff
```

## Stack

TypeScript · PostgreSQL · Google Cloud (Montréal). See the development workplan for the reasoning.
