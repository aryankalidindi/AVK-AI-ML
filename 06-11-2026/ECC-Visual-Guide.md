# ECC: Everything Claude Code — A Complete Visual Guide

[[Claude-Fable-Guide]] [[Harness-Engineering-Guide]]
## Table of Contents

1. [What Is ECC?](#what-is-ecc)
2. [The Operator System Philosophy](#the-operator-system-philosophy)
3. [Core Components at a Glance](#core-components-at-a-glance)
4. [How ECC Works](#how-ecc-works)
5. [Installation Workflow](#installation-workflow)
6. [The Command Ecosystem](#the-command-ecosystem)
7. [Context Management: Compaction vs Handoff](#context-management-compaction-vs-handoff)
8. [Day-One Commands](#day-one-commands)
9. [ECC vs. Vanilla Claude Code](#ecc-vs-vanilla-claude-code)
10. [Quick Reference Cheatsheet](#quick-reference-cheatsheet)

---

## What Is ECC?

ECC (Everything Claude Code) is a **harness-native operator system for agentic engineering work**. It bundles together skills, agents, slash commands, hooks, and rules into a single install that plugs into Claude Code and other AI coding harnesses. Built from 10+ months of intensive daily use on real production projects.


┌─────────────────────────────────────────────────────────────┐
│                    ~/.claude (after ECC)                     │
│                                                              │
│   📁 Your Home Directory                                     │
│      └── 📂 .claude/                                         │
│            ├── 📂 skills/      ← specialized workflows       │
│            ├── 📂 agents/      ← specialized sub-agents      │
│            ├── 📂 commands/    ← 80+ slash commands          │
│            ├── 📂 hooks/       ← automated triggers          │
│            ├── 📂 rules/       ← always-on standards         │
│            └── 📂 mcp-configs/ ← MCP server presets          │
│                                                              │
│   467 files installed in one command.                        │
│   Works across Claude Code, Codex, Cursor, Gemini, Zed.      │
└─────────────────────────────────────────────────────────────┘
```

### Why "Operator System"?

A raw LLM in your terminal is a generalist. ECC layers structure on top so the agent behaves like a senior engineer who already knows your patterns, your standards, and your workflow. Every interaction:

- Gets **scoped** by specialized agents instead of one giant prompt
- Gets **constrained** by language-specific rules
- Gets **automated** through hooks that fire on edit, bash, and commit events

---

## The Operator System Philosophy

The core idea behind ECC is that **prompt engineering doesn't scale**. The author spent months handcrafting elaborate CLAUDE.md files for each project. ECC is the result of distilling those patterns into reusable infrastructure.

> 📸 **Source screenshot** — *[paste screenshot from the Affaan ECC article at https://x.com/affaan/article/2014040193557471352 here]*

```
  ╔══════════╗     ╔═══════════╗     ╔═══════════╗     ╔══════════════╗
  ║  CAPTURE ║────▶║  CODIFY   ║────▶║  INSTALL  ║────▶║   COMPOSE    ║
  ╚══════════╝     ╚═══════════╝     ╚═══════════╝     ╚══════════════╝
  Repeated          Turn them          One command         Agents call
  workflows         into skills,       deploys it all      each other
  and patterns      agents, hooks      to ~/.claude        as workflows
```

> **The KEY insight:** A great agent is not just a great LLM, it's a great LLM plus a great operating environment. ECC ships that environment.

---

## Core Components at a Glance

| Component | What It Does | Visual Metaphor |
|---|---|---|
| **Skills** | Domain-specific instruction files Claude loads on demand | Reference manuals on a shelf |
| **Agents** | Specialized sub-agents Claude can delegate to | A team of senior engineers |
| **Commands** | 80+ slash commands accessible via `/command-name` | A toolbox of power tools |
| **Hooks** | JS scripts that fire on edit, bash, and commit events | Tripwires that auto-respond |
| **Rules** | Always-on coding standards per language | Team coding conventions |
| **MCP Configs** | Pre-built MCP server configurations | Plug-and-play integrations |
| **Memory & Learning** | Session tracking, instinct capture, continuous learning | A workshop logbook |
| **Cross-Harness** | Same configs work on Codex, Cursor, Gemini, Zed | Universal adapter |



---

## How ECC Works

### The Agent Network

Unlike a single-shot LLM call, ECC structures Claude as a network of specialized agents that delegate to each other.

```
                        ┌──────────────────┐
                        │   Main Claude    │
                        │   (orchestrator) │
                        └────────┬─────────┘
                                 │ delegates to
                   ┌─────────────┼─────────────┐
                   ▼             ▼             ▼
           ┌───────────┐  ┌──────────┐  ┌──────────────┐
           │  Python   │  │   TDD    │  │   Security   │
           │  Reviewer │  │  Guide   │  │   Reviewer   │
           └─────┬─────┘  └────┬─────┘  └──────┬───────┘
                 │              │                │
                 └──────────────▼────────────────┘
                                │ all report back
                        ┌───────┴────────┐
                        │  Orchestrator  │
                        │  synthesizes   │
                        └────────────────┘
```

### The Hooks Layer

Hooks fire automatically on certain events so Claude is constantly enforcing standards without you having to ask.

```
        EDIT FILE                BASH COMMAND             COMMIT
            │                          │                      │
            ▼                          ▼                      ▼
   ┌─────────────────┐       ┌──────────────────┐    ┌──────────────────┐
   │ post-edit-      │       │ pre-bash-commit- │    │ governance-      │
   │ format          │       │ quality          │    │ capture          │
   └─────────────────┘       └──────────────────┘    └──────────────────┘
   ┌─────────────────┐       ┌──────────────────┐    ┌──────────────────┐
   │ post-edit-      │       │ pre-bash-git-    │    │ session-end      │
   │ typecheck       │       │ push-reminder    │    │                  │
   └─────────────────┘       └──────────────────┘    └──────────────────┘
```



### The Skills Loader

Skills are just markdown files. Claude loads the relevant one when the situation calls for it.

```markdown
# In ~/.claude/skills/python-patterns/SKILL.md

When working in Python:
- Use type hints on public functions
- Prefer dataclasses over plain dicts for structured data
- Run pytest before claiming a feature works
- Follow PEP 8 style
```

---

## Installation Workflow

### Prerequisites

```
□  Node.js installed     (brew install node)
□  Git installed          (brew install git)
□  Claude Code CLI installed
```

### The Three-Step Install

```
Step 1 ─── Clone the ECC repo
             git clone https://github.com/affaan-m/ecc ~/.claude/ecc
             │
Step 2 ─── Install the universal CLI globally
             npm install -g ecc-universal
             │
Step 3 ─── Run the installer with the developer profile
             npx ecc install --profile developer --target claude
```


After install, restart Claude Code, type `/help`, and tab over to "Custom commands" to see everything that landed.

### Profiles

| Profile | Use When |
|---|---|
| `developer` | Full kit — recommended default |
| `core` | Minimal install, just rules and core commands |
| `framework:nextjs` | Adds Next.js patterns on top |
| `framework:django` | Adds Django patterns on top |

Run `npx ecc catalog profiles` to see the full list.

> ⚠️ **Warning:** ECC installs 467 files into `~/.claude`. If you've already customized that folder, back it up first. ECC also writes an `install-state.json` so you can cleanly uninstall later with `npx ecc uninstall`.

---

## The Command Ecosystem

ECC ships 80+ slash commands. Here are the most useful ones grouped by purpose.

### Code Quality

```
┌──────────────────────┬───────────────────────────────────────────┐
│       Command        │  What it does                             │
├──────────────────────┼───────────────────────────────────────────┤
│ /code-review         │ General-purpose review of recent changes  │
├──────────────────────┼───────────────────────────────────────────┤
│ /python-review       │ Specialized Python review agent           │
├──────────────────────┼───────────────────────────────────────────┤
│ /rust-review         │ Specialized Rust review agent             │
├──────────────────────┼───────────────────────────────────────────┤
│ /refactor-clean      │ Removes dead code and tightens patterns   │
├──────────────────────┼───────────────────────────────────────────┤
│ /quality-gate        │ Blocks low-quality commits                │
├──────────────────────┼───────────────────────────────────────────┤
│ /test-coverage       │ Analyzes test gaps                        │
└──────────────────────┴───────────────────────────────────────────┘
```

### Planning & Implementation

```
┌──────────────────────┬───────────────────────────────────────────┐
│       Command        │  What it does                             │
├──────────────────────┼───────────────────────────────────────────┤
│ /plan                │ Structured planning before implementation │
├──────────────────────┼───────────────────────────────────────────┤
│ /prp-prd             │ Generate a Product Requirements Doc       │
├──────────────────────┼───────────────────────────────────────────┤
│ /prp-plan            │ Generate an implementation plan from PRD  │
├──────────────────────┼───────────────────────────────────────────┤
│ /prp-implement       │ Execute the plan step by step             │
├──────────────────────┼───────────────────────────────────────────┤
│ /prp-pr              │ Open a draft PR with the changes          │
├──────────────────────┼───────────────────────────────────────────┤
│ /orchestrate         │ Runs parallel sub-agents on different     │
│                      │ parts of a task                           │
└──────────────────────┴───────────────────────────────────────────┘
```

### Session Management

```
┌──────────────────────┬───────────────────────────────────────────┐
│       Command        │  What it does                             │
├──────────────────────┼───────────────────────────────────────────┤
│ /checkpoint          │ Save a recoverable mid-session point      │
├──────────────────────┼───────────────────────────────────────────┤
│ /save-session        │ Dump full state to disk for handoff       │
├──────────────────────┼───────────────────────────────────────────┤
│ /resume-session      │ Load state into a fresh Claude session    │
├──────────────────────┼───────────────────────────────────────────┤
│ /context-budget      │ Show context window usage                 │
├──────────────────────┼───────────────────────────────────────────┤
│ /prune               │ Drop irrelevant context proactively       │
└──────────────────────┴───────────────────────────────────────────┘
```


---

## Context Management: Compaction vs Handoff

This is where ECC adds the most value over vanilla Claude Code. Long sessions degrade model intelligence as the context window fills up. ECC provides tools for both approaches.

### Compaction (The Automated Band-Aid)

```
  Context hits ~75%
         │
         ▼
  ┌─────────────────┐
  │ Claude forks    │
  │ a sub-agent     │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │ Sub-agent       │  ← Lossy! Drops rationale,
  │ summarizes      │     edge cases, specific
  │ chat history    │     numbers, decisions
  └────────┬────────┘
           │ injects back
           ▼
  ┌─────────────────┐
  │ Same terminal,  │
  │ flattened       │
  │ history         │
  └─────────────────┘
```

### Handoff (The Architectural Strategy)

```
  Before context fills
         │
         ▼
  ┌─────────────────┐
  │ /save-session   │  ← deliberate dump
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │ Markdown file   │  ← persistent on disk
  │ on disk         │     readable forever
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │ NEW Claude      │  ← zero history,
  │ Code session    │     peak intelligence
  └────────┬────────┘
           │ runs /resume-session
           ▼
  ┌─────────────────┐
  │ Fresh agent,    │
  │ full state      │
  │ restored        │
  └─────────────────┘
```

> **Key difference:** Compaction keeps the terminal running but Claude acts like it has mild amnesia. Handoff trades the terminal for a fresh agent with full memory of where you were.

| Feature | Compaction | Handoff |
|---|---|---|
| Primary goal | Survive context limit | Restore full intelligence |
| Mechanism | Automated summarization | Manual state dump to disk |
| Data loss | High | Low |
| Window state | Same window, flattened | Fresh window, empty |
| Control | Automated by Claude | Triggered by `/save-session` |


---

## Day-One Commands

These are the commands worth trying first to see ECC's value immediately.

```
👨‍💻 DEVELOPER (any language)
   ├── /code-review            — review pending changes
   ├── /test-coverage          — find test gaps
   ├── /quality-gate           — block bad commits
   └── /checkpoint             — save your spot

🐍 PYTHON-SPECIFIC
   ├── /python-review          — specialized Python reviewer agent
   └── /tdd                    — runs the TDD workflow

🔄 LONG-RUNNING WORK
   ├── /plan                   — plan before coding
   ├── /orchestrate            — multi-agent parallel work
   ├── /save-session           — handoff to a fresh session
   └── /resume-session         — pick up exactly where you left off
```

---

## ECC vs. Vanilla Claude Code

```
                       VANILLA      ECC
                       Claude Code  
                       ──────────   ──────────
Specialized agents     ❌            ✅ (50+)
Slash commands         basic         ✅ (80+)
Language rules         ❌            ✅ (14 langs)
Auto-format hooks      ❌            ✅
Session handoff        ❌            ✅
Cross-harness          ❌            ✅
Memory & learning      ❌            ✅
MCP presets            ❌            ✅
Quality gates          ❌            ✅
```


**When to use ECC:**
- You work in Claude Code daily and your workflows are getting repetitive
- You want specialized reviewers for different languages
- You run into context window limits regularly
- You collaborate across multiple AI harnesses

**When vanilla Claude Code is enough:**
- You use Claude Code occasionally for one-off tasks
- You prefer minimal configuration
- You don't want to install npm packages globally

---

## Quick Reference Cheatsheet

### Install One-Liner

```bash
git clone https://github.com/affaan-m/ecc ~/.claude/ecc && \
npm install -g ecc-universal && \
npx ecc install --profile developer --target claude
```

### Most Used Commands

```
/help                Show all available commands
/code-review         Review recent changes
/python-review       Python-specialized review
/test-coverage       Analyze test gaps
/plan                Structured planning workflow
/checkpoint          Save mid-session state
/save-session        Full handoff dump
/resume-session      Load handoff state
/orchestrate         Run parallel sub-agents
```

### Health Check Checklist

```
□  ~/.claude/skills exists with 50+ skill folders
□  ~/.claude/agents has 50+ agent files
□  ~/.claude/commands has 80+ command files
□  /help → "Custom commands" shows ECC commands
□  Hooks fire on edit (test by editing a Python file)
□  `npx ecc doctor --target claude` reports healthy
```

---

## Further Resources

| Resource | Type | What You'll Learn |
|---|---|---|
| [github.com/affaan-m/ecc](https://github.com/affaan-m/ecc) | Repo | Full docs and source |
| [ecc.tools](https://ecc.tools) | Official site | Pricing, hosted features |
| [Affaan on X](https://x.com/affaan) | Author | Updates and tips |
| [ECC release notes](https://github.com/affaan-m/ecc/blob/main/RELEASE-NOTES.md) | Changelog | What's new each version |
| [obra/superpowers](https://github.com/obra/superpowers) | Related | Alternative skills bundle |

---
