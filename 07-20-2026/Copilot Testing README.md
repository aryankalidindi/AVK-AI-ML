---

### Evaluating AI Coding Agents: What “It Fixed the Bug” Actually Means

### Testing five prompting strategies across three codebases reveals why transcript analysis misses the real failure modes.

---

A common barrier in evaluating AI coding agents is stopping at the right question. “Can it fix the bug?” is straightforward to ask and gets answered quickly. But it doesn’t tell you what matters in production. Will an agent declare a problem solved when parts of it remain broken? Will it introduce new problems while fixing the one you asked about?

To measure that, you need to move past transcript review. You need to look in the folder.

This project evaluated five prompting strategies across three open-source codebases using Claude Haiku 4.5 through Copilot Agent Mode. Two coworkers on the AI/ML team at AVK Tech Solutions ran the same strategy pattern against their own repositories. I ran mine against Alfresco. The methodology was identical across all three: inject a realistic defect, run five strategies in parallel, verify by checking the actual outcome instead of reading the model’s explanation of what it did.

This post walks through the ERP case (mine) in detail, then shows how the findings align with and diverge from what the other two repos revealed.

---

### The Constraint: Real Codebases, Realistic Faults

We chose three open-source systems in different domains.

**CRM — Twenty.** A bug in invoice late-fee calculation causes some records to bill customers incorrectly. One of my coworkers ran strategies against this.

**FinTech — Apache Fineract.** A mismatch in loan calculations results in incorrect interest charges. Another coworker ran strategies against this.

**ERP — Alfresco Content App.** A defect in folder copying: the operation fails silently but the notification reports success. This is the case I evaluated.

All three were run through the same five prompting strategies, with no repetition. Each strategy ran once per repository.

---

### The ERP Case: Two-File Fault

The Alfresco bug required edits to two separate files.

**File A — copyFolderAction()** is where folder copying happens. The bug is a hard-coded error return.

return of(new Error('folder copy failed')).pipe(  
  catchError(err => {  
    // catchError only knows how to handle HTTP 409 (conflict)  
    // This error has no statusCode, so it falls through  
    return of(err || 'Server error');  
  })  
);

The error handler checks for `statusCode === 409`. The injected error doesn't have a status code. The catch doesn't fire. The operation fails and returns an unhandled error, which terminates the copy. Folders don't get copied.

**File B — showCopyMessage()** displays the result. The bug is in the counter:

const succeeded = nodes.length;

`nodes` is the array of items the user _selected_. Not the array of items that were _created_. So if you select one folder to copy, `succeeded` is always 1, regardless of whether the copy succeeded.

Together, these create a specific failure mode: the user sees “Copied 1 item” while the folder is missing from the destination.

The correct fixes are minimal:

- File A: replace the error return with a real copy call
- File B: change `nodes.length` to `newItems.length` (the items actually created)

---

### The Five Strategies

**P1: Naive.** Pass the code and symptom, ask for a fix. No context beyond the file itself.

**P2: Root-Cause-First.** Two turns: first explain the root cause in detail, then fix it.

**P3: Systematic Multi-Phase.** Six phases in order: Reproduce → Instrument → Inspect → Isolate → Fix → Verify, showing work at each stage.

**P4: Context-Rich.** Provide symptom, both file paths, expected behavior, recent change hints, and explicit constraints in a single turn.

**P5: Role Reframe.** Ask the model to act as a senior code reviewer, rank issues by likelihood, then apply fixes.

Each strategy ran once against the broken baseline. Before each run, both files were reset to the identical broken state to avoid compounding prior edits.

**Verification was physical, not narrative.** I ran two checks:

- **Check A:** Copy a file. This always works (files go through a different method). It’s included because it’s what an agent would run on its own, and it tells you nothing.
- **Check B:** Copy a folder, then navigate to the destination and look. This is the ground truth.

Every conclusion below is based on Check B: what’s actually in the folder, not what the model said about itself.

---

### Results

The three matrices below show outcomes for my ERP case, with the comparative results from my coworkers’ CRM and FinTech runs included for cross-repo visibility.

### Finding the Bug

CRM FinTech ERP **P1** Naive No No No **P2** Root-Cause Yes Yes Partial **P3** Systematic Yes Partial Yes **P4** Context-Rich Yes Yes Yes **P5** Role Reframe Yes Yes Yes

P1 (Naive) failed to locate the fault on all three repositories. This is not a cheap baseline; it’s a liability. Even on single-file bugs, zero-shot prompting against real open-source code did not successfully identify the problem.

P2, P3, P4, and P5 all found the ERP fault, though P2’s finding was partial. It identified File A clearly and File B only under certain conditions.

### Fixing the Bug

CRM FinTech ERP **P1** Naive No No No **P2** Root-Cause Partial Partial Partial **P3** Systematic Partial Yes Partial **P4** Context-Rich Yes Yes Yes **P5** Role Reframe Yes Yes Yes

P1 repaired nothing across all repositories.

P2 repaired the issue partially on every repository. On the ERP case, P2’s Turn 1 correctly identified both faults: _“The message count is based on the original input (nodes.length), not on what actually got copied.”_ Turn 2 shipped code, but only edits to File A. File B was never opened, despite being explicitly documented in Turn 1.

P3 repaired File A completely but left File B with the original bug. The folder copies (Check B passes), but the counter still shows source count rather than result count. This fault only manifests when a multi-item copy is attempted with partial failures — a scenario my check didn’t exercise.

P4 and P5 both repaired both files correctly.

### Creating a New Bug

P5, despite matching P4 on repair accuracy, introduced new bugs in two of the three repositories. On the ERP case it was clean, but this row reveals a pattern: the strategy with the best diagnostic recall (P5’s ranked issue list was comprehensive) also introduced regressions in CRM and FinTech.

---

### Detailed Walkthrough: The ERP Case

### P2: Root-Cause-First

Turn 1 was excellent. The model read both files, traced the control flow, and produced a section header: **“Two Distinct Bugs.”** It explained File A’s termination-on-error mechanism correctly. For File B, it wrote:

>   

> _The message count is based on the original input (_`_nodes.length_`_), not on what actually got copied._

>   

>   

That is the exact fault. Correctly stated. Unprompted.

Turn 2 shipped code. Thirty-three lines added, thirty-four removed. All in File A.

File B was never opened.

**Check B:** Folder is not in the destination. FAIL

Diagnosis and repair are separate things. One doesn’t guarantee the other. If you’re just reading what the model says it did, you’re reading a document, not the actual code state.

### P3: Systematic Multi-Phase

This strategy asked the model to work through six phases: Reproduce, Instrument, Inspect, Isolate, Fix, Verify.

The Instrument phase added logging to `showCopyMessage`, the File B function. The code would print `newItems: undefined // <-- THE PROBLEM!` followed by the success count.

The Inspect phase correctly stated: _“the code reports success when actually nothing was created.”_

The Isolate phase listed **File 1: node-actions.service.ts** under “Exact Buggy Lines.” There was no File 2.

The Fix phase repaired File A only. File B got a `console.log` statement but the `succeeded = nodes.length` line remained unchanged.

**Verify phase:** The model did not copy a folder. It ran a TypeScript compile check (passed), then began generating documents: `DEBUGGING-SUMMARY.md`, `FIX-DIFF.md`, `DEBUG-COMPLETE.md`, nine files total. Copilot itself prompted asking whether to continue iterating. I said yes. The model kept generating until I stopped it manually.

When I asked directly: _“did you rewrite the code? I don’t need all these readmes”_ it re-read both files in two tool calls and confirmed the File A fix.

Two tool calls. That is what the entire verification phase should have cost.

**Check B:** Folder is in the destination. PASS

The test passes. File B’s bug is still there. When you select one folder and copy it, `nodes.length` equals `newItems.length` (both are 1). The bug only shows up when you copy multiple items and some fail. My single-item test couldn't catch it.

### P4: Context-Rich

Single turn. Provided: symptom, both file paths, expected behavior, a hint that recent changes touched folder copying and result messaging, a constraint to keep the fix minimal.

The model read `copyFolderAction` and `moveFolderAction` side by side (the move equivalent) and noticed the structural difference. It replaced the error stub with a real copy call and edited both files.

**Diff: +2 -2**

**Check B:** Folder is in the destination. PASS

No preamble, no documents, no phases. Total elapsed ceremony: minimal.

### P5: Role Reframe

_Act as a senior code reviewer. Review these two methods together and point out, in order of likelihood, every mistake that could cause it._

The model produced seven issues, ranked:

1. `copyFolderAction` always fails immediately 2–3. Secondary issues around ID extraction and undo handling
2. `showCopyMessage` hardcodes `succeeded = nodes.length`. It shows success even when nothing copied. 5–7. Additional observations

Both root faults, correctly ranked. It then wrote `CODE-REVIEW-FOLDER-COPY-BUG.md` and stopped.

Zero code edits.

Looked like a failure at first. The model understood the problem and changed nothing. But P5 is really a two-turn tool, not a one-turn one. A code reviewer’s output is a review, not code changes.

I sent a follow-up: Apply the fixes.

Both files got fixed cleanly.

**Check B:** Folder is in the destination. PASS

Scored on one turn, P5 looks worse than P4. Scored on two, they tie.

---

### Key Takeaways

**Understanding a bug and repairing a bug are separate things.** P2 wrote out the File B fault in its own words during Turn 1, then never touched it in Turn 2. P3 instrumented it with `// <-- THE PROBLEM!` and left it unfixed. If you just read the transcript, you'd think the bug was fixed.

**Verification by document generation is not verification.** P3’s Verify phase produced nine files about the fix without actually running a test that would catch the remaining fault. Specify what you’re actually checking for. “The folder named X must appear in directory Y after the copy” beats “verify the fix.”

**Confidence and correctness are not correlated.** The most assured completion claim — P2’s _“Done! The minimal fixes are now applied”_ — came from a run that failed Check B. P5’s first turn looked like a washout and ended up tied for best on repair.

**The “creating new bug” column reveals what single-metric evaluation misses.** P4 and P5 both repaired the ERP fault completely. On the cross-repo results, P5 created regressions in CRM and FinTech while P4 stayed clean. Measuring only repair success would have recommended the strategy that breaks two other codebases.

**Physical test design matters.** P3 passes its test. The folder copies. The bug P3 left behind — the miscount on multi-item operations — only surfaces when you select multiple items and some fail. A single-item test cannot catch it. Fixtures need to exercise each fault independently.

**Context with direction is the workhorse.** P4 asked for no reasoning, no phases, no ceremony. Symptom, location, expected behavior, constraints, go. It fixed all three bugs across all three repos without introducing a regression.

**Separate reasoning from repair, or bind them explicitly.** P2 and P3 both interleaved analysis and repair. In both cases the repair step drifted from the reasoning step. P4 skipped reasoning entirely. P5 fully separated them, producing analysis as one deliverable and repair as a second. When analysis and repair are mixed, the repair can silently ignore the analysis findings.

---

### Practical Implementation Notes

**N=1 per strategy.** These results come from single runs. Claude Haiku is stochastic; another run might produce different outcomes. The qualitative findings survive small n (P2 provably diagnosed a fault it didn’t fix; P3 provably left a latent bug), but statements like “P4 beats P2” are hypotheses, not rates.

**The injection announced itself.** My ERP bug contains the string `'folder copy failed'` in a hard-coded return. This is legible. A realistic fault — a stale reference, an unsubscribed observable, a boundary condition — would provide less directional signal.

**One model, one tool.** Claude Haiku 4.5 via Copilot Agent Mode. Frontier models, other tools, and other small models might behave completely differently.

**Cross-repo variance.** The three repositories were evaluated independently by three people with some wording variance in the prompts within each strategy pattern. The CRM and FinTech results are drawn from the outcome matrices shown in the accompanying deck.

**The test reflects deployment constraints.** Check B (navigate to the destination and verify the copy) reflects a scenario where a human can see whether the operation actually worked. In production, you might only have log output or success/failure signals. A real evaluation would need to match your actual validation capability.

---

### Where This Leaves Evaluation Practice

Transcript review misses the real failure modes. Models can articulate a fault and still not fix it. They can pass a test while leaving a latent bug in place. They sound most confident when they’re wrong.

The strongest finding: P4 (Context-Rich) fixed all three bugs across all three repos without introducing anything new. It used no reasoning phase, no multi-step procedure, no phase-specific output. Symptom, location, expected behavior, constraints, repair request. That was enough.

The most useful finding: measure the damage, not just the fix. P5 scored identically to P4 on repair. The “creating new bug” column is what separated them.

The practical constraint: **look in the folder.** Verification by transcript is fast and wrong. Verification by observation is slow and right. At scale, the check becomes the expensive part, but you can’t skip it.