# specialist-panel

Four read-only specialist agents grounded in [roadmap.sh](https://roadmap.sh)
roadmaps (`backend`, `performance`, `architect`, `security`), plus the
`panel` workflow. The workflow maps the repository with Graphify, picks only
the specialists the work needs, and runs them as a panel:

- **review** a change: findings verified by a skeptic, each with its roadmap topic and a lesson.
- **design** a feature: competing proposals, a red team, and one design with a draft ADR.
- **learn** a codebase: the patterns it uses, misapplies and lacks, with a study plan.

Ask for it by name, for example "Run the specialist panel on my current
changes", or call an agent directly with `@agent-specialist-panel:security`.

See the [full guide](../../README.md) for install, Graphify, modes, arguments,
cost and development.
