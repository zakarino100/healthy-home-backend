# Healthy Home OS

## Overview

A lightweight business operating system for Healthy Home, a local exterior cleaning company (house wash, driveway cleaning, bundles). Tracks sales, fulfillment, reviews, content, and generates daily business reports.

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
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server — all business logic
│   └── dashboard/          # React frontend — owner dashboard UI
├── lib/
│   ├── api-spec/           # OpenAPI spec (openapi.yaml) + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
```

## Database Schema (lib/db/src/schema/)

- **canvassing_sessions** — D2D session records per canvasser per day
- **leads** — Lead-level records with status flow (new→quoted→follow_up→sold→lost)
- **customers** — Customer master record
- **jobs** — Job scheduling and fulfillment (scheduled→completed/rescheduled/canceled)
- **review_workflows** — Post-job satisfaction routing (4-5 → Google review, 1-3 → internal feedback + issue flag)
- **job_content** — Before/after photos, video capture, content-ready flag (auto-created with each job)
- **daily_reports** — Persisted daily report with full Robin-payload JSON

## API Routes (artifacts/api-server/src/routes/)

| Module | Routes |
|---|---|
| Health | GET /api/healthz |
| Canvassing | GET/POST /api/canvassing/sessions, GET/PUT /api/canvassing/sessions/:id |
| Leads | GET/POST /api/canvassing/leads, GET/PUT /api/canvassing/leads/:id |
| Customers | GET/POST /api/customers, GET/PUT /api/customers/:id |
| Jobs | GET/POST /api/jobs, GET/PUT /api/jobs/:id, POST /api/jobs/:id/complete |
| Reviews | GET /api/reviews, POST /api/reviews/:id/satisfaction, POST /api/reviews/:id/resolve-issue, POST /api/reviews/campaign/batch |
| Content | GET/PUT /api/content/:jobId |
| Dashboard | GET /api/dashboard/today, GET /api/dashboard/weekly |
| Reports | GET /api/reports/daily, POST /api/reports/daily/generate, GET /api/reports/daily/:date/export |

## Key Business Logic

- **Job completion** (POST /api/jobs/:id/complete): marks job done, creates review workflow, sets satisfactionSentAt
- **Satisfaction routing**: score ≥ 4 → status=review_link_sent, score < 4 → status=feedback_requested + isIssueFlagged=true
- **Daily report generation**: aggregates all canvassing + job + review data for date, detects anomalies, produces Robin-ready JSON payload, supports webhook delivery
- **Daily KPI targets**: 20 good conversations, 4 closes, $1,200 revenue, 1 bundle per day

## Daily Report / Robin Payload

POST /api/reports/daily/generate with `{"date":"YYYY-MM-DD","webhookUrl":"optional"}`

Payload structure:
```json
{
  "businessName": "Healthy Home",
  "reportDate": "YYYY-MM-DD",
  "salesMetrics": { "doorsKnocked", "goodConversations", "quotesGiven", "closes", "closeRate", "revenueSold", "averageTicket", "bundlesSold" },
  "fulfillmentMetrics": { "jobsCompleted", "cashCollected", "tomorrowScheduled" },
  "reviewMetrics": { "reviewRequestsSent", "positiveSatisfaction", "negativeSatisfaction", "reviewsReceived" },
  "teamMetrics": { "topCanvasser", "topTechnician" },
  "openIssues": 0,
  "nextDaySchedule": [...],
  "notes": "Anomaly notes..."
}
```

To auto-send to Robin: include `webhookUrl` in the generate request. The system will POST the payload to that URL.

## Configuring Automated Daily Reports

To automate end-of-day report delivery:
1. Set up a cron job or scheduled task to call: `POST /api/reports/daily/generate` with `{"date":"YYYY-MM-DD","webhookUrl":"https://your-webhook.com/robin"}`
2. The webhook receives the full Robin payload as JSON
3. Reports are also saved to the database for dashboard review

## Running Codegen (after OpenAPI spec changes)

```
pnpm --filter @workspace/api-spec run codegen
```

## DB Migrations

```
pnpm --filter @workspace/db run push
```
