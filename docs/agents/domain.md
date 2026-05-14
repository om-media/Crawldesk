# Domain documentation layout

This repo uses a **single-context** layout: one `CONTEXT.md` at the repo root plus `docs/adr/` for architectural decision records.

## Consumer rules

When reading domain documentation, follow these rules in order:

1. **Read `CONTEXT.md` first.** This file contains the project's domain language, core concepts, and overall architecture overview. Skills should use its terminology when generating issues, writing code, or explaining findings.
2. **Review ADRs in `docs/adr/`.** These capture past architectural decisions (what was chosen, what alternatives were considered, why). New work should respect existing ADRs unless there's an explicit reason to revisit them. If a decision needs changing, write a new ADR rather than editing old ones.
3. **Check `AGENTS.md` for tooling conventions.** Any agent-specific configuration (issue tracker, triage labels, CI workflows) lives here under the "Agent skills" section.

## Layout summary

| Path | Purpose |
|---|---|
| `CONTEXT.md` | Project domain language, core model, high-level architecture |
| `docs/adr/` | Architectural Decision Records (Markdown files named `NNN-title.md`) |
| `AGENTS.md` | Agent skill configuration (issue tracker, labels, domain docs pointer) |
| `docs/agents/*.md` | Detailed skill reference docs (this directory) |
