#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SERVER=${DEPLOY_SERVER:-root@100.124.168.108}
APP_DIR=${DEPLOY_APP_DIR:-/opt/werkstatt-terminplaner}
DATA_DIR=${DEPLOY_DATA_DIR:-/var/lib/werkstatt-terminplaner}
BRANCH=${DEPLOY_BRANCH:-master}
DRY_RUN=${DRY_RUN:-0}

log() {
  echo "[deploy] $*"
}

for command in git node npm ssh scp; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Fehlt: $command" >&2
    exit 1
  }
done

cd "$ROOT"
if [[ $(git branch --show-current) != "$BRANCH" ]]; then
  echo "Aktueller Branch ist nicht $BRANCH" >&2
  exit 1
fi
if [[ -n $(git status --porcelain) ]]; then
  echo "Arbeitsbaum ist nicht sauber" >&2
  git status --short
  exit 1
fi

HEAD=$(git rev-parse HEAD)
log "Deploy-Kandidat $HEAD auf $BRANCH"
log "Backend-Tests"
(cd backend && npm test)
log "Frontend-Tests und Build"
(cd frontend && npm test && npm run build)
log "Tablet-Tests und Syntax"
(cd electron-intern-tablet && node --test tests/zettel-board.test.js && node --check main.js && node --check preload.js)

JS_ASSETS=("$ROOT"/frontend/dist/assets/main-*.js)
CSS_ASSETS=("$ROOT"/frontend/dist/assets/main-*.css)
if [[ ${#JS_ASSETS[@]} -ne 1 || ${#CSS_ASSETS[@]} -ne 1 || ! -f ${JS_ASSETS[0]} || ! -f ${CSS_ASSETS[0]} ]]; then
  echo "Erwartet genau ein main-*.js und ein main-*.css in frontend/dist/assets" >&2
  exit 1
fi

if [[ $DRY_RUN == 1 ]]; then
  log "Dry-Run erfolgreich; keine Push-, Server- oder Datenbankänderung"
  exit 0
fi

log "Push $BRANCH"
git push origin "$BRANCH"

log "Server-Preflight"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$SERVER" "test -d '$APP_DIR' && systemctl is-active werkstatt-terminplaner && curl -fsS http://localhost:3001/api/health"

log "Produktiv-Backup mit WAL-Checkpoint"
ssh -o BatchMode=yes "$SERVER" "DATA_DIR='$DATA_DIR' APP_DIR='$APP_DIR' node -" <<'REMOTE_BACKUP'
const fs = require('fs');
const path = require('path');
const sqlite3 = require(path.join(process.env.APP_DIR, 'backend', 'node_modules', 'sqlite3')).verbose();
const source = path.join(process.env.DATA_DIR, 'database', 'werkstatt.db');
const backup = path.join(
  process.env.DATA_DIR,
  'backups',
  `pre-deploy-${new Date().toISOString().replace(/[:.]/g, '-')}.db`
);
fs.mkdirSync(path.dirname(backup), { recursive: true });
const db = new sqlite3.Database(source);
db.exec('PRAGMA wal_checkpoint(TRUNCATE)', error => {
  if (error) throw error;
  db.close(closeError => {
    if (closeError) throw closeError;
    fs.copyFileSync(source, backup);
    console.log(`BACKUP_OK ${backup}`);
  });
});
REMOTE_BACKUP

log "Frontend-Upload"
scp "${JS_ASSETS[0]}" "$SERVER:$APP_DIR/frontend/dist/assets/"
scp "${CSS_ASSETS[0]}" "$SERVER:$APP_DIR/frontend/dist/assets/"
scp "$ROOT/frontend/dist/index.html" "$SERVER:$APP_DIR/frontend/dist/"

log "Backend-Pull und Restart"
ssh -o BatchMode=yes "$SERVER" "cd '$APP_DIR' && if [[ -n \$(git status --porcelain) ]]; then git stash push -m 'pre-deploy-script'; fi && git pull --ff-only origin '$BRANCH' && systemctl restart werkstatt-terminplaner"

log "Warte auf Health-Check"
for attempt in {1..60}; do
  if ssh -o BatchMode=yes "$SERVER" "curl -fsS http://localhost:3001/api/health" >/dev/null 2>&1; then
    break
  fi
  if [[ $attempt -eq 60 ]]; then
    echo "Health-Check nach Restart fehlgeschlagen" >&2
    ssh "$SERVER" "systemctl status werkstatt-terminplaner --no-pager" || true
    exit 1
  fi
  sleep 2
done

log "Verifiziere Serverstand, Schema und Queue-API"
ssh -o BatchMode=yes "$SERVER" "APP_DIR='$APP_DIR' DATA_DIR='$DATA_DIR' EXPECTED_HEAD='$HEAD' node -" <<'REMOTE_VERIFY'
const path = require('path');
const sqlite3 = require(path.join(process.env.APP_DIR, 'backend', 'node_modules', 'sqlite3')).verbose();
const db = new sqlite3.Database(path.join(process.env.DATA_DIR, 'database', 'werkstatt.db'), sqlite3.OPEN_READONLY);
db.get("SELECT value FROM _schema_meta WHERE key = 'schema_version'", [], (error, row) => {
  if (error) throw error;
  db.all("PRAGMA index_list('termine')", [], (indexError, indexes) => {
    if (indexError) throw indexError;
    console.log(JSON.stringify({
      schema: row?.value,
      apprenticeIndex: indexes.some(index => index.name === 'idx_termine_warteschlange_lehrlinge')
    }));
    db.close();
  });
});
REMOTE_VERIFY

SERVER_HEAD=$(ssh -o BatchMode=yes "$SERVER" "cd '$APP_DIR' && git rev-parse HEAD")
if [[ $SERVER_HEAD != "$HEAD" ]]; then
  echo "Serverstand $SERVER_HEAD entspricht nicht $HEAD" >&2
  exit 1
fi
ssh -o BatchMode=yes "$SERVER" "curl -fsS http://localhost:3001/api/health && echo && curl -fsS 'http://localhost:3001/api/warteschlange?datum=$(date +%F)' >/dev/null && systemctl is-active werkstatt-terminplaner"

log "Deployment erfolgreich: $HEAD"
log "Rollback: vorherigen Git-Stand deployen; DB-Backup liegt unter $DATA_DIR/backups/"
