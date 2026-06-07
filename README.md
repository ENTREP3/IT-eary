# IT-eary

A digital companion for the neighborhood **karinderya** — a living customer menu
on one side and a clear-eyed admin back-office on the other. Built with React +
Vite + Tailwind, with a Supabase (Postgres) backend for auth, payments, orders,
menu/inventory, and analytics.

## Features

- **Customer storefront** — browse today's menu, add to cart, log in / register,
  and check out with a **Cash or GCash** choice.
- **Admin dashboard** (press `Ctrl+Shift+A`, then sign in) — live order analytics,
  a **kitchen order-queue** board, inventory, menu control, payment settings, and
  expense tracking.
- **Secure auth & roles** — Supabase Auth with `customer` / `admin` roles enforced
  by Row-Level Security.
- **Live data** — orders, menu, and inventory sync across devices via Supabase Realtime.

## Quick start

Prerequisites: **Node.js**, **Docker Desktop** running.

```bash
npm install              # install dependencies
npx supabase start       # boot the local Supabase stack (Docker)
npx supabase db reset    # apply schema + seed data
cp .env.example .env.local   # then paste values from `npx supabase status`
npm run dev              # start the app at http://localhost:5173
```

**Default admin login:** `admin@iteary.local` / `admin123`

## Docs

- [BACKEND.md](BACKEND.md) — backend setup, schema, auth model, and how the
  frontend connects (maps to the project's 4 phases).
- [IMPROVEMENTS.md](IMPROVEMENTS.md) — roadmap / consulting notes.

## Verify

```bash
node scripts/verify-backend.mjs   # auth, RLS, orders, payments
node scripts/verify-phase4.mjs    # menu/inventory/expenses + order trigger
```
