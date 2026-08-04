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

### Auth model — staff only

**Diners have no accounts.** Ordering is anonymous and ticket-based; the only
authenticated users are staff.

Authentication uses **Supabase Auth (email + password)**. Roles live in
`public.profiles.role` (`admin` | `cashier`), **not** in the JWT, and are
**server-controlled**:

- A DB trigger (`handle_new_user`) creates a profile for every new auth user and
  **always** sets `role = 'customer'` (the inert default). A malicious client
  cannot sign up as staff by passing `{"role":"admin"}` — that input is ignored.
- Staff are created out-of-band: the seed creates `admin@iteary.local` and
  `cashier@iteary.local`, or an existing admin calls `promote_to_admin(email)` /
  `promote_to_cashier(email)`.
- Column-level grants prevent anyone from updating their own `role`
  (verified by the test suite — see below).
- `public.is_admin()` gates owner-only data; `public.is_staff()` (admin **or**
  cashier) gates the order queue.

### Login (frontend)

In [`src/app/store/authStore.ts`](src/app/store/authStore.ts):

| Function | What it does |
| --- | --- |
| `loginStaff(email, password, allowed)` | Signs in, then **verifies the role is in `allowed`**; if not, signs back out and rejects |
| `signOut()` | Ends the session |

Routing in [`src/app/App.tsx`](src/app/App.tsx) gates `/admin` to `['admin']` and
`/cashier` to `['cashier', 'admin']`.

**Staff logins:** `admin@iteary.local` / `admin123` and
`cashier@iteary.local` / `cashier123` (change these for anything real).

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

### `orders` = tickets

A checkout creates a **ticket**, not a payment. `orders.payment_method` stays
**NULL** until a cashier settles it at the counter — NULL therefore means
"not yet paid".

Two RPCs are the only write paths:

| Function | Caller | What it does |
| --- | --- | --- |
| `create_ticket(p_items, p_customer_name)` | `anon` | **Recomputes prices and the total server-side** from `public.dishes` — the client sends only dish ids + quantities, so a tampered client cannot underpay. Rejects sold-out dishes, allocates a unique 6-char code, inserts the order. |
| `mark_ticket_paid(p_ticket_code, p_method)` | staff | Sets `status='paid'`, `payment_method`, `paid_at`, `paid_by`. Refuses an already-paid or cancelled ticket, so a double-click can't read as a second payment. |

Clients hold **no INSERT grant** on `orders` at all.

### Ticket codes

6 characters from a 32-symbol alphabet with `O/0/I/1` removed, so codes are
unambiguous read aloud or typed (`generate_ticket_code()`). ~1.07 billion
combinations.

### Security trade-off — anonymous ticket lookup

Anonymous diners can `select` orders **from the last 24 hours**, not strictly
their own — with no accounts there is no identity to scope by. This is what lets
a diner's device read its ticket and receive live status updates.

Bounded by: ~1 billion code combinations, the 24-hour window, no personal data
on an order beyond an optional first name, and **no anonymous writes**. If this
needs tightening later, add a long random `claim_token` held only by the diner's
device and keep the short code purely for the cashier's keyboard.

### Analytics — "How diners pay"

The admin dashboard reads orders live (with a **Realtime** subscription, so new
orders appear instantly) and computes:

- **How diners pay** pie chart — Cash vs GCash, straight from
  `orders.payment_method`. Unpaid tickets (NULL) are excluded from both the JS
  helper and the SQL function, so they don't show up as a phantom slice.
- Latest orders, today's order pulse, 7-day sales, best sellers.

There is also a `admin_payment_mix(days)` SQL function (admin-only) that returns
the same breakdown server-side if you prefer aggregating in the DB.

---

## Phase 3 — Frontend

The React app is **staff-only** — there is no customer screen. Routes are
declared in [`App.tsx`](src/app/App.tsx):

| Route | Roles | Component |
| --- | --- | --- |
| `/cashier` | cashier, admin | [`CashierApp.tsx`](src/app/components/CashierApp.tsx) |
| `/admin` | admin | [`AdminApp.tsx`](src/app/components/AdminApp.tsx) |
| anything else | — | redirects to `/cashier` |

An unauthenticated (or wrongly-roled) visit renders
[`AuthScreen.tsx`](src/app/components/auth/AuthScreen.tsx) instead of the page.

### Cashier flow

Ticket code input → order review → **Cash / GCash** → receipt.
[`Receipt.tsx`](src/app/components/Receipt.tsx) renders the on-screen receipt and
also builds a 32-column plain-text version for **Print** and **Download**
(sized for an 80mm thermal roll).

---

## Schema map

```
auth.users ──1:1──> public.profiles (role: admin|cashier)   ← staff only

public.payment_settings (singleton)
public.orders  = TICKETS  ──Realtime──> admin dashboard + kitchen + diner's phone
   ├─ create_ticket()      anon  · server-priced insert (the ONLY insert path)
   ├─ mark_ticket_paid()   staff · records payment_method / paid_at / paid_by
   └─ trigger apply_order_to_dishes(): on insert, sold_today++ / stock_count--

public.categories ─┐
public.dishes      ├─ public read, admin write ──Realtime──> Flutter app + admin
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

A self-contained test exercises the real ticket/RLS/payment paths through
`@supabase/supabase-js` (the same client the app uses):

```bash
node scripts/verify-backend.mjs
```

It checks that an anonymous diner can raise a ticket; that **a tampered client
cannot set its own price** (sends ₱1 for a ₱75 dish, asserts the stored total is
₱75); that sold-out dishes are refused; that `anon` cannot insert, update, or
settle an order; that a cashier can look a ticket up and settle it exactly once
(double payment refused); that a cashier **cannot** reach admin-only data; that
an admin sees everything and the payment-mix RPC works; and that anonymous
exposure stays bounded to the 24-hour window.

---

## Phase 4 — Recommended improvements

See the "Phase 4" section in the chat / `IMPROVEMENTS.md` for the full
consulting write-up (security, UX, scalability, and feature ideas).
