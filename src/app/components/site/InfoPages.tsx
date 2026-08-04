import React from 'react';
import { Link } from 'react-router';
import { BUSINESS, addressOneLine } from '../../lib/business';
import { SiteHeader, SiteFooter } from './SiteChrome';

/**
 * About, FAQ, Contact, Order issues and Privacy.
 *
 * These exist because a first-time diner has no way to judge whether a shop is
 * real. They are deliberately short and plain: a karinderya does not need a
 * legal department, it needs answers to the questions people actually ask.
 */

function Page({ title, standfirst, children }: { title: string; standfirst?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-diner-ground text-diner-ink flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 md:px-8 py-12">
        <h1
          style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.02em' }}
          className="text-4xl md:text-5xl"
        >
          {title}
        </h1>
        {standfirst && <p className="mt-4 text-lg opacity-70 leading-relaxed">{standfirst}</p>}
        <div className="mt-8 space-y-6 leading-relaxed opacity-85">{children}</div>
        <Link to="/menu" className="inline-block mt-10 text-diner-accent hover:underline">
          See what is cooking today
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
      className="text-xl mt-8 mb-2"
    >
      {children}
    </h2>
  );
}

export function AboutPage() {
  return (
    <Page
      title="About Bencris"
      standfirst="A neighbourhood karinderya in Dasmariñas Bayan, serving home-cooked Filipino food to the people who work and pass through the bayan every day."
    >
      <p>
        Bencris cooks fresh each morning and serves until the trays run out. There is no
        warehouse and no freezer stock behind the counter: what you see is what was cooked
        today, which is why the menu on this site changes through the day.
      </p>

      <H2>Why this site exists</H2>
      <p>
        The most common frustration our customers had was walking over for a particular ulam
        only to find it had already run out. This site fixes exactly that. The menu here is
        the same menu at the counter, and a dish disappears from it the moment the last
        serving is sold, so you never make the trip for nothing.
      </p>

      <H2>How we handle your order</H2>
      <p>
        You do not need an account. When you place an order you get a short ticket code on
        your phone. Show that code at the counter, pay in cash or through GCash, and the
        ticket updates to Paid while you are standing there.
      </p>

      <H2>Where to find us</H2>
      <p>{addressOneLine}</p>
      <ul className="mt-2 space-y-1">
        {BUSINESS.hours.map((h) => (
          <li key={h.days}>
            {h.days}: {h.opens} to {h.closes}
          </li>
        ))}
      </ul>
    </Page>
  );
}

export function FaqPage() {
  const faqs: [string, React.ReactNode][] = [
    [
      'Do I need an account to order?',
      <>No. You build your order, and we give you a short ticket code. That code is all you need.</>,
    ],
    [
      'Is the menu here the real one?',
      <>
        Yes. It is the same list the counter works from. When a dish sells out it disappears from
        this site straight away, so anything you can see is genuinely still available.
      </>,
    ],
    [
      'How do I pay?',
      <>
        Cash at the counter, or GCash. If you choose GCash you send the payment and upload the
        receipt screenshot to your ticket, and the cashier checks it before releasing your order.
      </>,
    ],
    [
      'Do you deliver?',
      <>
        Not at the moment. Ordering here saves you the queue and tells you what is available, but
        you still collect your food at the counter.
      </>,
    ],
    [
      'How long is my ticket valid?',
      <>
        For the day it was issued. Come to the counter within our opening hours and show the code.
      </>,
    ],
    [
      'What if I lose the code?',
      <>
        Use <Link to="/menu" className="text-diner-accent hover:underline">Find my ticket</Link> on
        the menu page and type the code, or ask at the counter with the name you used.
      </>,
    ],
    [
      'Can I order for a group?',
      <>
        Yes. Put everything in one order and you will get a single ticket for the whole group,
        which is faster at the counter than paying separately.
      </>,
    ],
  ];

  return (
    <Page title="Questions people ask" standfirst="The short answers. If yours is not here, please call or ask at the counter.">
      <dl className="space-y-6">
        {faqs.map(([q, a]) => (
          <div key={q}>
            <dt style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-lg">
              {q}
            </dt>
            <dd className="mt-1 opacity-80">{a}</dd>
          </div>
        ))}
      </dl>
    </Page>
  );
}

export function ContactPage() {
  return (
    <Page title="Contact us" standfirst="The fastest way to reach us is to call during opening hours.">
      <H2>Phone</H2>
      <p>{BUSINESS.contact.phone}</p>

      <H2>Address</H2>
      <p>{addressOneLine}</p>

      <H2>Opening hours</H2>
      <ul className="space-y-1">
        {BUSINESS.hours.map((h) => (
          <li key={h.days}>
            {h.days}: {h.opens} to {h.closes}
          </li>
        ))}
      </ul>

      <H2>About an order you already placed</H2>
      <p>
        Have your ticket code ready. It is the six-character code shown on your phone when you
        placed the order, and it lets us find your order immediately.
      </p>
    </Page>
  );
}

export function RefundPage() {
  return (
    <Page
      title="If something is wrong with your order"
      standfirst="We would rather fix it than have you leave unhappy. Here is exactly what happens."
    >
      <H2>Your order is wrong or incomplete</H2>
      <p>
        Tell the counter before you leave and show your ticket code. We will correct it or
        replace the item there and then. Because nothing is paid for until the cashier settles
        your ticket, this is usually sorted out in under a minute.
      </p>

      <H2>A dish ran out after you ordered</H2>
      <p>
        This is rare, because the menu hides sold-out dishes as they go. If it does happen, you
        can swap the item for anything else on the counter, or we simply do not charge you for
        it. Your ticket total is confirmed by the cashier before you pay, never before.
      </p>

      <H2>You paid through GCash and something went wrong</H2>
      <p>
        Your payment screenshot is attached to your ticket, so there is always a record tied to
        the order. If a transfer does not show up on our side, the cashier releases your food
        anyway and flags the payment for the owner to check against the GCash history. You are
        not left standing at the counter over a network problem.
      </p>

      <H2>Refunds</H2>
      <p>
        Food is prepared fresh and served immediately, so we do not refund an order once it has
        been handed over and eaten. If you are unhappy with what you received, tell us at the
        counter that day and we will make it right.
      </p>
    </Page>
  );
}

export function PrivacyPage() {
  return (
    <Page
      title="Privacy notice"
      standfirst="We collect as little as possible, because ordering here does not need an account."
    >
      <H2>What we ask for</H2>
      <p>
        Only your first name, and only if you choose to give it. It is used for one thing:
        calling your order at the counter. There is no sign-up, no password, no email address
        and no phone number attached to an order.
      </p>

      <H2>What your order record holds</H2>
      <p>
        The dishes you ordered, the quantities, the total, the payment method, and the ticket
        code. Nothing that identifies you personally beyond the name you may have typed.
      </p>

      <H2>GCash payment screenshots</H2>
      <p>
        If you pay by GCash, the screenshot you upload is stored privately and is not public.
        Only counter staff can open it, and only to confirm your payment before releasing your
        order.
      </p>

      <H2>What stays on your own phone</H2>
      <p>
        Your recent orders, your favourites and any ratings you leave are kept in your own
        browser, not on our system. Clearing your browser data removes them, and we never see
        them.
      </p>

      <H2>Questions</H2>
      <p>
        Call {BUSINESS.contact.phone} or ask at the counter.
      </p>
    </Page>
  );
}
