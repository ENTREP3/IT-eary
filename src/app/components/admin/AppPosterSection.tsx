import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { Loader2, Printer, QrCode } from 'lucide-react';
import { useBusinessStore } from '../../store/businessStore';
import { humanError } from '../../lib/errors';
import { dinerOrigin } from '../../lib/surface';
import { displayPhoto } from '../../lib/photos';
import { useKarinderyaStore } from '../../store/karinderyaStore';

/**
 * The printed poster that gets the app onto a diner's phone.
 */

const field =
  'w-full h-10 rounded-lg border px-3 text-sm outline-none bg-[#0f1410] border-[#e8dfc8]/15 text-[#e8dfc8] placeholder:text-[#e8dfc8]/35 focus:border-[#e8a84a]/60';

export function AppPosterSection() {
  const profile = useBusinessStore((s) => s.profile);
  const dishes = useKarinderyaStore((s) => s.dishes);
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
   */
  const posterTarget = `${dinerOrigin()}/download`;

  /*
   * A dish of the shop's own for the poster.
   *
   * There is no storefront photograph anywhere in the settings — the hero on
   * the website cycles dish pictures — so the best image available is the food,
   * which is also the thing worth putting on a wall. Prefers one that is on the
   * menu today, so the poster is not advertising something sold out.
   */
  // Without the scheme: nobody types https:// off a wall.
  const printedAddress = posterTarget.replace(new RegExp('^https?:\\/\\/'), '');

  const posterPhoto = useMemo(() => {
    const withPhoto = dishes.filter((d) => d.image);
    const live = withPhoto.find((d) => d.available);
    const chosen = live ?? withPhoto[0];
    return chosen ? displayPhoto(chosen.image) : null;
  }, [dishes]);

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

      {svg && (
        <Poster
          svg={svg}
          shopName={profile.name}
          district={profile.district}
          photo={posterPhoto}
          address={printedAddress}
        />
      )}

      <StaffCodes />
    </section>
  );
}

/**
 * The sheet itself, shown on screen at a readable size and printed alone.
 *
 * A photograph carries it. The previous version was a QR code with the shop's
 * name over it, which is a notice rather than a poster — nothing on it made
 * anybody want the food, and a code alone gives a passer-by no reason to lift
 * their phone. The picture is one of the shop's own dishes, so the poster sells
 * what is actually being cooked.
 *
 * The address is printed under the code as well. Somebody who will not scan a
 * square can still type it, and a poster that only works through a camera
 * excludes exactly the customers least likely to have the app already.
 */
function Poster({
  svg,
  shopName,
  district,
  photo,
  address,
}: {
  svg: string;
  shopName: string;
  district: string;
  photo: string | null;
  address: string;
}) {
  return (
    <>
      <style>{`
        @media print {
          @page { size: A5 landscape; margin: 0; }

          /* Hiding the dashboard is not enough: invisible content is still
             laid out, so it kept paginating and the preview offered eight
             sheets with one poster on the first. Taking the app out of the
             flow entirely leaves exactly one page. */
          html, body { height: auto !important; margin: 0 !important; }
          #root { display: none !important; }

          #app-poster {
            display: flex !important;
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }

          /* Printers drop background colour and images by default, which
             would leave the photograph half of this sheet blank. */
          #app-poster, #app-poster * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }

        /* The printable copy lives outside #root and is only ever seen on
           paper. The preview below is the one on screen. */
        #app-poster { display: none; }
      `}</style>

      {/* On screen. */}
      <PosterSheet
        svg={svg}
        shopName={shopName}
        district={district}
        photo={photo}
        address={address}
        className="rounded-xl w-full max-w-[640px] aspect-[1.414/1]"
      />

      {/* On paper. Portalled to <body> so it survives #root being taken out
          of the flow, which is what stops the dashboard paginating behind
          it. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div id="app-poster">
            <PosterSheet
              svg={svg}
              shopName={shopName}
              district={district}
              photo={photo}
              address={address}
              className="w-full h-full"
            />
          </div>,
          document.body,
        )}
    </>
  );
}

/** The sheet itself, drawn the same way on screen and on paper. */
function PosterSheet({
  svg,
  shopName,
  district,
  photo,
  address,
  className = '',
}: {
  svg: string;
  shopName: string;
  district: string;
  photo: string | null;
  address: string;
  className?: string;
}) {
  return (
    <div
      className={`flex overflow-hidden bg-[#f4ead5] text-[#1a1410] ${className}`}
    >
      {/* The food, as big as the sheet allows. */}
      {photo ? (
        <div className="relative w-[46%] shrink-0">
          <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
          {/* Keeps the name legible whatever the photograph is doing. */}
          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/75 to-transparent">
            <div
              style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
              className="text-white text-2xl leading-none"
            >
              {shopName}
            </div>
            {district && (
              <div className="text-white/80 text-[9px] tracking-[0.3em] uppercase mt-1">
                {district}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="w-[46%] shrink-0 bg-[#c8442a] grid place-items-center p-6 text-center">
          <div>
            <div
              style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
              className="text-white text-3xl leading-none"
            >
              {shopName}
            </div>
            {district && (
              <div className="text-white/80 text-[9px] tracking-[0.3em] uppercase mt-2">
                {district}
              </div>
            )}
          </div>
        </div>
      )}

      {/* The code, and everything somebody needs to act on it. */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-5 py-6">
        <div
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
          className="text-xl leading-tight"
        >
          Order from your phone
        </div>
        <p className="text-[11px] opacity-70 leading-relaxed mt-1 max-w-[15rem]">
          See what is cooking today, order ahead, and show your ticket at the
          counter.
        </p>

        <div
          className="mt-3 w-[142px] h-[142px] bg-white rounded-lg p-1.5 [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <div className="mt-2 text-[10px] tracking-[0.18em] uppercase opacity-55">
          Scan to get the app
        </div>

        {/* For the people who will not scan a square. */}
        <div className="mt-2 text-[12px] font-medium tracking-wide">{address}</div>

        <div className="mt-3 text-[10px] opacity-45">Walang account na kailangan.</div>
      </div>
    </div>
  );
}


/**
 * Codes for the two staff apps.
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