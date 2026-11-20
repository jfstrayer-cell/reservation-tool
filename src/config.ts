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
  lateGraceMinutes: number;
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
}

export function turnTimeFor(config: RestaurantConfig, partySize: number): number {
  return config.turnTimeMinutes.bySize?.[String(partySize)] ?? config.turnTimeMinutes.default;
}
