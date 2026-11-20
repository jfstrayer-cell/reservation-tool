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
| `tests/` | Engine tests and database tests (200 simultaneous bookings) |

## Running the tests

```bash
npm install
npm test                                   # engine tests
DATABASE_URL=postgres://… npm test         # + database tests (PostgreSQL 16)
```

Every pull request runs the full suite automatically (GitHub Actions).

## Stack

TypeScript · PostgreSQL · Google Cloud (Montréal). See the development workplan for the reasoning.
