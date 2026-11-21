#!/bin/sh
set -eu
dest=${1:?Indiquez le dossier de la sauvegarde locale}
(cd "$dest" && shasum -a 256 -c SHA256SUMS)
tar -tzf "$dest/media.tar.gz" >/dev/null
test_db="table_restore_$(date +%s)_$$"
docker compose exec -T db createdb -U table "$test_db"
trap 'docker compose exec -T db dropdb -U table "$test_db"' EXIT
docker compose exec -T db pg_restore --exit-on-error --single-transaction --no-owner -U table -d "$test_db" < "$dest/table.dump"
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U table -d "$test_db" -c 'select (select count(*) from recipes) as recettes, (select count(*) from recipe_versions) as versions, (select count(*) from preps) as preparations, (select count(*) from meals) as repas, revision from preferences'
