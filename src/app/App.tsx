import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { Loader2 } from 'lucide-react';
import { AdminApp } from './components/AdminApp';
import { CashierApp } from './components/CashierApp';
import { StorefrontApp } from './components/diner/StorefrontApp';
import { AuthScreen } from './components/auth/AuthScreen';
import { useAuthStore } from './store/authStore';
import { usePaymentStore } from './store/paymentStore';
import { useKarinderyaStore } from './store/karinderyaStore';
import type { UserRole } from './lib/types';

/**
 * All three audiences on the web, mirroring the Flutter apps:
 *   /          diner storefront — no account
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

  useEffect(() => {
    initAuth();
    loadPayments();
    loadMenu();
    return subscribeMenu();
  }, [initAuth, loadPayments, loadMenu, subscribeMenu]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StorefrontApp />} />
        <Route
          path="/admin"
          element={
            <RequireRole allowed={['admin']} area="admin">
              <AdminApp />
            </RequireRole>
          }
        />
        <Route
          path="/cashier"
          element={
            <RequireRole allowed={['cashier', 'admin']} area="cashier">
              <CashierApp />
            </RequireRole>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
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
