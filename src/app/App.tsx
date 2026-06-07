import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { CustomerApp } from './components/CustomerApp';
import { AdminApp } from './components/AdminApp';
import { AuthScreen } from './components/auth/AuthScreen';
import { useAuthStore } from './store/authStore';
import { usePaymentStore } from './store/paymentStore';
import { useKarinderyaStore } from './store/karinderyaStore';

type Screen = 'customer' | 'admin';

export default function App() {
  const [screen, setScreen] = useState<Screen>('customer');

  const initAuth = useAuthStore((s) => s.init);
  const loading = useAuthStore((s) => s.loading);
  const role = useAuthStore((s) => s.profile?.role);
  const loadPayments = usePaymentStore((s) => s.load);
  const loadMenu = useKarinderyaStore((s) => s.loadAll);
  const subscribeMenu = useKarinderyaStore((s) => s.subscribe);

  // Boot: hydrate the session, payment settings, and the menu/inventory (now
  // served from Postgres) — and keep the menu live across devices.
  useEffect(() => {
    initAuth();
    loadPayments();
    loadMenu();
    const unsub = subscribeMenu();
    return unsub;
  }, [initAuth, loadPayments, loadMenu, subscribeMenu]);

  // Ctrl+Shift+A still jumps to the staff area — but it's now gated by login.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setScreen('admin');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const renderAdmin = () => {
    if (loading) {
      return (
        <div className="min-h-screen grid place-items-center bg-[#0f1410] text-[#e8dfc8]">
          <Loader2 className="animate-spin opacity-60" />
        </div>
      );
    }
    if (role === 'admin') {
      return <AdminApp onBack={() => setScreen('customer')} />;
    }
    return <AuthScreen mode="admin" onClose={() => setScreen('customer')} />;
  };

  return (
    <div className="size-full">
      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="size-full"
        >
          {screen === 'customer' && <CustomerApp />}
          {screen === 'admin' && renderAdmin()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
