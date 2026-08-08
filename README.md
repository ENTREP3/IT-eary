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

All three are built and served by the `mobile` container, so Flutter does not
need to be installed to run them:

```bash
docker compose up -d mobile            # → http://localhost:5180
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

Prerequisites: **Docker Desktop**. Nothing else — not Node, not Flutter, not
Postgres. The database is the hosted Supabase project, so there is no backend to
boot; the containers run the two frontends and nothing more.

```bash
cp .env.example .env.local          # paste the Supabase project URL + publishable key
docker compose up -d --build -V     # build and start both apps
```

That one command is the whole workflow, first run and every run after. It builds
what changed, leaves the rest cached, and starts both apps. A rebuild after a
code change takes about half a minute, because only the affected layers run
again.

`-V` renews the containers' anonymous volumes. It is there so a newly installed
package cannot be masked by a stale `node_modules`, which is the failure
described under [Adding a dependency](#adding-a-dependency) below.

> Avoid `docker compose build --no-cache` as a routine update command. It throws
> away every cached layer, so the mobile image re-downloads the Flutter SDK and
> redoes all three web builds and the Android build from scratch, turning half a
> minute into the best part of half an hour. Reach for it only when you suspect
> the cache itself is wrong.

| | Address | What it is |
| --- | --- | --- |
| Web | http://localhost:5173 | Storefront, counter and owner dashboard (React) |
| Mobile | http://localhost:5180 | The three Flutter apps, as PWAs |

To open the mobile apps on a real phone, use this machine's address on the
network — `http://<your-lan-ip>:5180` — because `localhost` on a phone is the
phone. Allow inbound TCP on 5173 and 5180 if the firewall blocks it.

Installing to the home screen needs a secure context, so browsers will not offer
it over a plain LAN address; they give a bookmark shortcut instead. The apps
themselves work fully either way, and install properly once served over HTTPS.

```bash
docker compose --profile prod up -d --build web-prod   # nginx build → :8080
```

> Do not run `npm run dev` alongside the `web` container: both want port 5173,
> and two servers showing the same site is exactly the confusion this layout is
> meant to remove. Working without Docker is still fine, just pick one.

### Before you trust a change

```bash
npm run typecheck    # fastest, and the one that catches missing imports
npm run check        # typecheck, then the backend suites, then every screen
```

Vite strips TypeScript **without checking it**, so a component using a name
nobody imported builds cleanly and only crashes on the one path that renders it.
Three such bugs reached the browser before `tsconfig.json` existed. Run the
typecheck after editing components; it takes seconds.

### Adding a dependency

`npm install <package>` on your own machine is **not** enough. The `web`
container keeps its `node_modules` in its own volume, built into the image, and
your install never reaches it. The symptom is confusing: the editor and
`npm run build` are both happy, while the running site dies with
`Failed to resolve import "<package>"`.

```bash
npm install <package>              # updates package.json + the lockfile
docker compose up -d --build -V    # the usual command; -V does the rest
```

`-V` is the part that matters. Without it Docker keeps the existing anonymous
volume across the recreate, so the stale `node_modules` survives the rebuild and
the import fails exactly as before. It costs nothing to leave on, which is why
the quick start above already includes it.

After editing `.env.local`, restart with `docker compose restart web` — Vite
reads the environment when the server starts, not on hot reload.

**Staff logins** are real accounts the owner creates on the Staff access screen.
None are published here or shown on the sign-in pages. To bring up a brand new
project, run [`docs/hosted-setup.sql`](docs/hosted-setup.sql) once to create the
first owner — the app cannot, because creating staff requires an existing owner.

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
