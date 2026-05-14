# Triage labels mapping

Five canonical triage roles and their corresponding GitHub label strings:

| Role | Label String |
|---|---|
| Maintainer needs to evaluate | `needs-triage` |
| Waiting on reporter | `needs-info` |
| Fully specified, agent-ready | `ready-for-agent` |
| Needs human implementation | `ready-for-human` |
| Won't fix | `wontfix` |

Each role maps directly to a label of the same name. These are the exact strings used by the `gh issue edit --add-label` / `--remove-label` commands.

## How skills use these labels

- **triage**: Applies/removes labels as issues move through the state machine (new → needs evaluation → waiting on reporter → ready for agent/human → won't fix).
- **to-issues**: Assigns `ready-for-agent` when an issue is fully specified and self-contained enough for an autonomous agent to pick up without additional context.
- **diagnose**, **tdd**, etc.: Read labels to understand issue readiness before acting on them.

To change a label string, update this file — no other configuration is needed.
