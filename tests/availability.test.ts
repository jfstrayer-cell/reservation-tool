import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import fs from "node:fs";
import { findSlots, Hold } from "../src/availability.js";
import { RestaurantConfig } from "../src/config.js";

const config: RestaurantConfig = JSON.parse(fs.readFileSync("config/les-oiseaux.json", "utf8"));
const zone = config.restaurant.timeZone;
const at = (iso: string) => DateTime.fromISO(iso, { zone }).toJSDate();
const local = (d: Date) => DateTime.fromJSDate(d, { zone }).toFormat("HH:mm");

const FRIDAY = "2027-01-15";
const SUNDAY = "2027-01-17";
const LONG_BEFORE = { now: at("2027-01-01T12:00"), channel: "online" as const };

function slots(date: string, party: number, holds: Hold[] = [], opts: { now: Date; channel: "online" | "staff" } = LONG_BEFORE) {
  const r = findSlots(config, date, party, holds, opts);
  if (r.kind !== "slots") throw new Error(`expected slots, got ${r.kind}`);
  return r.slots;
}

describe("start times", () => {
  it("Friday: every 15 min from 17:00 to last seating 22:00", () => {
    const s = slots(FRIDAY, 2);
    expect(s.length).toBe(21);
    expect(local(s[0].start)).toBe("17:00");
    expect(local(s.at(-1)!.start)).toBe("22:00");
  });

  it("Sunday: 17:00 to last seating 21:00", () => {
    const s = slots(SUNDAY, 2);
    expect(s.length).toBe(17);
    expect(local(s.at(-1)!.start)).toBe("21:00");
  });

  it("a booking lasts 2 h 30", () => {
    const s = slots(FRIDAY, 2)[0];
    expect(local(s.end)).toBe("19:30");
    expect(local(s.heldUntil)).toBe("19:40"); // + 10 min buffer
  });

  it("closure days have no times", () => {
    const closed = { ...config, closures: [{ startsOn: "2027-01-15", endsOn: "2027-01-16" }] };
    expect(findSlots(closed, FRIDAY, 2, [], LONG_BEFORE).kind).toBe("closed");
  });

  it("daylight saving day keeps local times right", () => {
    const s = slots("2027-03-14", 2); // clocks go forward that night in Montréal
    expect(local(s[0].start)).toBe("17:00");
    expect(s[0].start.toISOString()).toBe("2027-03-14T21:00:00.000Z"); // EDT = UTC-4
  });
});

describe("party size and table choice", () => {
  it("7 or more online goes to the group request", () => {
    expect(findSlots(config, FRIDAY, 7, [], LONG_BEFORE)).toEqual({ kind: "group_request", reason: "party_too_large" });
  });

  it("a party of 2 gets a single table, never a combination", () => {
    expect(slots(FRIDAY, 2)[0].tables).toEqual(["A1"]);
  });

  it("a party of 3 or 4 gets the smallest 4-seat combination", () => {
    expect(slots(FRIDAY, 3)[0].tables).toEqual(["A1", "A2"]);
    expect(slots(FRIDAY, 4)[0].tables).toEqual(["A1", "A2"]);
  });

  it("a party of 5 or 6 gets A6 + A7 + A8", () => {
    expect(slots(FRIDAY, 5)[0].tables).toEqual(["A6", "A7", "A8"]);
    expect(slots(FRIDAY, 6)[0].tables).toEqual(["A6", "A7", "A8"]);
  });

  it("when A1 is taken, a party of 4 moves to the next combination", () => {
    const holds: Hold[] = [{ table: "A1", start: at(`${FRIDAY}T17:00`), heldUntil: at(`${FRIDAY}T19:40`) }];
    expect(slots(FRIDAY, 4, holds)[0].tables).toEqual(["A4", "A5"]);
  });

  it("a party of 6 has no time when A7 is taken", () => {
    const holds: Hold[] = [{ table: "A7", start: at(`${FRIDAY}T17:00`), heldUntil: at(`${FRIDAY}T23:00`) }];
    expect(slots(FRIDAY, 6, holds)).toEqual([]);
  });
});

describe("held tables", () => {
  const fullAt19: Hold[] = config.tables.map((t) => ({ table: t.label, start: at(`${FRIDAY}T19:00`), heldUntil: at(`${FRIDAY}T21:40`) }));

  it("a full room at 19:00 blocks every start that would overlap", () => {
    const times = slots(FRIDAY, 2, fullAt19).map((s) => local(s.start));
    expect(times).not.toContain("19:00");
    expect(times).not.toContain("17:00"); // 17:00 + 2 h 40 runs into 19:00
    expect(times).toEqual(["21:45", "22:00"]);
  });

  it("a hold ending exactly at a start does not block it", () => {
    const holds: Hold[] = config.tables.map((t) => ({ table: t.label, start: at(`${FRIDAY}T17:00`), heldUntil: at(`${FRIDAY}T19:45`) }));
    expect(slots(FRIDAY, 2, holds).map((s) => local(s.start))[0]).toBe("19:45");
  });
});

describe("online cut-off", () => {
  it("online guests can't book less than 30 min ahead", () => {
    const s = slots(FRIDAY, 2, [], { now: at(`${FRIDAY}T18:00`), channel: "online" });
    expect(local(s[0].start)).toBe("18:30");
  });

  it("staff can still book right away", () => {
    const s = slots(FRIDAY, 2, [], { now: at(`${FRIDAY}T18:00`), channel: "staff" });
    expect(local(s[0].start)).toBe("18:00");
  });
});
