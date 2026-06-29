# Harness Engineering: A Complete Visual Guide
[[ECC-Visual-Guide[[Claude-Fable-Guide]]]]
## Table of Contents

1. [What Is Harness Engineering?](#what-is-harness-engineering)
2. [Why It Matters](#why-it-matters)
3. [The Seven-Component Architecture](#the-seven-component-architecture)
4. [Default Harness vs Custom Harness](#default-harness-vs-custom-harness)
5. [Real-World Examples](#real-world-examples)
6. [Tools You Can Use Today](#tools-you-can-use-today)
7. [Building Your First Custom Harness](#building-your-first-custom-harness)
8. [The Big Model vs Big Harness Debate](#the-big-model-vs-big-harness-debate)
9. [Skills Checklist](#skills-checklist)
10. [References and Further Reading](#references-and-further-reading)

---

## What Is Harness Engineering?

A **harness** is the infrastructure layer that sits between a language model and the outside world. The model generates text. The harness decides what that text is allowed to *do*.

Harness engineering is the discipline of designing, configuring, and tuning that infrastructure so the agent is reliable, safe, and useful.

```
┌─────────────────────────────────────────────────────────────┐
│                  WHAT A HARNESS DOES                         │
│                                                              │
│   🧠 Language Model                                          │
│      │                                                       │
│      │ generates text                                        │
│      ▼                                                       │
│   ┌─────────────────────────────────────┐                   │
│   │              HARNESS                 │                   │
│   │                                      │                   │
│   │  • Tool orchestration                │                   │
│   │  • Permission gating                 │                   │
│   │  • Context management                │                   │
│   │  • Memory and state                  │                   │
│   │  • Safety guardrails                 │                   │
│   │  • Observability and logging         │                   │
│   └─────────────────┬────────────────────┘                   │
│                     │                                        │
│                     │ executes vetted actions                │
│                     ▼                                        │
│              🌍 The World                                    │
│            (files, shell, APIs, databases)                   │
└─────────────────────────────────────────────────────────────┘
```

### The Core Insight

The model doesn't change. The harness does. As Anthropic's engineering team has noted, even a frontier model running in a loop across multiple context windows will underperform without a well-designed harness — the agent tries to do too much at once or declares the job done prematurely. The harness imposes structure on that tendency.

> 💡 **Key insight:** Prompt engineering tells the model what to do in the moment. Context engineering assembles the materials the model needs. Harness engineering shapes the runtime the model lives inside. All three matter, but harness engineering is what makes agents production-ready.

---

## Why It Matters

### The Five Problems Harnesses Solve

```
┌──────────────────────┬──────────────────────────────────────┐
│      Problem          │  How the Harness Solves It           │
├──────────────────────┼──────────────────────────────────────┤
│ 1. Unbounded actions │ Provides typed tools with strict      │
│                      │ input schemas instead of raw shell    │
├──────────────────────┼──────────────────────────────────────┤
│ 2. Context drift     │ Manages conversation state and        │
│                      │ persistent memory across turns        │
├──────────────────────┼──────────────────────────────────────┤
│ 3. Dangerous ops     │ Permission gating — prompts user      │
│                      │ before destructive actions            │
├──────────────────────┼──────────────────────────────────────┤
│ 4. Silent failures   │ Verifies outputs, runs tests, checks  │
│                      │ types, blocks bad commits             │
├──────────────────────┼──────────────────────────────────────┤
│ 5. No audit trail    │ Logs every tool call, every decision, │
│                      │ every artifact produced               │
└──────────────────────┴──────────────────────────────────────┘
```

### Why "Engineering" and Not Just "Config"

A modern production-ready harness is a **layered system** — not a config file. You're designing for:

- Reliability across thousands of runs
- Safety in the face of model mistakes
- Auditability for compliance review
- Speed of iteration when patterns change
- Composability when multiple agents need to cooperate

---

## The Seven-Component Architecture

A recent MBZUAI study found that **four independent teams** building agent harnesses — Anthropic (Claude Code), OpenAI (Codex CLI), Aider (open source), and OpenClaw — all converged on the **same seven-component architecture**. That convergence is one of the strongest signals available that this structure isn't a preference, it's a constraint imposed by the problem itself.

```
              ┌──────────────────────────────────────┐
              │  1. User Interface                    │
              │     CLI, IDE plugin, chat UI          │
              └────────────────┬─────────────────────┘
                               │
              ┌────────────────▼─────────────────────┐
              │  2. Agent Loop                        │
              │     model call → tool exec → result   │
              │     capture → repeat                  │
              └────────────────┬─────────────────────┘
                               │
              ┌────────────────▼─────────────────────┐
              │  3. Permission System                 │
              │     gates every tool call through     │
              │     sequential safety checks          │
              └────────────────┬─────────────────────┘
                               │
              ┌────────────────▼─────────────────────┐
              │  4. Tools Layer                       │
              │     file read/write, shell, search,   │
              │     web fetch, git, MCP servers       │
              └────────────────┬─────────────────────┘
                               │
              ┌────────────────▼─────────────────────┐
              │  5. State and Persistence             │
              │     conversation history, memory,     │
              │     handoff files, session storage    │
              └────────────────┬─────────────────────┘
                               │
              ┌────────────────▼─────────────────────┐
              │  6. Execution Environment             │
              │     sandbox, OS user, network egress, │
              │     containers, virtualization        │
              └────────────────┬─────────────────────┘
                               │
              ┌────────────────▼─────────────────────┐
              │  7. Observability                     │
              │     logs, traces, audits, metrics     │
              └──────────────────────────────────────┘
```

### Two Sub-Disciplines

The Konishi article on harness engineering splits this into two parallel disciplines:

```
┌──────────────────────────┐    ┌──────────────────────────┐
│  HARNESS ENGINEERING     │    │  ENVIRONMENT ENGINEERING │
│                          │    │                          │
│  Shapes the agent        │    │  Bounds the world the    │
│  runtime itself:         │    │  agent acts in:          │
│                          │    │                          │
│  • Which tools allowed   │    │  • OS user permissions   │
│  • Which hooks fire      │    │  • Sandbox container     │
│  • Which MCP servers     │    │  • Network egress rules  │
│  • What CLAUDE.md says   │    │  • Filesystem mounts     │
└──────────────────────────┘    └──────────────────────────┘
            │                              │
            └──────────────┬───────────────┘
                           ▼
                ┌────────────────────┐
                │  Together they     │
                │  shape what the    │
                │  agent can SEE,    │
                │  TOUCH, and CHANGE │
                └────────────────────┘
```

---

## Default Harness vs Custom Harness

```
                  DEFAULT HARNESS                CUSTOM HARNESS
                  ────────────────                ──────────────
                  (what Claude Code ships)        (what you build on top)

Purpose           General-purpose reliability     Organizational accountability

Includes          File read/write                Compliance linters
                  Shell execution                Code ownership rules
                  Multi-step loop                Audit logging
                  Permission prompts             Custom tool integrations
                  ~19 built-in tools             Domain-specific guardrails

Designed for      Any developer, any project     Your team, your codebase
```

> 💡 **The Faros AI take:** The prebuilt harness gives the agent general-purpose reliability. The custom harness gives it organizational accountability. **Both are necessary. Neither replaces the other.**

### What a Custom Harness Layer Looks Like

```
   ┌─────────────────────────────────────────────┐
   │  Your Custom Layer                          │
   │  ┌───────────────────────────────────────┐ │
   │  │ Pre-commit compliance linter          │ │
   │  │ Migration file write-block            │ │
   │  │ Audit log to internal system          │ │
   │  │ Approval workflow for PRs over X LOC  │ │
   │  └───────────────────────────────────────┘ │
   └────────────────────┬────────────────────────┘
                        │ wraps and gates
                        ▼
   ┌─────────────────────────────────────────────┐
   │  Claude Code Default Harness                │
   │  (read, write, shell, git, search, etc.)    │
   └─────────────────────────────────────────────┘
```

---

## Real-World Examples

### Example 1: Fintech with Compliance Requirements

A mid-sized fintech company adopts Claude Code across their backend team. The default harness covers read/write/test, but they need more:

```
🏦 FINTECH CUSTOM HARNESS REQUIREMENTS

   ✅ Every PR touching payment logic must pass a proprietary
      compliance linter before submission

   ✅ Agents must never modify database migration files
      without a human sign-off

   ✅ All agent activity must be logged to an internal audit
      system for regulatory review
```

None of that exists in the default harness, so the team builds a custom layer that sits between the agent and their codebase. **The model hasn't changed. Claude Code's default hasn't changed. The custom harness does the work.**

### Example 2: Multi-Agent Orchestration Pipeline

```
                   ┌──────────────────┐
                   │  Issue arrives   │
                   │  in tracker      │
                   └────────┬─────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │  Triage Agent    │
                   │  (classifies,    │
                   │   routes work)   │
                   └────────┬─────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │  Claude Code     │
                   │  writes the fix  │
                   └────────┬─────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │  Review Agent    │
                   │  (checks the fix,│
                   │   blocks if bad) │
                   └────────┬─────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │  Draft PR opens  │
                   │  for human       │
                   └──────────────────┘
```

Each step is a different agent with a different harness configuration. The orchestrator on top is yet another piece of harness engineering.

### Example 3: Long-Horizon Coding Tasks

Stripe used Claude Fable 5 in an agent harness to perform a codebase-wide migration on a 50-million-line Ruby codebase — work that would have taken a team **over two months by hand** — in a single day. The model is part of it. The harness around the model is what made the long-horizon autonomous work possible.

---

## Tools You Can Use Today

### ECC (Everything Claude Code)

> github.com/affaan-m/ecc

A complete harness extension that drops into `~/.claude`. Installs 467 files of skills, agents, slash commands, hooks, and rules. **This is harness engineering productized.**

```
After installing ECC, your harness gains:
   ├── 50+ specialized agents (python-reviewer, security-reviewer, etc.)
   ├── 80+ slash commands (/code-review, /save-session, /orchestrate)
   ├── Auto-format hooks (run on every edit)
   ├── Pre-commit quality gates
   ├── Session handoff and resume
   └── Per-language coding standards
```

### Superpowers

> github.com/obra/superpowers

Skills bundle focused on the systematic-debugging four-phase workflow, TDD enforcement, git worktree usage, and parallel subagent dispatching. Plugs into the same `~/.claude/skills` directory.

### MCP (Model Context Protocol)

The standard for adding external tools to your harness. Lets Claude Code talk to GitHub, Slack, databases, custom internal APIs, and more — without modifying the harness itself.

### CLAUDE.md

The simplest form of harness customization. A `CLAUDE.md` file in the repo root automatically injects team-specific instructions into every session. Lightweight, but persistent. Most teams start here.

### Hooks

Scripts that fire automatically on harness events:

```
🔄 EVENT-DRIVEN HOOKS

   post-edit        runs after a file is edited
                    → auto-format, type-check

   pre-bash         runs before a shell command
                    → block dangerous patterns, require confirmation

   pre-commit       runs before git commit
                    → quality gate, ban no-verify

   session-end      runs when the session closes
                    → save session, generate handoff
```

---

## Building Your First Custom Harness

### Step 1: Start with CLAUDE.md

Put a `CLAUDE.md` file in your repo root with the rules your team actually follows:

```markdown
# Project Conventions

## Code Style
- Python: black, type hints required on public functions
- Always run pytest before claiming a feature is done

## Workflow
- Branch naming: feature/<short-desc>, fix/<short-desc>
- Commits: conventional commits (feat:, fix:, chore:)

## Don'ts
- Never modify alembic/versions/* without explicit approval
- Never commit secrets — use the project's .env.example
```

### Step 2: Add One Hook

Pick the single most painful repetitive task and automate it via a hook. Format-on-edit is usually the best first choice — it's high-value and low-risk.

### Step 3: Install ECC for Heavy Lifting

If you find yourself building lots of similar tooling, install ECC and let it provide the foundation. Customize from there rather than rebuilding from scratch.

### Step 4: Add Custom Tools via MCP

When the agent needs to talk to your internal systems (Jira, internal API, custom database), expose them as MCP tools rather than embedding API keys in prompts.

### Step 5: Layer in Observability

Log every tool call. When something goes wrong (and it will), the log is what tells you whether the model misbehaved or the harness misbehaved.

---

## The Big Model vs Big Harness Debate

There's a real argument happening in the agent space:

```
                BIG MODEL                       BIG HARNESS
                ─────────                       ───────────
                Camp:                           Camp:
                "As reasoning improves,         "Convergent architectures
                 scaffolding becomes             across competing teams
                 redundant. Bet on the           prove harnesses are
                 model getting smarter."         structural, not optional."

                Proxies:                        Proxies:
                Boris Cherny (Anthropic),       MBZUAI research team,
                Noam Brown (OpenAI)             Obvix Labs, ECC author

                Evidence:                       Evidence:
                METR found Claude Code          Four competing teams
                doesn't consistently beat       independently built the
                a basic scaffold on certain     same 7-component
                tasks. Scale AI's SWE-Atlas     architecture. That kind
                showed harness choice was       of convergence isn't
                within margin of error for      preference — it's a
                some models.                    constraint.
```

### The Honest Read

Both camps are partially selling something. The honest middle position is that for **short, well-defined tasks**, the model is most of the answer. For **long-horizon, multi-step, production-quality work**, the harness is where the differentiation happens.

> 💡 **Practical takeaway:** Don't pick a side. Use the best model you can afford *and* invest in your harness. The two compound.

---

## Skills Checklist

What you should be comfortable with to call yourself good at harness engineering:

```
□  Read and write a CLAUDE.md that actually shapes behavior
□  Configure permissions to block dangerous operations
□  Write a hook that fires on edit, bash, or commit events
□  Add a custom MCP tool to extend the agent's reach
□  Design a multi-agent orchestration where agents hand off work
□  Implement session save/resume for long-running tasks
□  Add observability so you can audit what the agent did
□  Use sandboxing to limit blast radius of mistakes
□  Build a verification step that runs after every change
□  Manage context window — proactive compaction or handoff
```

---

## References and Further Reading

### Primary Articles

| Resource | What It Covers | Link |
|---|---|---|
| **Faros AI — Harness Engineering** | Making AI coding agents work in 2026. Best overview of the discipline. | faros.ai/blog/harness-engineering |
| **MindStudio — What Is an Agent Harness?** | The architecture behind Claude Code, Codex, and Cursor. | mindstudio.ai/blog/what-is-agent-harness-architecture-explained |
| **WaveSpeed — Claude Code Agent Harness** | Architecture breakdown of Claude Code's 19+ tools. | wavespeed.ai/blog/posts/claude-code-agent-harness-architecture |
| **Konishi — Harness and Environment Engineering** | Implementation-level companion. Splits the discipline into two sub-disciplines. | hidekazu-konishi.com/entry/claude_code_harness_and_environment_engineering_guide.html |
| **TechTimes — 98% Convergence Study** | Four competing teams built the same harness. | techtimes.com/articles/316928/20260521 |
| **Ken Huang — The Harness Paradigm** | Substack series, Chapter 1 lays out the QueryEngine. | kenhuangus.substack.com/p/found-from-claude-code-chapter-1 |

### Tools and Frameworks

| Tool | What It Is | Link |
|---|---|---|
| **ECC** | Full harness extension for Claude Code, Codex, Cursor | github.com/affaan-m/ecc |
| **Superpowers** | Skills bundle, systematic debugging and TDD workflows | github.com/obra/superpowers |
| **Anthropic Claude Code docs** | Official documentation | docs.claude.com |
| **MCP** | Model Context Protocol for tool integration | modelcontextprotocol.io |


---
