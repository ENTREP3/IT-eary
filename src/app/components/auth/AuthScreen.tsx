import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Loader2, ShieldCheck, UserPlus, LogIn } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

type Mode = 'customer' | 'admin';

const THEME = {
  customer: {
    bg: '#f4ead5',
    card: '#fbf4e3',
    text: '#2a1810',
    accent: '#c8442a',
    field: 'bg-white/60 border-[#2a1810]/15 text-[#2a1810] placeholder:text-[#2a1810]/40',
    primary: 'bg-[#2a1810] text-[#f4ead5]',
  },
  admin: {
    bg: '#0f1410',
    card: '#0a0d0a',
    text: '#e8dfc8',
    accent: '#e8a84a',
    field: 'bg-[#0f1410] border-[#e8dfc8]/15 text-[#e8dfc8] placeholder:text-[#e8dfc8]/40',
    primary: 'bg-[#e8a84a] text-[#0a0d0a]',
  },
} as const;

export function AuthScreen({
  mode,
  onClose,
  onSuccess,
}: {
  mode: Mode;
  onClose?: () => void;
  onSuccess?: () => void;
}) {
  const t = THEME[mode];
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { registerCustomer, loginCustomer, loginAdmin } = useAuthStore();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'admin') {
        await loginAdmin(email.trim(), password);
      } else if (tab === 'register') {
        if (!fullName.trim()) throw new Error('Please enter your name.');
        await registerCustomer({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          phone: phone.trim(),
        });
      } else {
        await loginCustomer(email.trim(), password);
      }
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const field =
    'w-full h-11 rounded-xl border px-4 text-sm outline-none focus:ring-2 transition ' + t.field;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: `${t.bg}ee`, backdropFilter: 'blur(6px)' }}
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: 'spring', damping: 24 }}
        className="w-full max-w-md rounded-3xl border p-7 relative"
        style={{ background: t.card, color: t.text, borderColor: `${t.text}22` }}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1 opacity-50 hover:opacity-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        )}

        <div className="mb-6">
          <div
            className="inline-flex w-11 h-11 rounded-full items-center justify-center mb-4"
            style={{ background: t.accent, color: t.card }}
          >
            {mode === 'admin' ? <ShieldCheck size={20} /> : tab === 'register' ? <UserPlus size={20} /> : <LogIn size={20} />}
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-3xl">
            {mode === 'admin'
              ? 'Staff sign in'
              : tab === 'register'
                ? 'Gumawa ng account'
                : 'Maligayang balik!'}
          </h2>
          <p className="text-sm opacity-60 mt-1">
            {mode === 'admin'
              ? 'Owner & staff only. Customer accounts cannot sign in here.'
              : tab === 'register'
                ? 'Sign up to order and track your purchases.'
                : 'Log in to place your order.'}
          </p>
        </div>

        {mode === 'customer' && (
          <div className="flex gap-1 p-1 rounded-full mb-5" style={{ background: `${t.text}10` }}>
            {(['login', 'register'] as const).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setTab(k);
                  setError(null);
                }}
                className={`flex-1 py-2 rounded-full text-sm transition ${tab === k ? t.primary : 'opacity-60'}`}
              >
                {k === 'login' ? 'Log in' : 'Register'}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          {mode === 'customer' && tab === 'register' && (
            <input
              className={field}
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          )}
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
            autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
            required
            minLength={6}
          />
          {mode === 'customer' && tab === 'register' && (
            <input
              className={field}
              placeholder="Phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          )}

          {error && (
            <div
              className="text-sm rounded-xl px-3 py-2"
              style={{ background: `${t.accent}22`, color: t.accent }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className={`w-full h-11 rounded-xl flex items-center justify-center gap-2 font-medium disabled:opacity-60 ${t.primary}`}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {mode === 'admin' ? 'Sign in' : tab === 'register' ? 'Create account' : 'Log in'}
          </button>
        </form>

        {mode === 'admin' && (
          <p className="text-[11px] opacity-40 mt-4 text-center">
            Demo admin · admin@iteary.local / admin123
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
