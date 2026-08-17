# Moving the backend to Laravel: what it costs, and what we recommend

**Status:** spike complete, decision not yet made
**Date:** 17 August 2026

The subject requires Laravel. The system currently runs on Supabase and works.
This document records what we measured by building a working Laravel backend
against the live database, so the choice is made on evidence rather than
estimates.

---

## 1. The short version

Laravel and Supabase can run together. We built it and it works: Laravel serves
the menu, verifies logins, and takes orders with the pricing rules intact, while
Supabase keeps the login system, the live-updating screens and file storage.

**What we recommend:** Laravel becomes the backend, but the rules that protect
money and privacy stay in the database and Laravel calls them. This satisfies the
requirement, keeps a Laravel codebase the panel can read, and does not put weeks
of tested security rules through a rewrite in a second language.

---

## 2. What was built and proven

A running Laravel 12 API in its own container, against the live database.

| Question | Endpoint | Result |
| --- | --- | --- |
| Can Laravel reach the database? | `GET /api/health` | Connected to PostgreSQL 17.6 through the connection pooler |
| Can Laravel serve real data? | `GET /api/menu` | The live menu, through Eloquent |
| Can Laravel tell who the caller is? | `GET /api/me` | Verifies the Supabase login token; a forged token claiming to be an owner is refused |
| Can Laravel take a write safely? | `POST /api/orders` | Order created, and a customer claiming a dish costs 1 peso was still charged the real price |

The last row is the one that matters. The whole point of pricing on the server is
that a customer cannot edit a price on their phone and underpay. That protection
survived the move, but only because it was rewritten carefully.

---

## 3. What one rule cost to move

The ordering rule is about 90 lines in the database. In Laravel it is **367
lines** across a controller and two pieces of login-checking middleware.

Three parts were deliberately left in the database:

- **Ticket code generation**, which retries if a code is already taken. It has to
  check against the live table, so it belongs beside the data.
- **Working out what a discount code is worth**, so the price shown in the cart
  and the price actually charged can never disagree. Two copies of that sum is
  two chances for them to drift apart.
- **Claiming a discount**, written so the check and the claim happen in one step.
  Checking first and claiming after, in PHP, would let two customers race for the
  last redemption of a limited promo and both win.

**This is the useful finding: not everything should move.** Some rules are
cheaper and safer next to the data, and a good migration keeps them there.

---

## 4. The scope of a full rewrite

| What exists today | Count |
| --- | --- |
| Database functions | 33 |
| Access rules protecting the tables | 37 |
| Tables | 13 |
| Ported in the spike | 1 endpoint |

---

## 5. The risk that is easy to miss

Right now the access rules sit **inside the database**, so they protect every way
in at once: the website, all three mobile apps, and anything else. A cashier
cannot read the expenses. A customer cannot read another customer's orders. None
of that depends on any app remembering to check.

Laravel connects with a privileged account, which **bypasses all of it**. We
demonstrated this by deleting rows from the Laravel container with nothing
stopping us.

So if the business rules move into Laravel, those 37 protections stop applying to
anything Laravel does. Every one of them becomes a check that a developer has to
remember to write, in every endpoint, forever. One forgotten check is one
customer reading another customer's orders.

**This is a larger risk than the 33 functions**, and it is the main argument for
the recommendation in section 1.

---

## 6. The three options

### Option A — Laravel calls the existing rules (recommended)

Laravel owns the routes, the models and the request handling. Where money or
privacy is involved, it calls the database functions that already exist.

- The panel sees a real Laravel backend: controllers, Eloquent, middleware, auth
- The tested protections keep working for every app at once
- Smallest chance of introducing a security hole under deadline
- Least Laravel business logic to show, if the subject specifically wants that

### Option B — Laravel reimplements everything

Every rule is rewritten in PHP, and the database becomes storage only.

- The most Laravel code to demonstrate
- All 33 functions and 37 access rules have to be rebuilt and re-tested
- The apps must stop talking to the database directly, or protection is uneven
- Realistically weeks, and the security burden moves onto the group

### Option C — Laravel only for extra features

Laravel handles reports and background jobs; everything else stays as it is.

- Least work
- Unlikely to satisfy a requirement that the backend *be* Laravel

---

## 7. What to confirm with the adviser

The answer changes which option is right, so it is worth asking before starting:

1. Does "use Laravel" mean an API the existing apps call, or must the pages
   themselves be rendered by Laravel? The second is a much larger job, because
   the React and Flutter front ends would also be rebuilt.
2. Must the business rules be written in Laravel, or is Laravel owning the
   requests and the data access enough?
3. Is keeping the live-updating screens acceptable via Supabase, or must that
   also be Laravel? Laravel can do it, but it needs a always-on server that free
   hosting generally does not provide.

---

## 8. Notes for whoever continues this

Two things cost time and are not obvious:

- **Login tokens are verified with a public key, not a shared secret.** This
  project issues ES256 tokens; the common advice about decoding with a "JWT
  secret" is for older projects and fails with a signature error that explains
  nothing.
- **Do not turn on emulated prepared statements.** The usual advice says to,
  because of the connection pooler. We measured it: twelve prepare-and-execute
  pairs succeeded without it. Turning it on also breaks every query that filters
  a true/false column, because PHP's `true` arrives as the number 1 and Postgres
  refuses to compare the two.

Run it with:

```bash
docker compose up -d --build -V     # api on http://localhost:8000
```
