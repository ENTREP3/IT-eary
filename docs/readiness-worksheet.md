# CTELEC5L – Web Commercialization and E-Commerce
## Student Laboratory Worksheet
### E-Commerce Business Readiness Challenge
Business Strategy • Security • Payment Systems • Customer Trust • Ethics

| Group Information | Details |
|---|---|
| Group No. | fill in |
| Members | fill in |
| SME / Business Name | Bencris, a karinderya (small Filipino eatery) in Dasmariñas Bayan, Cavite |
| Date | August 19, 2026 |

---

## PART 1 – BUSINESS STRATEGY

Identify and analyze the basic business strategy of your e-commerce project.

| Item | Answer |
|---|---|
| Business / SME Name | Bencris, a karinderya in Dasmariñas Bayan, Cavite. |
| Main Product / Service | Home-cooked Filipino ulam (main dishes), 23 recipes plus rice, ordered online or at the counter. |
| Target Customers | People who live, study, or work near Dasmariñas Bayan and want a cheap, home-style lunch without walking over to find the food already gone. |
| Main Competitor | Other small eateries nearby that do not show what they are cooking before a customer walks over. |
| How will the business make profit? | Each dish is sold for more than it costs to cook, about 17 pesos profit for every 100 pesos taken in, based on real supplier prices. Rice is sold separately. |
| Why should customers choose your business? | They can see what is cooking and the real price before they leave home. They order with a short code and no account, pay cash or GCash, and get told when their food is ready. |
| What could increase demand? | Discount codes for members, a rewards card for repeat customers, a QR code and app that reach more people, and dishes the owner picks to highlight. |
| What could reduce supply? | Higher market prices (some ingredients already went up a lot once we checked real prices), running out of one ingredient, or a delivery problem. |
| How will the business respond if demand suddenly increases? | A dish is marked sold out the moment it runs out, so the menu is never wrong. The owner can see real sales and cost numbers and decide whether to raise a price or cook more. |

---

## PART 2 – E-COMMERCE SECURITY

Identify the three most important security threats that could affect your website. Consider hacking, phishing, malware/web-skimming, DDoS, insider threats/misconfiguration, and MITM.

| # | Security Threat | How Could It Affect Our Website? | CIA Impact | Protection |
|---|---|---|---|---|
| 1 | Wrong access rules (a mistake by the shop, not an outsider) | A rule that is too loose could let anyone see every order: name, items, total, even the payment receipt, without needing a code or account. This actually happened once and was fixed. | Confidentiality, Integrity | Every table only shows data to the right person, checked by the database itself. An order belongs to an account or to the phone that placed it, not to anyone who asks within 24 hours. The fix was tested before we trusted it. |
| 2 | Payment fraud, a fake or reused GCash receipt | A customer could try to pay with an old screenshot, or say they paid when they did not, to get food without paying. | Integrity | An order cannot be marked paid twice. The cashier can ask to see the customer's GCash app directly instead of trusting a picture. Receipt links expire, so an old one cannot be reused. |
| 3 | Phishing, a stolen staff password | If a cashier's or owner's password is stolen, someone could take payments, change the menu, or read every customer's order history. | Confidentiality, Integrity | Staff and customers sign in through different doors. A staff member's role is set by the shop, not by anything sent from their phone or browser, so a stolen login cannot upgrade itself to owner. Every change goes through a checked process, not a direct edit. |

**Choose the most important security measure for your project:**

[X] HTTPS / SSL &nbsp;&nbsp; [X] Strong Passwords &nbsp;&nbsp; [ ] Two-Factor Authentication &nbsp;&nbsp; [X] Role-Based Access

[ ] Firewall &nbsp;&nbsp; [ ] Intrusion Detection &nbsp;&nbsp; [X] Regular Security Review &nbsp;&nbsp; [ ] Secure Coding

**Why did you choose it?**

We chose **HTTPS** because every order and payment detail travels between the customer's phone and our server. Without it, that information could be read or changed along the way. It keeps the system secure by making that information unreadable to anyone else. It protects the business because a shop that leaks names or GCash receipts loses customer trust fast.

We chose **Role-Based Access** because the app has different kinds of users: diners, cashiers, and the owner. Each should only be able to do what their job needs. It keeps the system secure because the database checks this itself, not the app, so a trick or a stolen customer login cannot act like staff. It protects the business because the owner can trust that only the right people can touch the menu, the money, and other customers' orders.

We chose **Regular Security Review** because new problems can appear as the system grows, so checking once is not enough. It keeps the system secure because this is exactly how we found and fixed the one real gap this project had, before it caused any harm. It protects the business because catching a problem early costs nothing, while a customer finding it first costs trust and maybe money.

We chose **Strong Passwords** because a weak password is one of the easiest ways for an account to be broken into. Right now ours only needs 6 characters. We are changing that so a password must use uppercase letters, lowercase letters, numbers, and symbols before real accounts go live. It keeps the system secure by making accounts much harder to guess or break into. It protects the business because staff accounts can see sales, change prices, and handle payments, so they are the accounts most worth protecting.

---

## PART 3 – PAYMENT PROCESS

Design the payment process that customers use when buying from your website.

**Select your payment method:**
[ ] GCash &nbsp;&nbsp; [ ] Maya &nbsp;&nbsp; [ ] QR Payment &nbsp;&nbsp; [ ] Bank Transfer &nbsp;&nbsp; [ ] Credit/Debit Card &nbsp;&nbsp; [X] Multiple Methods
[ ] Other: __________

*(Multiple Methods = Cash and GCash)*

**Payment implementation:**
[ ] Automated Payment Gateway &nbsp;&nbsp; [X] QR / Manual Payment Verification &nbsp;&nbsp; [ ] Other: __________

**If using a payment gateway, identify it:**
Not used. GCash goes straight to the shop's own account. No outside company handles the money.

**If using QR/manual payment, explain how the payment will be verified:**
The customer sees the GCash number, name, and QR code at checkout. They pay, then upload a receipt with their ticket code, or show the app at the counter. The cashier checks it before marking the order Paid.

**Complete your payment flow:**

| Step | Process |
|---|---|
| 1 | Customer looks at the menu and picks dishes. Rice is separate. |
| 2 | Customer picks Cash or GCash and gets a short ticket code. No account is needed. |
| 3 | Customer, for GCash, pays and uploads the receipt. |
| 4 | Payment Confirmation: the cashier checks the payment at the counter and marks it Paid. |
| 5 | Order Status: the kitchen cooks the order, and the customer's screen updates on its own. |

**What happens when payment is successful?**
The order is marked Paid, goes to the kitchen, and the customer's screen updates without them asking.

**What happens when payment cannot be verified?**
The order stays Unpaid and does not go to the kitchen. The cashier asks the customer to send it again or show the app.

**How will you prevent fake or reused payment proofs?**
Each receipt is linked to one order only. An order that is already paid cannot be paid again. Receipt links stop working after a short time, so an old one cannot be reused. The cashier can always ask to see the live app instead of a picture.

---

## PART 4 – CUSTOMER TRUST

Check your website from the customer's point of view.

| Check | Yes | No | Needs Improvement | What Will You Improve? |
|---|---|---|---|---|
| Prices are clear and transparent. | [X] | [ ] | [ ] | none |
| Payment methods are clearly explained. | [X] | [ ] | [ ] | none |
| Customer information is protected. | [X] | [ ] | [ ] | none |
| Payment/order status is clear. | [X] | [ ] | [ ] | none |
| Refund/return/complaint process is clear. | [ ] | [ ] | [X] | There is a page for order problems, but no written refund rule yet. A customer can only cancel their own order before the kitchen starts cooking it. Anything after that needs a staff member. |
| Business information is sufficient to build trust. | [ ] | [X] | [ ] | The address, phone number, and GCash number shown right now are placeholders, not the real ones. This needs to be fixed before launch. |

---

## PART 5 – ETHICS AND SOCIAL RESPONSIBILITY

Identify issues that your e-commerce business should address.

| Issue | Possible Problem | What Will Your Business Do? |
|---|---|---|
| Data Privacy | We store customer names and real GCash receipts. | Only the right people can see this data, checked by the database. The owner can download old receipts and then permanently delete them. |
| Consumer Protection | A cost could be hidden, for example if rice looked included when it is not. | Rice is shown and priced on its own. Nothing is added to the bill without the customer choosing it. |
| Environmental Sustainability | Cooking more food than gets sold is wasteful. | Every dish is cooked in planned batches based on its real recipe, and the menu updates the moment stock runs low. |
| Ethical Marketing | Reviews could be fake. | A customer can only leave a review for a dish they actually bought and paid for. Sample reviews used for testing were deleted before the real menu went live. |
| Labor / Worker Concerns | A small staff could get overloaded during a rush, with no record of who did what. | The counter and kitchen screen are combined so one person can run both. Staff sign in with their own name. Cancelling an order that is already cooking needs the owner, not just anyone at the counter. |
| Social Equity | Customers without a phone, app, or bank account could be left out. | Ordering only needs a short code. No account and no app are required. Customers can pay cash. A QR poster and an app are there for people who want them, but they are optional. |

---

## FINAL DECISION – CAN WE LAUNCH?

Based on your assessment, choose ONE:

[ ] READY TO LAUNCH &nbsp;&nbsp; [X] READY WITH IMPROVEMENTS &nbsp;&nbsp; [ ] NOT READY TO LAUNCH

**Give three reasons for your decision:**

| Reason | Evidence from Our Project |
|---|---|
| 1. The full order, payment, and kitchen process works on a real system, not a mock-up. | 25 real dishes, each priced from real recipes and real supplier costs. |
| 2. Security is built into the database itself, and the one real problem we found was fixed and tested. | Each guest order can now be traced back to the device that placed it, so no one else can view or cancel it. Discount codes only work for customers who are signed in. |
| 3. Some basic shop information shown to customers is still fake. | The address, phone number, and GCash number shown today are placeholders from when we were building the system. |

**List the three most important improvements before the final presentation:**

| Priority | Improvement | Why Is It Important? |
|---|---|---|
| 1 | Add the real address, phone number, and GCash number. | Wrong information could send a customer to the wrong place or the wrong GCash account. |
| 2 | Add real photos of the food. | Every dish and the homepage banner currently show a blank placeholder. Photos are what make people want to order. |
| 3 | Finish checking a few remaining ingredient prices. | Most prices are already confirmed and real. A few are still estimates, so the numbers for the lowest-profit dishes are not fully final yet. |

---

## SUBMISSION CHECKLIST

[X] Completed worksheet
[X] Business strategy identified
[X] Three security threats analyzed
[X] Payment process completed
[X] Customer trust assessment completed
[X] Ethics/social responsibility actions identified
[X] Final launch decision justified
[ ] 3 to 5 minute presentation prepared (see companion outline)
