# Laboratory Exercise 3, E-Commerce Business Presence Enhancement

**Course:** Web Commercialization and E-Commerce
**Duration:** 4 Hours
**Topic:** Strengthening an E-Commerce Business Presence

**Client:** Bencris, a local eatery (karinderya) inside Dasmariñas Bayan, Cavite
**System assessed:** the Bencris ordering system, built by the group. It has a website for
diners, a counter screen, an owner dashboard, three mobile apps and an installable Android
app, all sharing one online database.

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
point-of-sale system. Nothing recorded what was sold, what it cost, or what was left in stock.
Ordering was entirely manual: a diner walked to the counter, looked at what was left in the
trays, and ordered whatever was still there. If the dish they came for had run out, the trip was
wasted.

The system assessed here is what the group built to solve that. Every strength and every
opportunity below refers to that system, and each is evidenced by a screen of it running.

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
| 22 | Customer sign in |
| 23 | My orders |
| 24 | Cart with pickup time |
| 25 | Order status, live |
| 26 | Shop details |
| 27 | Staff access and ratings |
| 28 | Recipes and cooking a batch |
| 29 | Promotions screen |
| 30 | Counter kitchen queue |
| 31 | Inventory stock levels |
| 32 | Editing an ingredient |
| 33 | Inventory quantity fields |
| 34 | The three mobile apps |
| 35 | App download page |
| 36 | Diner app, menu |

---

## Part 1 – Business Presence Assessment

### 1.1 Strengths

| No. | Strength | Explanation | Evidence |
| --- | --- | --- | --- |
| 1 | **The menu is always true, so no trip is wasted** | The menu comes from the shop's own records, not from a page someone remembers to edit. Every order lowers the count, and a dish hides itself once it runs out. Bestseller, Only a few left and Sold out labels are worked out from real sales and real stock, so they can never go stale. A diner can check before leaving the house, which is the exact problem the client had. | Figures 7, 8, 18 |
| 2 | **Ordering is easy for everyone, with an account or without** | Checkout gives a six-character ticket code held on the phone. No sign-up, no password. A diner who wants more can make a free account and get order history, payment history, a live view of whether their food is preparing, ready or completed, and loyalty rewards. Nobody is forced to register, and nobody who wants to is turned away. | Figures 10, 11, 12, 22, 23, 25 |
| 3 | **The money side is safe and costs nothing to run** | The shop's own records work out every total, so a customer cannot change a price on their phone and underpay. Discount codes are checked the same way, so a code cannot be invented or reused past its limit. A GCash payer attaches their receipt to the ticket and the counter opens it privately before releasing the order. There is no payment company taking a cut, which matters for a client with no budget. | Figures 10, 15, 20, 29 |
| 4 | **The owner can finally run and measure the business** | The dashboard shows the day's takings, a seven-day trend, best sellers, the cash and GCash split, and profit after expenses. None of this existed before. Inventory says how much of each ingredient should be on hand, how much there is, and how much to buy, and cooking a batch takes the ingredients out automatically because the menu is linked to the recipes. The owner changes prices, shop details, promotions and staff logins without asking a developer. | Figures 16, 19, 26, 27, 28, 31, 32 |
| 5 | **One shop, reaching people on every screen, for free** | The website, the counter screen, the owner dashboard, the three mobile apps and the installable Android app all carry one identity and share one database, so they can never disagree. Screens update themselves: when the counter marks a ticket paid, the diner's phone changes on its own and the kitchen queue moves at the same moment. The owner can print a QR poster for the wall so walk-in customers become online ones, at the cost of one sheet of paper. | Figures 1, 17, 30, 34, 35, 36 |

### 1.2 Opportunities for improvement

Each opportunity below names a weakness in how the business presents itself. Part 2 plans the
fix for each one, in the same order.

| No. | Opportunity | Explanation | Evidence |
| --- | --- | --- | --- |
| 1 | **Nobody can find Bencris online** | The system is finished but still runs only on the group's computer. There is no public address, so a hungry person searching for a karinderya in Dasmariñas Bayan finds nothing, and Bencris still depends entirely on people walking past the stall. Every other strength is worth nothing until this is solved. | No public address yet |
| 2 | **The shop does not look like a real business yet** | The address and contact number on the page are still placeholder text, and the shop has no recognisable mark a customer would remember. A visitor who cannot tell where Bencris is or how to contact it has no reason to trust it with an order. | Figures 1, 3 |
| 3 | **The food does not look appetising** | Every dish is illustrated with a generic stock picture, and several show the wrong food entirely. For an eatery, the photograph is the product, and a customer choosing between places will not pick the one whose sinigang is a stock photo of something else. | Figure 7 |
| 4 | **A first-time visitor sees no proof that the food is good** | The system can accept a star rating from a diner who actually paid, but no real orders have happened yet, so there is nothing on the page that tells a stranger other people eat here and come back. Word of mouth is the client's main advantage and none of it is visible online. | Figure 7 |
| 5 | **There is no way to reach a customer once they leave** | After a diner collects their food, Bencris has no way to tell them today's ulam is ready, that a discount is running, or that a sold-out favourite is back. Every visit has to start from scratch, so the business keeps paying to win the same customer again. | Figure 25 |

---

## Part 2 – Business Presence Improvement Plan

Each area records what the group has already built, then what still has to be done to close the
matching opportunity from Part 1. Every action is free to run, which is the client's firm
constraint.

| Improvement Area | Proposed Action | Tool / Feature / Technology | Expected Outcome |
| --- | --- | --- | --- |
| **Branding** | *Done:* one identity applied to the website, the counter screen, the owner dashboard and all three mobile apps, with the shop name, tagline, hours and contact stored once and read everywhere, so the owner can correct them without a developer. *To do:* replace the placeholder address and contact number with the owner's real details, and agree a simple wordmark and colour with them. | React, Flutter | A customer recognises Bencris wherever they meet it, and the page finally says where the shop actually is |
| **UX, user experience** | *Done:* ordering takes four taps, the cart stays within thumb reach, the menu has a search box and categories, and a returning diner can reorder in one tap. *To do:* walk the whole path on a cheap phone on mobile data and fix whatever is slow or awkward before launch. | React, Flutter | A diner can order while queueing or riding, without pinching or hunting |
| **SEO, being found** | *Done:* the pages carry real text naming the shop and the area, and every dish is listed in Tagalog and English. *To do:* publish to free hosting with a real address and a security certificate, and add the address, opening hours and price range in the form search engines read. | Free hosting, HTML page data | Someone searching for a karinderya in Dasmariñas Bayan finds Bencris instead of nothing |
| **Product presentation** | *Done:* Bestseller, Only a few left and Sold out labels are worked out from real sales and real stock, so they can never go stale, and each dish carries a name and description. *To do:* photograph every dish Bencris actually serves, in daylight, and replace all the stock pictures. | Phone camera, database | The food sells itself, and scarcity labels pull orders earlier in the day |
| **Trust** | *Done:* the first screen shows the hours, address, contact and whether the shop is open right now, backed by About, Questions people ask, Order issues and Privacy pages, and the GCash receipt check is shown openly. Star ratings are accepted only from a ticket that was actually paid. *To do:* gather the first real ratings once the shop is live. | React | A stranger can answer "is this real, and what if my order is wrong?" without asking anyone |
| **Marketing** | *Done:* the owner can create discount codes with a minimum spend and an expiry, and can print a QR poster from the dashboard. *To do:* put the poster on the wall and on the menu, run a small discount in the quiet hours, and make a shared link show the shop name and a dish photo. | QR poster, discount codes, React | A marketing channel that costs one sheet of paper, and a discount only when it makes a sale |
| **Engagement** | *Done:* free accounts keep order and payment history, show an order moving from preparing to ready to completed, and reward every fifth completed order. *To do:* send a notification when the food is ready and when a sold-out favourite returns, and announce each new discount code to account holders. | Accounts, free notifications, loyalty rewards | Bencris can reach a customer after they leave, so the second visit costs nothing to win |

---

## Part 3 – Customer Journey Mapping

### 3.1 Before and after

| Stage | Before, the manual counter | After, the Bencris system |
| --- | --- | --- |
| Discovery | Only by walking past the store | A link in a group chat, the QR poster on the wall, or a web search |
| Menu check | Walk to the counter and look at the trays | Open the site or the app; sold-out dishes are already hidden |
| Decide | Whatever is left on arrival | Browse, search, read descriptions, check ratings and labels |
| Order | Say it out loud in the queue | Build the order on the phone and receive a ticket code |
| Pay | Cash, or a GCash transfer nobody tracked | Cash or GCash, with the receipt attached to the ticket |
| Wait | Stand at the counter and hope | Watch the order move from preparing to ready |
| Receive | Wait at the counter | Show the code; the ticket marks itself paid |
| Record | None | A digital receipt kept on the phone or in the account |
| Return | Start over from nothing | One-tap reorder, plus loyalty rewards |

### 3.2 Journey flowchart

The flowchart is provided as a separate diagram and appears on slide 6 of the presentation. It
runs: Discover, Browse, Cart, Checkout, Ticket issued, then either upload the GCash receipt or
go straight to the counter for cash, then the counter settles it, the ticket marks itself paid,
the kitchen queue advances, handover, receipt, review and reorder. Two loops close it: a reorder
returns the diner to Browse, and a shared receipt or a scanned poster starts a new person at
Discover. Every settled ticket and every review also feeds the owner dashboard.

### 3.3 Stage detail

| Stage | Customer action | Touchpoint | What the system does | Business objective | Measure |
| --- | --- | --- | --- | --- | --- |
| **Discovery** | Receives a link, scans the poster, or searches | Shared link, QR poster, search result | Serves a page that previews properly and names the location in words | Become reachable at all | Link opens, poster scans |
| **Consideration** | Checks whether Bencris is open and real | Landing page | Shows hours, address, contact and the trust pages | Turn a stranger into a visitor | Landing to menu rate |
| **Browse** | Looks for a specific ulam | Menu, search, categories | Shows only what is genuinely available, with labels for scarcity | Remove the wasted trip | Menu views, search use |
| **Cart** | Adjusts quantities, tries a discount code | Cart | Checks the code with the same rule that will charge it | Raise the average order | Add-to-cart rate |
| **Checkout** | Confirms and picks how to pay | Checkout | Works out the total from the live menu and refuses sold-out dishes | Prevent underpaying and overselling | Cart to ticket rate |
| **Ticket** | Receives a six-character code | Ticket screen | Issues a unique code and starts following it live | Give the diner proof of order | Tickets issued |
| **Payment** | Pays cash, or transfers and attaches the receipt | Counter, GCash | Keeps the receipt privately for the counter to check | Cashless trade with a record, at no fee | GCash share |
| **Waiting** | Watches the order progress | Account or ticket screen | Moves the order through preparing, ready and completed | Reduce crowding at the counter | Time from paid to ready |
| **Fulfilment** | Shows the code and collects the food | Counter, kitchen board | The counter settles it and the kitchen queue advances | Shorten counter time | Ticket to paid time |
| **Post-purchase** | Saves or shares the receipt | Receipt | Produces a digital receipt and a share action | A record with no paper cost | Shares |
| **Feedback** | Rates the dish | Rating control | Accepts a rating only against a paid ticket | Build reviews that cannot be faked | Ratings per hundred orders |
| **Retention** | Reorders a favourite, collects a reward | Recent orders, account | Rebuilds the order in one tap and counts loyalty | Turn one visit into many | Repeat-order rate |

---

## Part 4 – Website Operations Plan

### 4.1 Developing the system

How the group will build and finish the system, stage by stage. Each stage ends with something
that can be shown, so progress is never a claim.

| Task | Description | Assigned Member | Timeline | Evidence |
| --- | --- | --- | --- | --- |
| **1. Understand the business** | Interview the owner and watch a full service: how an order is taken, how money is handled, what is written down, and what runs out first. Agree what the system must do before any of it is built. | [Member 5] | Week 1 | Interview notes, photographs, agreed feature list |
| **2. Design the records and the rules** | Decide what the system stores, and settle the rules that must never depend on the customer's phone: the shop works out every total, owns the payment result, and decides what each role may see. | [Member 2] | Week 2 | Records diagram, written rules |
| **3. Build the diner side** | The live menu, search, cart, checkout, ticket code and receipt. Built first because nothing else matters if a customer cannot order. | [Member 1] | Weeks 3 and 4 | Working ordering path on a phone |
| **4. Build the staff side** | The counter screen that looks a ticket up and settles it, and the owner dashboard for takings, kitchen queue, menu, stock, payments and expenses. | [Member 1] and [Member 2] | Weeks 4 and 5 | Counter and dashboard screens |
| **5. Build the money handling** | Cash and GCash, with the diner attaching the receipt to the ticket for the counter to check privately before releasing the order. | [Member 2] | Week 5 | A settled GCash order end to end |
| **6. Build accounts and stock control** | Free customer accounts with order history and live tracking, loyalty rewards, discount codes, and stock that falls automatically when a batch is cooked. | [Member 1] and [Member 2] | Week 6 | Account screens, stock moving after cooking |
| **7. Give the owner full control** | Make every part the owner needs editable by the owner: prices, dishes, shop details, hours, discount codes and staff logins, with no developer involved. | [Member 2] | Week 6 | Owner changing each one unaided |
| **8. Put the real content in** | Photograph every dish, write Tagalog and English descriptions, and replace the placeholder address and contact number with the owner's real details. | [Member 3] | Week 7 | Photograph set, updated shop details |
| **9. Build the mobile apps** | The three mobile apps and the installable Android app, plus the printable QR poster that points customers at the download. | [Member 1] | Week 7 | Installed app running on a real phone |
| **10. Test the whole path** | Run the automated checks, then walk the whole journey by hand on a cheap phone on mobile data: browse, order, pay, wait, collect. Fix what breaks. | [Member 4] | Week 8 | Passing checks, signed test walkthrough |
| **11. Publish it** | Put the site on free hosting with a public address and a security certificate, and point the QR poster at it. | [Member 2] | Week 8 | Live address reachable from outside |
| **12. Train the owner and hand over** | Sit with the owner through opening the menu, settling a ticket, checking a GCash receipt, buying stock and reading the day's takings. Leave a one-page cheat sheet. | [Member 4] | Week 9 | Signed handover checklist and cheat sheet |

### 4.2 Keeping it running after handover

| Task | Description | Assigned Member | Timeline | Evidence |
| --- | --- | --- | --- | --- |
| Daily menu and stock | Confirm the owner has marked today's dishes available and recorded what was cooked, so the site never advertises food that has run out. | [Member 4] | Daily for two weeks, then owner-run | Menu screen for the day |
| Payment reconciliation | Clear every payment the counter flagged against the real GCash history. | [Member 4] | Weekly | Payments screen with nothing outstanding |
| Performance review | Read best sellers, slow movers and profit, and advise the owner what to cook more or less of. | [Member 2] | Weekly | Takings and profit screen |
| Reviews and promotions | Publish genuine ratings, reply to complaints, and choose the next discount code and its expiry. | [Member 3] | Weekly and monthly | Rating queue and the new code |
| Backup and access review | Export the records, keep the change history, re-run the access checks and change staff passwords. | [Member 2] and [Member 4] | Monthly | Backup file and passing checks |

---

## Part 5 – Group Presentation (5 to 7 minutes)

| # | Segment | Content | Speaker | Time |
| --- | --- | --- | --- | --- |
| 1 | The client and the problem | Bencris, inside Dasmariñas Bayan. No website, no link of any kind, no point-of-sale, no stock records, no profit tracking, and the wasted trip when the ulam has run out. | [Member 5] | 0:45 |
| 2 | Assessment | Five strengths of the system and the five gaps that remain, each tied to a screen or a passing check. | [Member 4] | 1:00 |
| 3 | Improvement plan | Six goals: one recognisable shop, being findable, letting the food sell itself, earning trust, bringing people back, and keeping it fast and free. | [Member 3] | 1:15 |
| 4 | Customer journey | Walk the flowchart from discovery through ticket, payment, waiting, receipt and reorder. | [Member 5] | 1:00 |
| 5 | Live demonstration | Browse, add to the cart, apply a discount code, get a ticket, settle it at the counter, watch the diner's phone change by itself, follow the order to ready, and see the sale appear on the owner dashboard. | [Member 1] and [Member 2] | 2:00 |
| 6 | Operations plan and close | Who runs what, from daily to monthly, at no recurring cost. | [Member 4] | 0:30 |

---

## Submission Checklist

| Requirement | Deliverable |
| --- | --- |
| Completed worksheet | This document |
| Presentation slides | Lab3-Bencris-Presentation.pptx in the docs folder |
| Customer Journey Diagram | Part 3.2, and slide 6 of the presentation |
| Supporting screenshots | The screens in the figure list, in the docs screenshots folder |
| Website link | Not published yet, demonstrated live during the presentation |
| Source code repository | github.com/ENTREP3/IT-eary |
