#!/bin/sh
set -eu
umask 077
dest="data/private/backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$dest"
docker compose exec -T db pg_dump -U table -d table -Fc --exclude-table-data=logins --exclude-table-data=login_limit > "$dest/table.dump.partial"
docker compose exec -T app tar -C /data/media -czf - . > "$dest/media.tar.gz.partial"
mv "$dest/table.dump.partial" "$dest/table.dump"
mv "$dest/media.tar.gz.partial" "$dest/media.tar.gz"
(cd "$dest" && shasum -a 256 table.dump media.tar.gz > SHA256SUMS)
echo "Sauvegarde : $dest"
