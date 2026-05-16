# Codex Bridge

This folder documents how Codex should share the existing Claude setup.

## Source of Truth

Do not maintain a separate Codex copy of the project rules. Codex reads:

- `../AGENTS.md`
- `../CLAUDE.md`
- `../.claude/PROJEKT.md`
- `../.claude/memory.md`
- `../.claude/knowledge-base.md`
- `../.claude/command-index.md`
- `../.claude/commands/*.md`

That keeps Claude Code and Codex on the same project behavior.

## Slash Commands

Codex does not run the Claude command system directly. Instead, when the user types a Claude-style command, Codex reads the matching markdown file from `../.claude/commands/` and follows the workflow manually.

Examples:

- `/start` -> `../.claude/commands/start.md`
- `/review target` -> `../.claude/commands/review.md`
- `/release version` -> `../.claude/commands/release.md`
- `/handoff recipient` -> `../.claude/commands/handoff.md`

## Hooks and Permissions

Claude hooks from `../.claude/settings.json` are Claude-specific. Codex mirrors their intent through its normal workflow:

- inspect before editing
- keep changes scoped
- use safe shell commands
- request approval for destructive or external actions
- verify with the nearest relevant tests/builds

## Updating the Shared Setup

When project rules change, update `../CLAUDE.md` or `../.claude/PROJEKT.md` first. Keep `../AGENTS.md` as a short bridge, not a second full manual.
