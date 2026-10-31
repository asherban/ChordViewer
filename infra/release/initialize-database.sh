#!/bin/sh
set -eu
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 \
  --set=migration_password="$MIGRATION_DB_PASSWORD" --set=app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE chordviewer_owner LOGIN PASSWORD :'migration_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE chordviewer_runtime LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER DATABASE chordviewer OWNER TO chordviewer_owner;
REVOKE ALL ON DATABASE chordviewer FROM PUBLIC;
GRANT CONNECT ON DATABASE chordviewer TO chordviewer_owner, chordviewer_runtime;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO chordviewer_owner;
SQL
