# Codex Instructions

This repository is shared between Claude Code and Codex. Keep both assistants aligned by using the Claude project files as the shared source of truth.

## Shared Context

At the start of a session, read these files when relevant:

1. `CLAUDE.md` - primary project rules, commands, architecture, pitfalls, build/test/deploy notes.
2. `.claude/PROJEKT.md` - full project documentation and component map.
3. `.claude/memory.md` - current project memory and recent state.
4. `.claude/knowledge-base.md` - durable constraints and lessons.
5. `Task Board.md` - current tasks and priorities.

If any instruction here conflicts with `CLAUDE.md`, prefer the stricter/safest rule. Do not duplicate long-lived project facts here; update `CLAUDE.md` or `.claude/PROJEKT.md` so Claude and Codex stay in sync.

## Project Rules Codex Must Follow

- Backend uses CommonJS (`require` / `module.exports`), 2-space indentation, semicolons.
- Keep the route -> controller -> model separation.
- Controllers contain business logic; models are database-only.
- Use `dbHelper.js` (`getAsync`, `allAsync`, `runAsync`) instead of raw sqlite callbacks in controllers.
- Use `withTransaction()` from `utils/transaction.js` for atomic multi-step DB changes.
- WebSocket messages go through `broadcastEvent()` only.
- New WebSocket events use dot notation, for example `termin.created`.
- Never hardcode frontend API port 3001; use `API_BASE_URL` from `api.js`.
- Never hardcode the database path; use `dataDir` from `config/database.js`.
- Database schema changes must use the migration system under `backend/migrations/`.
- Before restore-style destructive DB work, create a backup and checkpoint WAL.
- New critical/destructive API routes need auth and an appropriate rate limiter.
- The app version is maintained in `backend/src/config/version.js`.

## Frontend/Tablet Cautions

- `frontend/src/app.js` is a large monolith; make focused, careful edits.
- After frontend changes, run `frontend` build when the change is intended for production.
- If `frontend/index.html` is touched, verify all critical `data-tab` entries still exist:
  `dashboard`, `heute`, `termine`, `kalender`, `kunden`, `zeitverwaltung`, `zeitstempelung`, `auslastung`, `intern`, `papierkorb`, `einstellungen`.
- Tablet app changes live under `electron-intern-tablet/`; update its package version when producing a tablet release.

## Command Compatibility

Claude commands live in `.claude/commands/*.md`. Codex should treat a user request like `/start`, `/review`, `/release`, `/handoff`, etc. as a request to read the corresponding file and execute the same workflow as closely as possible with Codex tools.

Command index: `.claude/command-index.md`.

Important examples:

- `/start`: read `.claude/memory.md`, `.claude/knowledge-base.md`, `Task Board.md`, create today's daily note if needed, then give a short orientation.
- `/review [target]`: use a code-review stance focused on bugs, security, regressions, performance, architecture, and missing tests.
- `/release [version]`: gather changes, check build/test status, and prepare release notes/deploy guidance.
- `/handoff [recipient]`: summarize state, changed files, verification, risks, and next steps.

Claude hooks in `.claude/settings.json` are not executed automatically by Codex. Codex must manually preserve the same safety intent: inspect before editing, keep changes scoped, avoid destructive commands without explicit approval, and record important context in shared docs when asked.

## Verification Defaults

Prefer the nearest relevant checks:

- Backend tests: `cd backend && npm test`
- Backend bug regressions: `cd backend && npm run test:bugs`
- Frontend build: `cd frontend && npm run build`
- Tablet build/checks: use scripts from `electron-intern-tablet/package.json`

If a check cannot run, say why and describe the residual risk.

## Working Style

- Read existing patterns before editing.
- Keep edits narrow and compatible with the current architecture.
- Do not revert user changes.
- Use `rg` / `rg --files` for search.
- Use `apply_patch` for manual file edits.
- Update shared Claude docs only when the user asks or when the change is clearly documentation/workflow related.
