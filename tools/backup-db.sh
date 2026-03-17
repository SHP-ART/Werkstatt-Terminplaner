#!/bin/bash
BACKUP_DIR="/var/lib/werkstatt-terminplaner/backups"
DB_FILE="/var/lib/werkstatt-terminplaner/database/werkstatt.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/auto_${TIMESTAMP}.db"

mkdir -p "$BACKUP_DIR"

# Backup erstellen (SQLite-sicher via .backup-Befehl)
if sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"; then
    echo "$(date): Backup OK -> $BACKUP_FILE"
else
    echo "$(date): Backup FEHLER!" >&2
    exit 1
fi

# Alte Auto-Backups loeschen (aelter als 7 Tage)
find "$BACKUP_DIR" -name 'auto_*.db' -mtime +7 -delete

# Anzahl verbleibender Backups
COUNT=$(ls "$BACKUP_DIR"/auto_*.db 2>/dev/null | wc -l)
echo "$(date): $COUNT Auto-Backup(s) vorhanden"
