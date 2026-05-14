# CrawlDesk — Agent Configuration

All critical issues have been addressed. Builds successfully. Ready to test.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for [om-media/Crawldesk](https://github.com/om-media/Crawldesk). Skills use the `gh issue` CLI to read/write issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage labels are used: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Each label string equals its role name with no overrides. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one `CONTEXT.md` at the repo root and `docs/adr/` for architectural decisions. Most engineering skills read these files first to learn domain language and prior decisions. See `docs/agents/domain.md`.
