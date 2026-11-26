// Shape of a restaurant's configuration (see config/les-oiseaux.json).

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface ServicePeriod {
  days: Weekday[];
  opens: string;       // "HH:mm", local time
  lastSeating: string; // "HH:mm", local time, inclusive
}

export interface TableConfig {
  label: string;
  minSeats: number;
  maxSeats: number;
  onlineBookable?: boolean; // default true
}

export interface CombinationConfig {
  tables: string[];
  minSeats: number;
  maxSeats: number;
}

export interface RestaurantSettings {
  maxPartySizeOnline: number;
  slotIntervalMinutes: number;
  bufferMinutes: number;
  onlineCutoffMinutes: number;
  lateBadgeMinutes: number;     // "En retard" shown after this many minutes
  noShowPromptMinutes: number;  // staff asked "Absent ?" after this many minutes; never automatic
  largerPartiesRedirect?: { type: "group_request"; minPartySize: number; url: string | null; fallbackEmail?: string };
  pacingLimitPer15Min: number | null;
  remindersHoursBefore: number[];
  reviewRequestHoursAfter: number;
}

export interface RestaurantConfig {
  restaurant: { name: string; address?: string; timeZone: string; defaultLanguage: string };
  servicePeriods: ServicePeriod[];
  closures?: { startsOn: string; endsOn: string; reason?: string }[];
  tables: TableConfig[];
  combinations: CombinationConfig[];
  turnTimeMinutes: { default: number; bySize?: Record<string, number> };
  settings: RestaurantSettings;
  brand?: { logo?: string; fontHeading?: string; colorInk?: string; colorText?: string; colorBackground?: string };
}

export function turnTimeFor(config: RestaurantConfig, partySize: number): number {
  return config.turnTimeMinutes.bySize?.[String(partySize)] ?? config.turnTimeMinutes.default;
}
