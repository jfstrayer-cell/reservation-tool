-- 001 — Core schema: restaurants, tables, bookings, and the no-double-booking guarantee.
-- See docs/01-data-model-and-availability.md.

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE restaurant (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL UNIQUE,
  name             text NOT NULL,
  time_zone        text NOT NULL,
  default_language text NOT NULL DEFAULT 'fr-CA',
  settings         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE service_period (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  weekday       smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7), -- ISO: 1 = Monday, 7 = Sunday
  opens         time NOT NULL,
  last_seating  time NOT NULL,
  CHECK (last_seating >= opens)
);

CREATE TABLE closure (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  starts_on     date NOT NULL,
  ends_on       date NOT NULL,
  reason        text,
  CHECK (ends_on >= starts_on)
);

CREATE TABLE dining_table (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  label           text NOT NULL,
  min_seats       smallint NOT NULL CHECK (min_seats >= 1),
  max_seats       smallint NOT NULL,
  online_bookable boolean NOT NULL DEFAULT true,
  active          boolean NOT NULL DEFAULT true,
  UNIQUE (restaurant_id, label),
  CHECK (max_seats >= min_seats)
);

CREATE TABLE table_combination (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  min_seats     smallint NOT NULL,
  max_seats     smallint NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  CHECK (max_seats >= min_seats)
);

CREATE TABLE table_combination_member (
  combination_id uuid NOT NULL REFERENCES table_combination(id) ON DELETE CASCADE,
  table_id       uuid NOT NULL REFERENCES dining_table(id) ON DELETE CASCADE,
  PRIMARY KEY (combination_id, table_id)
);

CREATE TABLE guest (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  name              text NOT NULL,
  phone             text,
  email             text,
  language          text,
  marketing_consent boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE TYPE booking_status AS ENUM ('confirmed', 'late', 'seated', 'completed', 'no_show', 'cancelled');
CREATE TYPE booking_source AS ENUM ('online', 'phone', 'walk_in', 'api', 'google');

CREATE TABLE booking (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  guest_id      uuid REFERENCES guest(id) ON DELETE SET NULL, -- walk-ins may have no guest record
  party_size    smallint NOT NULL CHECK (party_size BETWEEN 1 AND 50),
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  status        booking_status NOT NULL DEFAULT 'confirmed',
  source        booking_source NOT NULL,
  notes         text,
  manage_token  text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX booking_restaurant_day ON booking (restaurant_id, starts_at);

-- Which table(s) hold a booking. held_until = booking end + buffer.
-- THE GUARANTEE: no two active holds on the same table may overlap in time.
CREATE TABLE booking_table (
  booking_id    uuid NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  table_id      uuid NOT NULL REFERENCES dining_table(id),
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  starts_at     timestamptz NOT NULL,
  held_until    timestamptz NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  PRIMARY KEY (booking_id, table_id),
  CHECK (held_until > starts_at),
  CONSTRAINT no_double_booking EXCLUDE USING gist (
    table_id WITH =,
    tstzrange(starts_at, held_until, '[)') WITH &&
  ) WHERE (active)
);

-- Append-only history of every change.
CREATE TABLE booking_event (
  id            bigserial PRIMARY KEY,
  booking_id    uuid NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  kind          text NOT NULL,   -- created, changed, cancelled, seated, late, no_show, completed…
  actor         text NOT NULL,   -- guest, staff:<id>, system, api:<client>
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  at            timestamptz NOT NULL DEFAULT now()
);

-- Separation between restaurants (row-level security).
-- The application connects with a non-owner role and sets app.restaurant_id per request;
-- rows of other restaurants are then invisible. Migrations and tests run as owner.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['service_period','closure','dining_table','table_combination',
                           'guest','booking','booking_table','booking_event'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY same_restaurant ON %I USING (restaurant_id = current_setting(''app.restaurant_id'', true)::uuid)', t);
  END LOOP;
END $$;
