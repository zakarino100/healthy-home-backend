# Healthy Home OS

## Overview

A full-stack business operating system for Healthy Home, a local exterior cleaning company (house wash, driveway cleaning, bundles). Tracks canvassing sessions, leads, customers, jobs, review/satisfaction workflows, content capture, team management, and generates automated daily reports in a Robin-compatible payload format.

## Data Architecture — Option 3 (ACTIVE)

**Revenue/closes come from sold leads, not canvassing sessions.**

| Metric | Source |
|---|---|
| Doors knocked, conversations, quotes given | `canvassing_sessions` table (activity) |
| Closes, revenue sold, bundle count | `leads` WHERE `status='sold'` JOIN `hh_lead_details` |
| Jobs completed, cash collected | `hh_jobs` WHERE `status='completed'` |

Key tables:
- **`leads`** — shared CRM table; HH records have `business_unit='healthy_home'`
- **`hh_lead_details`** — stores HH-specific financials (`sold_price`, `quote_price`, `is_bundle`, `job_id`)
- **`hh_jobs`** — fulfillment records; have `lead_id` FK linking back to the originating sale

### Jobs Pipeline flow
1. Lead marked `status='sold'` + `hh_lead_details` record created → appears in **Needs Scheduling** section of Jobs page
2. Owner clicks "Schedule Job" → POST `/api/jobs/from-lead/:leadId` → creates `hh_customers` + `hh_jobs` record, links `lead_details.job_id`
3. Job moves through pipeline: `scheduled → completed`

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Frontend**: React + Vite (Recharts, TanStack Query, Wouter)
- **Scheduler**: node-cron (auto end-of-day report)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server — all business logic + scheduler
│   └── dashboard/          # React frontend — owner dashboard UI
├── lib/
│   ├── api-spec/           # OpenAPI spec (openapi.yaml) + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
```

## Database

**Primary DB**: Supabase (project `hclpovktywijfnswthpm`, pooler: `aws-1-us-east-1.pooler.supabase.com:6543`).  
Connection string stored in `SUPABASE_DATABASE_URL` env var; `lib/db/src/index.ts` prefers it over the local `DATABASE_URL`.

**CRITICAL — Shared Supabase project**: The Wolfpack D2D app uses the same Supabase instance. The following tables contain LIVE PRODUCTION DATA and must **never** be altered, dropped, or have new columns/rows written by Healthy Home code:
`leads` (read + hh_filter-write only), `pins`, `d2d_touches`, `d2d_quotes`, `d2d_media`, `d2d_services`, `crm_activity`, `call_logs`, `conversations`, `automation_rules`, `message_*`, `nurture_*`, `voice_settings`

### Schema (lib/db/src/schema/)

| Drizzle file | Supabase table | Notes |
|---|---|---|
| `canvassing.ts` → `leadsTable` | **`leads`** (shared) | Read/write with `WHERE business_unit='healthy_home'`; new records get `source='crm'` |
| `canvassing.ts` → `hhCanvassingSessionsTable` | `hh_canvassing_sessions` | HH-only canvassing sessions |
| `customers.ts` | `hh_customers` | HH customer master records |
| `jobs.ts` | `hh_jobs` | Job scheduling + fulfillment |
| `reviews.ts` | `hh_review_workflows` | Post-job satisfaction + review routing |
| `content.ts` | `hh_job_content` | Before/after photos, video |
| `reports.ts` | `hh_daily_reports` | Persisted daily report + Robin payload |
| `users.ts` | `hh_users` | HH team members |
| `routes.ts` → `canvassingRoutesTable` | `canvassing_routes` | Shared (no `hh_` prefix) — D2D app can also read/write this |
| `tasks.ts` → `tasksTable` | `hh_tasks` | Follow-up tasks linked to jobs, leads, sessions, customers |

All `hh_*` tables use **TEXT** fields for status/enum columns (no pgEnum) to avoid conflicts with the live DB's existing enum types.

All core HH tables (`hh_canvassing_sessions`, `hh_jobs`, `hh_lead_details`, `hh_customers`) have `sync_source` and `updated_by` columns for data provenance tracking.

### leads table mapping (API boundary)

| External API field | DB column (`leads`) |
|---|---|
| `firstName` + `lastName` | `homeowner_name` (join/split on first space) |
| `address` | `address_line1` |
| `canvasser` | `assigned_rep_email` |
| `serviceInterest` | `services_interested[0]` |
| `followUpDate` | `next_followup_at` |
| `id` | `id` (UUID, not integer) |

### Schema changes

**drizzle.config.ts** now has `tablesFilter: ["hh_*"]` — drizzle-kit only manages tables with the `hh_` prefix and will never attempt to drop/alter Wolfpack or shared tables.

For any new `hh_*` table: create via direct SQL, add Drizzle schema to match. Do NOT use `drizzle-kit push` — even with tablesFilter it can try to CREATE non-hh tables that are in the schema.

For shared tables (no `hh_` prefix, accessible to both apps): create via SQL migration script, add Drizzle schema for type-safe queries only — drizzle-kit will not manage them due to the filter.

## API Routes (artifacts/api-server/src/routes/)

| Module | Routes |
|---|---|
| Health | GET /api/healthz |
| Users | GET/POST /api/users, GET/PUT/DELETE /api/users/:id |
| Canvassing | GET/POST /api/canvassing/sessions, GET/PUT/DELETE /api/canvassing/sessions/:id |
| Leads | GET/POST /api/canvassing/leads, GET/PUT/DELETE /api/canvassing/leads/:id, POST /api/canvassing/leads/:id/convert |
| **Routes** | **GET/POST /api/canvassing/routes, PUT/DELETE /api/canvassing/routes/:id** — shared `canvassing_routes` table |
| Customers | GET/POST /api/customers, GET/PUT /api/customers/:id |
| Jobs | GET/POST /api/jobs, GET/PUT /api/jobs/:id, POST /api/jobs/:id/complete |
| Jobs (pending) | GET /api/jobs/pending-sales — includes `latestTouchNote` + `latestTouchDate` from `d2d_touches` |
| Reviews | GET /api/reviews, POST /api/reviews/:id/satisfaction, POST /api/reviews/:id/resolve-issue, POST /api/reviews/campaign/batch |
| Content | GET/PUT /api/content/:jobId |
| Dashboard | GET /api/dashboard/today, GET /api/dashboard/weekly |
| Calendar | GET /api/calendar — returns `jobs` + `routes` (from `canvassing_routes`) |
| Tasks | GET/POST /api/tasks, GET/PUT/DELETE /api/tasks/:id |
| Reports | GET /api/reports/daily, POST /api/reports/daily/generate, GET /api/reports/daily/:date/export?format=json|csv |

## Key Business Logic

- **Job completion** (POST /api/jobs/:id/complete): marks job done, creates review workflow, sets satisfactionSentAt
- **Satisfaction routing**: score ≥ 4 → status=review_link_sent, score < 4 → status=feedback_requested + isIssueFlagged=true
- **Lead conversion** (POST /api/canvassing/leads/:id/convert): creates a Customer record from a lead and links them
- **Daily report generation**: aggregates all canvassing + job + review data for a date, detects anomalies, produces canonical Robin JSON payload, optionally POSTs to webhook
- **Daily KPI targets**: 20 good conversations, 4 closes, $1,200 revenue sold, 1 bundle per day
- **Automated scheduler**: node-cron runs at `REPORT_SEND_TIME` (default 20:00 CT) to auto-generate and deliver the daily report

## Daily Report / Robin Payload (V2.1 spec)

POST /api/reports/daily/generate with `{"date":"YYYY-MM-DD"}`  
GET /api/reports/daily/:date/export?format=json|csv

Canonical snake_case payload structure:
```json
{
  "business_name": "Healthy Home",
  "report_date": "YYYY-MM-DD",
  "sales_metrics": { "doors_knocked", "people_reached", "contact_rate_pct", "not_home", "no_answer", "callbacks_requested", "good_conversations", "quotes_given", "closes", "close_rate_pct", "revenue_sold", "average_ticket", "bundles_sold", "driveaway_addons" },
  "fulfillment_metrics": { "jobs_completed", "cash_collected", "jobs_scheduled_tomorrow" },
  "review_metrics": { "satisfaction_requests_sent", "positive_responses", "negative_responses", "reviews_received" },
  "team_metrics": { "top_canvasser", "top_technician", "canvasser_count_active_today" },
  "open_issues": { "count": 0, "details": [{ "workflowId", "customerId", "jobId", "notes" }] },
  "next_day_schedule": [...],
  "daily_targets": {
    "good_conversations": { "goal": 20, "actual": 0, "met": false },
    "closes": { "goal": 4, "actual": 0, "met": false },
    "revenue_sold": { "goal": 1200, "actual": 0, "met": false },
    "bundles": { "goal": 1, "actual": 0, "met": false }
  },
  "anomaly_notes": "Plain English notes..."
}
```

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| REPORT_SEND_TIME | 20:00 | Daily report cron time (HH:MM, America/Chicago) |
| REPORT_DELIVERY_MODE | database | webhook / database / both |
| ROBIN_REPORT_WEBHOOK_URL | (empty) | Webhook URL to POST Robin payload |
| GOOGLE_REVIEW_LINK | (empty) | Google review link for happy customers |
| FEEDBACK_FORM_URL | (empty) | Internal feedback form URL |
| REVIEW_DELIVERY_MODE | sms | sms / email / manual |
| REPORT_FALLBACK_EMAIL | (empty) | Optional email fallback |
| RESEND_API_KEY | (empty) | For email delivery |

## Running Codegen (after OpenAPI spec changes)

```
pnpm --filter @workspace/api-spec run codegen
cd lib/api-client-react && pnpm exec tsc --build  # rebuild declarations
```

## DB Migrations

For simple additive schema changes:
```
pnpm --filter @workspace/db run push-force
```
For complex changes (renames, type changes), run SQL directly via the executeSql tool.
