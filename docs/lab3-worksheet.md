# Laboratory Exercise 3, E-Commerce Business Presence Enhancement

**Course:** Web Commercialization and E-Commerce
**Duration:** 4 Hours
**Topic:** Strengthening an E-Commerce Business Presence
**Date prepared:** August 4, 2026

**Client:** **Bencris**, a local eatery (karinderya) located inside Dasmariñas Bayan, Cavite
**Platform used:** Custom-developed web application (React 18 + Vite + Tailwind v4) with a
PostgreSQL and Supabase database, and a Flutter mobile app.

| Group role | Member |
| --- | --- |
| Frontend / UX Developer | [Member 1] |
| Backend / Database | [Member 2] |
| Content & SEO | [Member 3] |
| Operations & QA | [Member 4] |
| Documentation & Presentation | [Member 5] |

---

## Client Background, the baseline we started from

Bencris is a counter-service eatery inside Dasmariñas Bayan. A diner walks up to the
counter, looks at what is left in the trays, and orders whatever is still there.

**What Bencris had online before this project: nothing.**

| Channel / capability | Status before the project |
| --- | --- |
| Website | None |
| Any reachable link, page or profile | None, nothing exists for a customer to open or send |
| Social media of any kind | None |
| POS system | None, computation is mental or on a calculator |
| Inventory system | None, stock is judged by looking at the trays |
| Sales and profit tracking | None, no record of what sold, no record of expenses |
| Ordering | Fully manual, at the counter, in person |

### The five business problems this creates

1. **Zero discoverability.** Someone searching *"karinderya malapit sa Dasmariñas Bayan"*
   cannot find Bencris. The business is invisible to anyone who is not already walking past it.
2. **Wasted trips, the problem the client actually named.** Availability is only knowable
   at the counter. A diner who walks over for a specific *ulam* that has already run out has
   wasted the trip, and often leaves without buying anything at all.
3. **No demand data.** The owner cannot tell which dish sells out by 11:00 AM and which is
   cooked every day and thrown out. The same over-cooking and under-cooking repeats daily.
4. **Cashless payment is proven by a photo on a staff phone.** For every GCash order a staff
   member photographs the customer's payment screen. Nothing ties that photo to the order, so
   a disputed payment cannot be checked and the owner cannot audit takings.
5. **No proof of profit.** Expenses live in a notebook or in the owner's memory, so "did we
   actually earn today?" is a guess.

**Part 1 therefore assesses Bencris as it actually operates today**, evidenced by photographs
taken on site. **Part 2 sets out the improvement plan**, and shows, with screenshots of the
running system, which of those gaps are already closed.

---

## Part 1 – Business Presence Assessment

This assessment is of **Bencris as it operates today**. The evidence column points to photographs
of the eatery itself, the counter, the trays, the signage, the way an order is actually taken.
Screenshots of the system we built are **not** evidence here; they belong in Part 2, where they
show how each gap is closed.

> **Photographs to capture, see the shot list in §1.4.** These must be taken on site at
> Bencris. Save them to the photo set using the filenames referenced below.

### 1.1 Observed situation, what the photographs show

| No. | Observation on site | What it costs the business | Photo / Evidence |
| --- | --- | --- | --- |
| 1 | No signage beyond the store name, no menu board, no prices, no QR, no social handle, no phone number displayed | A passer-by cannot tell what is served or for how much without walking in and asking. Every decision requires physically entering. | Photo 1: the storefront |
| 2 | The menu *is* the trays on the counter | Availability exists only in the room. It cannot be checked, shared, or planned around. | Photo 2: the counter trays |
| 3 | Diners queue at the counter to see what is left before deciding | Deciding and queueing happen in the same place, so the queue moves at the speed of indecision. | Photo 3: the queue at the counter |
| 4 | An empty or near-empty tray mid-service | This is the wasted trip, photographed. Anyone who came for that dish leaves without it, and often without buying anything. | Photo 4: an empty tray during service |
| 5 | Payment is a cash box, there is no register and no receipt is issued | Money goes into a box with nothing recording which order it belonged to, so takings can only be counted at the end of the day, and never explained. | Photo 5: the cash box |
| 6 | For GCash, a staff member **manually photographs the customer's payment screen** on their own phone | This is the only proof that a transfer happened. The photo sits in a personal camera roll, is not attached to any order, and cannot be searched later, so a disputed payment comes down to whoever remembers it better. | Photo 6: staff photographing a GCash screen |
| 7 | Orders and takings are tracked on paper, or not at all | There is no daily total, no record of which dish sold, and no way to set takings against the cost of ingredients. | Photo 7: how takings are recorded |
| 8 | Searching the business name online returns nothing owned by Bencris | The business has no reachable address on the internet in any form, so it cannot be found by anyone who is not already standing in front of it. | Photo 8: the web search result |

### 1.2 Strengths, the assets an online presence can build on

A business with nothing online still has real strengths. These are what the e-commerce presence
is designed to amplify rather than replace.

| No. | Strength | Explanation | Photo / Evidence |
| --- | --- | --- | --- |
| 1 | **Established location with steady foot traffic** | Bencris sits inside Dasmariñas Bayan, a dense commercial area with constant passing trade. The audience already walks past the door every day, it has simply never been given a way to order ahead. | Photo 1 (storefront) and Photo 3 (the queue) |
| 2 | **A base of regular *suki*** | Repeat customers already return without any marketing. Retention exists; it is simply undocumented and unrewarded, so it cannot be grown deliberately. | Owner interview; Photo 3: the queue at the counter |
| 3 | **A genuinely varied, freshly cooked menu** | Multiple *ulam*, *silog*, *merienda* and drinks are prepared daily. There is enough range to make a browsable online menu worth opening, a single-item stall would not be. | Photo 2: the counter trays |
| 4 | **An accessible price point** | Meals sit in the range where a diner decides quickly and buys often. Low deliberation is ideal for a fast online ordering flow. | Photo 9: any posted prices |
| 5 | **GCash is already accepted, and already photographed** | Cashless payment is an existing habit for both the staff and the diners, and staff already take a photo of every transfer. The behaviour we need is therefore already in place, it only has to be moved off a personal camera roll and attached to the order it belongs to. | Photo 6: staff photographing a GCash screen |
| 6 | **The owner already uses a smartphone daily** | The tool the system runs on is already in the owner's hand and already familiar. No hardware purchase, and no computer literacy barrier. | Owner interview |
| 7 | **Word of mouth already works** | Customers already recommend Bencris to friends in person. The referral behaviour exists; it has just never been captured or made shareable. | Owner interview |

### 1.3 Opportunities for improvement

| No. | Opportunity for Improvement | Explanation | Evidence |
| --- | --- | --- | --- |
| 1 | **No online presence of any kind to reach** | There is no website, no page, no link, nothing a customer can open, save, or send to a friend. The business cannot be reached online at all. | Photo 8: the web search result |
| 2 | **Availability cannot be known before arriving** | This is the client's own stated problem. Because the menu is physical, the only way to learn that a dish has run out is to travel to the counter and look. | Photo 4: an empty tray during service |
| 3 | **Nothing exists that could spread** | With no shareable link, no QR on the counter, and no referral mechanism, the existing word of mouth cannot travel further than a conversation. | Photo 1: the storefront, no QR or handle anywhere |
| 4 | **No demand data, so cooking is guesswork** | Without a record of what sold and when, the same dishes are over-cooked and thrown away while others sell out by mid-morning. Both are direct losses. | Photo 7: how takings are recorded |
| 5 | **No sales or profit tracking** | Takings and expenses are not recorded against each other, so the owner cannot answer whether a given day, or a given dish, actually made money. | Photo 7: how takings are recorded |
| 6 | **The GCash record is a photo on a personal phone** | Every transfer is proven by a staff member photographing the customer's screen. That photo is not attached to an order, cannot be searched, is lost if the phone is lost, and sits in a private camera roll the owner cannot audit. | Photo 6: staff photographing a GCash screen |
| 7 | **No trust surface for a first-time customer** | No published hours, address, contact number, or policy on a wrong order. A stranger has nothing to evaluate before committing. | Photo 1: the storefront |
| 8 | **No product presentation** | Dishes are never shown with a photo, a description, or a price outside the store. The food cannot sell itself to anyone not already standing in front of it. | Photo 2 (the trays) and Photo 9 (posted prices) |

### 1.4 Photograph shot list

Take these at Bencris during service hours, when trays are in use and customers are present.
Ask the owner's permission before photographing people, and avoid capturing customers' faces.

| Filename | What to capture | Why it matters |
| --- | --- | --- |
| Photo 1 | The shopfront from the street, wide enough to show all existing signage | Proves the absence of a menu board, QR, handle or phone number |
| Photo 2 | The counter with the day's trays laid out | Shows that the menu is physical and exists only in the room |
| Photo 3 | Customers deciding and queueing at the counter | Shows deciding and queueing happening in the same place |
| Photo 4 | A tray that has run out during service | The wasted trip, photographed, the client's core problem |
| Photo 5 | The cash box or drawer where money is kept | Shows there is no register and no receipt |
| Photo 6 | A staff member photographing a customer's GCash screen | The only proof of payment that currently exists |
| Photo 7 | Whatever is used to track orders or takings, notebook, pad, or nothing | Shows the absence of sales and profit tracking |
| Photo 8 | A screenshot of a web search for the business name | Proves there is no owned result anywhere |
| Photo 9 | Any handwritten or posted prices, if they exist at all | Establishes the price point and how prices are communicated |

---

## Part 2 – Business Presence Improvement Plan

Every proposed action below is **free-tier or self-hosted**, per the client's constraint that
this project must not add recurring cost. No payment gateway, no paid hosting, no printer,
and no paid marketing tools appear anywhere in this plan.

| Improvement Area | Proposed Action | Tool / Feature / Technology | Expected Outcome |
| --- | --- | --- | --- |
| **Branding** | Adopt one consistent identity, name, logo mark, warm karinderya palette, and the tagline *"Kain na, tayo na."*, applied identically across the storefront, cashier screen, owner dashboard and the three mobile apps. | React, Flutter | A single recognisable brand instead of six loosely-related screens; a colour change never has to be made twice |
| **Discoverability, organic search** | Give the site enough real, indexable content to be found for *"karinderya Dasmariñas Bayan"*: a home page that names the location in text, dish names in both Tagalog and English, and local business structured data carrying the address, hours and price range. | HTML, structured data | The business becomes findable through search on the strength of its own site, with no third-party page to maintain |
| **Word of mouth, digitised** | Add a **Share** action to the receipt and a shareable **Today's menu** link that previews with a proper title and image, so a diner can drop Bencris into a Messenger or Viber group chat in one tap. Group chats, not corporate pages, are how a karinderya actually spreads. | React, Web Share API | Every satisfied diner becomes a distribution channel, at zero cost per share |
| **Referral codes** | Each paid ticket can mint a personal code: the friend who uses it gets ₱15 off, and the referrer's next order is discounted too. | PostgreSQL, Supabase | Growth that costs a discount only when it actually produces a sale |
| **Turn existing foot traffic online** | Show a QR to the site at the counter and on the tarpaulin already hanging outside, a one-time cost, nothing recurring, so today's walk-in becomes tomorrow's online order. | QR code | Converts customers Bencris already has into repeat online orders |
| **Timed promos for dead hours** | Run codes that only work in the slow part of the day (HAPON15, 2 to 4 PM) plus a first-order code for new diners. | PostgreSQL, Supabase | Demand pulled into hours that currently earn nothing |
| **Loyalty without an account** | Count paid tickets on the device; every fifth order automatically unlocks a discount code. | React | Repeat visits rewarded without building a login system |
| **Link previews & crawlability** | Add a descriptive page title and meta description plus link preview tags so a pasted link previews properly, and a crawler file and a site map so the site can be crawled at all. | HTML | A link dropped into a group chat shows the name, a description and a dish photo instead of a bare URL |
| **UX, first impression** | Route the unused landing design as a real home page carrying the hero, opening hours, address, contact number and a single obvious **Order now** call to action, with the menu one tap away. | React | A visitor learns what Bencris is, where it is, and when it is open within five seconds |
| **UX, findability in the menu** | Add a search box and sort control to the menu, keep the category chips, and make the cart bar sticky on mobile. | React, Tailwind CSS | A diner looking for one specific *ulam* finds it in one action instead of scrolling |
| **Product presentation** | Add real photos and short Tagalog-and-English descriptions per dish, and surface automatic badges, **Bestseller**, **Few left**, **Sold out**, computed from the the quantity sold today and the stock count columns that are already being tracked. | PostgreSQL, Supabase | Appetising, scannable listings; scarcity signalling drives earlier orders and reduces end-of-day waste |
| **Trust & credibility** | Publish **About**, **FAQ**, **Contact**, **Privacy Notice** and **Refund / Order Issue** pages; show the GCash verification flow openly; keep the ticket-lookup entry point visible in the header. | React | A first-time diner has visible answers to *"is this real, and what if my order is wrong?"* |
| **Social proof** | Let a diner leave a 1 to 5 star rating and a short comment **only against a ticket code that was actually paid**, then show the average rating on each dish card. | PostgreSQL, Supabase | Reviews that cannot be faked, because only a real buyer holds a paid ticket code |
| **Marketing / promotions** | Add owner-defined promo codes (percentage or fixed peso, with a minimum spend, an optional cap, an expiry and a redemption limit), validated and applied **server-side**. Advertise the codes on the tarpaulin already hanging outside and on the counter QR. | PostgreSQL, Supabase | A measurable, zero-cost way to pull demand into slow hours and to reward repeat diners |
| **Engagement / retention** | Store completed tickets on the device for one-tap **reorder**, allow **favourites**, and make the digital receipt shareable. | React, Web Share API | The second order takes one tap; repeat rate rises without any advertising spend |
| **Notifications** | Tell the diner when the order is ready, and announce the day's menu to anyone who installed the mobile app. | Flutter, browser notifications | The diner stops watching the screen, counter congestion drops, and past customers can be reached again at no cost |
| **Measurement** | Install a free analytics tag and define the funnel: menu view → add to cart → ticket issued → ticket paid. | Google Analytics | Cart abandonment becomes visible and fixable instead of invisible |
| **Performance** | Split the bundle by route, lazy-load the admin dashboard, and compress dish photos to WebP. | Vite, React | Faster first load on mobile data, which is how nearly every diner will arrive |
| **Accessibility** | Semantic landmarks, visible focus states, alt text on every dish photo, and a contrast check against WCAG AA. | HTML, Lighthouse | The site is usable by more people and scores better in search |
| **Operating cost control** | Stay inside the Supabase free tier and watch usage with the existing owner-only readout. | Supabase | The system keeps costing ₱0/month, which is what makes it sustainable for this client |

### 2.2 Evidence, what is already built

Captured from the running system by an automated capture script, which drives a headless browser
through the whole loop in one continuous run: menu → cart → ticket → cashier settlement → owner
dashboard. Ticket JB3CES was raised during the capture and appears in the owner's *Latest
orders* panel, so the sequence is genuinely one session and not assembled from separate visits.

| Gap from Part 1.3 | How it is closed | Screenshot |
| --- | --- | --- |
| 1 · No online presence to reach | A working storefront a customer can open and send to a friend | Screenshot 1: the live menu |
| 2 · Availability unknown before arriving | The menu is served from Postgres; a database trigger drops the stock count on each order and flips a dish to sold-out at zero, so it removes itself | Screenshots 1 and 9 |
| 4 · No demand data | Every ticket is recorded; best-sellers, hourly pulse and low-stock alerts are computed from real orders | Screenshots 7 and 12 |
| 5 · No sales or profit tracking | Daily sales, a 7-day trend and net profit after logged expenses | Screenshot 10: sales and profit |
| 6 · Cashless payment has no audit trail | The diner uploads a GCash receipt to a private bucket; the cashier reads it through a short-lived signed URL before settling | Screenshots 2, 6 and 11 |
|, · Ordering without an account | Checkout issues a 6-character ticket code held on the device, no sign-up, no password | Screenshots 2 and 3 |
|, · Counter workflow | Cashier looks the code up, reviews the order and proof, then settles it; the kitchen queue advances | Screenshots 4, 5 and 8 |

Two guarantees in this set are proven by automated test rather than by screenshot, because a
screenshot cannot demonstrate them:

- **A tampered browser cannot underpay.** the database re-reads prices from the live menu.
  the automated test report posts a forged ₱1 price for a ₱75 dish and asserts the
  stored total is still ₱75.
- **A cashier cannot reach the owner's data.** database-level access rules, not hidden buttons. The same
  suite asserts *"cashier cannot read admin-only expenses"* and *"cashier cannot change menu prices"*.

---

## Part 3 – Customer Journey Mapping

### 3.1 Before vs. after

| Stage | Before (manual counter) | After (Bencris online) |
| --- | --- | --- |
| Discovery | Only by walking past the store | A link shared in a group chat, the counter QR, or a web search |
| Menu check | Physically walk to the counter and look at the trays | Open the site; sold-out dishes are already hidden |
| Decide | Whatever is left when you arrive | Browse, search, read descriptions, check ratings |
| Order | Say it out loud at the counter, in the queue | Build a cart on the phone, get a ticket code |
| Pay | Cash, or an untracked GCash transfer | Cash or GCash with a screenshot attached to the ticket |
| Receive | Wait at the counter | Show the code; the ticket flips to *Paid* live |
| Record | None | Digital receipt, saved to the device |
| Return | Start over from nothing | One-tap reorder from history |

### 3.2 Journey diagram

The journey flowchart is provided as a separate diagram, and appears in full on the
published page and on slide 6 of the presentation. It runs: Discover, Browse, Cart,
Checkout, Ticket issued, then either Upload proof (GCash) or straight to the counter
(cash), then Cashier settles, Paid live, Kitchen queue, Handover, Receipt, Review and
Reorder. Two loops close it: a reorder returns the diner to Browse, and a shared receipt
starts a new person at Discover. Every settled ticket and every review also feeds the
owner dashboard.

### 3.3 Stage detail

| Stage | Customer action | Touchpoint | What the system does | Business objective | KPI |
| --- | --- | --- | --- | --- | --- |
| **Discovery** | Receives a link in a group chat, scans the counter QR, or searches the web | Shared link, QR, search result | Serves a page that previews properly when pasted and carries indexable location content | Become reachable at all | Link opens; QR scans; search impressions |
| **Consideration** | Checks whether Bencris is open and real | Landing page | Shows hours, address, contact, trust content | Convert a stranger into a visitor | Bounce rate; landing → menu rate |
| **Browse** | Looks for a specific *ulam* | Menu grid, search, category chips | Serves only what is genuinely available; badges signal scarcity | **Eliminate the wasted trip** | Menu views; search usage |
| **Cart** | Adjusts quantities, tries a promo code | Cart screen | Previews the discount server-side so the quoted price is the charged price | Raise average order value | Add-to-cart rate; average order value |
| **Checkout** | Confirms and picks a payment method | Checkout sheet | Reprices everything from the live menu; refuses sold-out dishes | Prevent underpayment and overselling | Cart → ticket conversion |
| **Ticket** | Receives a 6-character code | Ticket screen | Allocates a unique code; opens a live subscription | Give the diner proof of order | Tickets issued |
| **Payment** | Pays cash, or transfers via GCash and uploads the screenshot | Counter / GCash app | Stores proof privately; the cashier reads it via a signed URL | Auditable cashless trade at zero fee | GCash share; flagged-payment count |
| **Fulfilment** | Shows the code and collects the food | Counter, kitchen board | Cashier settles; the kitchen queue advances | Shorten counter time | Ticket → paid time |
| **Post-purchase** | Saves or shares the receipt | Receipt view | Generates a digital receipt, no printer needed | Record without paper cost | Receipt downloads |
| **Feedback** | Rates the dish | Review form | Accepts a review only against a settled ticket | Build social proof that cannot be faked | Reviews per 100 orders |
| **Retention** | Reorders a previous favourite | Order history | Rebuilds the cart in one tap; applies a returning-diner promo | Turn one visit into many | Repeat-order rate |

---

## Part 4 – Website Operations Plan

This part lists the **operational activities required to develop, launch and keep running
the Bencris website**, who on the team owns each one, when it happens, and what evidence
proves it was done. Member names are role placeholders, replace them before submitting.

Dates run from the week of **August 4, 2026**. Anything marked **Built** already exists in
the repository and can be demonstrated today; anything marked **Planned** is scheduled work
that has not been written yet.

### 4.1 Development activities, building the website

| Task | Description | Assigned Member | Timeline | Evidence |
| --- | --- | --- | --- | --- |
| Requirements gathering | Interview the owner and observe a full service at Bencris: how orders are taken, how payment is handled, what is recorded. | [Member 5, Documentation] | Week 1 · Aug 4 to 8, 2026 | Interview notes; the eight site photographs in the photo set |
| Database and business rules, **Built** | Design the schema and put the ordering rules in PostgreSQL rather than the browser: the database prices every order from the live menu, records the payment outcome itself, and decides what each role is allowed to see. | [Member 2, Backend / Database] | Week 1 · Aug 4 to 8, 2026 | the database change history; passing the automated test report |
| Customer storefront, **Built** | Build the diner-facing site: live menu by category, cart, checkout, ticket code, and the receipt view. | [Member 1, Frontend / UX] | Weeks 1 and 2 · Aug 4 to 15, 2026 | Running site at the site running on the team’s computer |
| Counter and owner screens, **Built** | Build the cashier lookup-and-settle screen and the owner dashboard covering sales, kitchen queue, menu, inventory, payments and expenses. | [Member 1, Frontend / UX] | Week 2 · Aug 11 to 15, 2026 | the counter screen and the owner dashboard |
| Proof-of-payment flow, **Built** | Let a GCash diner attach their receipt screenshot to the ticket, store it in a private bucket, and let the cashier open it through a short-lived signed URL before settling. | [Member 2, Backend / Database] | Week 2 · Aug 11 to 15, 2026 | Passing the payment-proof test report |
| Promotional codes, **Built (backend only)** | Owner-defined discount codes validated and applied inside the database, so a tampered browser cannot invent a discount. **The cart entry field is not yet written.** | [Member 2, Backend / Database] | Week 3 · Aug 18 to 22, 2026 | the promotions change record; SULIT10, BAGONG20, BALIKBAYAN in the database |
| Brand consolidation, **Planned** | Apply one Bencris identity across the storefront, counter and owner screens through the shared token pipeline, so the branding cannot drift between them. | [Member 1, Frontend / UX] | Week 3 · Aug 18 to 22, 2026 | a single shared brand file diff; before-and-after screens |
| Landing and trust pages, **Planned** | Home page with opening hours, address and contact, plus About, FAQ, Privacy Notice and Refund / Order Issue pages. | [Member 1, Frontend / UX] | Week 3 · Aug 18 to 22, 2026 | Page screenshots |
| Menu search and badges, **Planned** | A search box on the menu, and automatic *Bestseller*, *Few left* and *Sold out* badges computed from the sales and stock columns already being tracked. | [Member 1, Frontend / UX] | Week 3 · Aug 18 to 22, 2026 | Menu screenshot |
| Promo entry, reviews and reorder, **Planned** | The cart field that redeems a promo code, star ratings that only a settled ticket code can leave, and one-tap reorder from the device's own history. | [Member 1] and [Member 2] | Week 4 · Aug 25 to 29, 2026 | Migration files; UI screenshots |

### 4.2 Launch activities, making the website reachable

| Task | Description | Assigned Member | Timeline | Evidence |
| --- | --- | --- | --- | --- |
| Dish photography and copy, **Planned** | Photograph every dish Bencris actually serves and write a short description in Tagalog and English, replacing the sample data currently in the database. | [Member 3, Content & SEO] | Week 3 · Aug 18 to 22, 2026 | Photo set; populated dish records |
| Search visibility, **Planned** | Give the site enough indexable content and structured data to be found by someone searching for a karinderya in Dasmariñas Bayan. | [Member 3, Content & SEO] | Week 4 · Aug 25 to 29, 2026 | the site’s front page diff; structured-data test result |
| Link previews, **Planned** | Title, description and preview image so a link pasted into a group chat shows the shop name and a dish photo instead of a bare URL. | [Member 3, Content & SEO] | Week 4 · Aug 25 to 29, 2026 | Screenshot of the preview card |
| Share, QR and referral, **Planned** | A Share action on the receipt, a shareable today's-menu link, a QR for the counter, and referral codes that reward the diner who brings a friend. | [Member 3, Content & SEO] | Week 4 · Aug 25 to 29, 2026 | The QR; a new promotional codes |
| Deployment, **Planned** | Publish the site to free hosting with a public address, so it is reachable outside the development machine. | [Member 2, Backend / Database] | Week 4 · Aug 25 to 29, 2026 | Live URL |
| Testing and acceptance, **Built (suites exist)** | Run the three backend suites and the mobile test suite, then walk the whole diner-to-owner path by hand on a phone. | [Member 4, Operations & QA] | Week 4 · Aug 25 to 29, 2026 | Passing output of all four automated test suites |
| Owner training and handover | Sit with the owner through opening the menu, settling a ticket, checking a GCash proof and reading the day's takings. Leave a one-page cheat sheet. | [Member 4, Operations & QA] | Week 4 · Aug 25 to 29, 2026 | Signed handover checklist; the cheat sheet |
| Documentation and presentation | Produce the worksheet, the customer journey diagram and the slide deck. | [Member 5, Documentation] | Week 4 · Aug 25 to 29, 2026 | This document; the slide deck |

### 4.3 Operation and maintenance activities, keeping the website running

These continue after handover. The team stays responsible for the website itself; the owner is
responsible only for the daily content, which the training in 4.2 covers.

| Task | Description | Assigned Member | Timeline | Evidence |
| --- | --- | --- | --- | --- |
| Daily menu content | Confirm the owner has marked today's dishes available and set stock counts for limited items, so the site never advertises food that has run out. | [Member 4, Operations & QA] | Daily, first two weeks after handover, then owner-run | Menu screen showing the day's availability |
| Payment reconciliation | Clear every payment the cashier flagged for review against the real GCash history, so no sale stays unexplained. | [Member 4, Operations & QA] | Weekly · every Monday | Payments screen with no outstanding flags |
| Performance review | Read best sellers, slow movers, payment mix and net profit; tell the owner which dishes to cook more or less of. | [Member 2, Backend / Database] | Weekly · every Monday | Sales and profit screen |
| Review moderation, **Planned** | Publish genuine ratings and reply to complaints, so the feedback loop stays trustworthy. | [Member 3, Content & SEO] | Weekly · every Monday | Review queue |
| Promotional planning, **Planned** | Choose the next code, its discount, minimum spend and expiry, then announce it. | [Member 3, Content & SEO] | Monthly · first Monday | a new promotional code; the announcement |
| Database backup | Export the schema and data, and keep the migration history in version control so the site can be rebuilt from scratch. | [Member 2, Backend / Database] | Monthly · first Monday | Dump file; Git log |
| Security review | Re-run the role-separation and database-level access rules tests, and rotate the staff passwords. | [Member 4, Operations & QA] | Monthly · first Monday | Passing the automated test report output |
| Storage and cost check | Confirm the stored payment proofs still fit inside the free tier, so the site keeps costing nothing to run. | [Member 2, Backend / Database] | Monthly · first Monday | Storage usage readout |

---

## Part 5 – Group Presentation (5 to 7 minutes)

| # | Segment | Content | Speaker | Time |
| --- | --- | --- | --- | --- |
| 1 | The client and the problem | Bencris, inside Dasmariñas Bayan. No website, no link of any kind, no POS, no inventory, no profit tracking. The wasted trip when the *ulam* has run out. | [Member 5] | 0:45 |
| 2 | Assessment | Baseline of zero; the eight strengths of what we built and the eight remaining gaps | [Member 4] | 1:00 |
| 3 | Improvement plan | Branding, SEO, UX, product presentation, trust, promotions, retention, every item free-tier | [Member 3] | 1:15 |
| 4 | Customer journey | Walk the diagram: discovery → ticket → payment → receipt → reorder | [Member 5] | 1:00 |
| 5 | **Live demonstration** | Browse the menu → add to cart → apply a promo code → issue a ticket → settle it as cashier → the diner's screen flips to *Paid* live → owner dashboard updates | [Member 1] and [Member 2] | 2:00 |
| 6 | Operations plan and close | Who runs what, daily through monthly; ₱0 recurring cost | [Member 4] | 0:30 |

### Demonstration script

1. Open the site running on the team’s computer, landing page shows hours, address and contact.
2. Tap **Order now** → the live menu. Point out a **Sold out** dish and explain the trigger.
3. Search for a dish; add two items to the cart.
4. Apply promo code SULIT10; show the discount computed by the server.
5. Choose **GCash**, check out, and read the ticket code aloud.
6. Upload a GCash screenshot as proof.
7. In a second window open the counter screen, sign in, type the ticket code, review the proof, tap **Paid**.
8. Return to the diner window, it has flipped to *Paid* with no refresh.
9. Open the owner dashboard → the dashboard, kitchen queue, and net profit have all updated.

---

## Submission Checklist

| Requirement | Deliverable | Status |
| --- | --- | --- |
| Completed worksheet | this worksheet (this file) | ✔ |
| Presentation slides | Published deck, see the published page | ✔ |
| Customer Journey Diagram | Part 3.2 above, and in the published deck | ✔ |
| Supporting screenshots | the screenshot set | ✔ |
| Website link | Not deployed, demonstrated on the site running on the team’s computer by choice, to keep recurring cost at ₱0 | Local demo |
| Source code repository | This repository | ✔ |
