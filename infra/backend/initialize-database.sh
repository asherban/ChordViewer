#!/bin/sh
set -eu

# The API owns its database schema but cannot administer PostgreSQL or other databases.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 \
  --set=app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE chordviewer LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER DATABASE chordviewer OWNER TO chordviewer;
REVOKE ALL ON DATABASE chordviewer FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
