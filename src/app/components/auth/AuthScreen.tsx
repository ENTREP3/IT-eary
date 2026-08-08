import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, ShieldCheck, Store } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import type { UserRole } from '../../lib/types';

type Area = 'admin' | 'cashier';

/**
 * No credentials are printed on this screen, by design. Staff sign in with the
 * account the owner created for them on the Staff access screen, which is a
 * real row in auth.users. Anything shown here would be a second, weaker way in.
 */
const COPY = {
  admin: {
    icon: ShieldCheck,
    title: 'Owner sign in',
    blurb: 'Owner access only. Cashier accounts cannot sign in here.',
  },
  cashier: {
    icon: Store,
    title: 'Counter sign in',
    blurb: 'Sign in to take payments at the counter.',
  },
} as const;

export function AuthScreen({ area, allowed }: { area: Area; allowed: UserRole[] }) {
  const copy = COPY[area];
  const Icon = copy.icon;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginStaff = useAuthStore((s) => s.loginStaff);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await loginStaff(email.trim(), password, allowed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const field =
    'w-full h-11 rounded-xl border px-4 text-sm outline-none focus:ring-2 transition ' +
    'bg-[#0f1410] border-[#e8dfc8]/15 text-[#e8dfc8] placeholder:text-[#e8dfc8]/40 focus:ring-[#e8a84a]/40';

  return (
    <div className="min-h-screen grid place-items-center p-4 bg-[#0f1410]">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 24 }}
        className="w-full max-w-md rounded-3xl border border-[#e8dfc8]/15 bg-[#0a0d0a] text-[#e8dfc8] p-7"
      >
        <div className="mb-6">
          <div className="inline-flex w-11 h-11 rounded-full items-center justify-center mb-4 bg-[#e8a84a] text-[#0a0d0a]">
            <Icon size={20} />
          </div>
          <div
            style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em' }}
            className="text-2xl leading-none mb-2"
          >
            Ben<span style={{ fontStyle: 'italic', color: '#e8a84a' }}>cris</span>
          </div>
          <h2
            style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.02em' }}
            className="text-3xl"
          >
            {copy.title}
          </h2>
          <p className="text-sm opacity-60 mt-1">{copy.blurb}</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            className={field}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            className={field}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            minLength={6}
          />

          {error && (
            <div className="text-sm rounded-xl px-3 py-2 bg-[#c8442a]/20 text-[#e87a5c]">{error}</div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 rounded-xl flex items-center justify-center gap-2 font-medium disabled:opacity-60 bg-[#e8a84a] text-[#0a0d0a]"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            Sign in
          </button>
        </form>

        <p className="text-[11px] opacity-40 mt-4 text-center">
          No account? The owner creates staff logins on the Staff access screen.
        </p>
      </motion.div>
    </div>
  );
}
