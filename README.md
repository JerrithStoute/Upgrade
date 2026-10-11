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
| **Takeoff** | On-screen takeoff from PDF or image plans (up to 100 MB): per-sheet scale (preset or calibrated), area / linear / count conditions with deductions, pitch for roofs, rakes, hips and valleys, a joist & rafter tool (spacing, overhang, cut list), assemblies (e.g. 1 sheet per 32 sf + waste), one-click send to a draft estimate that updates in place, a material list (print / CSV / hide prices), and **Rebid at current prices**, which re-prices a job from the Item List into a new estimate version. |
| **Item List** | Company-wide list of materials and labor (Settings → Item List, admins). Pick items into takeoff assemblies; new items typed into an assembly are added automatically. Jobs keep their own prices. |
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
- [Prisma 6](https://www.prisma.io) with **PostgreSQL 17** — on your PC it runs from the project folder (`npm run dev` starts it; data in `.pgdata/`), nothing to install
- Tailwind CSS v4, lucide icons
- Cookie-based sessions (signed JWT), bcrypt password hashing, role-based access (Admin, Staff, Client, Subcontractor)
- File uploads go through one storage switch (`STORAGE`): a local folder (`UPLOAD_DIR`) now, cloud storage once hosted

## Getting started

Requires Node.js 20+ (22 recommended).

```bash
git clone <this repo> upgrade && cd upgrade
cp .env.example .env        # then set SESSION_SECRET (openssl rand -base64 48)
npm install
npm run db:up               # first time only, in a second window: starts the local database
npm run db:deploy && npm run db:seed   # creates the tables + company lock, loads a demo company (then Ctrl+C the db:up window)
npm run dev                 # starts the database and the app — http://localhost:3000
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
| `npm run dev` | Starts the local database, then the development server (Ctrl+C stops both) |
| `npm run db:up` | Just the local database (for scripts or Prisma Studio) |
| `npm run db:copy-from-sqlite` | Copies an old SQLite database file (or old backup) into Postgres, checking every count |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:migration -- <name>` | After editing `prisma/schema.prisma`: writes the change as a migration, applies it, re-applies the company lock |
| `npm run db:deploy` | Applies migrations + the company lock (what the online server runs) |
| `npm run db:rules` | Re-applies the company lock (Row-Level Security + same-company link checks) |
| `npm run test:isolation` | Break-in test: a throwaway company tries to reach another company's data every way (app must be running) |
| `npm run db:seed` | Loads (or refreshes) the demo company — other companies are never touched |
| `npm run db:reset` | Recreate the database and reseed |
| `npm run db:studio` | Open Prisma Studio to browse the database |
| `npm run create-admin` | Create an admin login without demo data |
| `npm run typecheck` / `npm run lint` | Type checking and linting |
| `npm test` | Checks for the takeoff math (joists, rafters, hips, packing, assemblies…) |
| `npm run backup` | Back up the database and uploads now |

### Configuration (`.env`)

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | The app's own database login — the database only lets it see one company at a time. Locally: `postgresql://app_user:local-app@localhost:5433/builderstation` |
| `SYSTEM_DATABASE_URL` | The tables' owner: sign-in, backups, migrations. Locally: `postgresql://builder:local@localhost:5433/builderstation` |
| `STORAGE` | Where uploads (and, online, backups) live: `local` (default, `UPLOAD_DIR`) or `cloud` (required online). |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | For `STORAGE=cloud`: Cloudflare R2 (or any S3-compatible storage). |
| `APP_DB_PASSWORD` | Online: the app's own database login password. `scripts/online.mjs` builds `DATABASE_URL` from `SYSTEM_DATABASE_URL` with it. |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile, the "I'm not a robot" check on sign-up, forgot-password, and sign-in after wrong tries. Off when unset; required online. |
| `TZ` | The time zone dates and times are shown in (online: `America/Chicago`). |
| `SESSION_SECRET` | Random string of at least 32 characters used to sign login cookies. **Required in production** — the server won't start without it. Generate one with `openssl rand -base64 48`. |
| `ENCRYPTION_KEY` | A *different* random string (32+ characters) that locks secrets kept in the database (authenticator-app keys). **Required in production.** Keep it safe — losing it means everyone has to set up two-step sign-in again. |
| `UPLOAD_DIR` | Where uploaded files/photos are stored. Default `./uploads`. |
| `APP_URL` | The program's address, for links in emails (e.g. `https://thebuilderstation.com`). Default `http://localhost:3000`. |
| `MAIL` | `outbox` (default on a PC — emails are saved and shown at `/dev/outbox`, nothing is sent) or `resend` (online). |
| `RESEND_API_KEY` / `MAIL_FROM` | For `MAIL=resend`: the Resend key, and the From address (default `The Builder Station <no-reply@thebuilderstation.com>`). |
| `BACKUP_DIR` | Where backups go. Default `./backups` — point it at another drive or a synced cloud folder. |
| `BACKUP_KEEP` | How many database backups to keep. Default `30`. `BACKUP_AUTO="off"` turns off the nightly backup. |

## Deploying

Online it runs on Render, from `render.yaml`: the program, a Postgres database, files and
backups in Cloudflare R2, and email through Resend. The step-by-step is in
[GOING-ONLINE.md](GOING-ONLINE.md). Each deploy runs `npm run db:deploy` (database changes +
company rules) before the new version starts. The server refuses to start if a required
setting is missing (`src/lib/startup-checks.ts`). Failed sign-ins are rate-limited in memory,
which assumes one app process. Moving this PC's companies up: `npm run go-online:copy`.

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
