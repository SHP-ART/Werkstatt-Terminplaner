---
name: pre-commit-security-audit
description: Use when about to commit or push code to GitHub, before running git push or git commit, when checking if sensitive data like passwords, API keys, personal data, or database files would be uploaded, when reviewing .gitignore completeness, or when creating a security audit report for a repository.
---

# Pre-Commit Security Audit

Scans staged files and the repository for sensitive data before it reaches GitHub. Generates a structured warning report with severity levels and concrete fix recommendations.

## Audit Scope

Check all of the following:

### 1. Staged & Tracked Files
Run these commands to assess what would be uploaded:
```bash
git status --short
git diff --cached --name-only
git ls-files --others --exclude-standard
```

### 2. Critical Patterns to Detect

**CRITICAL — must fix before push:**
- Passwords: `password\s*=\s*['"][^'"]{4,}`, `pass\s*=\s*['"]`, `passwd\s*=`
- API Keys / Tokens: `api_key\s*=`, `apikey\s*=`, `secret\s*=\s*['"]`, `token\s*=\s*['"][^'"]{10,}`
- Private keys / SSH: `BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY`, `-----BEGIN PRIVATE`
- Database credentials: `DATABASE_URL\s*=.*://[^/]+:[^@]+@`, `db_password`, `mysql_pwd`
- JWT secrets: `JWT_SECRET\s*=`, `jwt_secret\s*=`
- OpenAI / Ollama keys: `OPENAI_API_KEY\s*=\s*sk-`, `chatgpt_api_key\s*=\s*[^$]`

**WARNING — review carefully:**
- IP addresses in config/code: `\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b` (docs are usually OK, `.env`/code is not)
- Email addresses in source code (not templates): `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`
- Hardcoded usernames: `username\s*=\s*['"][^'"]{3,}`
- Connection strings with embedded credentials

**INFO — best practices:**
- `.env` present but `.env.example` missing
- `node_modules/` not gitignored
- SQLite/database files tracked: `*.db`, `*.sqlite`, `*.sqlite3`
- Log files tracked: `*.log`, `logs/`
- Build artifacts tracked: `dist/`, `build/`, `*.exe`, `*.dmg`

### 3. Project-Specific Checks (Werkstatt-Terminplaner)
- `backend/database/werkstatt.db` must not be tracked
- `backend/.env` must not be tracked (check if `.env.example` exists)
- Any file containing `100.124.168.108` (production server IP) in non-docs files
- `chatgpt_api_key` values outside of `.env`
- Installer files (`*.exe`, `*.deb`) — usually too large and must not be committed

### 4. .gitignore Completeness Check
Verify these entries exist in `.gitignore`:
```
node_modules/
*.db
*.sqlite
*.sqlite3
.env
.env.local
logs/
*.log
dist/
build/
release/
*.exe
*.dmg
*.deb
```

## Report Format

Generate the report in this structure:

```
## SICHERHEITS-AUDIT — GitHub Pre-Commit Bericht
Datum: [YYYY-MM-DD]
Repository: [repo-name]

### KRITISCH ⛔ (sofort beheben — NICHT pushen)
| Datei | Zeile | Typ | Detail |
|-------|-------|-----|--------|
| ...   | ...   | Password | mysql_password="xyz" |

### WARNUNG ⚠️ (vor Push prüfen)
| Datei | Typ | Detail |
|-------|-----|--------|

### HINWEISE ℹ️ (Best Practices)
- [ ] .gitignore ergänzen um: ...
- [ ] .env.example erstellen

### EMPFEHLUNGEN
1. [Konkrete Maßnahme]
2. [Konkrete Maßnahme]

### ERGEBNIS
❌ PUSH BLOCKIERT — X kritische Probleme gefunden
✅ FREIGABE — Keine kritischen Probleme
```

## Fix Recommendations

For each finding, suggest the specific fix:

| Finding | Fix |
|---------|-----|
| Password in code | Move to `.env`, access via `process.env.VAR_NAME` |
| `.env` not in `.gitignore` | Add `.env*` to `.gitignore`, check `git rm --cached .env` |
| DB file tracked | `git rm --cached backend/database/werkstatt.db`, add to `.gitignore` |
| API key hardcoded | Replace with env variable, rotate the leaked key immediately |
| `node_modules/` tracked | `git rm -r --cached node_modules/`, add to `.gitignore` |
| Logs tracked | `git rm -r --cached logs/`, add `logs/` to `.gitignore` |

## Execution

1. Run the checks using grep/git commands
2. Categorize every finding by severity
3. Generate the full report in German
4. If CRITICAL findings exist: state clearly that pushing is **blocked**
5. Provide copy-paste commands to fix each issue

**Never assume a file is safe without checking its contents for the patterns above.**
