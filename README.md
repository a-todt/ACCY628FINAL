# General Contract Management

Contract-to-cash management for general contractors.

## Stack

- Next.js (App Router) + React
- Tailwind CSS + daisyUI
- Supabase Auth + Postgres (RLS)
- Recharts

## Setup

### 1. Environment variables

Create or update `.env.local` (already gitignored):

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
```

Use the **ACCY628-FINAL-PROJECT** values from Supabase → Settings → API.

**After creating or editing `.env.local`, stop and restart the dev server.**

### 2. Database (required once)

Supabase MCP was unavailable during setup, so apply SQL manually:

1. Open [Supabase SQL Editor](https://supabase.com/dashboard/project/cetchmtjuvdaqfdbvfva/sql)
2. Paste and run `supabase/FULL_SETUP.sql` (schema + RLS + seed)
   - Or run `supabase/migrations/20260804180000_gc_contract_manager.sql` then `supabase/seed.sql`
3. For file attachments, also run:
   - [`supabase/migrations/20260805200000_attachments_and_storage.sql`](supabase/migrations/20260805200000_attachments_and_storage.sql) (base table + Storage bucket)
   - [`supabase/migrations/20260805210000_attachments_change_orders_insurance.sql`](supabase/migrations/20260805210000_attachments_change_orders_insurance.sql) (change orders + insurance policies)
   
   That creates/extends the `attachments` table, RLS, and a private Storage bucket named `attachments`. If the bucket insert fails, create a **private** bucket named `attachments` in Supabase → Storage and re-run the policy statements from those migrations.
4. For client ↔ PM messaging (inbox icon), also run:
   - [`supabase/migrations/20260806090000_contract_pm_messaging.sql`](supabase/migrations/20260806090000_contract_pm_messaging.sql)

### 3. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Demo logins (after seed)

| Email | Password | Role |
|-------|----------|------|
| admin@gcmanager.demo | Demo123! | Admin |
| owner@gcmanager.demo | Demo123! | Owner / Executive |
| pm@gcmanager.demo | Demo123! | Project Manager |
| pm2@gcmanager.demo | Demo123! | Project Manager (Alex Chen) |
| client@gcmanager.demo | Demo123! | Client |
| field@gcmanager.demo | Demo123! | Field Supervisor |
| field2@gcmanager.demo | Demo123! | Field Supervisor (Casey Morgan) |
| sub@gcmanager.demo | Demo123! | Subcontractor |
| sub2@gcmanager.demo | Demo123! | Subcontractor (Taylor Quinn) |

### Fix / reset demo data

Demo Auth users are created via the Auth API (not fragile SQL inserts).

1. In Supabase SQL Editor, run [`supabase/APPLY_NOW.sql`](supabase/APPLY_NOW.sql) (schema + roles). It may already be on your clipboard.
2. Then run:

```bash
npm run bootstrap:demo
```

That seeds contracts and related demo data and confirms roles.

## Features

- Role-based dashboards and navigation
- Contracts, change orders, subcontractors, costs, invoices/payments, field logs
- Reports (admin / PM) with CSV / PDF export
- Finance overview CSV / PDF export
- Role-aware Alerts inbox (invoices, weather, change orders)
- Client ↔ project manager messaging hub (inbox icon next to Alerts)
- File attachments on field logs, invoices, change orders, and insurance policies (Supabase Storage)
- Theme selector (daisyUI)
- Demo role switcher in the header (preview only)
