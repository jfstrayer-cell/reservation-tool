# 01 — Data model and availability rules

Status: **draft for JF's review** · 20 November 2026
Pilot: Les Oiseaux de Passage · Stack: TypeScript, PostgreSQL, Google Cloud (Montréal)

This document fixes *what the system knows* and *how it decides a table is free* before any booking code is written. Everything else (guest page, restaurant screen, messages) is built on top of it.

---

## 1. Design principles

1. **No full-time host.** The system runs the book on its own: bookings confirm automatically, guests change and cancel themselves, late tables are released automatically. Staff only check guests in, flag no-shows and add walk-ins or phone bookings.
2. **Never a double booking.** The database itself refuses two bookings on the same table at overlapping times. Application code is not trusted to get this right alone.
3. **Many restaurants from day one.** Every record belongs to one restaurant, and the database enforces that separation (row-level security). The second restaurant is configuration, not rework.
4. **API first.** Every action available on a screen is available through the API, so any AI assistant (and future tools: POS, CRM, reporting) can use it with the restaurant's permission.
5. **Times are stored in UTC and shown in the restaurant's time zone** (America/Toronto for Les Oiseaux), so daylight-saving changes never shift a booking.
6. **Every change is logged.** Bookings keep a history of who changed what and when.

---

## 2. Core entities

| Entity | What it holds | Notes |
|---|---|---|
| **restaurant** | name, address, time zone, default language (fr-CA), Google review link, settings (see §5) | One row per customer restaurant. |
| **service_period** | day of week, opening time, last seating time, closing time | Several per day allowed (e.g. a later second service). |
| **closure** | start date, end date, optional time range, reason | Holidays, private events, renovations. Overrides service periods. |
| **dining_table** | label (e.g. "12"), min seats, max seats, online bookable yes/no, active yes/no | "Online bookable = no" keeps a table for walk-ins only. |
| **table_combination** | set of tables, min seats, max seats | Tables that can be pushed together, e.g. 4 + 5 → 2 to 6 seats. |
| **turn_time_rule** | party size range, duration in minutes, optional day of week | E.g. 1–2 people: 90 min; 3–4: 105 min; 5–6: 120 min. |
| **guest** | name, phone, email, preferred language, marketing consent, created at | Identified by phone or email per restaurant. Not shared between restaurants. |
| **booking** | guest, party size, start, end, status, source, notes, private manage link | See §3 for statuses. End = start + turn time. |
| **booking_table** | booking, table, time range | Which table(s) hold the booking. **The no-overlap rule lives here.** |
| **booking_event** | booking, what happened, who (guest, staff, system, AI), when | Append-only history. |
| **message** | booking, type, channel (email/text), language, scheduled at, sent at, status | Confirmations, reminders, review requests. |
| **staff_member / device** | name, role (owner, staff), personal code, device | Owner sees settings; staff see the day. |

### Sources of a booking
`online` (guest page), `phone` (entered by staff), `walk_in`, `api` (an AI assistant or another tool), later `google` (native Reserve with Google).

---

## 3. Booking statuses

```
            ┌──────────────► cancelled (by guest or restaurant)
            │
confirmed ──┼──► late (grace period passed, table released) ──► seated / no_show
            │
            └──► seated ──► completed
```

| Status | Meaning | Who sets it |
|---|---|---|
| confirmed | Booked, table held. No second confirmation needed. | System on creation |
| late | Guest not checked in after the grace period (default 15 min). The table is released for walk-ins, but staff can still seat the guest. | System |
| seated | Guest arrived and was checked in. | Staff (one tap) |
| completed | Visit over. Triggers the review request. | System at end time, or staff |
| no_show | Guest never came. Feeds the guest's no-show history. | Staff (one tap), or system at end of service for "late" bookings |
| cancelled | Cancelled by the guest (manage link or reply) or by the restaurant. | Guest, staff, API |

---

## 4. How availability is decided

### 4.1 Tables are always assigned — silently
Even when the "table allocation" option is off, the engine quietly assigns each booking to a table or a combination. Staff never have to look at it. This is what makes "no double booking" provable: a simple seat count per time slot would accept, say, three parties of 4 when the room only has two 4-tops.

When the table-allocation option is on, staff simply see and can change the assignment.

### 4.2 The no-overlap guarantee
PostgreSQL refuses any two `booking_table` rows on the same table whose time ranges overlap:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE booking_table
  ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    table_id WITH =,
    tstzrange(starts_at, ends_at + buffer, '[)') WITH &&
  ) WHERE (active);
```

If two guests click the last table at the same second, one booking succeeds and the other is told, instantly, that the time just went; the page then offers the nearest free times. `active` turns false when a booking is cancelled, marked no-show, or released as late.

### 4.3 Finding free times for a date and party size
1. Take the day's service periods, minus closures.
2. Offer start times every **15 minutes** (setting) from opening to last seating.
3. For each start time, compute the end: start + turn time for that party size.
4. Look for a free single table that fits (min ≤ party ≤ max), smallest first, so a 2 doesn't take a 6-top.
5. If none, look for a free combination that fits, smallest first.
6. Respect the optional **pacing limit**: at most N new guests starting in the same 15 minutes, to protect the kitchen.
7. Respect the **online booking cut-off** (e.g. up to 30 minutes before) and the **maximum party size online** (larger groups are invited to call or write, which later leads to the groups option).
8. Tables marked "walk-ins only" are never offered online, but staff can use them.

### 4.4 Walk-ins and phone bookings
- **Walk-in:** one tap → party size → the system suggests the best free table now and seats it. If nothing is free, staff can still seat them on a table of their choice; the screen shows the conflict rather than refusing.
- **Phone booking:** party size, time, name, phone. The guest gets the same confirmation and reminders as an online booking. Target: under 10 seconds.

### 4.5 Late tables and no-shows
At start + grace period (default 15 min) a booking not checked in becomes `late` and its table is released. If the guest arrives, staff seat them on any free table. At the end of service, remaining `late` bookings become `no_show` unless staff changed them.

### 4.6 Guest changes and cancellations
Every confirmation and reminder carries a private link. Until the cut-off, the guest can change the time or party size (re-checked against availability) or cancel. No account, no password.

---

## 5. Les Oiseaux — pilot configuration

Data given by JF on 20 November 2026. Items marked **(assumed)** need confirmation.

**Tables (ground floor, 554):** A1 to A12, **2 seats each (assumed)** — 12 tables × 2 = the stated 24-guest capacity.

**Combinations:**

| Combination | Seats | Note |
|---|---|---|
| A1 + A2 | 3–4 | |
| A4 + A5 | 3–4 | |
| A6 + A7 | 3–4 | **(assumed)** partial use of the A6–A8 group |
| A7 + A8 | 3–4 | **(assumed)** partial use of the A6–A8 group |
| A6 + A7 + A8 | 5–6 | Largest combination |
| A9 + A10 | 3–4 | |
| A11 + A12 | 3–4 | |
| A3 | 1–2 | Stands alone |

**Opening hours:** Sunday–Thursday 17:00–21:00 · Friday–Saturday 17:00–22:00. Whether 21:00/22:00 is the **last seating** or the **closing time** is to confirm.

**Time per table:** 2 h 30 for every party size.

**Maximum party size online:** 6 (decided by JF, 20 Nov. 2026), matching the largest combination (A6 + A7 + A8). For 7 guests or more, the guest page shows no times; it offers the **group request** instead, which leads to the groups workflow (private room 552 or a group at the 554). For the pilot, a group request goes to JF by email; the full groups option comes later.

**Other settings (proposed defaults):**

| Setting | Proposed default | To confirm with |
|---|---|---|
| Interval between start times | 15 min | Julian |
| Buffer between bookings on a table | 10 min | Julian |
| Online cut-off | 30 min before | JF |
| Grace period before "late" | 15 min | Julian |
| Pacing limit | none at first | Guillaume |
| Reminders | 24 h before (email) and 3 h before (email, text later) | JF |
| Review request | 2 h after completed, every guest who came | JF |

**What 2 h 30 means in practice:** each table turns at most about twice a night (e.g. 17:00 and 19:40 with the buffer). On a Friday the room can take roughly 24 guests at the first seating and 24 at the second, about 48 covers at most. That is a business choice, not a technical one; a shorter time for parties of 2 (e.g. 2 h) would add a third possible start on long nights.

## 6. Privacy and retention (Law 25)

- Guest data belongs to the restaurant that collected it and is never shared with other restaurants on the platform.
- Privacy notice on the booking page states what is kept, why, and for how long.
- Proposed retention: guest contact details anonymised after **24 months** without a visit; no-show history kept **12 months**. To be confirmed by JF.
- Marketing consent is separate from booking messages and off by default.
- Data hosted in Google Cloud, Montréal region.

---

## 7. Decisions needed

1. ~~Parties of 7–8~~ — decided: online max 6, larger parties go to the group request.
2. Confirm 2 seats per table, and whether A6+A7 and A7+A8 can be used without A8 or A6.
3. Is 21:00 / 22:00 the last seating or the closing time? Usual closures (holidays)?
4. Interval, buffer, grace period, cut-off and retention periods (JF / Julian).
5. Any table kept for walk-ins only?

Once these are confirmed, Phase 1 code starts: the schema, the availability engine and the tests, including the "200 simultaneous booking attempts, zero double bookings" test.
