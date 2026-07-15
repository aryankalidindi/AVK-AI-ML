## What the bug does

**In one line:** copying files and then clicking "Undo" permanently deletes your _original_ files instead of the copies you just made.

**The normal flow:** In Alfresco you can copy files into another folder. After a copy, the app shows a snackbar — "Copied 2 items · **Undo**" — so you can back out. Clicking Undo is supposed to remove the freshly-created _copies_ and leave your originals untouched.

**What happens with the bug:** When you click Undo, the app deletes the **originals** (the files you selected to copy from) rather than the copies. And it uses a _permanent_ delete — the files don't even go to the Trash/recycle bin, so they can't be recovered through the UI. The copies, meanwhile, survive in the destination.

So the user experience is: "I copied two files, realized I didn't need to, hit Undo to clean up — and it destroyed my source files forever." A safe-looking action silently causes permanent data loss.

**Why it's a good AI-debugging test:** the _symptom_ (files disappear) happens on the delete code path, but the _cause_ is on the copy code path — the undo handler was wired to the wrong set of files (the original selection instead of the newly-created copies). Finding it requires understanding how a copy operation produces its result and how undo is supposed to reverse it, tracing across several layers. Nothing in the code diff looks obviously wrong; it reads like an ordinary variable name.

---

## What this application is


### Alfresco, the platform (Enterprise Content Management)

Alfresco is an **ECM system** — enterprise software for storing, organizing, securing, and collaborating on documents and records at scale. Think of it as a heavily governed, API-driven alternative to something like SharePoint or Google Drive, aimed at organizations that need control and compliance, not just file storage. Core capabilities:

- **Document repository** — a central store for files and folders, backed by a database (metadata) plus file storage (the actual content).
- **Versioning** — every file keeps a full version history (v1.0, 1.1, 2.0…); you can upload new versions, compare, and roll back.
- **Permissions & access control** — fine-grained, inherited permissions on folders and files, with roles, groups, and sharing.
- **Metadata & content models** — files aren't just blobs; they carry typed properties and "aspects" (e.g., a document can be tagged as a record, given retention dates, etc.).
- **Search** — full-text and metadata search powered by a Solr search index.
- **Workflow** — approval chains and document routing (review/approve processes).
- **Records management & compliance** — retention, disposition, audit trails.
- **Transformations** — generating thumbnails, PDF previews, and format conversions.

### What's actually running on your machine

I stood up the full stack via Docker, so you have a real, working Alfresco:

- **Alfresco Content Services (ACS)** — the backend "repository" server (the brain: stores content, enforces permissions, exposes REST APIs) at `localhost:8080`.
- **PostgreSQL** — the database holding metadata.
- **Solr** — the search index.
- **ActiveMQ** — the message broker for async events.
- **Transform service** — generates previews/thumbnails.
- All fronted by a **Traefik** proxy.

### `alfresco-content-app` (the repo on your desktop — "ACA")

This is the **front-end web UI**, and it's where the bug lives. It's the modern, user-facing application people actually click around in — branded "Workspace" in the interface you saw. Key facts:

- **It's an Angular app** (Angular 20 / TypeScript), built as a single-page application. It ships no data of its own — it's a pure client that talks to the ACS backend over REST APIs.
- **What users do in it:** log in; browse Personal Files, shared libraries, and the repository; upload/download; **copy, move, delete** files; manage versions; favorite and share; search; view previews; and restore deleted items from Trash. These are exactly the operations the front-end orchestrates against the backend.
- **How it's architected:** it uses ADF (Alfresco Development Framework) component libraries for the document list, viewers, and dialogs, plus an **NgRx store** (a central state container) and "effects" that translate user actions into API calls. Actions like copy/move/delete run through a service layer — `ContentManagementService` and `NodeActionsService` — which is exactly where the injected bug sits.
- **An "extension" model:** the toolbar buttons and context-menu items you can use on a file are governed by **rule evaluators** (e.g., `canDeleteNode`, `canCopyNode`). This is central to the app — it's why, when I tested a different bug idea, Alfresco _refused to even show_ the Delete option on a locked file. The UI proactively hides actions you're not allowed to perform.

**How the two connect:** you run ACA's dev server at `localhost:4200`; it proxies API calls to ACS at `localhost:8080`. Log in with `admin` / `admin`. Without the backend, ACA loads but every operation fails — which is why getting the whole stack running was the first task.

The reason this repo is a good AI-debugging playground: the bugs aren't algorithm puzzles, they're **plausible business-app defects** in real document-management operations (copy, move, delete, permissions, versioning) that span multiple layers — UI action → service → API → backend — so finding them requires understanding how the whole flow fits together, not just reading one function.




create a diagram where you can explain our ideas (like a flowchart).    Explain how it works in the background. 

Should show the actual code and how an actual human would solve it with a flowchart. And then we are expecting the LLM to follow the same logic or enhance the logic. Compare how the LLM solves it compared to how you are supposed to.