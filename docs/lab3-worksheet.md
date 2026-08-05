# Laboratory Exercise 3, E-Commerce Business Presence Enhancement

**Course:** Web Commercialization and E-Commerce
**Duration:** 4 Hours
**Topic:** Strengthening an E-Commerce Business Presence

**Client:** Bencris, a local eatery (karinderya) inside Dasmariñas Bayan, Cavite
**Website assessed:** the Bencris ordering website, custom-developed with React, Vite and
Tailwind CSS, with a PostgreSQL and Supabase database and a Flutter mobile app.

| Group role | Member |
| --- | --- |
| Frontend and UX | [Member 1] |
| Backend and database | [Member 2] |
| Content and SEO | [Member 3] |
| Operations and QA | [Member 4] |
| Documentation and presentation | [Member 5] |

---

## Background

Bencris had no website, no page or link a customer could open, no social media and no
point-of-sale system. Ordering was entirely manual: a diner walked to the counter, looked at
what was left in the trays, and ordered whatever was still there. If the dish they came for had
run out, the trip was wasted.

The website assessed in this worksheet is the system built to solve that. Every strength and
every opportunity below refers to that website, and each one is evidenced by a screenshot of it
running.

### Figure list

| No. | Screen |
| --- | --- |
| 1 | Landing page |
| 2 | How ordering works |
| 3 | About page |
| 4 | Questions people ask |
| 5 | Order issues page |
| 6 | Privacy notice |
| 7 | Menu with badges |
| 8 | Menu search |
| 9 | Favourites |
| 10 | Cart with promo code applied |
| 11 | Ticket issued, with share |
| 12 | Recent orders and one-tap reorder |
| 13 | Staff sign in |
| 14 | Counter ticket lookup |
| 15 | Counter order review |
| 16 | Owner dashboard |
| 17 | Kitchen queue |
| 18 | Menu control |
| 19 | Sales and profit |
| 20 | Payment settings |
| 21 | Inventory |

---

## Part 1 – Business Presence Assessment

### 1.1 Strengths

| No. | Strength | Explanation | Screenshot / Evidence |
| --- | --- | --- | --- |
| 1 | **The menu tells the truth by itself** | The menu is served from the database rather than written by hand. Each order reduces the stock count, and a dish marks itself sold out when it reaches zero, so it disappears from the site without anyone touching it. This is the direct answer to the wasted trip: availability can be checked before leaving the house. | Screenshot 7, Screenshot 18 |
| 2 | **Ordering needs no account and no app** | Checkout issues a six-character ticket code held on the diner's phone. There is no sign-up, no password and no email address. For a meal at this price, a registration wall would lose the sale outright. | Screenshot 10, Screenshot 11 |
| 3 | **Prices are computed by the server, never by the browser** | The site sends only the dish and the quantity. The database re-reads the real price from the live menu and works out the total itself, so a tampered browser cannot pay one peso for a seventy-five peso meal. An automated test posts a forged price and confirms the stored total is still correct. | Automated test report |
| 4 | **Discounts are validated server-side too** | A promo code entered at checkout is priced by the same database rule that will charge it, so the discount shown is the discount paid. A code cannot be invented, reused past its limit, or applied below its minimum spend. | Screenshot 10 |
| 5 | **Cashless payment with an audit trail and no transaction fee** | The diner sends the payment through GCash and attaches the receipt to their ticket. It is stored privately and opened by the counter through a short-lived link before the order is released. This replaces a photo sitting in a staff member's camera roll, and it costs nothing per transaction because there is no payment gateway. | Screenshot 15, Screenshot 20 |
| 6 | **The owner and the counter see different things, enforced by the database** | Access rules live in the database, not in hidden buttons. A counter account can settle tickets but cannot read expenses or change menu prices. Automated tests confirm both refusals. | Screenshot 13, automated test report |
| 7 | **The business can finally measure itself** | The owner dashboard shows the day's sales, a seven-day trend, best sellers, the cash and GCash split, ingredient stock, and net profit after expenses. None of this existed before the website. | Screenshot 16, Screenshot 19, Screenshot 21 |
| 8 | **Every screen updates itself** | When the counter marks a ticket paid, the diner's screen changes to Paid on its own, with no refresh, and the kitchen queue advances at the same moment. | Screenshot 15, Screenshot 17 |
| 9 | **A first-time visitor can tell the business is real** | The site opens on a landing page carrying the opening hours, the address, a contact number and whether the shop is open right now, backed by About, Questions people ask, Order issues and Privacy pages. | Screenshot 1, Screenshot 3, Screenshot 5 |
| 10 | **The menu is searchable and signals scarcity** | A search box covers the whole menu, and Bestseller, Only a few left and Sold out badges are computed from the live sales and stock figures rather than curated by hand, so they can never go stale. | Screenshot 7, Screenshot 8 |
| 11 | **A second order takes one tap** | The device remembers past tickets and favourites, so a returning diner can rebuild a whole order in a single tap, and the receipt can be shared straight into a group chat. | Screenshot 9, Screenshot 11, Screenshot 12 |

### 1.2 Opportunities for improvement

| No. | Opportunity | Explanation | Screenshot / Evidence |
| --- | --- | --- | --- |
| 1 | **Ratings never leave the diner's own phone** | A diner can rate a dish they actually bought, but that rating is stored in their own browser. Nobody else can see it, so the site still shows no social proof to a first-time visitor. Ratings need to move into the database, still gated on a settled ticket so they cannot be faked. | Screenshot 7, ratings shown per device only |
| 2 | **The site is not published yet** | It runs only on the development machine. There is no public address, no domain and no secure certificate, so no customer can reach it however good it is. | No hosting configuration in the repository |
| 3 | **Nothing measures how the site is actually used** | No analytics are installed, so there is no way to see how many people open the menu, how many reach the cart, and how many abandon it. Improvements cannot be judged without that. | No analytics tag on any page |
| 4 | **The whole site downloads as one large file** | The JavaScript ships as a single bundle of roughly 1.15 megabytes. On mobile data, which is how nearly every diner will arrive, that is a slow first open. It should be split so each page loads only what it needs. | Build output warning |
| 5 | **The dish photographs are generic stock images** | Several are plainly wrong for the dish they illustrate. The food cannot sell itself with pictures that are not of the food. Every dish needs a real photograph and a short description in Tagalog and English. | Screenshot 7 |
| 6 | **The address and contact number are still placeholders** | The landing page, the trust pages and the search engine data all carry bracketed placeholder text instead of the real details, so the most important information on the site is not yet true. | Screenshot 1, Screenshot 3 |
| 7 | **The mobile app still carries the old branding** | The website was rebranded to Bencris, but the Flutter mobile app screens were not, so the two do not match. | Mobile app screens |
| 8 | **The owner cannot create a promo code without a developer** | Discount codes work correctly, but they can only be added directly to the database. The owner needs a screen for it, otherwise the feature cannot be used in practice. | Screenshot 18, no promotions screen |
| 9 | **Nothing tells the diner the order is ready** | The ticket updates to Paid, but the diner still has to watch the screen or wait at the counter. A free browser notification would release them and reduce congestion. | Screenshot 11 |
| 10 | **The site cannot spread on its own yet** | The receipt can be shared, but there is still no QR code for the counter and no referral code, so the word of mouth the business already has cannot be captured. | Screenshot 11 |
| 11 | **Accessibility has not been checked** | Colour contrast, keyboard navigation and image alternative text have not been audited, so the site may exclude people who could otherwise order. | No audit on record |
| 12 | **Anonymous orders stay readable for a day** | Because diners have no accounts, the system allows anonymous reading of orders from the past twenty-four hours. This is what lets a diner's phone follow its own ticket, and it is bounded by roughly a billion possible codes and no personal data beyond a first name, but it remains a deliberate trade-off rather than a strict rule. | Documented in the database rules |

---

## Part 2 – Business Presence Improvement Plan

| Improvement Area | Proposed Action | Tool / Feature / Technology | Expected Outcome |
| --- | --- | --- | --- |
| **Branding** | Adopt one identity: name, logo mark, warm karinderya palette and tagline, applied identically across the storefront, the counter screen and the owner dashboard, and extended to the mobile app so the two stop disagreeing. | React, Flutter | A single recognisable brand instead of loosely related screens |
| **Discoverability, organic search** | Give the site enough real indexable content to be found by someone searching for a karinderya in Dasmariñas Bayan: a home page naming the location in words, dish names in Tagalog and English, and structured data carrying the address, opening hours and price range. | HTML, structured data | Findable through search on the strength of its own site, with no third-party page to maintain |
| **Word of mouth, digitised** | A shareable today's menu link that previews with a proper title and photo, so a diner can drop Bencris into a group chat in one tap. Group chats, not corporate pages, are how a karinderya actually spreads. | React, Web Share API | Every satisfied diner becomes a distribution channel, at no cost per share |
| **Turn foot traffic online** | Display a QR code to the site at the counter and on the tarpaulin already hanging outside. A one-time cost with nothing recurring, so today's walk-in becomes tomorrow's online order. | QR code | Converts customers Bencris already has into repeat online orders |
| **Referral** | Let a paid ticket generate a personal code that gives a friend a discount and rewards the diner who shared it. | PostgreSQL, Supabase | Growth that costs a discount only when it produces a sale |
| **UX, first impression** | A home page carrying the opening hours, address, contact number and one obvious Order now action, with the menu one tap away. | React | A visitor learns what Bencris is, where it is and when it opens within five seconds |
| **UX, findability** | A search box across the whole menu, category chips kept for browsing, and a cart bar that stays in reach on a phone. | React, Tailwind CSS | A diner hunting one ulam finds it in one action instead of scrolling |
| **Product presentation** | Real photographs and short Tagalog and English descriptions for every dish, plus automatic Bestseller, Only a few left and Sold out badges computed from figures the system already tracks. | PostgreSQL, Supabase | Appetising, scannable listings, and scarcity that pulls orders earlier and cuts end-of-day waste |
| **Trust and credibility** | Publish About, Questions people ask, Contact, Privacy Notice and Order issues pages, show the GCash verification flow openly, and keep ticket lookup visible in the header. | React | A first-time diner can answer "is this real, and what happens if my order is wrong?" |
| **Social proof** | Allow a one to five star rating and a short comment, accepted only against a ticket code that was actually paid, and show the average on each dish card. | PostgreSQL, Supabase | Ratings that cannot be faked, because only a real buyer holds a settled code |
| **Marketing, promotions** | Owner-defined discount codes with a minimum spend, an optional cap, an expiry and a redemption limit, validated by the database, plus a screen so the owner can create them without a developer. | PostgreSQL, Supabase | A measurable, no-cost way to pull demand into the quiet hours |
| **Retention** | Keep completed tickets on the device for one-tap reorder, allow favourites, and make the receipt shareable. | React, Web Share API | The second order takes one tap, and the repeat rate rises with no advertising spend |
| **Notifications** | Tell the diner when the order is ready, and announce the day's menu to anyone who installed the mobile app, using free browser notifications. | Flutter, browser notifications | The diner stops watching the screen, and counter congestion drops |
| **Measurement** | Install a free analytics tag and define the funnel: menu view, add to cart, ticket issued, ticket paid. | Google Analytics | Cart abandonment becomes visible, and therefore fixable |
| **Performance** | Split the site so each page loads only what it needs, load the owner dashboard on demand, and compress the dish photographs. | Vite, React | A faster first open on mobile data, which is how nearly every diner arrives |
| **Accessibility** | Semantic page structure, visible keyboard focus, alternative text on every dish photograph, and a colour contrast check. | HTML, Lighthouse | Usable by more people, and better ranked |
| **Operating cost** | Stay inside the free hosting and database tiers, and watch storage usage from the owner dashboard. | Supabase | The site keeps costing nothing per month, which is what makes it sustainable for this client |

---

## Part 3 – Customer Journey Mapping

### 3.1 Before and after

| Stage | Before, the manual counter | After, the Bencris website |
| --- | --- | --- |
| Discovery | Only by walking past the store | A link shared in a group chat, the counter QR code, or a web search |
| Menu check | Walk to the counter and look at the trays | Open the site; sold-out dishes are already hidden |
| Decide | Whatever is left on arrival | Browse, search, read descriptions, check badges |
| Order | Say it out loud in the queue | Build a cart on the phone and receive a ticket code |
| Pay | Cash, or an untracked GCash transfer | Cash or GCash, with the receipt attached to the ticket |
| Receive | Wait at the counter | Show the code; the ticket changes to Paid by itself |
| Record | None | A digital receipt saved on the phone |
| Return | Start over from nothing | One-tap reorder from history |

### 3.2 Journey flowchart

The flowchart is provided as a separate diagram and appears in full on slide 6 of the
presentation. It runs: Discover, Browse, Cart, Checkout, Ticket issued, then either Upload proof
for GCash or straight to the counter for cash, then Cashier settles, Paid live, Kitchen queue,
Handover, Receipt, Review and Reorder. Two loops close it: a reorder returns the diner to
Browse, and a shared receipt starts a new person at Discover. Every settled ticket and every
review also feeds the owner dashboard.

### 3.3 Stage detail

| Stage | Customer action | Touchpoint | What the system does | Business objective | Measure |
| --- | --- | --- | --- | --- | --- |
| **Discovery** | Receives a link, scans the counter QR code, or searches the web | Shared link, QR code, search result | Serves a page that previews properly when pasted and carries indexable location content | Become reachable at all | Link opens, QR scans |
| **Consideration** | Checks whether Bencris is open and real | Landing page | Shows hours, address, contact and trust pages | Turn a stranger into a visitor | Landing to menu rate |
| **Browse** | Looks for a specific ulam | Menu, search, category chips | Serves only what is genuinely available, and badges signal scarcity | Eliminate the wasted trip | Menu views, search use |
| **Cart** | Adjusts quantities, tries a promo code | Cart | Prices the discount with the same rule that will charge it | Raise the average order value | Add-to-cart rate |
| **Checkout** | Confirms and picks a payment method | Checkout | Reprices from the live menu and refuses sold-out dishes | Prevent underpayment and overselling | Cart to ticket rate |
| **Ticket** | Receives a six-character code | Ticket screen | Allocates a unique code and starts following it live | Give the diner proof of order | Tickets issued |
| **Payment** | Pays cash, or transfers and attaches the receipt | Counter, GCash | Stores the proof privately for the counter to check | Auditable cashless trade at no fee | GCash share |
| **Fulfilment** | Shows the code and collects the food | Counter, kitchen board | The counter settles it and the kitchen queue advances | Shorten counter time | Ticket to paid time |
| **Post-purchase** | Saves or shares the receipt | Receipt | Produces a digital receipt and a share action | A record with no paper cost, and a chance to spread | Shares |
| **Feedback** | Rates the dish | Rating control | Accepts a rating only against a settled ticket | Build social proof that cannot be faked | Ratings per hundred orders |
| **Retention** | Reorders a favourite | Recent orders | Rebuilds the cart in one tap | Turn one visit into many | Repeat-order rate |

---

## Part 4 – Website Operations Plan

| Task | Description | Assigned Member | Timeline | Evidence |
| --- | --- | --- | --- | --- |
| Requirements gathering | Interview the owner and observe a full service at Bencris: how orders are taken, how payment is handled, and what is recorded. | [Member 5] | Week 3, Jul 31 to Aug 8 | Interview notes and site photographs |
| Database and business rules | Design the schema and put the ordering rules in the database rather than the browser: the database prices every order from the live menu, owns the payment outcome, and decides what each role may read. | [Member 2] | Week 4, Aug 7 | The database diagram |
| Customer storefront | Build the diner-facing site: live menu by category, cart, checkout, ticket code and receipt. | [Member 1] | Week 5, Aug 14 | Screenshots 7 and 11 |
| Counter and owner screens | Build the counter lookup-and-settle screen and the owner dashboard covering sales, kitchen queue, menu, inventory, payments and expenses. | [Member 1] | Weeks 5 and 6, Aug 14 to 21 | Screenshots 14, 16 and 17 |
| Proof-of-payment flow | Let a GCash diner attach their receipt to the ticket, store it privately, and let the counter open it through a short-lived link before settling. | [Member 2] | Week 6, Aug 21 | Passing payment-proof test report |
| Brand consolidation | Apply one Bencris identity across the storefront, counter and owner screens through the shared brand file, so the branding cannot drift between them. | [Member 1] | Week 6, Aug 21 | Before-and-after screens |
| Landing and trust pages | A home page carrying opening hours, address and contact, plus About, Questions people ask, Privacy Notice and Order issues pages. | [Member 1] | Week 7, Aug 28 | Screenshots 1 to 6 |
| Menu search and badges | A search box on the menu, and automatic Bestseller, Only a few left and Sold out badges computed from figures already tracked. | [Member 1] | Week 8, Sept 4 | Screenshots 7 and 8 |
| Dish photography and copy | Photograph every dish Bencris actually serves and write a short description in Tagalog and English, replacing the sample data. | [Member 3] | Week 8, Sept 4 | Photograph set and updated dish records |
| Promo entry, ratings and reorder | The cart field that redeems a promo code, star ratings only a settled ticket can leave, and one-tap reorder from the device's own history. | [Member 1] and [Member 2] | Week 9, Sept 11 | Screenshots 10 and 12 |
| Search visibility | Give the site enough indexable content and structured data to be found by someone searching for a karinderya in Dasmariñas Bayan. | [Member 3] | Week 9, Sept 11 | Structured data test result |
| Link previews | Title, description and preview image so a link pasted into a group chat shows the shop name and a dish photo instead of a bare address. | [Member 3] | Week 9, Sept 11 | Screenshot of the preview card |
| Deployment | Publish the site to free hosting with a public address, so it is reachable outside the development machine. | [Member 2] | Week 10, Sept 18 | Live address |
| Testing and acceptance | Run the three backend test suites and the mobile suite, then walk the whole diner-to-owner path by hand on a phone. | [Member 4] | Week 10, Sept 18 | Passing output of all four suites |
| Owner training and handover | Sit with the owner through opening the menu, settling a ticket, checking a GCash proof and reading the day's takings. Leave a one-page cheat sheet. | [Member 4] | Weeks 10 and 11, Sept 18 to 25 | Signed handover checklist and the cheat sheet |
| Documentation and presentation | Produce the worksheet, the customer journey diagram and the slide deck. | [Member 5] | Week 11, Sept 25 | This document and the slide deck |

### Ongoing operation after handover

| Task | Description | Assigned Member | Timeline | Evidence |
| --- | --- | --- | --- | --- |
| Daily menu content | Confirm the owner has marked today's dishes available and set stock counts, so the site never advertises food that has run out. | [Member 4] | Daily for the first two weeks, then owner-run | Menu screen for the day |
| Payment reconciliation | Clear every payment the counter flagged for review against the real GCash history. | [Member 4] | Weekly | Payments screen with no outstanding flags |
| Performance review | Read best sellers, slow movers and net profit, and advise the owner what to cook more or less of. | [Member 2] | Weekly | Sales and profit screen |
| Rating moderation | Publish genuine ratings and reply to complaints. | [Member 3] | Weekly | Rating queue |
| Promotion planning | Choose the next code, its discount and expiry, and announce it. | [Member 3] | Monthly | The new promotional code |
| Backup and security review | Export the database, keep the change history in version control, re-run the access-rule tests and rotate staff passwords. | [Member 2] and [Member 4] | Monthly | Backup file and passing test output |

---

## Part 5 – Group Presentation (5 to 7 minutes)

| # | Segment | Content | Speaker | Time |
| --- | --- | --- | --- | --- |
| 1 | The client and the problem | Bencris, inside Dasmariñas Bayan. No website, no link of any kind, no point-of-sale, no inventory, no profit tracking, and the wasted trip when the ulam has run out. | [Member 5] | 0:45 |
| 2 | Assessment | Eleven strengths of the website and twelve remaining gaps, each tied to a screenshot or a passing test. | [Member 4] | 1:00 |
| 3 | Improvement plan | Branding, search visibility, product presentation, trust, promotions and retention, every item free to run. | [Member 3] | 1:15 |
| 4 | Customer journey | Walk the flowchart: discovery through ticket, payment, receipt and reorder. | [Member 5] | 1:00 |
| 5 | Live demonstration | Browse, add to cart, apply a promo code, issue a ticket, settle it at the counter, watch the diner's screen change by itself, and see the sale on the owner dashboard. | [Member 1] and [Member 2] | 2:00 |
| 6 | Operations plan and close | Who runs what, from daily to monthly, at no recurring cost. | [Member 4] | 0:30 |

---

## Submission Checklist

| Requirement | Deliverable |
| --- | --- |
| Completed worksheet | This document |
| Presentation slides | Lab3-Bencris-Presentation.pptx in the docs folder |
| Customer Journey Diagram | Part 3.2, and slide 6 of the presentation |
| Supporting screenshots | Twenty-one screens in the docs screenshots folder |
| Website link | Not published yet, demonstrated live on the development machine |
| Source code repository | github.com/ENTREP3/IT-eary |
