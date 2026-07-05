#!/bin/bash
set -e

# Start original PostgreSQL entrypoint
/usr/local/bin/docker-entrypoint.sh postgres &

echo "Waiting for PostgreSQL..."

until pg_isready -h localhost -U "${POSTGRES_USER}"; do
    sleep 2
done

echo "PostgreSQL Started"

liquibase \
  --defaults-file=/opt/liquibase/migrations/liquibase.properties \
  update

echo "Liquibase Completed"

wait