# Migration Guide

This guide describes how to safely apply database/schema updates for the Werkstatt-Terminplaner.

## 1) Backup Before Any Update

Use a copy of the SQLite DB before running a new version:

```bash
cp backend/database/werkstatt.db backup_$(date +%Y%m%d).db
```

Keep the backup outside the repo if possible.

## 2) Run the New Version

Schema updates are applied automatically at startup by:

- `backend/src/config/database.js`
- `_schema_meta` table tracks the schema version

Start the backend normally:

```bash
./start_server_only.sh
```

Check `logs/backend.log` for messages like:

```
Schema-Version aktuell: X
```

## 3) Rollback (if needed)

Stop the backend and restore the backup:

```bash
./stop_server.sh
cp backup_YYYYMMDD.db backend/database/werkstatt.db
```

Then restart the backend.

## 4) What Changed in 1.3.0

New settings fields are added to `werkstatt_einstellungen` (defaults shown):

- `ki_mode` (TEXT, default `local`)
- `ki_enabled` (INTEGER, default `1`)
- `realtime_enabled` (INTEGER, default `1`)
- `smart_scheduling_enabled` (INTEGER, default `1`)
- `anomaly_detection_enabled` (INTEGER, default `1`)

These columns are added via `ALTER TABLE` with safe defaults.

## 5) Notes

- The production DB lives under `backend/database/werkstatt.db` by default.
- Electron builds can set `DATA_DIR` to point to a custom data directory.
- Do not commit DB files to the repository.
