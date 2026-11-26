import { describe, expect, it } from "vitest";
import { registreId, validateGroupRequest } from "../src/groups.js";

const base = {
  eventDate: "2027-03-12", guestsMin: 20, guestsMax: 25, eventFormat: "souper", drinks: "apportez",
  contactName: "Camille Roy", email: "Camille.Roy@Exemple.ca", consent: true,
};
const ctx = { today: "2027-01-10", zone: "America/Toronto" };

describe("group request form", () => {
  it("accepts a normal request and cleans it", () => {
    const r = validateGroupRequest({ ...base, options: ["gateau", "nope"] }, ctx);
    expect(r.ok).toBe(true);
    expect(r.value?.email).toBe("camille.roy@exemple.ca");
    expect(r.value?.options).toEqual(["gateau"]);
    expect(r.notices).toEqual([]);
  });

  it("requires date, guests, format, drinks, name, email and consent", () => {
    const r = validateGroupRequest({}, ctx);
    expect(Object.keys(r.errors).sort()).toEqual(["consent", "contactName", "drinks", "email", "eventDate", "eventFormat", "guestsMin"].sort());
  });

  it("refuses a past date", () => {
    expect(validateGroupRequest({ ...base, eventDate: "2027-01-01" }, ctx).errors.eventDate).toBeTruthy();
  });

  it("over 40 guests: accepted, with a notice about the room's capacity", () => {
    const r = validateGroupRequest({ ...base, guestsMin: 45, guestsMax: 50 }, ctx);
    expect(r.ok).toBe(true);
    expect(r.notices.join()).toContain("40 convives");
  });

  it("more than three months ahead: notice that the menu comes later", () => {
    const r = validateGroupRequest({ ...base, eventDate: "2027-07-15" }, ctx);
    expect(r.notices.join()).toContain("plus de trois mois");
  });

  it("builds the Registre ID like the Registre does", () => {
    expect(registreId("2027-03-12", "Camille Roy")).toBe("2027-03-12-ROY");
    expect(registreId("2027-03-12", "Élise Côté-Brûlé")).toBe("2027-03-12-BRU");
    expect(registreId("2027-03-12", "Al")).toBe("2027-03-12-ALX");
  });
});
