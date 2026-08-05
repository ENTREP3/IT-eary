import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { Loader2 } from 'lucide-react';
import { StorefrontApp } from './components/diner/StorefrontApp';

/**
 * The staff screens are loaded only when somebody actually opens them.
 *
 * They are by far the heaviest part of the build (the owner dashboard alone
 * pulls in the whole charting library), and no diner will ever see them. Every
 * customer arrives on a phone over mobile data, so making them wait for the
 * counter and dashboard code is the single most expensive thing we could do to
 * the first page load.
 */
const AdminApp = lazy(() =>
  import('./components/AdminApp').then((m) => ({ default: m.AdminApp })),
);
const CashierApp = lazy(() =>
  import('./components/CashierApp').then((m) => ({ default: m.CashierApp })),
);
import { Landing } from './components/site/Landing';

/**
 * The trust pages and the account page are read rarely, and never on the way to
 * placing an order, so they load on demand as well. Only the landing page and
 * the menu are in the first download a diner pays for.
 */
const AccountPage = lazy(() =>
  import('./components/site/AccountPage').then((m) => ({ default: m.AccountPage })),
);
const AboutPage = lazy(() =>
  import('./components/site/InfoPages').then((m) => ({ default: m.AboutPage })),
);
const FaqPage = lazy(() =>
  import('./components/site/InfoPages').then((m) => ({ default: m.FaqPage })),
);
const ContactPage = lazy(() =>
  import('./components/site/InfoPages').then((m) => ({ default: m.ContactPage })),
);
const RefundPage = lazy(() =>
  import('./components/site/InfoPages').then((m) => ({ default: m.RefundPage })),
);
const PrivacyPage = lazy(() =>
  import('./components/site/InfoPages').then((m) => ({ default: m.PrivacyPage })),
);
import { AuthScreen } from './components/auth/AuthScreen';
import { useAuthStore } from './store/authStore';
import { usePaymentStore } from './store/paymentStore';
import { useKarinderyaStore } from './store/karinderyaStore';
import { useReviewStore } from './store/reviewStore';
import { useBusinessStore } from './store/businessStore';
import type { UserRole } from './lib/types';

/**
 * All three audiences on the web, mirroring the Flutter apps:
 *   /          landing page, plus the About / FAQ / Contact / policy pages
 *   /menu      diner storefront, no account
 *   /cashier   counter
 *   /admin     owner
 *
 * The rules they share live in Postgres, not here, so the web and mobile
 * versions of each screen cannot drift.
 */
export default function App() {
  const initAuth = useAuthStore((s) => s.init);
  const loadPayments = usePaymentStore((s) => s.load);
  const loadMenu = useKarinderyaStore((s) => s.loadAll);
  const subscribeMenu = useKarinderyaStore((s) => s.subscribe);
  const loadRatings = useReviewStore((s) => s.load);
  const loadBusiness = useBusinessStore((s) => s.load);

  useEffect(() => {
    initAuth();
    loadPayments();
    loadMenu();
    loadRatings();
    loadBusiness();
    return subscribeMenu();
  }, [initAuth, loadPayments, loadMenu, loadRatings, loadBusiness, subscribeMenu]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/menu" element={<StorefrontApp />} />
        <Route path="/about" element={<Page><AboutPage /></Page>} />
        <Route path="/faq" element={<Page><FaqPage /></Page>} />
        <Route path="/contact" element={<Page><ContactPage /></Page>} />
        <Route path="/refund" element={<Page><RefundPage /></Page>} />
        <Route path="/privacy" element={<Page><PrivacyPage /></Page>} />
        <Route path="/account" element={<Page><AccountPage /></Page>} />
        <Route
          path="/admin"
          element={
            <RequireRole allowed={['admin']} area="admin">
              <Suspense fallback={<StaffLoading />}>
                <AdminApp />
              </Suspense>
            </RequireRole>
          }
        />
        <Route
          path="/cashier"
          element={
            <RequireRole allowed={['cashier', 'admin']} area="cashier">
              <Suspense fallback={<StaffLoading />}>
                <CashierApp />
              </Suspense>
            </RequireRole>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

/** Suspense boundary for the diner-facing pages that load on demand. */
function Page({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen grid place-items-center bg-diner-ground text-diner-ink">
          <Loader2 className="animate-spin opacity-50" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

/** Shown for the moment a staff screen is being fetched. */
function StaffLoading() {
  return (
    <div className="min-h-screen grid place-items-center bg-[#0f1410] text-[#e8dfc8]">
      <Loader2 className="animate-spin opacity-60" />
    </div>
  );
}

function RequireRole({
  allowed,
  area,
  children,
}: {
  allowed: UserRole[];
  area: 'admin' | 'cashier';
  children: React.ReactNode;
}) {
  const loading = useAuthStore((s) => s.loading);
  const role = useAuthStore((s) => s.profile?.role);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#0f1410] text-[#e8dfc8]">
        <Loader2 className="animate-spin opacity-60" />
      </div>
    );
  }

  if (!role || !allowed.includes(role)) {
    return <AuthScreen area={area} allowed={allowed} />;
  }

  return <>{children}</>;
}
