# engineering-toolkit

A [Claude Code](https://code.claude.com) plugin marketplace for engineering
review and learning. It currently ships one plugin, **roadmap-panel**: four
specialist agents, each grounded in a [roadmap.sh](https://roadmap.sh) roadmap,
and a workflow that maps your repository, picks only the specialists the work
needs, and runs them as a review panel.

Point it at a change, a design question or a whole codebase. It returns a
ranked, verified report in which every finding names the roadmap topic it
comes from and carries a short lesson, so each review also teaches you the
roadmap through your own code.

## What's inside

| Component | What it does |
|---|---|
| `roadmap-backend` agent | Lens: the [backend roadmap](https://roadmap.sh/backend). APIs, databases and transactions, auth, caching, messaging, real-time, testing, operations |
| `roadmap-performance` agent | Lens: [backend performance best practices](https://roadmap.sh/backend-performance-best-practices) and building for scale. Queries, pooling, caching, payloads, async work, resilience, measurement |
| `roadmap-architect` agent | Lens: the [software architect roadmap](https://roadmap.sh/software-architect). Design principles, boundaries, architectural styles, integration patterns, data ownership, trade-offs, ADRs |
| `roadmap-security` agent | Lens: the security topics of both roadmaps. OWASP risks, authn/authz, cryptography, secrets, web and server security |
| `roadmap-review` workflow | Maps the repository, picks the specialists the work needs, and runs them in one of three modes: review, design, learn |

The agents only read your code. None of them can edit files.

## Install

You need a recent Claude Code with workflow support. This was tested with
Claude Code 2.1.286.

Inside Claude Code:

```
/plugin marketplace add c0rwil/engineering-toolkit
/plugin install roadmap-panel@engineering-toolkit
```

Or from a terminal:

```bash
claude plugin marketplace add c0rwil/engineering-toolkit
claude plugin install roadmap-panel@engineering-toolkit
```

Start a new session afterwards, because agents and workflows load at session
start.

### Recommended: Graphify

The workflow maps your repository with [Graphify](https://github.com/Graphify-Labs/graphify)
before any specialist starts. Install it once:

```bash
uv tool install graphifyy   # or: pipx install graphifyy
```

Without Graphify, the workflow still runs. It maps the change with git and
ripgrep instead and logs a reminder to install Graphify.

### Update or remove

```bash
claude plugin marketplace update engineering-toolkit
claude plugin update roadmap-panel@engineering-toolkit
claude plugin uninstall roadmap-panel@engineering-toolkit
```

### Install for a whole team

To offer the plugin to everyone who works in a repository, commit this to that
repository's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "engineering-toolkit": {
      "source": { "source": "github", "repo": "c0rwil/engineering-toolkit" }
    }
  },
  "enabledPlugins": { "roadmap-panel@engineering-toolkit": true }
}
```

## Use

Ask for the workflow by name. Claude doesn't start multi-agent runs on its
own, and it asks for approval before launching one. Watch progress with
`/workflows`.

| You say | What runs |
|---|---|
| "Run the roadmap-review workflow on my current changes." | A review of your uncommitted diff, or of the branch's commits when the tree is clean, by the specialists the change needs |
| "Run roadmap-review on commit abc123." | The same, for one commit |
| "Run roadmap-review in design mode: add per-tenant rate limiting to the public API." | Competing designs, a red team, and one merged design with a draft ADR |
| "Run roadmap-review in learn mode on src/." | A map of which roadmap patterns your code already uses, gets wrong or lacks, plus a study plan |
| "Run roadmap-review on my changes with only the security specialist." | Your choice of panel instead of the automatic one |

### Modes

| Mode | Input | Output |
|---|---|---|
| `review` (default) | a change, path, commit range or spec. Defaults to the current change | Verdict (ship, fix first, or rethink), a ranked findings table, and details with failure scenario, fix and lesson. Also what's done well, which lenses were skipped and why, and three topics to study next |
| `design` | a problem statement or the path to a spec | A recommended design: testable requirements, a decisions table, how each objection was resolved, risks, a test plan, a draft ADR and open questions |
| `learn` | a path. Defaults to the whole repository | Patterns you already use (named), misapplied patterns, coverage per roadmap, and a five-step study plan with hands-on exercises in your code |

### Arguments

You can pass arguments when you need precise control. A plain string is
treated as a review target.

| Argument | Values | Default |
|---|---|---|
| `mode` | `review`, `design`, `learn` | `review` |
| `target` | what to work on, in words or as a path | the current change, or the whole repo in learn mode. Required for design |
| `focus` | extra priorities, e.g. "p99 under 50 ms" | none |
| `specialists` | any subset of `backend`, `performance`, `architect`, `security`. Replaces the automatic choice | chosen by the map |
| `scope` | `false` skips the map step and runs the full panel | `true` |

### Call a specialist directly

Each agent also works on its own, outside the workflow:

```
@agent-roadmap-panel:roadmap-security review the session handling in src/auth
```

## How it works

```
Map ──▶ Specialists ──▶ Challenge ──▶ Synthesize
 1 agent   only the        a skeptic per    1 chair agent
           lenses the      lens, or a red
           work needs      team (design)
```

1. **Map.** One agent maps the target before anything else:
   - If Graphify is installed, it builds the graph on the first run
     (`graphify extract . --code-only`) and refreshes only what changed on
     later runs (`graphify update .`). Code is parsed locally with tree-sitter:
     no API key, and nothing leaves your machine. It then reads the graph
     report and queries the target's neighborhood. The graph goes into
     `graphify-out/` at the repository root, which the workflow adds to
     `.git/info/exclude` so it stays out of `git status`.
   - It writes a short context brief: the exact scope, the files and
     dependencies involved, the project rules that apply (CLAUDE.md,
     CONTRIBUTING, ADRs), and hotspots for each lens.
   - It picks the specialists the work actually touches and gives a reason for
     every pick and every skip. A schema change gets backend; a request-path
     loop gets performance; a new module boundary gets the architect;
     untrusted input or credentials get security. A docs-only change gets
     nobody, and the run stops right there.
2. **Specialists.** Each chosen specialist works through its own lens. It gets
   the brief plus only the hotspots meant for it, and treats the brief as leads
   to confirm in code, not as facts. Every finding cites `file:line`, a
   concrete failure scenario, a fix, the roadmap topic and a one-line lesson.
3. **Challenge.** A skeptic tries to refute each specialist's findings by
   reading the cited code. Anything it can't confirm is dropped; findings that
   depend on conditions it can't check are kept as *plausible*. In design mode,
   a red team attacks the proposals instead, looking for conflicts, gaps, risks
   and over-engineering.
4. **Synthesize.** A chair merges duplicates across lenses, ranks the findings
   and writes the report from the surviving data only, including a line for
   each lens that was skipped and why.

## Cost and tips

These runs are thorough, not cheap. In testing, one specialist reviewing one
commit took about 30 minutes and roughly 400k tokens, because the skeptic
reproduced the bug it was checking. The automatic panel keeps that down: every
specialist the map skips also skips its skeptic, so a change that needs one
lens runs 4 agents instead of 10, and a change that needs none stops after the
map. Building the Graphify graph costs no tokens because it is local parsing,
and later runs only re-parse the files that changed; the map step is one agent
reading that graph.

- Review one commit or one directory, not a whole repository.
- Let the map pick the panel. Use `specialists` only when you want a
  particular lens.
- Use `learn` mode once per codebase, not per change.

## Develop

```
.claude-plugin/marketplace.json        marketplace manifest
plugins/roadmap-panel/
  .claude-plugin/plugin.json           plugin manifest
  agents/roadmap-*.md                  the four specialists (lens and topic lists)
  workflows/roadmap-review.js          the workflow
  tests/roadmap-review.test.mjs        offline test harness
```

```bash
node plugins/roadmap-panel/tests/roadmap-review.test.mjs   # mocked agents: no tokens, no network
claude plugin validate . && claude plugin validate plugins/roadmap-panel
claude --plugin-dir ./plugins/roadmap-panel                # try local edits in a new session
```

The harness runs the workflow against mocked agents. It covers every mode,
panel selection (the map's choice, your override, and the full-panel
fallback), the early stop, failing agents, verdict handling, and how
specialists are resolved whether they come from the plugin, from user-level
files, or from neither. To check that a test catches a regression, set
`WF_PATH` to a deliberately broken copy of the workflow and confirm the run
fails.

## License

[MIT](LICENSE). The topic lists follow the public roadmap.sh roadmaps. This
project is not affiliated with roadmap.sh, Graphify or Anthropic.
