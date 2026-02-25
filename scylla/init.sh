#!/bin/bash
set -e

echo "Waiting for ScyllaDB to be ready..."
until cqlsh scylladb -e "describe keyspaces" > /dev/null 2>&1; do
  echo "ScyllaDB is unavailable - sleeping"
  sleep 2
done

echo "ScyllaDB is up - executing init script"
cqlsh scylladb -f /init.cql
echo "Init script executed successfully"
