-- 003 — Group requests for the private room at 552 Duluth (11 guests and more).
-- Mirrors the first columns of the "Registre des groupes 552" so a request can be copied there as is.
CREATE TABLE group_request (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  registre_id    text NOT NULL,                 -- AAAA-MM-JJ-XXX, as in the Registre
  status         text NOT NULL DEFAULT 'demande' CHECK (status IN ('demande', 'traitee', 'archivee')),
  event_date     date NOT NULL,
  alternate_date date,
  arrival_time   time,
  guests_min     smallint NOT NULL CHECK (guests_min >= 1),
  guests_max     smallint NOT NULL CHECK (guests_max >= guests_min),
  occasion       text,
  event_format   text NOT NULL CHECK (event_format IN ('souper', 'cocktail', 'traiteur', 'concert', 'autre')),
  drinks         text NOT NULL CHECK (drinks IN ('apportez', 'service', 'a_discuter')),
  options        text[] NOT NULL DEFAULT '{}',
  dietary_notes  text,
  message        text,
  contact_name   text NOT NULL CHECK (length(btrim(contact_name)) > 0),
  organisation   text,
  email          text NOT NULL,
  phone          text,
  language       text NOT NULL DEFAULT 'fr',
  consent        boolean NOT NULL,
  source         text NOT NULL DEFAULT 'formulaire web',  -- or 'téléphone (personnel)'
  created_at     timestamptz NOT NULL DEFAULT now(),
  handled_at     timestamptz,
  handled_by     text
);
CREATE INDEX group_request_restaurant_created ON group_request (restaurant_id, created_at DESC);
ALTER TABLE group_request ENABLE ROW LEVEL SECURITY;
CREATE POLICY same_restaurant ON group_request USING (restaurant_id = current_setting('app.restaurant_id', true)::uuid);
