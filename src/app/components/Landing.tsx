import React from 'react';
import { motion } from 'motion/react';
import { ShoppingBag, ArrowUpRight } from 'lucide-react';

export function Landing({ onPick }: { onPick: (r: 'customer') => void }) {
  return (
    <div className="min-h-screen w-full bg-[#f4ead5] text-[#2a1810] relative overflow-hidden">
      {/* grain + warm glow */}
      <div
        className="absolute inset-0 opacity-[0.08] pointer-events-none mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
      <div className="absolute -top-40 -right-40 w-[620px] h-[620px] rounded-full bg-[#c8442a]/25 blur-[120px]" />
      <div className="absolute -bottom-40 -left-20 w-[520px] h-[520px] rounded-full bg-[#3a5a3a]/20 blur-[100px]" />

      {/* top bar */}
      <header className="relative z-10 flex items-center justify-between px-8 md:px-14 py-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#2a1810] text-[#f4ead5] grid place-items-center" style={{ fontFamily: 'var(--font-display)' }}>
            <span style={{ fontStyle: 'italic', fontWeight: 700 }}>k</span>
          </div>
          <div className="leading-tight">
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.01em' }}>K-MARY FoodTech</div>
            <div className="text-xs opacity-60 tracking-[0.2em] uppercase">est. 2026 · Karinderya OS</div>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm opacity-70">
          <span>v1.0 · IT-eary</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#3a5a3a]" />
          <span>Quezon City</span>
        </div>
      </header>

      {/* hero */}
      <main className="relative z-10 px-8 md:px-14 pt-10 pb-24 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-12 gap-8 items-end mb-16">
          <div className="md:col-span-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#2a1810] text-[#f4ead5] text-xs tracking-[0.25em] uppercase mb-8"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#e8a84a] animate-pulse" />
              Serving — Open til 9PM
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.1 }}
              style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 0.92 }}
              className="text-[clamp(3.5rem,9vw,8rem)]"
            >
              IT<span style={{ fontStyle: 'italic', color: '#c8442a' }}>-eary</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.9, delay: 0.35 }}
              className="mt-6 max-w-xl opacity-75 leading-relaxed"
            >
              A digital companion for the neighborhood karinderya. A living menu on one side,
              a clear-eyed back-office on the other. Less guessing, more serving.
            </motion.p>
          </div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.4 }}
            className="md:col-span-4 border-l-2 border-[#2a1810]/20 pl-6 space-y-4"
          >
            {[
              ['₱ 46,920', 'This week'],
              ['312', 'Orders served'],
              ['2', 'Items low-stock'],
            ].map(([v, l]) => (
              <div key={l} className="flex items-baseline justify-between">
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-3xl">{v}</span>
                <span className="text-xs uppercase tracking-[0.2em] opacity-60">{l}</span>
              </div>
            ))}
          </motion.div>
        </div>

        <div className="max-w-2xl">
          <RoleCard
            onClick={() => onPick('customer')}
            accent="#c8442a"
            tag="For Diners"
            title="Tumingin sa Menu"
            sub="Browse what's cooking today. Order. Pay with GCash. Done."
            icon={<ShoppingBag size={22} />}
            delay={0.5}
          />
        </div>
      </main>

      <footer className="relative z-10 border-t border-[#2a1810]/15 px-8 md:px-14 py-5 flex items-center justify-between text-xs opacity-60">
        <span>© K-MARY FoodTech · Kain na, tayo na.</span>
        <span>Thu · Apr 23 · 2026</span>
      </footer>
    </div>
  );
}

function RoleCard({
  onClick, accent, tag, title, sub, icon, delay,
}: {
  onClick: () => void; accent: string; tag: string; title: string; sub: string; icon: React.ReactNode; delay: number;
}) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay }}
      whileHover={{ y: -4 }}
      className="group text-left relative overflow-hidden rounded-3xl border border-[#2a1810]/15 bg-[#fbf4e3] p-8 md:p-10 transition-colors"
      style={{ boxShadow: '0 1px 0 rgba(42,24,16,0.05)' }}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `radial-gradient(circle at 80% 20%, ${accent}22, transparent 60%)` }}
      />
      <div className="relative flex items-start justify-between">
        <span className="text-xs tracking-[0.25em] uppercase opacity-60">{tag}</span>
        <ArrowUpRight size={20} className="opacity-40 group-hover:opacity-100 group-hover:-translate-y-1 group-hover:translate-x-1 transition-all" />
      </div>
      <div className="relative mt-20 flex items-end justify-between gap-4">
        <div>
          <div
            className="inline-flex w-11 h-11 rounded-full items-center justify-center mb-4"
            style={{ background: accent, color: '#fbf4e3' }}
          >
            {icon}
          </div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-4xl md:text-5xl leading-[0.95]">
            {title}
          </h3>
          <p className="mt-3 opacity-70 text-sm max-w-sm">{sub}</p>
        </div>
      </div>
    </motion.button>
  );
}
