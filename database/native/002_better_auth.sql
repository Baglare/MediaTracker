-- Better Auth 1.7.7 core schema, pg adapter, UUID generation. Fresh DB only.
BEGIN;
SET LOCAL ROLE mt_auth_owner;
CREATE TABLE native_auth."user" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  email text NOT NULL UNIQUE, "emailVerified" boolean NOT NULL DEFAULT false,
  image text, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE native_auth.session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE, "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(), "ipAddress" text, "userAgent" text,
  "userId" uuid NOT NULL REFERENCES native_auth."user"(id) ON DELETE CASCADE
);
CREATE INDEX session_user_idx ON native_auth.session("userId");
CREATE TABLE native_auth.account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "accountId" text NOT NULL, "providerId" text NOT NULL,
  "userId" uuid NOT NULL REFERENCES native_auth."user"(id) ON DELETE CASCADE,
  "accessToken" text, "refreshToken" text, "idToken" text,
  "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz,
  scope text, password text, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_user_idx ON native_auth.account("userId");
CREATE UNIQUE INDEX account_provider_idx ON native_auth.account("providerId", "accountId");
CREATE TABLE native_auth.verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), identifier text NOT NULL, value text NOT NULL,
  "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_identifier_idx ON native_auth.verification(identifier);
CREATE TABLE native_auth."rateLimit" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE,
  count integer NOT NULL, "lastRequest" bigint NOT NULL
);
REVOKE ALL ON ALL TABLES IN SCHEMA native_auth FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA native_auth TO mt_auth_access;
RESET ROLE;
COMMIT;
-- Auth adapter must inspect all sessions to authenticate: these private tables
-- are NOT business owner-RLS tables. Only the trusted server runtime has DML.
-- No role/admin/user_metadata columns; auth profile input cannot grant privilege.
