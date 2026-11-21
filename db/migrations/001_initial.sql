CREATE TABLE preferences (id smallint PRIMARY KEY CHECK(id=1), revision integer NOT NULL DEFAULT 0, data jsonb NOT NULL DEFAULT '{}');
INSERT INTO preferences(id) VALUES(1);
CREATE TABLE recipes (id uuid PRIMARY KEY, data jsonb NOT NULL, source_key text GENERATED ALWAYS AS (data->>'sourceKey') STORED UNIQUE);
CREATE TABLE recipe_versions (id uuid PRIMARY KEY, recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, data jsonb NOT NULL);
CREATE TABLE sessions (id uuid PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE preps (id uuid PRIMARY KEY, data jsonb NOT NULL,
 recipe_id uuid GENERATED ALWAYS AS ((data->>'recipeId')::uuid) STORED REFERENCES recipes(id),
 version_id uuid GENERATED ALWAYS AS ((data->>'version')::uuid) STORED REFERENCES recipe_versions(id),
 session_id uuid GENERATED ALWAYS AS ((data->>'session')::uuid) STORED REFERENCES sessions(id));
CREATE TABLE meals (id uuid PRIMARY KEY, data jsonb NOT NULL, prep_id uuid GENERATED ALWAYS AS ((data->>'prepId')::uuid) STORED REFERENCES preps(id));
CREATE UNIQUE INDEX meal_slot ON meals ((data->>'day'),(data->>'slot'));
CREATE TABLE stock (id uuid PRIMARY KEY,data jsonb NOT NULL);
CREATE TABLE prices (id uuid PRIMARY KEY,data jsonb NOT NULL);
CREATE TABLE items (id uuid PRIMARY KEY,data jsonb NOT NULL);
CREATE UNIQUE INDEX item_identity ON items ((data->>'week'),(data->>'key'));
CREATE TABLE logins (token_hash text PRIMARY KEY, expires timestamptz NOT NULL);
CREATE TABLE login_limit (id smallint PRIMARY KEY CHECK(id=1), since timestamptz NOT NULL, attempts integer NOT NULL);
CREATE TABLE week_history (week date PRIMARY KEY, data jsonb NOT NULL);
