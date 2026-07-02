

Technical and Strategic Report: The State of Agentic Resource Discovery (ARD)

1. Introduction: The "Browser" for the Agentic Web

Announced in late May and formalized in mid-June 2026, Agentic Resource Discovery (ARD) is a v0.9 open specification designed to solve the "dark web of agents" problem. In the current landscape, AI agents are largely limited to "pre-installed" tools—integrations hardcoded by developers into a model's context. ARD shifts this paradigm to a dynamic discovery model, acting as the "DNS" or "browser" for the agentic web.

**Definition** Agentic Resource Discovery (ARD) is a protocol that allows an organization to publish a machine-readable manifest (`ai-catalog.json`) at a well-known path, enabling registries to index these resources so agents can find, verify, and connect to them based on natural-language intent at runtime.

ARD is required to solve the "install-first" bottleneck for three strategic reasons:

- **Runtime Selection vs. Pre-installation:** It moves beyond the manual "context budget" limit. Instead of pre-loading thousands of tool descriptions into a prompt, agents query a dedicated registry to find relevant resources only when needed.
- **Scalability for the Agentic Web:** It provides a standardized surface for the web’s vast ecosystem of MCP servers, A2A agents, and APIs, which would otherwise remain "dark" to AI clients.
- **Vetted Intent Matching:** By shifting selection to a discovery layer, organizations can ensure agents match tasks to verified, high-trust capabilities rather than guessing based on thin descriptions.

---

2. The Architectural Framework: Catalogs and Registries

The ARD framework relies on a decentralized architecture separating the publisher’s metadata from the discovery service’s index.

|Dimension|Catalogs (The Publisher Side)|Registries (The Discovery Side)|
|---|---|---|
|**Ownership**|Individual organizations and service providers (Domain-anchored).|Search services, discovery platforms, or enterprise internal directories.|
|**Function**|Hosting resource metadata (`ai-catalog.json`) on the publisher's domain.|Crawling catalogs, adding richer signals (compliance attestations, example queries), and exposing the search API.|
|**Primary Technical Artifact**|`ai-catalog.json` file at the `/.well-known/` path.|Discovery Service API (primarily the `POST /search` endpoint).|

---

3. Technical Specification: The Discovery Flow

The ARD specification establishes a strict four-stage sequence that occurs exclusively _before_ a resource is invoked.

1. **Request:** The agent queries a registry using a natural-language intent (e.g., "get the 5-day forecast for Seattle").
2. **Match:** The registry returns ranked entries, matching the intent against `representativeQueries` and metadata tags.
3. **Verify:** The agent uses the `trustManifest` to check the tool’s domain-anchored identity, provenance, and attestations.
4. **Connect:** The agent connects to the chosen resource via its native protocol. **Strategic Note:** At this stage, the discovery service "drops out of the path." Authentication and data access remain strictly between the client and the resource.

**Key Distinction: Discovery vs. Invocation** ARD is explicitly a discovery layer, not a runtime protocol. Its role concludes once a resource is identified and verified. Actual execution is handled by established protocols like the Model Context Protocol (MCP), Agent-to-Agent (A2A), or standard REST APIs.

---

4. Industry Alignment and Strategic Collaboration

The ARD specification is an Apache-2.0 licensed project building upon the Linux Foundation’s AI Catalog data model. While it is a broad industry effort, **Microsoft leads its development** and strategic trajectory.

**Collaborating Firms:** Google, Microsoft, Hugging Face, GitHub, Nvidia, Salesforce, Cisco, Databricks, GoDaddy, ServiceNow, and Snowflake.

Reference implementations are already surfacing to validate the spec:

- **GitHub’s "Agent Finder":** Integrated into GitHub Copilot, it allows the assistant to dynamically discover and inject the correct tools into the context window at runtime, preventing "context bloat."
- **Hugging Face’s "Discover Tool":** This implementation converts existing Hugging Face Spaces into discoverable Skills or MCP servers by wrapping `agents.md` files in the ARD manifest envelope.

---

5. Trust, Identity, and the Verification Challenge

Trust is the foundation of the ARD specification. The protocol utilizes a **"Domain-anchored"** identity model; if you own the domain hosting the catalog, you own the identity of the resources listed within it.

The Trust Manifest

The `trustManifest` object is designed to prevent agents from "trusting strangers" by providing cryptographic and compliance-based verification.

|Field|Strategic Purpose|
|---|---|
|`identity`|The cryptographic workload ID (SPIFFE, DID, or HTTPS URI).|
|`identityType`|Defines the specific protocol (e.g., "spiffe", "https").|
|`attestations`|Points to compliance records (e.g., SOC2-Type2) to prove enterprise readiness.|
|`provenance`|Describes the lineage and source of the resource to ensure data integrity.|
|`signature`|A **detached JWS signature** used to verify that the manifest has not been tampered with.|

---

6. Adoption Reality Check: The 2026 Census

Despite high-profile backing, real-world adoption remains in a "frontier" state. A Synscribe census conducted on June 18, 2026, probed 39 major domains—including all 11 lead working group members—to check for ARD discovery surfaces.

**Census Summary** **Current Adoption Rate:** 0 of 39 sites (0%). **The Practical Takeaway:** As of mid-2026, even the lead authors of the spec have not yet shipped discoverable catalogs on their primary domains.

The "zero adoption" result identified three primary technical "traps":

- **SPA HTML Traps:** Sites like `huggingface.co` and `azure.microsoft.com` returned 200 OK status codes but served standard HTML application shells (JavaScript app shells) instead of the required JSON content.
- **CDN Edge Blocks:** Large enterprises (e.g., Nvidia, ServiceNow) often have CDN settings that return "403 Access Denied" for any requests to the `/.well-known/` path.
- **Standard 404s:** The vast majority of probed sites simply have not yet deployed the `ai-catalog.json` file.

---

7. The ARD Implementation Playbook

For organizations aiming to become "agent-discoverable," the transition from "install-first" to "intent-based" search is a low-cost hedge with high potential upside.

1. **Inventory Resources:** Identify all callable MCP servers, A2A agents, and public APIs.
2. **Define URN Scheme:** Implement the required domain-anchored naming: `urn:ai:<your-domain>:<area>:<name>`.
3. **Draft Catalog:** Create the `ai-catalog.json` using the v0.9 (manifest `specVersion: "1.0"`) schema.
4. **Description Engineering:** In the `representativeQueries` field, write 2–5 **task-phrased** queries (e.g., "get the 5-day forecast for Seattle"). Avoid marketing copy; it matches nothing in semantic search.
5. **Host Static File:** Place the JSON at `/.well-known/ai-catalog.json`. Ensure the content-type is `application/json` and no auth walls/redirects exist.
6. **Redundancy Signals:** For "free" insurance against crawlers, add an `Agentmap:` directive to `robots.txt` and a `<link rel="ai-catalog">` tag to your homepage `<head>`.
7. **Schema Validation:** Validate against the official JSON Schema to prevent indexing failures.
8. **Registry Monitoring:** Monitor emerging registries (like GitHub’s or Hugging Face’s) to verify your entries are being indexed.

---

8. Strategic Outlook and Future Trends

The long-term trajectory of ARD suggests it may find its first "killer use case" **internal to large enterprises**. In these environments, departments create new data connectors and agents weekly; ARD allows internal agents to discover these capabilities via intent-based queries without bloated, manual tool configurations.

**Federation and Agentic SEO:** The spec defines three federation modes—**auto**, **referrals**, and **none**—to prevent walled gardens. If these modes gain traction, we will see the emergence of "Agentic SEO." Unlike traditional SEO, this discipline won't focus on human clicks but on being the "top candidate" a registry returns to an agent for a specific intent.

Strategic Verdict

**The Skeptic’s Read:** ARD is currently a "standard’s graveyard" candidate. With zero adoption among its own authors three weeks post-launch, it remains an unproven forecast. Until a major client (like ChatGPT or a primary Copilot) queries a registry by default, the protocol is inert.

**The Operator’s Read:** ARD is a "cheap option" with massive upside. Given the involvement of Microsoft and Google, this is the most likely candidate for the web's discovery layer. Building a catalog today is an afternoon of work that positions an organization as a first-mover in the shift to the agentic web.

---

9. Appendix: Technical Reference (Sample Catalog)

The following is a minimal, valid `ai-catalog.json` example for a resource provider.

```
{
  "specVersion": "1.0",
  "host": {
    "displayName": "Synscribe",
    "identifier": "synscribe.com"
  },
  "entries": [
    {
      "identifier": "urn:ai:synscribe.com:discovery:census-tool",
      "displayName": "ARD Adoption Census Tool",
      "type": "application/mcp-server+json",
      "url": "https://synscribe.com/mcp/census-tool.json",
      "description": "Checks domains for ARD discovery surfaces and adoption metrics.",
      "representativeQueries": [
        "Check if a domain is ARD-ready",
        "Search for ai-catalog adoption rates",
        "Verify a well-known catalog path"
      ],
      "tags": ["discovery", "census", "monitoring"],
      "trustManifest": {
        "identity": "https://synscribe.com/identity/census-tool",
        "identityType": "https"
      }
    }
  ]
}
```