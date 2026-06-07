# Phase 4 — System Improvements & Consulting

Expert recommendations for taking IT-eary from a solid school/MVP build to a
production-ready karinderya/e-commerce system. Ordered by priority within each
area.

> ## ✅ Implemented (Phase 4 build)
> The following recommendations from this list have now been built:
> - **Menu, inventory & categories moved into Postgres** (with RLS: public read
>   for the menu, admin-only writes) and synced live across devices via Realtime.
> - **Server-side order fulfillment trigger** — each order bumps `dishes.sold_today`
>   and, for dishes with a `stock_count`, decrements it and auto-marks the dish
>   sold out at 0 (oversell guard). Admins set the stock in the Menu editor.
> - **Kitchen / order-queue screen** — live NEW → PREPARING → READY lanes with
>   status-advance buttons, driven by Realtime.
> - **Expenses table + admin UI** (in Sales & Profit) so the profit line and
>   "Today's net" are now fully real, not sample data.
>
> Skipped per request: **payment-gateway verification** (PayMongo/Xendit webhook).
> Still open: the remaining items below.

---

## 1. Security & Data Integrity

**High priority**

- **Move menu, inventory & categories into Postgres.** Right now dishes and
  stock live only in the browser (Zustand + localStorage). That means each
  device has its own menu, the customer storefront and admin aren't truly in
  sync, and clearing browser data wipes the menu. Create `dishes`, `categories`,
  and `inventory` tables with the same RLS pattern (public read for the menu,
  admin write) and point the existing stores at them. The order item snapshot
  pattern already in `orders.items` stays as-is (good practice).
- **Server-side stock decrement on order.** Today an order doesn't touch
  inventory. Add a Postgres trigger or RPC that decrements ingredient stock when
  an order is placed (or a dish's `sold_today`), inside a transaction, so you
  can't oversell. This also makes the low-stock alerts real-time and trustworthy.
- **Verify GCash payments instead of trusting "I've sent it."** The customer
  currently self-confirms. For real money, either (a) integrate the GCash /
  PayMongo / Xendit API and confirm via webhook before marking `status = 'paid'`,
  or (b) keep manual confirmation but make the admin mark each GCash order
  *verified* in the dashboard. Add a `paid_verified boolean` + who/when.
- **Rate-limit & validate auth.** Enable email confirmation in production
  (`enable_confirmations`), set a stronger `minimum_password_length` (8+) and a
  password-strength requirement, and turn on CAPTCHA for signup to stop bots.
- **Audit log.** A `audit_log` table written by triggers (price changes, payment
  setting changes, order status changes, role grants) — invaluable for a
  business handling cash and for debugging disputes.

**Already handled well:** RLS on every table, role kept server-side, column
grants blocking self-escalation, admin-only Storage writes. Keep that discipline
for any new table.

---

## 2. User Experience

- **Order tracking for customers.** You already store orders per customer.
  Add a "My orders" view with live status (pending → preparing → ready) via the
  same Realtime channel the admin uses. Diners love knowing "is it ready yet?"
- **Order queue / kitchen view for staff.** A dedicated screen showing incoming
  orders as cards you can drag pending → preparing → ready → completed. This is
  the single most useful operational screen for a karinderya at lunch rush.
- **Receipts.** Generate a simple printable/downloadable receipt (or SMS/email)
  with the reference, items, total, and payment method.
- **Better feedback.** Add toasts (the project already includes `sonner`) for
  "Order placed", "Settings saved", "Logged in", and inline form validation
  (e.g. password too short) instead of only the current error strings.
- **Accessibility & i18n.** The Taglish copy is charming — formalize it with a
  small language toggle (EN/TL), add `aria-label`s to icon-only buttons, and
  ensure focus states on the custom inputs.
- **Empty/again states.** Show friendly empty states (no orders yet, cart
  empty) and a "reorder" button from order history.

---

## 3. Scalability & Performance

- **Aggregate analytics in the DB, not the browser.** The dashboard currently
  pulls up to 500 orders and computes charts client-side. That's fine now, but
  as volume grows, move to SQL: materialized views or scheduled rollups
  (`daily_sales`, `payment_mix_daily`) refreshed by `pg_cron`. The
  `admin_payment_mix()` function already shows the pattern.
- **Pagination & indexes.** Add cursor pagination to order lists. Indexes on
  `orders.created_at` and `orders.customer_id` already exist; add one on
  `payment_method` if you filter by it often.
- **Code-split the bundle.** The production build is ~1 MB JS. Lazy-load the
  admin app (`React.lazy` + dynamic `import()`), recharts, and the heavy Radix
  UI pieces so diners (the common case) download far less.
- **Image handling.** Dish photos are stored as base64 data URLs in localStorage
  today — heavy and not shareable. Upload them to a Storage bucket (like the QR)
  and store URLs. Use Supabase image transformation for thumbnails.
- **Caching & offline.** A service worker / PWA install lets the storefront load
  instantly and work on flaky mobile data — very relevant for Philippine users.

---

## 4. Features a restaurant / e-commerce system typically needs

- **Promos & discounts** — vouchers, "suki" (loyalty) points, senior/PWD
  discounts (legally relevant in PH), combo meals.
- **Dine-in vs takeout vs delivery** + table number or pickup time selection.
- **Daily menu scheduling** — auto show/hide dishes by time of day (your
  "Silog" in the morning, "Merienda" in the afternoon).
- **Multi-staff accounts & permissions** — cashier vs owner roles, shift
  reports, "who took this order."
- **Expense tracking** — you chart "expenses" but don't capture them yet. A
  simple `expenses` table makes the net-profit chart fully real (right now the
  expense line still uses sample data).
- **Reports & exports** — daily Z-reports, BIR-friendly sales summaries,
  scheduled email of yesterday's numbers. (CSV export already exists.)
- **Inventory purchasing** — supplier list, reorder POs auto-suggested from
  low-stock, delivery logging.
- **Notifications** — SMS/push to the customer when the order is ready; to the
  owner when stock is critically low.

---

## Suggested next 3 steps (highest value, least effort)

1. **Migrate the menu & inventory to Postgres** so the storefront and admin are
   truly one system across devices.
2. **Add the kitchen/order-queue screen with live status** (you already have
   Realtime + the orders table — this is mostly UI).
3. **Add an `expenses` table** to make the profit analytics real, then move the
   dashboard aggregates into SQL views.
