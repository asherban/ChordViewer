// Better Auth 1.7.5 core schema with database-backed rate limits. Changes are additive,
// reviewed migrations; dependency upgrades do not silently alter populated tables.
export const migrations = [{ id: '001_auth_and_sheets', sql: `
CREATE TABLE "user" (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false, image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE session (
  id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL,
  "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX "session_userId_idx" ON session ("userId");
CREATE TABLE account (
  id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" text, "refreshToken" text, "idToken" text,
  "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz,
  scope text, password text, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL
);
CREATE INDEX "account_userId_idx" ON account ("userId");
CREATE TABLE verification (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "verification_identifier_idx" ON verification (identifier);
CREATE TABLE "rateLimit" (id text PRIMARY KEY, key text NOT NULL UNIQUE, count integer NOT NULL, "lastRequest" bigint NOT NULL);
CREATE TABLE lead_sheets (
  id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  score jsonb NOT NULL CHECK (jsonb_typeof(score)='object' AND score->>'id'=id::text),
  tutorial_url text, revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_sheets_owner_updated ON lead_sheets (owner_id, updated_at DESC, id);
` }, { id: '002_library_metadata', sql: `
ALTER TABLE lead_sheets ADD COLUMN favorite boolean NOT NULL DEFAULT false;
ALTER TABLE lead_sheets ADD COLUMN draft boolean NOT NULL DEFAULT false;
ALTER TABLE lead_sheets ADD COLUMN trashed_at timestamptz;
ALTER TABLE lead_sheets ADD COLUMN opened_at timestamptz;
CREATE INDEX lead_sheets_owner_active ON lead_sheets (owner_id, trashed_at, opened_at DESC NULLS LAST, updated_at DESC, id);
` }];
