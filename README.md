# engineering-toolkit

A [Claude Code](https://code.claude.com) plugin marketplace for engineering
review and learning. It currently ships one plugin, **specialist-panel**: four
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
| `specialist-panel:backend` agent | Lens: the [backend roadmap](https://roadmap.sh/backend). APIs, databases and transactions, auth, caching, messaging, real-time, testing, operations |
| `specialist-panel:performance` agent | Lens: [backend performance best practices](https://roadmap.sh/backend-performance-best-practices) and building for scale. Queries, pooling, caching, payloads, async work, resilience, measurement |
| `specialist-panel:architect` agent | Lens: the [software architect roadmap](https://roadmap.sh/software-architect). Design principles, boundaries, architectural styles, integration patterns, data ownership, trade-offs, ADRs |
| `specialist-panel:security` agent | Lens: the security topics of both roadmaps. OWASP risks, authn/authz, cryptography, secrets, web and server security |
| `specialist-panel:panel` workflow | Maps the repository, picks the specialists the work needs, and runs them in one of three modes: review, design, learn |

The agents only read your code. None of them can edit files.

## Install

You need a recent Claude Code with workflow support. This was tested with
Claude Code 2.1.286.

Inside Claude Code:

```
/plugin marketplace add c0rwil/engineering-toolkit
/plugin install specialist-panel@engineering-toolkit
```

Or from a terminal:

```bash
claude plugin marketplace add c0rwil/engineering-toolkit
claude plugin install specialist-panel@engineering-toolkit
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
claude plugin update specialist-panel@engineering-toolkit
claude plugin uninstall specialist-panel@engineering-toolkit
```

The plugin was called `roadmap-panel` before 0.4.0. If you installed it under
that name, switch with:

```bash
claude plugin uninstall roadmap-panel@engineering-toolkit
claude plugin marketplace update engineering-toolkit
claude plugin install specialist-panel@engineering-toolkit
```

The workflow is now `specialist-panel:panel` and the agents are
`specialist-panel:backend`, `:performance`, `:architect` and `:security`.

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
  "enabledPlugins": { "specialist-panel@engineering-toolkit": true }
}
```

## Use

Ask for the workflow by name. Claude doesn't start multi-agent runs on its
own, and it asks for approval before launching one. Watch progress with
`/workflows`.

| You say | What runs |
|---|---|
| "Run the specialist panel on my current changes." | A review of your uncommitted diff, or of the branch's commits when the tree is clean, by the specialists the change needs |
| "Run the specialist panel on commit abc123." | The same, for one commit |
| "Run the specialist panel in design mode: add per-tenant rate limiting to the public API." | Competing designs, a red team, and one merged design with a draft ADR |
| "Run the specialist panel in learn mode on src/." | A map of which roadmap patterns your code already uses, gets wrong or lacks, plus a study plan |
| "Run the specialist panel on my changes with only the security specialist." | Your choice of panel instead of the automatic one |

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
| `specialists` | any subset of `backend`, `performance`, `architect`, `security`. Replaces the automatic choice | chosen by the map (one for a small diff) |
| `scope` | `false` skips the map step and runs the full panel | `true` |

### Call a specialist directly

Each agent also works on its own, outside the workflow:

```
@agent-specialist-panel:security review the session handling in src/auth
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
     nobody, and the run stops right there. A small diff (at most 150 changed
     lines in at most 3 files) gets only the most relevant specialist; the
     others are listed as not covered, and `specialists` adds them back.
2. **Specialists.** Each chosen specialist works through its own lens. It gets
   the brief plus only the hotspots meant for it, and treats the brief as leads
   to confirm in code, not as facts. Every finding cites `file:line`, a
   concrete failure scenario, a fix, the roadmap topic and a one-line lesson.
3. **Challenge.** A skeptic per specialist tries to refute every finding,
   lows included, by reading the cited code. Anything it can't confirm is
   dropped; findings that depend on conditions it can't check are kept as
   *plausible*. It also re-rates severity in both directions, so a real bug
   the specialist under-rated moves up the report. In learn mode it checks
   every claim the same way. In design mode, a red team attacks the proposals
   instead, looking for conflicts, gaps, risks and over-engineering.
4. **Synthesize.** A chair merges duplicates across lenses, ranks the findings
   and writes the report from the surviving data only, including a line for
   each lens that was skipped and why.

## Cost, and when to use it

These runs are thorough, not cheap. Here is what they cost and found next to
Claude Code's built-in `/code-review` (high effort), on two commits of a Rust
codebase, with Claude Opus at maximum session effort. Each row is one run, so
treat the numbers as indicative.

| Target | Tool | Tokens | Time | What it found |
|---|---|---|---|---|
| 812-line commit, 8 files | `/code-review` | 255k | 18 min | 10 findings; 3 of the 5 known bugs |
| same | panel 0.2.0, 4 lenses | 1.96M | 44 min | 12 merged findings; all 5 known bugs |
| same | panel 0.3.0, 4 lenses | 1.57M | 41 min | 16 merged findings; 4 of the 5, two of them as unchecked lows |
| 92-line commit, 3 files | `/code-review` | 246k | 15 min | 9 findings, none wrong |
| same | panel 0.3.0, 2 lenses | 764k | 28 min | 6 merged findings, 5 of them also in `/code-review`'s |
| whole repository | `learn`, 4 lenses | 1.81M | 42 min | 46 checked claims, including 3 security holes shown with proofs of concept |

The "known bugs" are the 5 bugs in that commit that later commits fixed.
Three of those fixes came from the 0.2.0 panel's own report, so the count
favors the panel. On the two bugs fixed independently of either tool,
`/code-review` and panel 0.3.0 each found one, and panel 0.2.0 found both.

What that means:

- **Everyday changes: start with `/code-review`.** It costs 3-6x less. On the
  small commit it found all but one of the panel's findings, plus four more; on
  the large one it found one known bug fewer than panel 0.3.0.
- **High-stakes or cross-cutting changes: add the panel.** It found what
  `/code-review` didn't: contract and lifecycle problems across modules,
  measured costs on hot paths (a 32-file patch taking 6.9 s against a 10 s
  timeout), and in one run two high-severity bugs. Its recall varied between
  runs, so treat it as a second opinion, not a replacement.
- **Learning a codebase: use `learn` mode** once per codebase or milestone.
  Nothing else here names the patterns your code uses, shows where they're
  misapplied, and turns the gaps into a study plan.

Two changes in 0.4.0 come from those runs and haven't been re-measured:

- A small diff gets one specialist. On the 92-line commit, the two lenses
  raised 4 of their 6 findings twice, and either lens alone found 5 of them,
  at about half the cost.
- The skeptic checks every finding, lows included, and can raise a severity.
  In the 0.3.0 run on the 812-line commit, two real bugs (a symlinked secret
  copied into the repository, and wasted work on every call of a hot path)
  sat at the bottom of the report as unchecked lows.

Building the Graphify graph costs no tokens because it is local parsing, and
later runs only re-parse the files that changed; the map step is one agent
reading that graph. Every specialist the map skips also skips its skeptic, and
a change that needs no lens stops after the map.

- Review one commit or one directory, not a whole repository.
- Let the map pick the panel. Use `specialists` only when you want a
  particular lens.
- Use `learn` mode once per codebase, not per change.

## Develop

```
.claude-plugin/marketplace.json        marketplace manifest
plugins/specialist-panel/
  .claude-plugin/plugin.json           plugin manifest
  agents/*.md                          the four specialists (lens and topic lists)
  workflows/panel.js                   the workflow
  tests/panel.test.mjs                 offline test harness
```

```bash
node plugins/specialist-panel/tests/panel.test.mjs        # mocked agents: no tokens, no network
claude plugin validate . && claude plugin validate plugins/specialist-panel
claude --plugin-dir ./plugins/specialist-panel             # try local edits in a new session
```

The harness runs the workflow against mocked agents. It covers every mode,
panel selection (the map's choice, your override, and the full-panel
fallback, and one lens for a small diff), the early stop, failing agents,
verdict handling, and how specialists are resolved: from the plugin, or from
their lens files when the session predates the install, and never by a
generic bare name such as `security` that another plugin may define. To check that a test catches a regression, set
`WF_PATH` to a deliberately broken copy of the workflow and confirm the run
fails.

## License

[MIT](LICENSE). The topic lists follow the public roadmap.sh roadmaps. This
project is not affiliated with roadmap.sh, Graphify or Anthropic.
