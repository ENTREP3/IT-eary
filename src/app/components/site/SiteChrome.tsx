import React from 'react';
import { Link } from 'react-router';
import { UserRound } from 'lucide-react';
import { useBusinessStore, addressOf, isOpenNow } from '../../store/businessStore';
import { useAuthStore } from '../../store/authStore';

/**
 * The header and footer shared by every page that is not the ordering flow.
 *
 * The footer is the trust surface: a first-time visitor can find the address,
 * the opening hours, a contact number and the policies without leaving the page
 * they landed on.
 */

export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const district = useBusinessStore((s) => s.profile.district);
  return (
    <Link to="/" className="inline-block text-left" aria-label="Bencris home">
      <div
        style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em' }}
        className={size === 'lg' ? 'text-3xl leading-none' : 'text-2xl leading-none'}
      >
        Ben<span style={{ fontStyle: 'italic' }} className="text-diner-accent">cris</span>
      </div>
      <div className="text-[10px] tracking-[0.3em] uppercase opacity-55 mt-0.5">
        {district}
      </div>
    </Link>
  );
}

/**
 * The hero line, read from the shop's own settings rather than hardcoded.
 *
 * It used to be typed straight into both hero headings, which meant the owner
 * could edit the tagline on the Shop screen and watch the two biggest pieces of
 * text on the site ignore them. The last word is emphasised for rhythm, so the
 * styling survives whatever they write.
 *
 * Painted immediately, never held back for the network. Waiting for the row to
 * arrive left the largest text on the page blank for the whole round trip,
 * which is far worse than the flicker it was meant to prevent. The store hands
 * over the last profile this device saw, so the first paint is already the
 * right words and there is nothing to wait for.
 */
export function Tagline({ className = '' }: { className?: string }) {
  const tagline = useBusinessStore((s) => s.profile.tagline);

  const words = tagline.trim().split(/\s+/);
  const last = words.pop() ?? '';

  return (
    <h1
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 500,
        letterSpacing: '-0.03em',
        lineHeight: 0.95,
      }}
      className={className}
    >
      {words.join(' ')}{words.length > 0 ? ' ' : ''}
      <em className="text-diner-accent">{last}</em>
    </h1>
  );
}

export function OpenPill() {
  const hours = useBusinessStore((s) => s.profile.hours);
  const open = isOpenNow(hours);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] tracking-wide border ${
        open
          ? 'border-semantic-cash/40 text-semantic-cash'
          : 'border-diner-ink/20 opacity-60'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${open ? 'bg-semantic-cash animate-pulse' : 'bg-diner-ink/40'}`}
      />
      {open ? 'Open now' : 'Closed right now'}
    </span>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 bg-diner-ground/90 backdrop-blur border-b border-diner-ink/10">
      <div className="shell py-3 flex items-center justify-between gap-3">
        <Wordmark />
        <nav className="flex items-center gap-1 sm:gap-3 text-sm">
          <Link to="/about" className="hidden sm:block px-2 py-1 opacity-70 hover:opacity-100">
            About
          </Link>
          <Link to="/faq" className="hidden sm:block px-2 py-1 opacity-70 hover:opacity-100">
            FAQ
          </Link>
          <AccountLink />
          <Link
            to="/menu"
            className="px-4 py-2 rounded-full bg-diner-ink text-diner-ground hover:opacity-90"
          >
            See the menu
          </Link>
        </nav>
      </div>
    </header>
  );
}

/** Signed-in diners get their orders page; everyone else gets sign in. */
function AccountLink() {
  const user = useAuthStore((s) => s.user);
  return (
    <Link
      to="/account"
      className="inline-flex items-center gap-1.5 px-2 py-1 opacity-70 hover:opacity-100"
    >
      <UserRound size={15} />
      <span className="hidden sm:inline">{user ? 'My orders' : 'Sign in'}</span>
    </Link>
  );
}

export function SiteFooter() {
  const p = useBusinessStore((s) => s.profile);
  return (
    <footer className="border-t border-diner-ink/10 mt-16">
      <div className="shell py-10 grid gap-8 sm:grid-cols-3 text-sm">
        <div>
          <Wordmark />
          <p className="mt-3 opacity-65 leading-relaxed max-w-xs">{p.tagline}</p>
          <div className="mt-3">
            <OpenPill />
          </div>
        </div>

        <div>
          <h2 className="text-[11px] tracking-[0.25em] uppercase opacity-55 mb-2">Where to find us</h2>
          <address className="not-italic opacity-75 leading-relaxed">{addressOf(p)}</address>
          <p className="mt-2 opacity-75">{p.phone}</p>
        </div>

        <div>
          <h2 className="text-[11px] tracking-[0.25em] uppercase opacity-55 mb-2">Opening hours</h2>
          <ul className="opacity-75 space-y-1">
            {p.hours.map((h) => (
              <li key={h.days}>
                {h.days}
                <br />
                <span className="tabular-nums">
                  {h.opens} to {h.closes}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-diner-ink/10">
        <div className="shell py-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs opacity-60">
          <Link to="/about" className="hover:opacity-100">About</Link>
          <Link to="/faq" className="hover:opacity-100">FAQ</Link>
          <Link to="/contact" className="hover:opacity-100">Contact</Link>
          <Link to="/refund" className="hover:opacity-100">Order issues</Link>
          <Link to="/privacy" className="hover:opacity-100">Privacy</Link>
          <span className="ml-auto">
            &copy; {new Date().getFullYear()} {p.name}
          </span>
        </div>
      </div>
    </footer>
  );
}
