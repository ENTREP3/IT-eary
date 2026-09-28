import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { humanError } from '../../lib/errors';
import { passwordProblem } from '../../lib/password';

/**
 * Where a reset link lands.
 *
 * Supabase signs the visitor in as it delivers them here, so by the time this
 * renders they already have a session — a short-lived one, minted from the
 * link. That is the whole reason this page can set a password without asking
 * for the old one, and the reason it has to check there is a session at all:
 * opened cold, with no link, it would otherwise present a form that silently
 * changes nothing.
 *
 * The rule the password is held to is the database's own, asked for rather
 * than copied, so this page cannot drift out of step with what the server will
 * actually accept.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const setNewPassword = useAuthStore((s) => s.setNewPassword);

  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // The session arrives from the link, which the client picks up out of the
    // URL asynchronously — so this waits for the event rather than reading
    // once and concluding there is nobody here.
    let settled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        settled = true;
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        settled = true;
        setReady(true);
      } else {
        // Give the link a moment to be exchanged before calling it expired.
        setTimeout(() => {
          if (!settled) setReady(false);
        }, 2500);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const check = (value: string) => {
    setPassword(value);
    setProblem(value ? passwordProblem(value) : null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bad = passwordProblem(password);
    if (bad) {
      setProblem(bad);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setNewPassword(password);
      setDone(true);
      // Straight to their orders, already signed in. Sending somebody who has
      // just proved who they are back to a sign-in form is a wasted step.
      setTimeout(() => navigate('/account'), 1800);
    } catch (err) {
      setError(humanError(err, 'That password could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const field =
    'w-full h-11 px-4 rounded-xl bg-diner-card border border-diner-ink/15 focus:outline-none focus:ring-2 focus:ring-diner-accent/40';

  if (ready === null) {
    return (
      <Shell>
        <p className="flex items-center gap-2 opacity-60">
          <Loader2 size={16} className="animate-spin" /> Checking your link…
        </p>
      </Shell>
    );
  }

  if (ready === false) {
    return (
      <Shell>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-3xl">
          That link has expired
        </h1>
        <p className="mt-3 opacity-70 leading-relaxed">
          Reset links only work once, and only for a short while. Ask for a new one and it will be
          in your inbox in a moment.
        </p>
        <Link
          to="/account"
          className="mt-6 inline-flex h-11 px-5 items-center rounded-full bg-diner-ink text-diner-ground"
        >
          Back to sign in
        </Link>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <h1
          style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
          className="text-3xl flex items-center gap-2"
        >
          <CheckCircle2 size={26} className="text-semantic-cash" /> Password changed
        </h1>
        <p className="mt-3 opacity-70">Taking you to your orders…</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-3xl">
        Choose a new password
      </h1>
      <p className="mt-2 opacity-70 text-sm">
        You are signed in from the link, so there is no old password to type.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => check(e.target.value)}
          placeholder="New password"
          autoComplete="new-password"
          autoFocus
          required
          className={field}
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Type it again"
          autoComplete="new-password"
          required
          className={field}
        />

        {/* Said as they type rather than on submit, and phrased as the next
            thing to do — "Add a capital letter" gets somebody to a working
            password, where "too weak" leaves them guessing. */}
        {problem && <p className="text-sm text-diner-accent">{problem}</p>}
        {!problem && password && (
          <p className="text-sm text-semantic-cash">That will do nicely.</p>
        )}
        {error && <p className="text-sm text-diner-accent">{error}</p>}

        <button
          type="submit"
          disabled={busy || !!problem}
          className="w-full h-11 rounded-full bg-diner-ink text-diner-ground flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          Save my new password
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell py-16 max-w-md">
      {children}
    </div>
  );
}
