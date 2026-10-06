export const meta = {
  name: 'panel',
  description: 'Specialist panel (backend, performance, architecture, security) grounded in the roadmap.sh roadmaps: maps the repository with Graphify, picks only the specialists the work needs, then reviews a change, red-teams a design, or maps a codebase to the roadmaps',
  whenToUse: 'A review of a change or path, a design decision before building, or a learning map of a codebase against the backend, backend-performance and software-architect roadmaps. args: {mode: "review" | "design" | "learn", target, focus, specialists, scope}; a plain string is a review target; specialists overrides the automatic panel; scope: false skips the map step and runs the full panel.',
  phases: [
    { title: 'Map', detail: 'Graphify map of the repository, context brief, and the specialists the work needs' },
    { title: 'Specialists', detail: 'each selected specialist works the target through its lens' },
    { title: 'Challenge', detail: 'skeptics refute findings, or a red team attacks the proposals' },
    { title: 'Synthesize', detail: 'merge, rank and write the report' },
  ],
}

// Agent types are namespaced by the plugin ("specialist-panel:security").
// The bare names are generic, so they are never resolved outside it.
const PLUGIN = 'specialist-panel'

// The lenses and topic lists live in the agents' .md files, so the same
// specialists also work on their own (e.g. @agent-specialist-panel:security).
const SPECIALISTS = [
  { key: 'backend', agentType: 'backend', title: 'Backend engineer', covers: 'backend fundamentals (APIs, databases, auth, caching, messaging, testing)', url: 'https://roadmap.sh/backend' },
  { key: 'performance', agentType: 'performance', title: 'Performance engineer', covers: 'performance and scale', url: 'https://roadmap.sh/backend-performance-best-practices' },
  { key: 'architect', agentType: 'architect', title: 'Software architect', covers: 'architecture, modularity and integration', url: 'https://roadmap.sh/software-architect' },
  { key: 'security', agentType: 'security', title: 'Security engineer', covers: 'security', url: 'https://roadmap.sh/backend and https://roadmap.sh/software-architect' },
]
const LENS_KEYS = SPECIALISTS.map(s => s.key)

const DEFAULT_TARGET = {
  review: 'the current change: uncommitted work (`git diff HEAD` plus untracked files from `git status --short`); if there is none, the commits on this branch that are not on the default branch; if there are none, the latest commit (`git show HEAD`)',
  design: '',
  learn: 'the whole repository',
}

const SEVERITIES = ['high', 'medium', 'low']

const FINDING = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'One-line statement of the defect or risk' },
    file: { type: 'string', description: 'Repository-relative path, or the section of a document' },
    line: { type: 'integer', description: '1-based line number; 0 when not applicable' },
    severity: { type: 'string', enum: SEVERITIES },
    roadmap_topic: { type: 'string', description: 'The roadmap topic involved, e.g. "N+1 problem" or "Connection pooling"' },
    evidence: { type: 'string', description: 'The exact construct in the code that shows the problem' },
    failure_scenario: { type: 'string', description: 'The input, load or state that triggers it, and what goes wrong' },
    fix: { type: 'string', description: 'The smallest change that resolves it' },
    lesson: { type: 'string', description: 'The general principle in one or two sentences' },
  },
  required: ['title', 'file', 'line', 'severity', 'roadmap_topic', 'evidence', 'failure_scenario', 'fix', 'lesson'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    scope: { type: 'string', description: 'What you reviewed: files, commit range or document' },
    findings: { type: 'array', items: FINDING },
    done_well: {
      type: 'array',
      description: 'Up to 3 places where the code applies one of your topics well',
      items: {
        type: 'object',
        properties: { topic: { type: 'string' }, where: { type: 'string' }, why: { type: 'string' } },
        required: ['topic', 'where', 'why'],
      },
    },
    omitted: { type: 'integer', description: 'Findings left out because of the 10-item limit' },
  },
  required: ['scope', 'findings', 'done_well', 'omitted'],
}

const CLAIM = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['demonstrated', 'misapplied', 'gap'] },
    topic: { type: 'string', description: 'The roadmap topic' },
    pattern: { type: 'string', description: 'The pattern or technique as the literature names it' },
    where: { type: 'string', description: 'file:line, or "absent" for a gap' },
    explanation: { type: 'string', description: 'How the code applies it, what goes wrong, or why the gap matters here' },
    exercise: { type: 'string', description: 'For misapplied and gap: a 1-3 hour build-break-measure exercise in this codebase; empty for demonstrated' },
  },
  required: ['kind', 'topic', 'pattern', 'where', 'explanation', 'exercise'],
}

const CLAIMS_SCHEMA = {
  type: 'object',
  properties: {
    scope: { type: 'string', description: 'What you surveyed and read' },
    claims: { type: 'array', items: CLAIM },
    omitted: { type: 'integer', description: 'Claims left out because of the 12-item limit' },
  },
  required: ['scope', 'claims', 'omitted'],
}

const VERDICTS_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          verdict: { type: 'string', enum: ['confirmed', 'plausible', 'refuted'] },
          severity: { type: 'string', enum: SEVERITIES, description: 'The severity the evidence supports (findings only)' },
          reason: { type: 'string', description: 'What you read, and why it confirms or refutes the item' },
        },
        required: ['index', 'verdict', 'reason'],
      },
    },
  },
  required: ['verdicts'],
}

const PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    approach: { type: 'string', description: 'The design you would choose, in one paragraph' },
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          decision: { type: 'string' },
          choice: { type: 'string' },
          rejected: { type: 'array', items: { type: 'string' }, description: 'Options you rejected, each with the reason' },
          roadmap_topic: { type: 'string' },
        },
        required: ['decision', 'choice', 'rejected', 'roadmap_topic'],
      },
    },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { risk: { type: 'string' }, mitigation: { type: 'string' }, roadmap_topic: { type: 'string' } },
        required: ['risk', 'mitigation', 'roadmap_topic'],
      },
    },
    requirements: { type: 'array', items: { type: 'string' }, description: 'Testable requirements any final design must meet' },
    left_out: { type: 'array', items: { type: 'string' }, description: 'What you deliberately left out, and why' },
    questions: { type: 'array', items: { type: 'string' }, description: 'Questions only the user can answer' },
  },
  required: ['approach', 'decisions', 'risks', 'requirements', 'left_out', 'questions'],
}

const OBJECTIONS_SCHEMA = {
  type: 'object',
  properties: {
    objections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['conflict', 'gap', 'risk', 'overengineering'] },
          about: { type: 'string', description: 'The proposal(s) and decision this targets' },
          objection: { type: 'string' },
          resolution: { type: 'string' },
        },
        required: ['kind', 'about', 'objection', 'resolution'],
      },
    },
  },
  required: ['objections'],
}

const LENS_CHOICE = {
  type: 'object',
  properties: { lens: { type: 'string', enum: LENS_KEYS }, reason: { type: 'string' } },
  required: ['lens', 'reason'],
}

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    graph: { type: 'string', enum: ['graphify', 'none'], description: '"graphify" when a Graphify graph informed the map, otherwise "none"' },
    scope: { type: 'string', description: 'The exact files, commit range or document the panel should work on' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: { path: { type: 'string' }, why: { type: 'string' } },
        required: ['path', 'why'],
      },
    },
    dependencies: {
      type: 'array',
      description: 'Callers, callees and cross-module consumers that matter',
      items: {
        type: 'object',
        properties: { symbol: { type: 'string' }, relation: { type: 'string' }, where: { type: 'string' } },
        required: ['symbol', 'relation', 'where'],
      },
    },
    standards: { type: 'array', items: { type: 'string' }, description: 'Project rules that apply (CLAUDE.md, CONTRIBUTING, ADRs), each with its source' },
    hotspots: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          lens: { type: 'string', enum: [...LENS_KEYS, 'any'] },
          where: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['lens', 'where', 'why'],
      },
    },
    changed_files: { type: 'integer', description: 'Files the change touches (review of a diff only); 0 when the target is not a diff' },
    changed_lines: { type: 'integer', description: 'Added plus deleted lines (review of a diff only); 0 when the target is not a diff' },
    lenses: { type: 'array', description: 'Specialists the work needs, most relevant first, each with the reason', items: LENS_CHOICE },
    skipped: { type: 'array', description: 'Specialists the work does not need, each with the reason', items: LENS_CHOICE },
  },
  required: ['graph', 'scope', 'files', 'dependencies', 'standards', 'hotspots', 'changed_files', 'changed_lines', 'lenses', 'skipped'],
}

// A focused diff gets one specialist. In measured runs on a 92-line, 3-file
// change, two lenses raised 4 of their 6 findings twice, and either lens
// alone found 5 of the 6 at about half the cost.
const SMALL_CHANGE = { files: 3, lines: 150 }

function parseArgs(raw) {
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (text.startsWith('{')) {
      try {
        return JSON.parse(text)
      } catch (e) {
        // Not JSON: treat the whole string as the target.
      }
    }
    return { target: raw }
  }
  return raw || {}
}

const input = parseArgs(args)
const mode = input.mode || 'review'
if (!(mode in DEFAULT_TARGET)) throw new Error(`Unknown mode "${mode}". Use review, design or learn.`)
const target = input.target || DEFAULT_TARGET[mode]
if (!target) throw new Error('design mode needs args.target: a problem statement or the path to a spec.')
const focus = input.focus ? `\nFocus from the user: ${input.focus}` : ''
const requested = input.specialists
  ? [].concat(input.specialists).flatMap(k => String(k).split(',')).map(k => k.trim()).filter(Boolean)
  : null
const unknown = (requested || []).filter(k => !LENS_KEYS.includes(k))
if (unknown.length) throw new Error(`Unknown specialists: ${unknown.join(', ')}. Choose from ${LENS_KEYS.join(', ')}.`)
const json = value => JSON.stringify(value, null, 1)

// Set by the Map stage, then shared by every later stage.
let context = null
let panel = []
let skipped = []
let roadmapUrls = ''

function role(s) {
  // Compare by key: the runtime hands pipeline stages copies of the items.
  const others = panel.filter(o => o.key !== s.key).map(o => o.covers)
  const lens = others.length ? ` The rest of the panel covers ${others.join('; ')}, so stay in your lens.` : ''
  return `You are the ${s.title} on a specialist panel.${lens}`
}

// The shared brief plus only the hotspots meant for this lens.
function contextFor(s) {
  if (!context) return ''
  const { scope, files, dependencies, standards } = context
  const hotspots = context.hotspots.filter(h => h.lens === s.key || h.lens === 'any')
  const brief = { scope, files, dependencies, standards, hotspots }
  const source = context.graph === 'graphify' ? 'a Graphify map and the code' : 'git and the code'
  return `\n\nContext brief (from ${source}; leads, not facts: confirm each one in the code before you rely on it):\n${json(brief)}`
}

async function runMap() {
  const goal = {
    review: 'the change under review: the exact files and symbols, and what depends on them',
    design: 'the code, data and contracts this design will touch',
    learn: "the repository's structure: modules, boundaries, data stores and integrations",
  }[mode]
  const chosen = requested ? `\n   The user already chose the panel (${requested.join(', ')}). Still give a reason for each lens; the choice stays the user's.` : ''
  const brief = await agent(`You map the repository for a specialist panel. Map ${goal}, and decide which specialists the work needs.

Target: ${target}${focus}

1. Graph. Work at the repository root (\`git rev-parse --show-toplevel\`). If the \`graphify\` command exists:
   - Refresh the graph: run \`graphify update .\` when graphify-out/graph.json exists, otherwise \`graphify extract . --code-only\`. Both parse code locally with tree-sitter: no API key, and nothing leaves the machine. Never run a semantic or docs pass.
   - Keep graphify-out/ out of git: if \`git check-ignore -q graphify-out\` fails, append "graphify-out/" to the file \`git rev-parse --git-path info/exclude\` prints (.git/info/exclude; in a linked worktree .git is a file).
   - For the structure, read graphify-out/GRAPH_REPORT.md if it exists; otherwise run \`graphify god-nodes\`. Then run \`graphify query "<question>" --budget 1500\` and \`graphify explain "<symbol>"\` for the target's neighborhood.
   Set "graph" to "graphify". If the command is missing or fails, set "graph" to "none" and use git and rg instead.
2. Scope. Identify the exact files and symbols involved, their callers and dependencies, and the project rules that apply (CLAUDE.md, CONTRIBUTING, ADRs). Treat graph output as leads and confirm each one in the code.
   When the target is a diff (a change, commit or range), count it with \`git diff --shortstat\` over that range: files changed go in "changed_files", insertions plus deletions in "changed_lines". Otherwise set both to 0.
3. Panel. Decide which specialists the work needs, and list the lenses most relevant first. Give a one-sentence reason for each lens you choose ("lenses") and for each you skip ("skipped"):
   - backend: APIs, request handling, data access, transactions, migrations, auth flows, caching, messaging, error contracts.
   - performance: hot paths, queries, I/O on request paths, concurrency, caching, payload sizes, resource limits.
   - architect: new modules or dependencies, public interfaces and contracts, boundaries, data ownership, integration patterns.
   - security: untrusted input, authentication and authorization, secrets and cryptography, file system, network or process access, deserialization, dependency changes.
   Choose only the lenses the work touches. Choose none only when no lens applies, for example a change to docs or comments only.${chosen}

Map the target; do not review it. The specialists judge correctness, so record facts and locations, not verdicts or fixes. Spend about 20 tool calls and write one sentence per entry: at most 15 files, 20 dependencies and 12 hotspots. A hotspot says where a lens should look first and why it matters to that lens.`, { label: 'map', phase: 'Map', schema: BRIEF_SCHEMA, effort: 'medium' }).catch(e => {
    log(`map: ${e.message}`)
    return null
  })
  if (!brief) log('map: no context brief; running the full panel')
  else if (brief.graph === 'graphify') log(`map: Graphify · ${brief.files.length} files · ${brief.hotspots.length} hotspots`)
  else log(`map: git only (Graphify not installed or failed; install it with \`uv tool install graphifyy\` for a richer map) · ${brief.files.length} files`)
  return brief
}

// The user's list wins; otherwise the map decides, and a small diff gets only
// its most relevant lens; without a map, everyone.
function choosePanel() {
  if (requested) {
    panel = SPECIALISTS.filter(s => requested.includes(s.key))
    skipped = SPECIALISTS.filter(s => !requested.includes(s.key)).map(s => ({ lens: s.key, reason: 'not requested' }))
    return 'chosen by you'
  }
  if (!context) {
    panel = SPECIALISTS
    skipped = []
    return 'no map, so the full panel'
  }
  const ranked = context.lenses.map(l => l.lens)
  const lines = Number(context.changed_lines) || 0
  const files = Number(context.changed_files) || 0
  const small = mode === 'review' && lines > 0 && lines <= SMALL_CHANGE.lines && files <= SMALL_CHANGE.files
  const chosen = new Set(small ? ranked.slice(0, 1) : ranked)
  panel = SPECIALISTS.filter(s => chosen.has(s.key))
  const size = `${lines} line${lines === 1 ? '' : 's'} in ${files} file${files === 1 ? '' : 's'}`
  const reasons = new Map(context.skipped.map(l => [l.lens, l.reason]))
  for (const lens of ranked.filter(k => !chosen.has(k))) {
    reasons.set(lens, `small change (${size}): one specialist covers it; pass specialists to add this lens`)
  }
  skipped = SPECIALISTS.filter(s => !chosen.has(s.key)).map(s => ({ lens: s.key, reason: reasons.get(s.key) || 'not selected by the map' }))
  return small && ranked.length > 1 ? `chosen by the map, one specialist for a small change: ${size}` : 'chosen by the map'
}

// Sessions load agent types at startup, so a just-installed specialist may be
// unknown here. Fall back to a default agent that adopts the same lens file,
// looked up inside this plugin's directories only (another plugin or a user
// agent may well have a file named backend.md).
async function runSpecialist(s, prompt, schema) {
  const agentType = `${PLUGIN}:${s.agentType}`
  try {
    return await agent(prompt, { label: s.key, phase: 'Specialists', agentType, schema })
  } catch (e) {
    log(`${s.key}: ${agentType} unavailable (${e.message}); using the default agent with its lens file`)
  }
  const lens = `First print your lens with \`cat "$(find ~/.claude/plugins -path '*/${PLUGIN}/*' -path '*/agents/${s.agentType}.md' 2>/dev/null | head -1)"\` and adopt the role, topics and working rules in its body (ignore the frontmatter). If nothing prints, act as a senior ${s.title} applying ${s.url}. Never edit files.\n\n`
  return agent(lens + prompt, { label: `${s.key} (fallback)`, phase: 'Specialists', schema }).catch(e => {
    log(`${s.key}: ${e.message}`)
    return null
  })
}

function applyVerdicts(items, result) {
  if (!result) return { kept: items.map(item => ({ ...item, verdict: 'unverified' })), refuted: [] }
  const byIndex = new Map(result.verdicts.map(v => [v.index, v]))
  const kept = []
  const refuted = []
  items.forEach((item, index) => {
    const v = byIndex.get(index)
    const checked = v ? { ...item, verdict: v.verdict, verdict_reason: v.reason } : { ...item, verdict: 'unverified' }
    if (v && v.severity && item.severity) checked.severity = v.severity
    if (checked.verdict === 'refuted') refuted.push(checked)
    else kept.push(checked)
  })
  return { kept, refuted }
}

const notCovered = () => (skipped.length ? `\n\nLenses not on the panel, with the reason:\n${json(skipped)}` : '')

const REVIEW = {
  schema: REVIEW_SCHEMA,
  itemsKey: 'findings',
  task: s => `${role(s)}

Target: ${target}${focus}${contextFor(s)}

1. Pin down the exact scope (files, commit range or document; the context brief names it when there is one) and read it. Read callers and surrounding code where the change touches them. Do not review untouched code unless the change breaks it.
2. Find defects and risks in your lens. Each finding names the roadmap topic involved, cites file:line, and gives a concrete failure scenario. Skip style nits and generic advice that names no specific gap.
3. Re-read the code behind each finding and drop any you cannot point to.
4. Note up to 3 places where the code applies one of your topics well.

Report at most 10 findings, most severe first, and put the number you left out in "omitted".`,
  verify: (s, items) => `You are a skeptical verifier. The ${s.title} on a review panel reported these findings about: ${target}

Try to refute each one. Read the cited code, then decide:
- confirmed: you read the code and the failure scenario holds.
- plausible: the code allows it, but it depends on conditions you cannot check here (load, deployment, callers outside this repository).
- refuted: the code does not do what the finding says; the scenario cannot happen; the issue lies outside the target; the fix costs more than the problem; or it contradicts a documented decision (ADR, CLAUDE.md, spec) without new evidence.
If you cannot confirm a finding from the code, refute it. Set severity to what the evidence supports: raise it when the reporter under-rated the impact (for example a secret that can leave the machine, or wasted work on every call of a hot path), and lower it when they over-rated it. Return one verdict per index.

Findings:
${json(items)}`,
  synth: ({ kept, doneWell, refutedCount }) => `You chair a specialist review panel. The specialists reviewed: ${target}
A skeptic checked every finding and refuted ${refutedCount}. Write the final report from this data only; do not add findings.

Findings that survived. The verdict is confirmed or plausible when a skeptic checked the finding, and unverified when the skeptic failed:
${json(kept)}

Done well:
${json(doneWell)}${notCovered()}

1. Merge findings with the same root cause and list every lens that raised them. Order by severity, then by how much breaks.
2. Return Markdown:
   - Verdict: one line (ship, fix first, or rethink) and why.
   - Findings: a table of # | severity | file:line | issue | roadmap topic | lenses | verdict.
   - Details: for each finding, the failure scenario, the fix and the lesson.
   - Done well: the patterns the code applies well, by name.
   - Not covered: one line per lens left off the panel, with the reason (omit when every lens ran).
   - Study next: the 3 roadmap topics these findings show are most worth learning, each with one exercise in this codebase and its roadmap URL (${roadmapUrls}).`,
}

const LEARN = {
  schema: CLAIMS_SCHEMA,
  itemsKey: 'claims',
  task: s => `${role(s)}

Target: ${target}${focus}${contextFor(s)}
Goal: help the author learn your roadmap from their own code.

1. Start from the context brief if there is one, then survey what it does not cover (README, CLAUDE.md, docs/adr if present, top-level modules). Read the modules most relevant to your topics. Do not try to read everything.
2. Report claims of three kinds:
   - demonstrated: a topic or named pattern the code already applies. Name it as the roadmap or the literature does (for example "transactional outbox" or "single-writer principle"), cite file:line, and explain in one sentence how the code applies it.
   - misapplied: a topic applied in a way that causes a concrete problem; say what would be better.
   - gap: a topic that is absent but relevant to what this system does, with a 1-3 hour build-break-measure exercise in this codebase that teaches it.
3. Claim only what you have read.

Report at most 12 claims, balanced across the three kinds, and put the number you left out in "omitted".`,
  verify: (s, items) => `You are a skeptical verifier. The ${s.title} on a learning panel mapped ${target} to its roadmap. Check each claim against the code:
- demonstrated: the cited code really implements the named topic or pattern, not just something with a similar name.
- misapplied: the cited code really has the stated problem.
- gap: the topic is really absent (search for it) and relevant to what this system does.
Verdicts: confirmed (you verified it), plausible (partly true; say which part in the reason), refuted (wrong or unverifiable). Return one verdict per index.

Claims:
${json(items)}`,
  synth: ({ kept, refutedCount }) => `You chair a roadmap learning panel. The specialists mapped ${target} to the roadmaps, and a skeptic checked each claim and refuted ${refutedCount}. Write a learning map from this data only.

Claims that survived:
${json(kept)}${notCovered()}

Return Markdown:
- Patterns you already use: a table of pattern | roadmap topic | where | how it works here.
- Misapplied: each with the problem and the better approach.
- Coverage by roadmap: for each roadmap on the panel, the topics demonstrated, misapplied and missing; one line for each lens left off the panel, with the reason.
- Study plan: the 5 most valuable gaps, ordered so each builds on the last; for each, why it matters for this system, the exercise, and the roadmap URL (${roadmapUrls}).`,
}

async function runChecked(cfg) {
  const results = await pipeline(
    panel,
    s => runSpecialist(s, cfg.task(s), cfg.schema),
    async (out, s) => {
      if (!out) {
        log(`${s.key}: no result; check that the ${s.agentType} agent is installed`)
        return null
      }
      const items = out[cfg.itemsKey] || []
      if (out.omitted) log(`${s.key}: left out ${out.omitted} lower-priority items (item limit)`)
      if (!items.length) return { s, out, kept: [], refuted: [] }
      // One skeptic per lens checks every finding, lows included: measured
      // runs left real bugs that a specialist under-rated as unverified lows,
      // and only a checked finding can be re-rated upward.
      const toCheck = items.map((item, index) => ({ index, ...item }))
      const verdicts = await agent(cfg.verify(s, toCheck), { label: `${s.key} verify`, phase: 'Challenge', schema: VERDICTS_SCHEMA, effort: 'medium' })
      const checked = applyVerdicts(items, verdicts)
      const rerated = (verdicts ? verdicts.verdicts : []).filter(v => v.severity && items[v.index] && items[v.index].severity && v.severity !== items[v.index].severity).length
      log(`${s.key}: ${items.length} raised, ${checked.kept.length} kept, ${checked.refuted.length} refuted${rerated ? `, ${rerated} re-rated` : ''}${verdicts ? '' : ' (verifier failed, kept as unverified)'}`)
      return { s, out, ...checked }
    },
  )
  const done = results.filter(Boolean)
  if (!done.length) throw new Error('No specialist returned a result.')
  const kept = done.flatMap(r => r.kept.map(item => ({ lens: r.s.key, ...item })))
  const refuted = done.flatMap(r => r.refuted.map(item => ({ lens: r.s.key, ...item })))
  const doneWell = done.flatMap(r => (r.out.done_well || []).map(d => ({ lens: r.s.key, ...d })))
  const report = await agent(cfg.synth({ kept, doneWell, refutedCount: refuted.length }), { label: 'chair', phase: 'Synthesize' })
  const missing = panel.filter(s => !done.some(r => r.s.key === s.key)).map(s => s.key)
  return { mode, target, panel: done.map(r => r.s.key), skipped, missing, brief: context, report, kept, refuted }
}

async function runDesign() {
  const task = s => `${role(s)}

Design problem: ${target}${focus}${contextFor(s)}

1. If the problem names a spec or file, read it. Read the code the design will touch (the context brief maps it when there is one) and any ADRs.
2. Propose the design you would choose from your lens: the approach, the key decisions with the options you rejected, the risks with mitigations, and the requirements from your lens that any final design must meet (each one testable).
3. Prefer the simplest design that meets those requirements, and say what you deliberately left out.
4. List questions only the user can answer.`
  // Barrier: the red team needs every proposal at once to find conflicts between them.
  const proposals = (await parallel(panel.map(s => () =>
    runSpecialist(s, task(s), PROPOSAL_SCHEMA).then(p => (p ? { lens: s.key, ...p } : null)),
  ))).filter(Boolean)
  if (!proposals.length) throw new Error('No specialist returned a proposal.')
  const missing = panel.filter(s => !proposals.some(p => p.lens === s.key)).map(s => s.key)
  if (missing.length) log(`no proposal from: ${missing.join(', ')}`)

  const challenge = await agent(`You are the red team for a design panel. The specialists proposed designs for: ${target}

Proposals:
${json(proposals)}

Attack them. Read the code wherever a claim depends on it. Report objections of four kinds:
- conflict: proposals contradict each other; say which side the evidence favors.
- gap: a failure mode, requirement or operational concern nobody covered (data migration, rollout and rollback, observability, abuse, cost), including concerns of a lens that is not on the panel.
- risk: a decision that fails under realistic load, misuse or partial failure.
- overengineering: complexity the requirements do not justify.
Each objection names the proposal and decision it targets and a concrete resolution. Skip objections you cannot ground in the problem or the code.${notCovered()}`, { label: 'red team', phase: 'Challenge', schema: OBJECTIONS_SCHEMA })
  if (!challenge) log('red team returned nothing; synthesizing without objections')
  const objections = challenge ? challenge.objections : []

  const report = await agent(`You chair a design panel. Merge the specialists' proposals into one design for: ${target}

Proposals:
${json(proposals)}

Red-team objections:
${json(objections)}${notCovered()}

Resolve every conflict and objection explicitly: accept it, reject it with the reason, or defer it to an open question. Return Markdown with these sections:
1. Recommendation: the design in one paragraph.
2. Requirements: numbered and testable; they become the acceptance tests.
3. Design: components and responsibilities, data model, integration, failure handling.
4. Decisions: a table of decision | choice | rejected options | why | roadmap topic.
5. Objections: how each red-team objection was resolved.
6. Risks: each with its mitigation and the signal that would show it happening.
7. Test plan: tests per requirement, plus load or failure tests where a requirement needs them.
8. Draft ADR: Context, Decision, Consequences, Alternatives considered.
9. Open questions for the user, including any lens left off the panel that should weigh in.
10. Learn: the 3 roadmap topics this design leans on most, with their roadmap URLs (${roadmapUrls}).`, { label: 'chair', phase: 'Synthesize' })
  return { mode, target, panel: proposals.map(p => p.lens), skipped, missing, brief: context, report, proposals, objections }
}

log(`${mode} · ${target.length > 120 ? `${target.slice(0, 117)}...` : target}`)
context = input.scope === false ? null : await runMap()
const how = choosePanel()
roadmapUrls = panel.map(s => `${s.key}: ${s.url}`).join('; ')
log(`panel: ${panel.length ? panel.map(s => s.key).join(', ') : 'none'} (${how})${skipped.length ? ` · skipped ${skipped.map(s => s.lens).join(', ')}` : ''}`)
if (!panel.length) {
  // Nothing in the work touches any lens: stop before spending on specialists.
  const reasons = skipped.map(s => `- ${s.lens}: ${s.reason}`).join('\n')
  return { mode, target, panel: [], skipped, missing: [], brief: context, report: `No specialist review needed for ${target}.\n\n${reasons}` }
}
if (mode === 'design') return await runDesign()
return await runChecked(mode === 'review' ? REVIEW : LEARN)
