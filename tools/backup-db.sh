#!/bin/bash
BACKUP_DIR="/var/lib/werkstatt-terminplaner/backups"
DB_FILE="/var/lib/werkstatt-terminplaner/database/werkstatt.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/auto_${TIMESTAMP}.db"

# Behalte maximal diese Anzahl Backups pro Typ
TAGE_AUTO=10       # Auto-Backups aelter als 10 Tage loeschen
MAX_PRE_UPDATE=10  # letzte 10 Pre-Update-Sicherungen

mkdir -p "$BACKUP_DIR"

# Backup erstellen (SQLite-sicher via .backup-Befehl)
if sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"; then
    echo "$(date): Backup OK -> $BACKUP_FILE"
else
    echo "$(date): Backup FEHLER!" >&2
    exit 1
fi

# Auto-Backups aufraеumen: aelter als TAGE_AUTO Tage loeschen
DELETED_AUTO=$(find "$BACKUP_DIR" -name 'auto_*.db' -mtime +$TAGE_AUTO -print -delete 2>/dev/null | wc -l)
if [ "$DELETED_AUTO" -gt 0 ]; then
    echo "$(date): Auto-Backups bereinigt ($DELETED_AUTO Dateien aelter als $TAGE_AUTO Tage geloescht)"
fi

# Pre-Update-Backups aufraеumen: nur die neuesten MAX_PRE_UPDATE behalten
PRE_FILES=$(ls -t "$BACKUP_DIR"/pre-update_*.db "$BACKUP_DIR"/pre_update_*.db 2>/dev/null)
PRE_COUNT=$(echo "$PRE_FILES" | grep -c . 2>/dev/null || echo 0)
if [ "$PRE_COUNT" -gt "$MAX_PRE_UPDATE" ]; then
    echo "$PRE_FILES" | tail -n +$((MAX_PRE_UPDATE + 1)) | xargs rm -f
    echo "$(date): Pre-Update-Backups bereinigt (behalte $MAX_PRE_UPDATE, geloescht: $((PRE_COUNT - MAX_PRE_UPDATE)))"
fi

# Anzahl verbleibender Backups ausgeben
TOTAL=$(ls "$BACKUP_DIR"/*.db 2>/dev/null | wc -l)
SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
echo "$(date): $TOTAL Backup(s) vorhanden, Gesamtgroesse: $SIZE"
