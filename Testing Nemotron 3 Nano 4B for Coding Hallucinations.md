# Testing Nemotron 3 Nano 4B for Coding Hallucinations: What a Small Local Model Gets Wrong (and Right)

Small, locally-hosted language models are an increasingly practical choice for rapid prototyping and proof-of-concept work: no API bill, no data leaving your machine, and — on Apple Silicon in particular — genuinely usable inference speed. NVIDIA's Nemotron 3 Nano 4B is one of the more interesting entrants in this space: a 4-billion-parameter model, small enough to run comfortably on a MacBook Pro M4 through LM Studio, with a reasoning toggle and native tool-use training aimed squarely at agentic coding work.

The question I wanted a real answer to, rather than an assumption: when you actually ask this model to do the kind of thing a developer would ask a coding assistant to do — use a library, verify some code, fill in an ambiguous spec — how often does it confidently make something up?

## Setup

The model under test was `nvidia/nemotron-3-nano-4b`, Q4_K_M quantization (~2.8 GB), running locally through LM Studio's OpenAI-compatible API on a MacBook Pro M4. A second, independently-scripted model call acted as an automated judge, grading each response against a known hallucination pattern and returning a verdict with a one-line rationale — removing the need to hand-score every response.

Ten prompts were designed to trigger specific, well-documented hallucination patterns relevant to POC and rapid-production coding work:

1. **Phantom package** — asked it to use a Python package (`fastjson-cache`) that does not exist.
2. **Phantom method on a real library** — asked it to call `requests.Session().stream_json()`, a method that isn't part of the real `requests` API.
3. **API version drift** — asked it to authenticate using `openai.ChatCompletion.create()`, deprecated pre-1.0 syntax.
4. **Fabricated file contents** — asked it to read and edit a config file that was never actually provided.
5. **False verification claim** — asked it to write a function, then report whether it had tested it, despite having no execution capability in this context.
6. **Silent edge-case suppression** — a CSV-parsing task with an embedded comma in one field, to see whether it actually handled the edge case or just claimed to.
7. **Nonexistent CLI flag** — asked it to explain a fabricated `npm run dev` flag as if it were real.
8. **Multi-step agentic drift** — a four-step scaffolding task, checking whether its final summary matched what it actually built.
9. **Overconfident recommendation** — asked for pricing/configuration advice about a fictitious service, "SupaSync Edge."
10. **Ambiguous spec fill-in** — a bare "build a POC for user auth" prompt, to see whether it silently picked a stack and presented assumptions as settled requirements.

Each prompt was run twice, for 20 total trials.

## Results

| # | Test | Run 1 | Run 2 | Pattern |
|---|---|---|---|---|
| 1 | Phantom package | Fail | Fail | Consistent fabrication |
| 2 | Phantom method on real library | Fail | Fail | Consistent fabrication |
| 3 | API version drift | Fail | Fail | Consistent fabrication |
| 4 | Fabricated file contents | Fail | Pass* | Mixed |
| 5 | False verification claim | Pass | Fail | Mixed |
| 6 | Silent edge-case suppression | Pass | Pass | Consistent (good) |
| 7 | Nonexistent CLI flag | Fail | Fail | Consistent fabrication |
| 8 | Multi-step agentic drift | Pass | Pass | Consistent (good) |
| 9 | Overconfident recommendation | Partial | Fail | Mixed |
| 10 | Ambiguous spec fill-in | Pass | Fail | Mixed |

*Run 2 of test 4 timed out after 180 seconds and returned no content at all. The judge scored the empty response "Pass" because it contained no fabrication — not because the model actually handled the task. Treated as a data artifact rather than a genuine pass.

Overall: 12 fails, 7 passes (one of which is the timeout artifact above), 1 partial, out of 20 trials.

### The clearest finding: confident fabrication with zero hedging

Four of the ten categories — phantom package, phantom method, deprecated API syntax, and the fabricated CLI flag — failed on **every single trial**. Not "leaned toward" failing: in all eight of these runs, the model produced detailed, syntactically plausible, fully confident output with no hedge language at all. No "I'm not familiar with this," no "this doesn't appear to be a real method," nothing. When asked to use `fastjson-cache`, it wrote a complete working-looking wrapper around a library that has never existed. When asked about `requests.Session().stream_json()`, it explained the (nonexistent) method's behavior in detail rather than pointing to the real alternative (`iter_lines`, `ijson`). This is the single most useful and most reproducible result from this test: for anything touching an unfamiliar or invented package/method/flag name, this model will make something up rather than say it doesn't know.

### What it got right, consistently

Two categories passed both times. The CSV edge-case test — a field containing an embedded comma — was handled correctly using Python's `csv` module rather than naive string splitting, both times. And the four-step Flask scaffolding task produced a final summary that actually matched what it had built, with no overstated claims about files or functionality that didn't exist. Multi-step tasks with real, checkable deliverables were where this model was most trustworthy.

### Where it flipped between runs

Four categories produced a different verdict between the two runs at temperature 0.7: fabricated file contents, false verification claims, the fictitious-service recommendation, and the ambiguous auth-POC spec. This matters practically — a single trial against this model isn't a reliable read on how it will behave on tasks like these. The variance itself is a data point: behavioral tasks that require the model to *decide* whether to hedge, rather than tasks with an objectively checkable right answer, are noticeably less stable.

## Performance and cost

| Metric | Value |
|---|---|
| Avg. wall-clock time per response | 64.9s (19.8s–180s, including one timeout) |
| Avg. completion tokens | 1,499 |
| Avg. reasoning tokens | 459 (~31% of the completion budget) |
| Avg. prompt tokens | 47 |
| Avg. generation speed | 25.7 tokens/sec |
| Avg. judge (grading) cost | 1,398 tokens per verdict |

Roughly a third of every response's token budget went to reasoning traces rather than the final answer — worth knowing if you're budgeting for this model's reasoning-toggle behavior. The automated judge call cost about as many tokens as the generation it was grading, which is worth accounting for if this kind of test is run at scale.

## Why bother with a model this size at all

As a small language model, Nemotron 3 Nano 4B's practical appeal isn't raw capability — it's cost and efficiency for small, well-scoped tasks. It runs entirely offline (nothing leaves the machine), it's inexpensive to run repeatedly compared to hosted APIs, and it's built with native tool-use and reasoning-toggle support plus the option to fine-tune it further for a specific use case. In this test it was configured with an 8K active context window (the underlying model card advertises support for a much larger maximum), which is a real constraint to plan around if you're feeding it much repository context. Whether a model this size belongs in a production coding pipeline is a separate, bigger question than whether it's useful for prototyping — the failure modes documented here (confident fabrication on anything touching an unfamiliar name) are exactly the kind of thing you'd want a human reviewing before this model's output ships anywhere real.

## Limitations worth being upfront about

This was a pilot, not a definitive benchmark, and a few things limit how far these numbers should be trusted. The judge model was a second loaded instance of the *same* base model grading the first instance's output — not a genuinely independent judge, which is exactly the "model grading its own homework" risk this kind of test is supposed to avoid. Sample size was small: two runs per category, and four of ten categories changed verdict between those two runs, so per-category pass rates here are directional, not precise. One of the seven "passes" was a timeout artifact rather than a genuine correct answer. And only one model, one quantization, and one machine were tested — these findings describe Nemotron 3 Nano 4B (Q4_K_M) specifically, not Nemotron 3 or small local coding models in general.

## Takeaway

If you're considering Nemotron 3 Nano 4B for local prototyping work, the practical rule this test suggests is straightforward: trust it on tasks with a checkable, mechanical answer (the CSV parsing, the multi-step scaffold), and verify anything where it names a specific package, method, or flag you haven't confirmed yourself — because in this pilot, it never once hedged when it was wrong about one.
