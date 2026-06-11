# Claude Fable 5: A Complete Visual Guide

## Table of Contents

1. [What Is Claude Fable?](#what-is-claude-fable)
2. [Fable vs Mythos: Same Brain, Different Guardrails](#fable-vs-mythos-same-brain-different-guardrails)
3. [The Model Family at a Glance](#the-model-family-at-a-glance)
4. [Core Capabilities](#core-capabilities)
5. [How the Safety Classifiers Work](#how-the-safety-classifiers-work)
6. [Real-World Performance](#real-world-performance)
7. [Pricing and Availability](#pricing-and-availability)
8. [How to Use Fable Today](#how-to-use-fable-today)
9. [Fable vs Previous Claude Models](#fable-vs-previous-claude-models)
10. [Quick Reference Cheatsheet](#quick-reference-cheatsheet)

---

## What Is Claude Fable?

Claude Fable 5 is Anthropic's **most capable widely released model**, launched on June 9, 2026. It's a Mythos-class model — meaning it sits above the Opus tier in capability — that has been made safe for general use through new safety classifiers.

```
┌─────────────────────────────────────────────────────────────┐
│                  CLAUDE MODEL FAMILY (2026)                  │
│                                                              │
│   🟣 Mythos    ← frontier tier, restricted access            │
│       └── Mythos 5  (Project Glasswing, trusted partners)    │
│                                                              │
│   🟢 Fable     ← Mythos-class, publicly available            │
│       └── Fable 5   (same model + safety classifiers)        │
│                                                              │
│   🔵 Opus      ← previous flagship, still excellent          │
│       └── Opus 4.8                                           │
│                                                              │
│   🟡 Sonnet    ← balanced workhorse                          │
│       └── Sonnet 4.6                                         │
│                                                              │
│   🟠 Haiku     ← fast and cheap                              │
│       └── Haiku 4.5                                          │
└─────────────────────────────────────────────────────────────┘
```

### Why "Fable"?

The name comes from the Latin *fabula*, meaning "that which is told" — directly related to the Greek *mythos*. Fable and Mythos are the **same underlying model**. The names differ because the safeguards differ.

> 💡 **Key insight:** Fable is not a weaker version of Mythos. It's the same intelligence with guardrails in three high-risk domains: cybersecurity, biology/chemistry, and distillation.

---

## Fable vs Mythos: Same Brain, Different Guardrails

```
                    ┌──────────────────────┐
                    │  Shared Foundation   │
                    │   (same weights)     │
                    └──────────┬───────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                              ▼
        ┌──────────────┐              ┌──────────────┐
        │  Fable 5     │              │  Mythos 5    │
        │  (public)    │              │  (restricted)│
        ├──────────────┤              ├──────────────┤
        │ Safeguards   │              │ Safeguards   │
        │ ON in:       │              │ LIFTED for   │
        │              │              │ approved     │
        │ • Cyber      │              │ partners     │
        │ • Bio/Chem   │              │ in their     │
        │ • Distill    │              │ domain       │
        └──────────────┘              └──────────────┘
            │                                  │
            │ Available via                    │ Available via
            ▼                                  ▼
        Everyone with                  Project Glasswing
        Claude API or                  partners and select
        subscription                   bio researchers
```

### What Triggers a Fallback?

When Fable's classifiers detect a query in a restricted domain, the request is routed to **Claude Opus 4.8** instead. The user is notified, and there's no charge at Fable pricing for the rerouted request.

Anthropic reports that **over 95% of Fable sessions involve no fallback at all** — meaning most users get the full Fable experience.

---

## The Model Family at a Glance

| Model | Tier | Access | Strengths |
|---|---|---|---|
| **Mythos 5** | Frontier | Project Glasswing, trusted access | Cybersecurity, drug design, biology research |
| **Fable 5** | Frontier (gated) | Public — API + subscriptions | Coding, knowledge work, vision, long-horizon tasks |
| **Opus 4.8** | High-capability | Public | General-purpose, fallback for Fable refusals |
| **Sonnet 4.6** | Balanced | Public | Speed-quality balance |
| **Haiku 4.5** | Fast | Public | Quick tasks, cost-sensitive workloads |

---

## Core Capabilities

### Software Engineering

```
  Long-horizon coding tasks that previous models couldn't sustain
                            │
                            ▼
              ┌──────────────────────────┐
              │ Days-long autonomous work│
              │ in agent harnesses like  │
              │ Claude Code              │
              └──────────────────────────┘
                            │
                            ▼
              ┌──────────────────────────┐
              │ State-of-the-art on:     │
              │ • CursorBench            │
              │ • FrontierCode           │
              │ • ViBench                │
              └──────────────────────────┘
```

### Knowledge Work and Vision

Fable 5 is strongest-ever Claude on:
- Document-based reasoning, chart and table interpretation
- Extracting precise numbers from scientific figures
- Rebuilding source code from screenshots alone
- Playing complex games like Pokémon FireRed using only raw screenshots (no maps, no game state, no helper harness)

### Memory and Long Context

```
  Without persistent memory          With persistent memory
        ───────────                       ──────────────
                                     ┌─────────────────┐
                                     │ Fable writes its│
        (forgets across              │ own notes,      │
         long sessions)              │ reads them back │
                                     │ in next turn    │
                                     └────────┬────────┘
                                              │
                                              ▼
                                       ~3x improvement
                                       on Slay the Spire
```

When given file-based memory, Fable 5 reached the final act of *Slay the Spire* three times more often than Opus 4.8.

### Life Sciences (Mythos 5)

With cyber safeguards in place but biology lifted (under the upcoming trusted access program), Mythos 5 has shown:
- ~10x acceleration in protein design workflows
- Matches or beats skilled human operators on drug design end-to-end
- Generates novel molecular biology hypotheses that scientists prefer ~80% of the time in blind reviews

---

## How the Safety Classifiers Work

```
┌─────────────────────────────────────────────────────────────┐
│                  USER QUERY ENTERS FABLE                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Classifier check      │
              │  (separate AI system)  │
              └───────────┬────────────┘
                          │
              ┌───────────┴────────────┐
              ▼                        ▼
      ┌──────────────┐         ┌──────────────────┐
      │ Safe query   │         │ Flagged in:      │
      │ (~95%+ of    │         │ • Cyber          │
      │ sessions)    │         │ • Bio / Chem     │
      └──────┬───────┘         │ • Distillation   │
             │                 └────────┬─────────┘
             ▼                          │
      ┌──────────────┐                  ▼
      │ Fable 5      │         ┌──────────────────┐
      │ responds     │         │ Opus 4.8         │
      │ at full      │         │ handles instead, │
      │ capability   │         │ user notified,   │
      └──────────────┘         │ no Fable charge  │
                               └──────────────────┘
```

### The Three Restricted Domains

| Domain | Why Restricted |
|---|---|
| **Cybersecurity** | Models can discover and exploit software vulnerabilities, making cyberattacks easier and cheaper |
| **Biology & Chemistry** | Dual-use risk — same skills that help drug discovery could help design dangerous pathogens |
| **Distillation** | Prevents bad actors from extracting Fable's capabilities to train competing models without safeguards |

> ⚠️ **Trade-off:** Anthropic has deliberately tuned the classifiers to be **cautious**. Some harmless queries will trigger fallbacks. The plan is to narrow the safeguards over time as confidence builds.

---

## Real-World Performance

### Customer Reports from Early Access

```
🏢 STRIPE
   └── A 50M-line Ruby codebase migration that would normally
       take a team 2+ months — completed in one day.

🏢 CURSOR
   └── State of the art on CursorBench. Opens up a class of
       long-horizon problems that were out of reach before.

🏢 GITHUB
   └── Took on complex, long-horizon coding tasks with a level
       of autonomy and reliability exceeding previous benchmarks.

🏢 HEBBIA
   └── Highest score of any model on their senior-level
       finance reasoning benchmark.

🏢 COGNITION
   └── Highest-scoring model on FrontierBench. Generalizes
       to unfamiliar tools out of the box.
```

### Showcase Demos

| Demo | What Fable Built |
|---|---|
| **Solar system simulation** | Derived planetary orbits from physics first principles, used them to predict solar eclipses |
| **Factorio** | Autonomously plays the factory-building game, strategizing and building automated factories |
| **VibeCAD** | A complete 3D-printable model in a browser CAD editor — and the editor itself, including built-in AI copilot |
| **Music + fluid sim** | Synced a fluid simulation to a classical EDM remix that Fable produced via code, having never heard music before |

---

## Pricing and Availability

### Cost

```
  ┌─────────────────────────────────────────────┐
  │  Claude Fable 5 + Mythos 5                  │
  │                                             │
  │  Input tokens:   $10 per million            │
  │  Output tokens:  $50 per million            │
  │                                             │
  │  → Less than half the price of              │
  │    Claude Mythos Preview                    │
  │                                             │
  │  → 90% input token discount still           │
  │    applies for prompt caching               │
  └─────────────────────────────────────────────┘
```

### Subscription Rollout (Pro / Max / Team / Enterprise)

```
  June 9 → June 22, 2026
  ─────────────────────
  ✅ Fable 5 included at NO EXTRA COST
     on Pro, Max, Team, and seat-based Enterprise plans

  June 23, 2026 →
  ───────────────
  ⚠️  Fable 5 removed from included plans
     Requires usage credits going forward

  Future (as capacity allows) →
  ─────────────────────────────
  ✅ Fable 5 restored as standard part of subscription plans
```

### API Access

- API model string: `claude-fable-5`
- Available immediately on the Claude API
- Available on the consumption-based Enterprise plan
- Available on Amazon Bedrock, Google Cloud Vertex AI, and Microsoft Foundry

### Data Retention Requirement

> ⚠️ **Important:** Using Fable 5 requires **30-day data retention** for safety monitoring. The data is not used to train new models or for any non-safety purpose, and is deleted after 30 days in almost all cases.

---

## How to Use Fable Today

### For Subscription Users

```
Step 1 ─── Open Claude (claude.ai or the app)
             │
Step 2 ─── Open the model picker
             │
Step 3 ─── Select Claude Fable 5
             │
Step 4 ─── Start your conversation
             │
Step 5 ─── If a query falls back to Opus 4.8,
             you'll see a notification
```

### For Developers

```python
# Python example
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-fable-5",
    max_tokens=4096,
    messages=[
        {"role": "user", "content": "Your prompt here"}
    ]
)
```

### What to Try First

```
🚀 BEST USE CASES FOR FABLE 5

   📂 Large codebase refactors
      └── Migrations, modernization, large-scale changes

   🎯 Long-horizon planning
      └── Multi-step research, planning, execution

   👁️  Vision-heavy work
      └── Diagrams, charts, screenshots, scientific figures

   📊 Senior-level analysis
      └── Finance, legal redlines, scientific reasoning

   🧠 Long-running agent work
      └── Days-long tasks in Claude Code or other harnesses
```

---

## Fable vs Previous Claude Models

```
                       FABLE 5    OPUS 4.8    SONNET 4.6
                       ───────    ────────    ──────────
Mythos-class            ✅          ❌           ❌
Long-horizon tasks      ✅✅✅       ✅           ⚠️
Vision SOTA             ✅          ⚠️           ⚠️
Coding SOTA             ✅          ✅           ⚠️
Safety classifiers      ✅          partial      partial
Available in API        ✅          ✅           ✅
Included in Pro plan    ⚠️ temp     ✅           ✅
Price (input / output)  $10/$50     $15/$75     $3/$15
```

> 💡 **When to use Fable vs Opus:** Use Opus 4.8 for short, well-defined tasks where you want speed and don't want to risk a classifier fallback. Use Fable 5 for long-horizon, complex, multi-step work where you need the strongest possible reasoning.

---

## Quick Reference Cheatsheet

### Key Facts at a Glance

```
RELEASED        June 9, 2026
TIER            Mythos-class (frontier)
API MODEL ID    claude-fable-5
PRICING         $10/M input, $50/M output
DATA POLICY     30-day retention required
SAFEGUARDS      Cyber, Bio/Chem, Distillation
FALLBACK MODEL  Opus 4.8 (when classifier triggers)
FALLBACK RATE   < 5% of sessions
```

### Strengths

```
✅  State-of-the-art on coding benchmarks
✅  Best Claude vision capabilities to date
✅  Sustained focus across millions of tokens
✅  Self-verification at high effort levels
✅  Better with persistent file-based memory
✅  Generalizes to unfamiliar tools out of the box
```

### Things to Know

```
⚠️  Classifiers are conservative — some false positives expected
⚠️  Subscription access narrows after June 22
⚠️  30-day data retention is non-optional
⚠️  Fallback to Opus 4.8 on flagged queries (not refusal)
⚠️  Demand will be high — expect occasional capacity limits
```

### Glossary

| Term | Meaning |
|---|---|
| **Mythos-class** | Anthropic's frontier capability tier, above Opus |
| **Fable** | Mythos-class with safety classifiers for public release |
| **Project Glasswing** | Anthropic's restricted cybersecurity initiative using Mythos models |
| **Classifier fallback** | When Fable routes a flagged query to Opus 4.8 |
| **Universal jailbreak** | A prompt or harness that bypasses safeguards across many situations |
| **Trusted access program** | Upcoming application-based access to unrestricted Mythos 5 in specific domains |

---

## Further Resources

| Resource | What You'll Find |
|---|---|
| anthropic.com/news/claude-fable-5-mythos-5 | The official launch announcement |
| anthropic.com/claude/fable | Product page for Claude Fable |
| anthropic.com/claude-fable-5-mythos-5-system-card | Full system card with safety evaluations |
| platform.claude.com/docs | API documentation for `claude-fable-5` |
| anthropic.com/glasswing | Project Glasswing and the trusted access program |

---
