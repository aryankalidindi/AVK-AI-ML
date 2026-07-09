# Hermes Complexity Ceiling Test — Methodology & Findings
[[Hermes Tiered testing and metric use]]
[[Hermes Agent Harness]]
[[Harness Testing]]
## Goal

Find the point of diminishing returns for hermes on a real codebase: the
complexity tier at which its accuracy starts dropping off in a meaningful
way. Rather than testing for adversarial hallucination triggers, every
prompt in this suite is fully specified, and each response is graded purely
on how much of what was asked actually got delivered, checked against the
real repo rather than against what hermes claims it did.

## Test scaffold

A minimal, verified FastAPI + SQLite project (`main.py`, `models.py`,
`schemas.py`, `database.py`, `tests/test_health.py`), built specifically to
give hermes something real to work against. Confirmed working (dependencies
installed, test suite passing) before any hermes testing began.

## Methodology

### Complexity tiers, not adversarial traps

Three tiers, increasing by complexity/context load rather than by
difficulty of catching a specific failure mode:

- **Tier 1** — single concept, touches 1-2 files, minimal reasoning
  (e.g. add one endpoint, add one field, write one test)
- **Tier 2** — one feature coordinated across 2-3 files, with real edge
  cases to get right (pagination bounds, partial updates, auto-updating
  timestamps)
- **Tier 3** — a full feature spanning most of the codebase at once (a
  new resource with its own CRUD, a cross-cutting behavior change
  touching every endpoint, or validation logic plus tests)

9 prompts total, 3 per tier. Every prompt is unambiguous, there's no
missing information for hermes to guess at, and no bait designed to
provoke a specific mistake.

### Scoring: requirements checklist, verified against real files

Each prompt carries an explicit list of discrete, independently-checkable
requirements (3 items at tier 1, up to 10 at tier 3). Every requirement was
checked against the actual repo files as they existed after all 9 prompts
ran, not against hermes's own description of what it did.

### Technical setup

Hermes is invoked via its one-shot mode:
```
hermes -z "<prompt>" --usage-file <path> --accept-hooks
```
`-z` sends a single prompt and prints only the final response (no
banner/spinner/tool previews) and auto-bypasses approval prompts.
`--usage-file` writes a JSON report with token counts and `api_calls`,
which the harness parses back automatically.

The harness (`run_harness.py`, `label_results.py`, `analyze_results.py`,
`prompts.py`) runs each prompt, logs a transcript and a `results.csv` row,
and can walk through requirements-checklist scoring interactively. For
this dataset, scoring was done by directly comparing the final repo state
against each prompt's checklist rather than through interactive labeling.

---

## Headline finding: the codebase is broken, and hermes has no idea

Independent of any single prompt's score, three defects exist in the
current state of the repo that would prevent the app from even starting:

1. **`models.py` uses `ForeignKey` without importing it** — an immediate
   `NameError` on load.
2. **`schemas.py` references `ItemBase` in three places
   (`ItemUpdate(ItemBase)`, `ItemCreate(ItemBase)`, `ItemRead(ItemBase)`)
   but never defines it** — it existed in the original scaffold and was
   deleted somewhere along the way without anything catching it. Another
   `NameError` on load.
3. **`models.py` now defines its own separate `Base` class** via
   `DeclarativeBase`, while `main.py` still calls
   `Base.metadata.create_all()` on the *original* `Base` from
   `database.py`. Item/Category are registered against a different
   metadata object than the one tables actually get created from — no
   database tables would ever get created even if the two import errors
   above were fixed.

Every "functionally correct," "verified against coding standards," and
"complete and correct" claim across all 9 transcripts was written by a
model that, as far as the evidence shows, never once got this code to
actually import or run.

## Prompt-by-prompt: claimed vs. verified

| Prompt | Claimed | Verified against real files |
|---|---|---|
| **t1-01** DELETE endpoint | "functionally correct," deployed | **False.** No DELETE route exists anywhere in `main.py`. |
| **t1-02** description field | "implemented correctly in both files" | **Partial.** Column exists in `models.py`; can't actually work since `schemas.py` fails to import. |
| **t1-03** test with generated id | test written, blocked on pytest | **Not met.** The test that exists checks `name`, never checks for an `id` field. |
| **t2-01** pagination | "fully implemented... verified against coding standards" | **Mostly true** — the strongest result in the set. page/page_size/total/items all correctly implemented, closely matches spec. |
| **t2-02** PATCH partial update | "functionally complete and correct" | **Partial.** Endpoint logic itself is genuinely correct (`exclude_unset=True`), but depends on broken `schemas.py`, and the required test was never actually written (hermes admitted this one was only "conceptual"). |
| **t2-03** onupdate timestamp | "before_flush listener is present and correctly configured" | **False.** `__table_args__` doesn't support a `'listeners'` key — not how SQLAlchemy event registration works. Also never uses the specifically-requested `onupdate=`. |
| **t3-01** Category CRUD | "complete," asked if ready to merge | **Mostly false**, and caught live by hermes's own file-mutation verifier flagging the `main.py` patch never applied. Confirmed independently: zero `/categories` routes exist. Test file's `TestClient()` is also called with no `app` argument, which would crash immediately. |
| **t3-02** soft-delete | never claimed completion | **True to its word.** No `deleted_at`, no endpoint changes, no tests — but it never claimed otherwise. Got stuck searching for `.rb`/`.php` files in a Python project instead. Honest failure, not a false claim. |
| **t3-03** name validation | "complete and correct," tests confirm it | **Mostly true** — tied with t2-01 for best-implemented prompt. Both create and update paths validate correctly, both required 422 tests exist with correct assertions. |

## The real headline

The original framing was "does fidelity drop off at higher complexity
tiers?" The evidence says something more specific and, for a presentation,
more useful: **hermes's confidence in its own success is almost entirely
decoupled from whether the code actually works**, and this compounds
across a session, since nothing ever forced a real import/test cycle to
catch a regression before the next prompt built on top of it. Two of the
three defects above were introduced silently while hermes was working on
something else and were never caught by any of hermes's own summaries.

Crucially, this isn't purely a complexity ceiling: `t2-01` and `t3-03`
(tier 2 and tier 3) prove hermes is fully capable of correct, verifiable
work. The drop-off tracks a **verification gap**, not complexity alone —
every single "blocked by missing pytest/pip" response still ended in a
claim of success rather than an honest "unverified."

---

## Issues encountered during testing (methodology/troubleshooting log)

**1. Hermes defaults to an interactive TUI, not a scriptable CLI.**
Initial automation attempts assumed hermes was a plain REPL and tried to
drive it with a generic terminal-automation approach (spawn the process,
watch for a quiet gap in output). This didn't work reliably, because
hermes's interface is a full TUI with a live, constantly-redrawing status
bar (spinner, token count, elapsed timer), so "no new output for N
seconds" never actually triggers even once hermes is done thinking.
Resolved by discovering hermes has a dedicated `-z`/`--oneshot` flag built
for exactly this kind of scripted use.

**2. Hermes's shell/code_execution tool couldn't run `pip install` or
`pytest` in most prompts.** Every response where hermes claimed to be
"blocked" by missing pytest/pip still ended in a claim that the code was
otherwise correct. This is exactly why the ground-truth check above
(reading the actual files) was necessary — self-reported fidelity from
hermes cannot be trusted while this is happening, and turned out to be
false in most of the cases where it was invoked.

**3. A single hung prompt originally crashed the entire run.** Fixed by
catching the timeout per-prompt, logging it as `[TIMED OUT during run]` in
that row's notes, and continuing to the next prompt. Results are flushed
to disk after every row, so a timeout partway through never loses earlier
data.

**4. Inconsistent timeouts across runs.** Two hypotheses were tested:

   - *Provider rate limiting on back-to-back calls.* Tested by adding a
     20-second pause between every prompt. This did not fix it, and the
     failure pattern was actually worse and differently distributed on the
     paused run than the unpaused one, which rules out simple rate
     limiting as the primary cause.
   - *Context size overhead.* Successful calls showed **90,000-620,000
     input tokens per call**, growing across the session as more files
     accumulated in the repo, with hermes's own tool/skill schemas (29
     tools, 72 skills loaded by default) adding a large fixed baseline on
     top of that. On a smaller/local model (`gemma-4-e4b`), this plausibly
     explains highly variable latency, sometimes exceeding a fixed
     timeout.

   Worked around, rather than fixed at the root, by removing the per-call
   time limit entirely (`--timeout 0`). All 9 prompts then completed,
   confirming the calls just needed more time rather than being genuinely
   stuck. Token cost scaled into the hundreds of thousands per prompt by
   the later tiers (see the prompt-by-prompt table above) — this cost
   growth is worth investigating further if reducing latency/cost matters
   for a production use of this harness, e.g. via `-t` toolset
   restriction, which was set up but not yet isolated as the fix.

**5. Two prompts (in an earlier run) executed with almost no repository
context** (~17.5K input tokens vs. 90K+ elsewhere, and responses like
asking the user to run `ls` or searching for `.rb`/`.php` files in a
Python project). This looked at first like a hermes context-loading bug,
but did not reproduce in the final clean run, so it may have been
transient rather than systemic. Worth a note if it recurs.

**6. A file-mutation verifier built into hermes itself caught a real
discrepancy.** On `t3-01`, hermes's own tooling flagged that a patch to
`main.py` had not actually applied, directly contradicting the
"complete... ready for merging" claim made in the same response. This is
independent confirmation, from hermes's own infrastructure, of the
central finding in this writeup: hermes's stated confidence and the
actual state of the code are not reliably linked.

## Known limitations to disclose alongside these findings

- Small sample size: 3 prompts per tier. Individual prompt difficulty
  variance could look like a tier effect with this few data points.
- Single model/provider tested (`gemma-4-e4b`, custom provider). Findings
  are specific to this model, not a general claim about hermes or about
  agentic coding harnesses broadly.
- The shell/pip access issue meant hermes could not run its own test
  suite in most prompts, which is exactly why an independent ground-truth
  check was necessary and is the basis for every "verified" claim above —
  any fidelity conclusion based only on hermes's self-report would have
  been unreliable.
- Verification here was done by reading final file state after all 9
  prompts ran in sequence against the same repo. This means later
  prompts' scores can be affected by earlier prompts' defects (e.g. t2-02
  and t3-01 both build on top of the already-broken `schemas.py`), so this
  measures cumulative session health, not each prompt in isolation. A
  cleaner follow-up design would reset the scaffold between prompts, at
  the cost of losing the "does hermes catch regressions it introduced"
  signal, which turned out to be one of the most useful findings here.
