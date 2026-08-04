# IT-eary

A digital companion for the neighborhood **karinderya**, built around a
**ticket-based counter flow**:

1. A diner browses the menu and builds a cart — **no account, no login**.
2. Checkout issues a **ticket** (short code, e.g. `K7M2Q9`) on their device.
3. They show the ticket to the **cashier** at the counter.
4. The cashier types the code, sees the order, takes the money, taps **Paid**.
5. A **receipt** appears for both sides; the diner can download theirs.

The frontend splits by audience:

**Six separate apps** — three on the web (React), three on mobile (Flutter PWAs)
— sharing one Supabase backend.

| Audience | Web · React | Mobile · Flutter PWA |
| --- | --- | --- |
| Customer | `/` | `mobile/lib/main_customer.dart` → `build/customer` |
| Cashier | `/cashier` | `mobile/lib/main_cashier.dart` → `build/cashier` |
| Owner | `/admin` | `mobile/lib/main_admin.dart` → `build/admin` |

Each mobile app is its own build with its own name and icon, so the three
install side by side and a cashier's phone never carries the owner UI at all.

```bash
cd mobile && node build_pwas.mjs       # all three, against hosted Supabase
node build_pwas.mjs --local            # against the local Docker stack
```

### What keeps six frontends in step

React and Flutter share no UI code, so each screen is written twice. Cohesion
comes from two shared layers instead:

1. **The rules live in PostgreSQL, not in any client.** `create_ticket()` prices
   every order server-side, `mark_ticket_paid()` owns the payment outcomes, and
   RLS decides what each role can see. A React cashier and a Flutter cashier
   cannot drift, because neither owns the rules.
2. **One palette, generated for both.** [`design/tokens.json`](design/tokens.json)
   is the single source; `npm run tokens` emits a Tailwind v4 `@theme` block for
   the web and Dart constants for mobile. Change a brand colour in one place.

## Features

- **Diner app** ([`mobile/`](mobile/README.md), Flutter) — browse the menu, build
  an order with no account, get a ticket code, watch it flip to Paid live, and
  download the receipt.
- **Cashier counter** (`/cashier`) — look a ticket up by code, review the order,
  record Cash/GCash payment, print or download the receipt.
- **Admin dashboard** (`/admin`) — live order analytics, a **kitchen order-queue**
  board, inventory, menu control, payment settings, and expense tracking.
- **Server-priced tickets** — totals are computed in Postgres from the live menu,
  so a tampered client cannot underpay.
- **Roles** — Supabase Auth with `admin` / `cashier` roles enforced by
  Row-Level Security. Diners are anonymous and can never write to `orders`.
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

Or run it fully in Docker:

```bash
docker compose up -d web                      # dev server  → http://localhost:5174
docker compose --profile prod up -d --build web-prod   # nginx build → http://localhost:5173
```

**Staff logins (local only):** `admin@bencris.local` / `admin123` ·
`cashier@bencris.local` / `cashier123`

**Practice tickets** (seeded unpaid): `PAY001` · `PAY002` · `PAY003`

## Deploying to a hosted Supabase project

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push        # schema + menu; seeds are NOT pushed
```

`db push` deliberately never runs [`supabase/seed.sql`](supabase/seed.sql), so
the weak local dev passwords can't leak into a public project. Menu, categories,
inventory and the demo tickets travel as a migration
(`20260803010000_menu_and_demo_data.sql`) and do arrive.

**Create staff accounts by hand**, once per project:

1. Supabase dashboard → **Authentication → Users → Add user**, with a real
   password and *Auto Confirm* on.
2. Then in the **SQL Editor**, grant the role:

```sql
select public.promote_to_admin('owner@yourdomain.com');
select public.promote_to_cashier('cashier@yourdomain.com');
```

Point the apps at it with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (web,
in `.env.local`) and `--dart-define` (mobile — see [mobile/README.md](mobile/README.md)).

Once you have real trade, clear the demo history:

```sql
delete from public.orders;
delete from public.expenses;
```

## Docs

- [BACKEND.md](BACKEND.md) — backend setup, schema, auth model, and how the
  frontend connects (maps to the project's 4 phases).
- [IMPROVEMENTS.md](IMPROVEMENTS.md) — roadmap / consulting notes.

## Verify

```bash
node scripts/verify-backend.mjs   # tickets, server-side pricing, roles, RLS, payment
node scripts/verify-phase4.mjs    # menu/inventory/expenses + order trigger
```
