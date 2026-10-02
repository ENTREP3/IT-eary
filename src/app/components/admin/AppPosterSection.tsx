import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, Printer, QrCode } from 'lucide-react';
import { useBusinessStore } from '../../store/businessStore';
import { humanError } from '../../lib/errors';
import { dinerOrigin } from '../../lib/surface';

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

  /**
   * The poster points at the download page, never at the file.
   *
   * A code encoding the .apk directly starts a download the moment somebody
   * scans a sheet of paper, with no explanation of what they are installing or
   * warning about the security prompt Android is about to show them. Pointing
   * it at the release host instead shows a customer a page of version tags
   * belonging to a system they have no reason to know exists.
   *
   * It is also the only address that gets printed. The file behind it can move
   * between releases or hosts without every poster on the wall becoming wrong,
   * which is the thing nobody remembers to reprint.
   */
  const posterTarget = `${dinerOrigin()}/download`;

  useEffect(() => {
    const target = posterTarget;
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
  }, [posterTarget]);

  const commit = async () => {
    setSaving(true);
    setError(null);
    try {
      await save({ app_download_url: url.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(humanError(e, 'Could not save that.'));
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

      <p className="text-[12px] opacity-55 mb-4 max-w-lg leading-relaxed">
        The code points at <code className="opacity-80">{posterTarget}</code>, a page that
        explains the install before it starts and warns about Android&rsquo;s security prompt.
        That address never changes, so a printed poster stays correct forever.
      </p>

      <label className="block mb-3 max-w-lg">
        <span className="text-[11px] opacity-55">
          Link to the app file, used by the Download button on that page
        </span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/your-name/bencris-app/releases/latest/download/bencris.apk"
          className={`${field} mt-1`}
        />
        <span className="block mt-1 text-[11px] opacity-45 leading-relaxed">
          Use a <strong>latest</strong> link rather than one naming a version, so new releases
          are picked up without changing anything here.
        </span>
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

      <StaffCodes />
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

/**
 * Codes for the two staff apps.
 *
 * Not for the wall. These are scanned off this screen by the person who is
 * about to use the till or the dashboard, which is why they sit here rather
 * than on the customer poster — and why each is labelled, since the two APKs
 * install side by side and look alike on a home screen.
 */
function StaffCodes() {
  const profile = useBusinessStore((s) => s.profile);
  const save = useBusinessStore((s) => s.save);

  const [counter, setCounter] = useState(profile.counter_app_url);
  const [owner, setOwner] = useState(profile.owner_app_url);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setCounter(profile.counter_app_url), [profile.counter_app_url]);
  useEffect(() => setOwner(profile.owner_app_url), [profile.owner_app_url]);

  const commit = async () => {
    setSaving(true);
    setError(null);
    try {
      await save({ counter_app_url: counter.trim(), owner_app_url: owner.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(humanError(e, 'Could not save those.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-8 pt-6 border-t border-[#e8dfc8]/10 print:hidden">
      <div className="flex items-center gap-2 mb-1">
        <QrCode size={16} className="text-[#e8a84a]" />
        <h3 className="text-sm font-medium">Codes for staff phones</h3>
      </div>
      <p className="text-[12px] opacity-55 mb-4 max-w-lg leading-relaxed">
        The counter and owner apps install alongside the customer one, each with
        its own icon. Have the person scan their own code from this screen.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 max-w-lg mb-3">
        <label className="block">
          <span className="text-[11px] opacity-55">Cashier app file</span>
          <input
            value={counter}
            onChange={(e) => setCounter(e.target.value)}
            placeholder=".../releases/latest/download/bencris-counter.apk"
            className={`${field} mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-[11px] opacity-55">Owner app file</span>
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder=".../releases/latest/download/bencris-owner.apk"
            className={`${field} mt-1`}
          />
        </label>
      </div>

      <button
        onClick={commit}
        disabled={saving}
        className="h-9 px-4 rounded-lg text-sm font-medium bg-[#e8a84a] text-[#0a0d0a] disabled:opacity-60 inline-flex items-center gap-2 mb-5"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saved ? 'Saved' : 'Save staff addresses'}
      </button>

      {error && (
        <div className="text-sm rounded-lg px-3 py-2 mb-4 bg-[#c8442a]/20 text-[#e87a5c]">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
        <StaffCode app="counter" label="Cashier" tint="#1e6f8e" ready={!!counter.trim()} />
        <StaffCode app="owner" label="Owner" tint="#e8a84a" ready={!!owner.trim()} />
      </div>
    </div>
  );
}

/** One labelled code, pointing at the staff download page for that app. */
function StaffCode({
  app,
  label,
  tint,
  ready,
}: {
  app: 'counter' | 'owner';
  label: string;
  tint: string;
  ready: boolean;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const target = `${dinerOrigin()}/download?app=${app}`;

  useEffect(() => {
    let stale = false;
    QRCode.toString(target, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'H',
      color: { dark: '#1a1410', light: '#ffffff' },
    })
      .then((out) => !stale && setSvg(out))
      .catch(() => !stale && setSvg(null));
    return () => {
      stale = true;
    };
  }, [target]);

  return (
    <div className="rounded-xl border border-[#e8dfc8]/12 p-4 text-center">
      <div
        className="text-[10px] tracking-[0.25em] uppercase mb-3 font-medium"
        style={{ color: tint }}
      >
        {label}
      </div>

      {svg ? (
        <div
          className="mx-auto w-[128px] h-[128px] bg-white rounded-lg p-1.5 [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="mx-auto w-[128px] h-[128px] rounded-lg bg-[#e8dfc8]/5" />
      )}

      <p className="text-[11px] opacity-45 mt-3 leading-relaxed">
        {ready
          ? 'Scan with the staff phone.'
          : 'Add the address above first, or the page will have nothing to install.'}
      </p>
    </div>
  );
}