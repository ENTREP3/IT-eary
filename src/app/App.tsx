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
import { AccountPage } from './components/site/AccountPage';
import {
  AboutPage,
  ContactPage,
  FaqPage,
  PrivacyPage,
  RefundPage,
} from './components/site/InfoPages';
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
        <Route path="/about" element={<AboutPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/refund" element={<RefundPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/account" element={<AccountPage />} />
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
