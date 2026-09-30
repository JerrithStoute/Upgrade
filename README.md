# Upgrade — Construction Project Management

Upgrade is a self-hosted construction project management app for builders and
remodelers, in the spirit of CoConstruct / Buildertrend. It gives your team one
place to run every job and gives your clients a portal to make selections,
approve change orders, see the schedule and pay attention to what matters.

## What's inside

| Area | What it does |
| --- | --- |
| **Dashboard** | Active projects, contract value, receivables, pending client approvals, your to-dos, upcoming schedule, activity feed. |
| **Projects** | Job file for every lead and project: status pipeline (Lead → Estimating → Proposal Sent → Contracted → In Progress → Completed), address, client, manager, dates, square footage. |
| **Clients** | Simple CRM with contact details, project history, and one-click client portal logins. |
| **Estimates & Proposals** | Line items by cost code with quantity, unit cost and markup; allowances and optional items; versioning; a clean printable proposal that never exposes your cost or markup. |
| **Selections** | Client choices (tile, fixtures, countertops…) with allowances, options, vendor/model info, due dates and over/under-allowance tracking. Clients pick and approve from the portal. |
| **Change Orders** | Priced change orders with schedule impact, sent for approval and e-signed by the client in the portal. Approved COs roll into the contract value and budget. |
| **Schedule** | Phase-grouped Gantt chart with milestones, predecessors, % complete, assignments and cascading date shifts. Company-wide 4-week view. |
| **Budget / Job Costing** | Budget vs actual by cost code (approved estimate + approved change orders vs logged expenses), projected margin, unpaid bills. |
| **Invoices** | Progress draws by % of contract, change-order billing, payments, statuses, printable invoices, company-wide receivables. |
| **Daily Logs** | Weather, crew, hours, work completed, issues and photos — optionally visible to the client. |
| **To-Dos** | Personal and project to-dos with priority, due dates and assignees. |
| **Files & Photos** | Folders (Plans, Photos, Contracts, Permits…), uploads, client visibility. |
| **Messages** | Threaded project conversations; internal-only or shared with the client. |
| **Client Portal** | Clients sign in and see only their project: approvals needed, selections, change orders, schedule, invoices, photos, messages. |
| **Settings** | Company profile, team members and roles, cost code library. |

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, Server Components, Server Actions), React 19, TypeScript
- [Prisma 6](https://www.prisma.io) with **SQLite** — a single file database, no server to run
- Tailwind CSS v4, lucide icons
- Cookie-based sessions (signed JWT), bcrypt password hashing, role-based access (Admin, Staff, Client, Subcontractor)
- File uploads stored on local disk (`UPLOAD_DIR`)

## Getting started

Requires Node.js 20+ (22 recommended).

```bash
git clone <this repo> upgrade && cd upgrade
cp .env.example .env        # then edit SESSION_SECRET
npm run setup               # installs deps, creates the SQLite DB, loads demo data
npm run dev                 # http://localhost:3000
```

Demo accounts (password is `password` for all):

| Role | Email |
| --- | --- |
| Owner / Admin | `owner@upgradebuilders.com` |
| Project Manager (Staff) | `pm@upgradebuilders.com` |
| Superintendent (Staff) | `super@upgradebuilders.com` |
| Client (portal) | `client@example.com` |

To start with an empty company instead of demo data:

```bash
npm install
npx prisma db push
npm run create-admin -- "Your Name" you@company.com "a-strong-password" "Your Company Name"
```

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:push` | Apply schema changes to the SQLite database |
| `npm run db:seed` | Load demo data (wipes existing data) |
| `npm run db:reset` | Recreate the database and reseed |
| `npm run db:studio` | Open Prisma Studio to browse the database |
| `npm run create-admin` | Create an admin login without demo data |
| `npm run typecheck` / `npm run lint` | Type checking and linting |

### Configuration (`.env`)

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | SQLite file, default `file:./dev.db` (relative to `prisma/`) |
| `SESSION_SECRET` | Long random string used to sign login cookies. **Change it.** |
| `UPLOAD_DIR` | Where uploaded files/photos are stored. Default `./uploads`. |

## Deploying

Upgrade is a standard Next.js app. Run `npm run build && npm start` on any
Node host (a small VPS, Railway, Render, Fly.io, a Docker container). Persist
two paths between deploys: the SQLite database file and `UPLOAD_DIR`. Put it
behind HTTPS (the session cookie is marked `secure` in production). Back up the
database file regularly — it is the whole system of record.

## Project layout

```
prisma/schema.prisma     data model (projects, estimates, selections, COs, schedule, …)
prisma/seed.ts           demo data
src/proxy.ts             login guard for every route
src/lib/                 db client, auth/session, money & date helpers, finance and schedule math
src/components/ui/       shared UI kit (buttons, tables, cards, badges, forms)
src/app/(app)/           staff application (dashboard, projects, clients, schedule, settings, …)
src/app/(portal)/        client portal
src/app/api/files/[id]   authenticated file download
```

## Roadmap ideas

Email/SMS notifications, online payments, lead intake forms, subcontractor
portal and bid requests, QuickBooks sync, time clock, warranty requests,
document e-signature, mobile app.
