# roadmap-panel

Four read-only specialist agents grounded in [roadmap.sh](https://roadmap.sh)
roadmaps (`roadmap-backend`, `roadmap-performance`, `roadmap-architect`,
`roadmap-security`), plus the `roadmap-review` workflow. The workflow maps the
repository with Graphify, picks only the specialists the work needs, and runs
them as a panel:

- **review** a change: findings verified by a skeptic, each with its roadmap topic and a lesson.
- **design** a feature: competing proposals, a red team, and one design with a draft ADR.
- **learn** a codebase: the patterns it uses, misapplies and lacks, with a study plan.

Ask for it by name, for example "Run the roadmap-review workflow on my current
changes", or call an agent directly with `@agent-roadmap-panel:roadmap-security`.

See the [full guide](../../README.md) for install, Graphify, modes, arguments,
cost and development.
