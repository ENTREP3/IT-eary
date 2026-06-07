# IT-eary — Backend & Integration Guide

This document covers the Supabase backend added to IT-eary: how to run it, the
schema, the auth model, and how the frontend connects. It maps 1:1 to the four
phases that were requested.

---

## Phase 1 — Backend Setup & Authentication

### Running Supabase locally (via Docker)

Supabase runs as a set of Docker containers, orchestrated by the Supabase CLI.
You do **not** need to write a `docker-compose.yml` — the CLI generates and
manages the stack from [`supabase/config.toml`](supabase/config.toml).

**Prerequisites:** Docker Desktop running, Node.js installed.

```bash
# 1. Install JS deps (includes @supabase/supabase-js)
npm install

# 2. Start the Supabase stack (Postgres, Auth, Storage, Realtime, Studio…)
npx supabase start

# 3. Apply schema + seed data (also re-runs on demand)
npx supabase db reset

# 4. Copy env values into .env.local (already done for this machine)
npx supabase status        # shows Project URL + publishable key
cp .env.example .env.local # then paste the values

# 5. Run the app
npm run dev
```

> **Ports:** This project is pinned to **55321–55327** (API `55321`, DB `55322`,
> Studio `55323`, Mailpit `55324`) so it can run alongside another local
> Supabase project that already uses the default `54321–54327` range. See
> `[api]`, `[db]`, `[studio]`, etc. in `config.toml`.

Useful URLs once started:

| Service | URL |
| --- | --- |
| API | http://127.0.0.1:55321 |
| Studio (DB GUI) | http://127.0.0.1:55323 |
| Mailpit (test emails) | http://127.0.0.1:55324 |
| App (Vite) | http://localhost:5173 |

### Auth model — two roles

Authentication uses **Supabase Auth (email + password)**. Roles live in
`public.profiles.role` (`customer` | `admin`), **not** in the JWT, and are
**server-controlled**:

- A DB trigger (`handle_new_user`) creates a profile for every new auth user and
  **always** sets `role = 'customer'`. A malicious client cannot sign up as an
  admin by passing `{"role":"admin"}` — that input is ignored.
- Admins are created out-of-band: the seed creates `admin@iteary.local` and
  promotes it, or an existing admin calls `promote_to_admin(email)`.
- Column-level grants prevent a customer from updating their own `role`
  (verified by the test suite — see below).

### Registration & login functions (frontend)

All in [`src/app/store/authStore.ts`](src/app/store/authStore.ts):

| Function | What it does |
| --- | --- |
| `registerCustomer({email,password,fullName,phone})` | `supabase.auth.signUp` + metadata → trigger makes a customer profile |
| `loginCustomer(email,password)` | `supabase.auth.signInWithPassword` |
| `loginAdmin(email,password)` | Signs in, then **verifies `role === 'admin'`**; if not, signs back out and rejects |
| `signOut()` | Ends the session |

**Default admin login:** `admin@iteary.local` / `admin123` (change it for
anything real).

---

## Phase 2 — Payment Management System

### `payment_settings` (singleton, id = 1)

Holds `gcash_name`, `gcash_number`, `gcash_qr_url`, plus `gcash_enabled` /
`cash_enabled` toggles. RLS: **anyone can read** (so diners see how to pay),
**only admins can update**.

- **Admin** edits these on the new **Payments** tab in the dashboard
  (`PaymentsPanel`). The GCash QR image uploads to the `payment-assets` Storage
  bucket (public read, admin-only write) and its public URL is saved back.
- **Customer** reads the live values at checkout (number, name, and QR image).

### `orders` + payment confirmation

When a customer checks out, after reviewing the cart they are asked **“How will
you pay?” → Cash or GCash**. The choice is written to `orders.payment_method`
along with an item snapshot, total, and a generated reference.

### Analytics — "How diners pay"

The admin dashboard reads orders live (with a **Realtime** subscription, so new
orders appear instantly) and computes:

- **How diners pay** pie chart — Cash vs GCash, straight from
  `orders.payment_method`.
- Latest orders, today's order pulse, 7-day sales, best sellers.

There is also a `admin_payment_mix(days)` SQL function (admin-only) that returns
the same breakdown server-side if you prefer aggregating in the DB.

---

## Phase 3 — Frontend Integration & UI Audit

Connected to Supabase:

- **Auth** — customer login/register modal + admin login gate
  ([`AuthScreen.tsx`](src/app/components/auth/AuthScreen.tsx)),
  wired into [`App.tsx`](src/app/App.tsx).
- **Payments** — admin management + customer checkout display.
- **Orders** — checkout writes to the DB; dashboard reads live.

### Hollow UI elements that were made functional

| Element | Before | After |
| --- | --- | --- |
| 🔔 Notification bell | Static dot | Dropdown with **live new-order feed** (Realtime) + low-stock alerts, unread badge, "seen" state persisted |
| 🔍 Admin search | Input with no handler | Filters menu + inventory live, jumps to the matching tab |
| 👤 "Admin 1 · signed in" | Hardcoded text | Real signed-in profile name + role + **Log out** |
| 💳 Checkout | GCash only, hardcoded number, fake payment | Cash/GCash choice, **live** GCash details + QR, writes a real order |
| 📊 Payment mix / recent orders / pulse | Hardcoded sample arrays | Computed live from the `orders` table |
| Admin access | Open via keyboard shortcut, no auth | Shortcut now opens a **login gate**; dashboard requires an admin account |

---

## Schema map

```
auth.users ──1:1──> public.profiles (role: customer|admin)

public.payment_settings (singleton)
public.orders (payment_method drives analytics) ──Realtime──> admin dashboard + kitchen
   └─ trigger apply_order_to_dishes(): on insert, sold_today++ / stock_count--

public.categories ─┐
public.dishes      ├─ public read, admin write ──Realtime──> storefront + admin
public.inventory  ─┘  (inventory is admin-only)
public.expenses (admin-only) ──> profit chart + "Today's net"

storage: payment-assets bucket (GCash QR, public read / admin write)
```

> **Phase 4 note:** menu/inventory/categories/expenses are now Postgres-backed
> (they used to live in browser localStorage). The Kitchen tab is a live order
> queue; the order trigger keeps `sold_today`/`stock_count` accurate server-side.
> Run `node scripts/verify-phase4.mjs` to exercise these paths.

Migrations live in [`supabase/migrations/`](supabase/migrations), seed in
[`supabase/seed.sql`](supabase/seed.sql).

---

## Verifying the backend

A self-contained test exercises the real auth/RLS/orders/payments paths through
`@supabase/supabase-js` (the same client the app uses):

```bash
node scripts/verify-backend.mjs
```

It checks customer signup→profile, **role-escalation is blocked**, order RLS
(customers see only their own; admins see all), admin login + role gate, payment
updates, the payment-mix RPC, and that anonymous users **cannot** place orders.

---

## Phase 4 — Recommended improvements

See the "Phase 4" section in the chat / `IMPROVEMENTS.md` for the full
consulting write-up (security, UX, scalability, and feature ideas).
