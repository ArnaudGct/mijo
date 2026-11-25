CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE CHECK (email = lower(trim(email))),
  password_hash text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (verified_at IS NULL OR (email IS NOT NULL AND password_hash IS NOT NULL))
);
-- Reserve the original notebook before opening registration.
INSERT INTO accounts(id) VALUES ('00000000-0000-4000-8000-000000000001');

DELETE FROM logins;
ALTER TABLE logins ADD COLUMN account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE;
CREATE INDEX logins_account ON logins(account_id);
DROP TABLE login_limit;
CREATE TABLE auth_limits (bucket text PRIMARY KEY, since timestamptz NOT NULL, attempts integer NOT NULL);
CREATE TABLE account_tokens (
  digest text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify','reset')),
  pending_hash text,
  expires timestamptz NOT NULL,
  CHECK ((purpose='verify') = (pending_hash IS NOT NULL))
);
CREATE INDEX account_tokens_owner ON account_tokens(account_id);

ALTER TABLE preps DROP CONSTRAINT preps_recipe_id_fkey, DROP CONSTRAINT preps_version_id_fkey, DROP CONSTRAINT preps_session_id_fkey;
ALTER TABLE meals DROP CONSTRAINT meals_prep_id_fkey;
ALTER TABLE recipe_versions DROP CONSTRAINT recipe_versions_recipe_id_fkey;
ALTER TABLE recipes DROP CONSTRAINT recipes_source_key_key;
DROP INDEX meal_slot;
DROP INDEX item_identity;

DO $$
DECLARE
  t text;
  pk text;
BEGIN
  FOREACH t IN ARRAY ARRAY['recipes','recipe_versions','sessions','preps','meals','stock','prices','items','lots','week_history','preferences'] LOOP
    pk := CASE WHEN t = 'week_history' THEN 'week' ELSE 'id' END;
    EXECUTE format('ALTER TABLE %I ADD COLUMN account_id uuid NOT NULL DEFAULT %L REFERENCES accounts(id)', t, '00000000-0000-4000-8000-000000000001');
    EXECUTE format('ALTER TABLE %I ALTER COLUMN account_id DROP DEFAULT, DROP CONSTRAINT %I, ADD PRIMARY KEY (account_id,%I)', t, t || '_pkey', pk);
  END LOOP;
END $$;

ALTER TABLE recipes ADD UNIQUE(account_id,source_key);
ALTER TABLE recipe_versions ADD FOREIGN KEY (account_id,recipe_id) REFERENCES recipes(account_id,id) ON DELETE CASCADE;
ALTER TABLE preps
  ADD FOREIGN KEY (account_id,recipe_id) REFERENCES recipes(account_id,id),
  ADD FOREIGN KEY (account_id,version_id) REFERENCES recipe_versions(account_id,id),
  ADD FOREIGN KEY (account_id,session_id) REFERENCES sessions(account_id,id);
ALTER TABLE meals ADD FOREIGN KEY (account_id,prep_id) REFERENCES preps(account_id,id);
CREATE UNIQUE INDEX meal_slot ON meals (account_id,(data->>'day'),(data->>'slot'));
CREATE UNIQUE INDEX item_identity ON items (account_id,(data->>'week'),(data->>'key'));
