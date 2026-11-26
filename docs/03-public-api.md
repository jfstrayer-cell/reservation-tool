# 03 — Two journeys: staff and guests

The tool has two separate front doors. They share the same engine and the same database, but not the same screens or rules.

| | Staff (restaurant) | Guest (or their AI assistant) |
|---|---|---|
| Where | `/staff` on the restaurant's tablet or phone, behind the team code | `/reserver`, opened from Google Maps, lesoiseaux.ca or social media |
| Who | Whoever greets walk-ins or answers the phone | The guest, or an assistant acting for them |
| Tonight | Walk-in in one tap; phone booking for tonight | Book tonight up to 30 minutes before |
| Another date | Phone booking with "Demain" or any date | Any date |
| Contact | A name is enough | Name plus an email or a phone (to confirm and reach them) |
| Party size | 1 to 10; 11+ opens the staff group form | 1 to 10; 11+ links to `/groupes` |
| Groups (11+) | `/staff/groupes/nouvelle`: same questions, a phone number is enough | `/groupes`: public group request form |
| Late guests | "En retard" at 15 min, "Absent ?" at 60 min, staff decide | Never told their table is lost |
| Change / cancel | From the day view | Private link: `/reservation/<token>` |

## For AI assistants

The guest page can be prefilled from a link:

```
/reserver?date=2026-12-04&personnes=4&heure=19:00
```

The page also publishes schema.org `Restaurant` data with a `ReserveAction` using that URL template.

### Public endpoints

`GET /api/public/availability?date=YYYY-MM-DD&party=N`

```json
{ "date": "2026-12-04", "party": 4, "timeZone": "America/Toronto",
  "times": [ { "start": "2026-12-04T22:00:00.000Z", "time": "17:00" } ] }
```
Parties of 11 or more get `"groupRequest": { "url": "/groupes" }` instead of times; closed days get `"closed": true`.

`POST /api/public/bookings`

```json
{ "start": "2026-12-04T22:00:00.000Z", "partySize": 4, "name": "Camille Roy",
  "email": "camille@exemple.ca", "phone": "", "notes": "", "language": "fr" }
```
Name and an email or phone are required. Only times returned by the availability endpoint are accepted.
Answer: `201 { "ok": true, "start": "...", "partySize": 4, "manageUrl": "https://…/reservation/<token>" }`;
`409` if the time was just taken.

`GET /api/public/bookings/<token>` returns the booking; `POST /api/public/bookings/<token>/cancel` cancels it (before its time).

`POST /api/groups` takes a group request (fields in `src/groups.ts`).

All public endpoints are rate-limited. An MCP server for assistants comes later (workplan, stage B).
