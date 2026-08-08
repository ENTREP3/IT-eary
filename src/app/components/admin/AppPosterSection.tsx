import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, Printer, QrCode } from 'lucide-react';
import { useBusinessStore } from '../../store/businessStore';

/**
 * The printed poster that gets the app onto a diner's phone.
 *
 * A karinderya has no app store listing and no advertising budget, but it does
 * have a wall and a menu, and every customer is already standing in front of
 * both while they wait. A code taped there costs one sheet of paper and reaches
 * exactly the people who already eat here.
 *
 * The QR is generated in the browser from the address the owner saved, so no
 * third-party QR service is involved: nothing to pay for, nothing to expire,
 * and no outside site sitting between a customer and the download. Printing is
 * plain window.print() against a print stylesheet, so it works on whatever
 * printer the shop can borrow.
 */

const field =
  'w-full h-10 rounded-lg border px-3 text-sm outline-none bg-[#0f1410] border-[#e8dfc8]/15 text-[#e8dfc8] placeholder:text-[#e8dfc8]/35 focus:border-[#e8a84a]/60';

export function AppPosterSection() {
  const profile = useBusinessStore((s) => s.profile);
  const save = useBusinessStore((s) => s.save);

  const [url, setUrl] = useState(profile.app_download_url);
  const [svg, setSvg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The store starts from a cached profile and is refreshed a moment later, so
  // the saved address can arrive after this section has already rendered.
  useEffect(() => setUrl(profile.app_download_url), [profile.app_download_url]);

  useEffect(() => {
    const target = url.trim();
    if (!target) {
      setSvg(null);
      return;
    }
    let stale = false;
    QRCode.toString(target, {
      type: 'svg',
      margin: 1,
      // Printed codes get scanned in bad light, at an angle, on a wall that may
      // pick up a smudge. The highest correction level still reads with roughly
      // a third of the code obscured.
      errorCorrectionLevel: 'H',
      color: { dark: '#1a1410', light: '#ffffff' },
    })
      .then((out) => {
        if (!stale) setSvg(out);
      })
      .catch(() => {
        if (!stale) setSvg(null);
      });
    return () => {
      stale = true;
    };
  }, [url]);

  const commit = async () => {
    setSaving(true);
    setError(null);
    try {
      await save({ app_download_url: url.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[#e8dfc8]/12 bg-[#0a0d0a] p-5">
      <div className="flex items-center gap-2 mb-1">
        <QrCode size={16} className="text-[#e8a84a]" />
        <h3 className="text-sm font-medium">Poster for the wall</h3>
      </div>
      <p className="text-[12px] opacity-55 mb-4 max-w-lg leading-relaxed">
        Print this and tape it by the counter or on the menu. A diner scans it and
        gets the app, so you are not paying anyone to advertise it.
      </p>

      <label className="block mb-3 max-w-lg">
        <span className="text-[11px] opacity-55">Where the app can be downloaded</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://bencris.example.com/download/"
          className={`${field} mt-1`}
        />
      </label>

      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={commit}
          disabled={saving}
          className="h-9 px-4 rounded-lg text-sm font-medium bg-[#e8a84a] text-[#0a0d0a] disabled:opacity-60 inline-flex items-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {saved ? 'Saved' : 'Save address'}
        </button>
        <button
          onClick={() => window.print()}
          disabled={!svg}
          className="h-9 px-4 rounded-lg text-sm border border-[#e8dfc8]/20 disabled:opacity-40 inline-flex items-center gap-2"
        >
          <Printer size={14} />
          Print poster
        </button>
      </div>

      {error && (
        <div className="text-sm rounded-lg px-3 py-2 mb-4 bg-[#c8442a]/20 text-[#e87a5c]">{error}</div>
      )}

      {!svg && (
        <p className="text-[12px] opacity-45">
          Enter the address first. Until the site is online you can use this
          machine's address on the network, which works for anyone on the same
          wifi.
        </p>
      )}

      {svg && <Poster svg={svg} shopName={profile.name} district={profile.district} />}
    </section>
  );
}

/**
 * The sheet itself, shown on screen at a readable size and printed alone.
 *
 * `print:` utilities hide the rest of the dashboard, so pressing print produces
 * the poster rather than a screenshot of an admin panel with a poster in it.
 */
function Poster({ svg, shopName, district }: { svg: string; shopName: string; district: string }) {
  return (
    <>
      <style>{`
        @media print {
          @page { size: A5 portrait; margin: 12mm; }
          body * { visibility: hidden; }
          #app-poster, #app-poster * { visibility: visible; }
          #app-poster {
            position: absolute; inset: 0; margin: auto;
            border: none !important; box-shadow: none !important;
          }
        }
      `}</style>

      <div
        id="app-poster"
        className="bg-white text-[#1a1410] rounded-xl p-8 max-w-[380px] text-center"
      >
        {/* The name as the owner typed it. An earlier version split it to mimic
            the italic wordmark, which cut "Bencris" in the wrong place and would
            have mangled any name the owner chose instead. */}
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }} className="text-3xl leading-none">
          {shopName}
        </div>
        <div className="text-[10px] tracking-[0.3em] uppercase opacity-50 mt-1 mb-6">{district}</div>

        <div
          className="mx-auto w-[200px] h-[200px] [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <div
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
          className="text-xl mt-6 mb-1"
        >
          Order from your phone
        </div>
        <p className="text-[13px] opacity-65 leading-relaxed">
          Scan to get the app. See what is cooking today, order ahead, and show
          your ticket at the counter.
        </p>
        <p className="text-[11px] opacity-40 mt-4">Walang account na kailangan.</p>
      </div>
    </>
  );
}
