# PRD: Plugin System

> **Status**: Approved
> **Author**: Auto-generated from scope analysis
> **Date**: 2026-03-05

---

## 1. Problem

Agents running on Paperclip produce rich operational knowledge — project health trends, dependency patterns, cost forecasts, external service status — but have **no structured way to present it**. The only output channel is task comments. Meanwhile, the board UI can only show what core developers built.

This creates two gaps:

1. **Agents can't build their own tools.** A DevOps agent monitoring infrastructure, a sales agent tracking eBay listings, or a PM agent measuring sprint velocity cannot surface their operational picture to the human board.
2. **Domain-specific views require core changes.** Every new visualization or integration (GitHub PR board, Sentry error tracker, AWS cost monitor) needs a PR to the monorepo.

## 2. Proposed Solution

A **universal plugin system** where agents (and humans) create self-contained micro-applications that run inside the Paperclip board. Plugins can:

- Query Paperclip data (issues, agents, costs, projects, goals)
- Call any external API (eBay, Prometheus, GitHub, Datadog, your own app)
- Present any visualization or interactive UI

Plugins are HTML applications running in sandboxed iframes, communicating via a controlled `postMessage` bridge. External API calls and secrets are handled server-side — the iframe itself has no network access.

## 3. User Stories

### 3.1 Agent creates a plugin

> As an **agent**, I want to create a custom dashboard that visualizes data relevant to my work, so that the board operator can see my operational picture without reading through task comments.

**Acceptance criteria:**
- Agent calls `POST /api/companies/:companyId/plugins` with an HTML bundle and manifest
- Plugin is created with `status: "pending_review"`
- An approval of type `plugin_review` is automatically created
- Agent is notified when the approval is resolved

### 3.2 Board reviews a plugin

> As a **board operator**, I want to review what a plugin does before it goes live, so that I can control what data it accesses and which external services it contacts.

**Acceptance criteria:**
- Plugin approval appears in Inbox / Approvals page
- Review shows: plugin name, description, Paperclip data types requested, external hosts declared, secrets consumed
- Board can preview the plugin in a sandboxed iframe (with no live data/secrets)
- Board can approve or reject
- On approval, plugin immediately appears on the Dashboard

### 3.3 Board manages plugins

> As a **board operator**, I want to enable, disable, and delete plugins, so that I can control what runs on my board.

**Acceptance criteria:**
- Plugin management tab in Company Settings
- List all plugins with status badges
- Toggle active/disabled
- Delete with confirmation
- View manifest details (permissions, hosts, secrets)

### 3.4 Plugin queries Paperclip data

> As a **plugin**, I want to query Paperclip entities (issues, agents, costs) so I can build visualizations about the company's work.

**Acceptance criteria:**
- Bridge API: `paperclip.query('issues', { status: 'in_progress' })`
- Only entity types declared in manifest's `permissions.paperclip` are queryable
- Undeclared entity types return an error

### 3.5 Plugin calls external APIs

> As a **plugin**, I want to call external APIs (eBay, GitHub, Prometheus) so I can display data from outside Paperclip.

**Acceptance criteria:**
- Bridge API: `paperclip.fetch(url, options)` with `{{SECRET_NAME}}` placeholders
- Server-side proxy resolves secrets, validates URL against manifest's `externalHosts`, makes the request
- Only declared external hosts are reachable
- Secrets never appear in the iframe

### 3.6 Plugin receives live updates

> As a **plugin**, I want to receive real-time events from Paperclip so my visualizations stay current.

**Acceptance criteria:**
- Bridge API: `paperclip.on('activity.logged', callback)`
- Host forwards relevant WebSocket events to the iframe via `postMessage`

## 4. Architecture

### 4.1 Runtime model

```
+--------------------------------------------------+
|  Paperclip Board (host page)                     |
|  - Full session/cookie access                     |
|  - Controls data bridge + external API proxy      |
+--------------------------------------------------+
|  iframe sandbox="allow-scripts"                   |
|  (NO allow-same-origin)                           |
|  +----------------------------------------------+|
|  |  Plugin micro-app                            ||
|  |  CAN: query Paperclip data via postMessage   ||
|  |  CAN: call declared external APIs via proxy  ||
|  |  CAN: render any UI (charts, tables, forms)  ||
|  |  CANNOT: access host cookies/localStorage    ||
|  |  CANNOT: make direct network requests         ||
|  |  CANNOT: access secrets directly              ||
|  +----------------------------------------------+|
+--------------------------------------------------+
```

### 4.2 Security model

| Layer | Mechanism | What it prevents |
|---|---|---|
| **iframe sandbox** | `sandbox="allow-scripts"` (no `allow-same-origin`) | Cookie theft, localStorage access, credentialed requests to Paperclip |
| **CSP** | `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:` | All direct network access |
| **Data bridge validation** | Host validates entity types against manifest `permissions.paperclip` | Unauthorized data access |
| **Proxy host enforcement** | Server validates fetch URL against manifest `permissions.externalHosts` | Calling undeclared external services, data exfiltration |
| **Server-side secret injection** | Secrets resolved server-side, never sent to iframe | Secret exfiltration |
| **Content integrity** | `ui_html_sha256` tracked; any change resets to `pending_review` | Post-approval content tampering |
| **Approval gate** | Board reviews manifest before activation | Unauthorized plugins going live |
| **Proxy SSRF prevention** | `https://` only, no IP addresses, no redirect following to non-allowed hosts | Server-side request forgery |

### 4.3 Plugin manifest

```json
{
  "name": "ebay-listing-tracker",
  "description": "Tracks eBay listings and shows price trends",
  "version": "1.0.0",
  "slot": "dashboard_panel",
  "size": { "minHeight": 300 },
  "permissions": {
    "paperclip": ["issues", "agents"],
    "externalHosts": ["api.ebay.com"],
    "secrets": ["EBAY_API_KEY"]
  }
}
```

### 4.4 Bridge API (inside iframe)

```javascript
// Paperclip data
const issues = await paperclip.query('issues', { status: 'in_progress' });
const agents = await paperclip.query('agents', {});
const costs  = await paperclip.query('costs', { period: 'current_month' });

// External APIs (server-side proxy, secrets injected automatically)
const listings = await paperclip.fetch(
  'https://api.ebay.com/buy/browse/v1/item_summary/search',
  { headers: { 'Authorization': 'Bearer {{EBAY_API_KEY}}' } }
);

// Context
const { companyId, pluginId, theme } = paperclip.context;

// Live events
paperclip.on('activity.logged', (event) => { /* update view */ });
```

### 4.5 Lifecycle

```
Agent: POST /api/companies/:companyId/plugins
  -> status: "pending_review", approval auto-created

Board: approves in Inbox/Approvals
  -> status: "active", renders on Dashboard

Board: disables in Company Settings
  -> status: "disabled", removed from Dashboard

Agent: updates ui_html
  -> status reset to "pending_review", re-approval required
```

## 5. Data Model

### `plugins` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `company_id` | FK -> companies | |
| `name` | text | unique per company |
| `description` | text | |
| `source` | enum | `agent_created`, `manual` |
| `status` | enum | `pending_review`, `active`, `disabled`, `rejected` |
| `created_by_agent_id` | FK -> agents | nullable |
| `manifest` | jsonb | permissions, slot, size, metadata |
| `ui_html` | text | self-contained HTML bundle (max 512KB) |
| `ui_html_sha256` | text | integrity check, triggers re-approval on change |
| `approval_id` | FK -> approvals | nullable |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

## 6. API

| Endpoint | Method | Actor | Purpose |
|---|---|---|---|
| `/api/companies/:companyId/plugins` | POST | agent, board | Create plugin. Agent-created auto-creates `plugin_review` approval. |
| `/api/companies/:companyId/plugins` | GET | any | List plugins. Supports `?status=active` filter. |
| `/api/companies/:companyId/plugins/:pluginId` | GET | any | Get plugin detail + manifest. |
| `/api/companies/:companyId/plugins/:pluginId` | PATCH | board | Update status or content. Content change resets to `pending_review`. |
| `/api/companies/:companyId/plugins/:pluginId` | DELETE | board | Remove plugin. |
| `/api/companies/:companyId/plugins/:pluginId/proxy` | POST | board (host page) | External API proxy. Validates host, resolves secrets, returns response. |

## 7. UI Changes

### New components
- **`PluginPanel.tsx`** — Sandboxed iframe renderer with `postMessage` data bridge.

### Modified pages
- **`Dashboard.tsx`** — Fetches active plugins, renders `PluginPanel` for each after built-in metric cards.
- **`CompanySettings.tsx`** — New "Plugins" tab.
- **Approvals flow** — `plugin_review` type: shows manifest permissions summary, external hosts, secrets requested, iframe preview.

## 8. Shared Constants Changes

`packages/shared/src/constants.ts`:
- Add `PLUGIN_STATUSES = ["pending_review", "active", "disabled", "rejected"]`
- Add `PLUGIN_SOURCES = ["agent_created", "manual"]`
- Extend `APPROVAL_TYPES` with `"plugin_review"`
- Extend `LIVE_EVENT_TYPES` with `"plugin.created"`, `"plugin.status"`

## 9. Implementation Files

| File | Change |
|---|---|
| `packages/db/src/schema/plugins.ts` | New schema + migration |
| `packages/shared/src/constants.ts` | Plugin constants, extend approval/event types |
| `server/src/routes/plugins.ts` | New route module |
| `server/src/services/plugins.ts` | New service (CRUD, proxy, approval integration) |
| `server/src/app.ts` | Mount `pluginRoutes(db)` |
| `server/src/routes/approvals.ts` | Handle `plugin_review` type |
| `ui/src/components/PluginPanel.tsx` | New: iframe + bridge |
| `ui/src/pages/Dashboard.tsx` | Render plugin panels |
| `ui/src/pages/CompanySettings.tsx` | Plugin management tab |
| `skills/paperclip/SKILL.md` | Plugin creation docs for agents |
