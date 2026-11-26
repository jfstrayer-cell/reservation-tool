-- 002 — A phone booking needs only a name: phone and email become optional (JF, 25 Nov. 2026).
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'guest'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%phone%email%'
  LOOP
    EXECUTE format('ALTER TABLE guest DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE guest ADD CONSTRAINT guest_name_not_blank CHECK (length(btrim(name)) > 0);
