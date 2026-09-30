import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Apple, Download, Share, Smartphone } from 'lucide-react';
import { useBusinessStore } from '../../store/businessStore';

/**
 * Where the printed QR code sends somebody.
 *
 * The code on the shop wall used to point straight at the file, which meant a
 * customer's first contact with Bencris was a download starting by itself, or
 * — once releases moved to GitHub — a page of source code and version tags
 * belonging to a system they have no reason to know exists.
 *
 * This is a page the shop owns, on the shop's own address. It explains what
 * the thing is before asking anybody to install it, and it is the only address
 * that ever needs printing: the file behind the button can move between
 * releases, or hosts, without the poster on the wall becoming wrong.
 *
 * ---------------------------------------------------------------------------
 * The warning is named before it appears
 *
 * Android interrupts every install from outside the Play Store with a security
 * warning. Somebody who meets that unprepared, having just scanned a code taped
 * to a wall in a canteen, stops — and they are right to. Saying it will happen,
 * and that it happens to every app installed this way, is the difference
 * between a cautious person continuing and a cautious person deleting the file.
 *
 * ---------------------------------------------------------------------------
 * iPhone is not an apology
 *
 * There is no iOS app and there is not going to be one — a developer account
 * costs more per year than this shop would spend on the whole system. But the
 * website already works on an iPhone and can be added to the home screen,
 * where it opens without browser furniture and is very hard to tell from an
 * app. That is worth presenting as the iPhone answer rather than as the thing
 * we could not do.
 */
export function DownloadPage() {
  const profile = useBusinessStore((s) => s.profile);
  const [qr, setQr] = useState<string | null>(null);

  /** The page itself, so somebody on a laptop can move to their phone. */
  const pageUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/download`;

  useEffect(() => {
    if (!pageUrl) return;
    let stale = false;
    QRCode.toString(pageUrl, {
      type: 'svg',
      margin: 1,
      // Read off a screen at an angle, or off a printed sheet that has picked
      // up a smudge. The highest correction level still scans with roughly a
      // third of the code obscured.
      errorCorrectionLevel: 'H',
      color: { dark: '#1a1410', light: '#00000000' },
    })
      .then((svg) => {
        if (!stale) setQr(svg);
      })
      .catch(() => {
        if (!stale) setQr(null);
      });
    return () => {
      stale = true;
    };
  }, [pageUrl]);

  /**
   * Where the file lives, kept in the shop's settings rather than in here.
   *
   * It changes when releases move; the owner can point it somewhere else from
   * the dashboard without waiting for a deploy.
   */
  const apk = profile.app_download_url?.trim();

  return (
    <div className="min-h-screen bg-diner-ground text-diner-ink">
      <main className="mx-auto w-full max-w-md px-5 py-12">
        <header className="text-center">
          <h1
            style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.02em' }}
            className="text-3xl"
          >
            Get {profile.name || 'Bencris'}
          </h1>
          <p className="mt-1.5 text-sm opacity-60">
            Order ahead and watch your food being made.
          </p>
        </header>

        {/* ------------------------------------------------------- Android */}
        <section className="mt-8 rounded-3xl border border-diner-ink/12 bg-diner-card p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Smartphone size={18} className="text-diner-accent" />
            Android
          </h2>
          <p className="mt-1 text-sm opacity-60">Install the app.</p>

          {qr && (
            <div
              className="mt-5 mx-auto w-44 h-44 grid place-items-center rounded-2xl bg-white p-3"
              /* The QR is generated in the browser from the shop's own address,
                 so no third-party QR service sits between a customer and the
                 download — nothing to pay for and nothing to expire. */
              dangerouslySetInnerHTML={{ __html: qr }}
            />
          )}
          <p className="mt-3 text-center text-xs opacity-50 leading-relaxed">
            Scan with your phone&rsquo;s camera, or tap the button below.
          </p>

          {apk ? (
            <a
              href={apk}
              className="mt-4 flex items-center justify-center gap-2 h-12 rounded-full bg-diner-ink text-diner-ground font-medium"
            >
              <Download size={17} />
              Download {profile.name || 'Bencris'} (.apk)
            </a>
          ) : (
            // Said plainly rather than showing a button that goes nowhere.
            <p className="mt-4 rounded-xl border border-diner-ink/15 px-4 py-3 text-sm opacity-65 leading-relaxed">
              The app is not ready to download yet. You can order from this
              website in the meantime — it does everything the app does.
            </p>
          )}

          <h3 className="mt-7 font-semibold text-sm">Installing</h3>
          <ol className="mt-2 space-y-2.5 text-sm opacity-75 leading-relaxed list-decimal pl-5">
            <li>Tap <strong>Download</strong> above and wait for the file to finish.</li>
            <li>
              Open the downloaded <code className="text-xs bg-diner-ink/8 px-1 py-0.5 rounded">bencris.apk</code>{' '}
              from your notifications or Files app.
            </li>
            <li>
              Android will warn that the app is from an unknown source. Choose{' '}
              <strong>Settings</strong>, turn on <strong>Allow from this source</strong>, then go
              back and tap <strong>Install</strong>.
            </li>
            <li>Open {profile.name || 'Bencris'} and start ordering. No account needed.</li>
          </ol>

          {/* The reassurance is the point of this box. Somebody who has just
              been shown a security warning needs to know it is expected. */}
          <p className="mt-4 rounded-xl border border-diner-accent/30 bg-diner-accent/5 px-4 py-3 text-xs leading-relaxed text-diner-accent">
            That warning is normal. It appears for every app installed outside the Play Store and
            does not mean anything is wrong with the file.
          </p>
        </section>

        <div className="my-7 flex items-center gap-3 text-xs uppercase tracking-[0.25em] opacity-35">
          <span className="flex-1 h-px bg-diner-ink/15" />
          or
          <span className="flex-1 h-px bg-diner-ink/15" />
        </div>

        {/* -------------------------------------------------------- iPhone */}
        <section className="rounded-3xl border border-diner-ink/12 bg-diner-card p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Apple size={18} className="text-diner-accent" />
            iPhone &amp; iPad
          </h2>
          <p className="mt-1 text-sm opacity-60 leading-relaxed">
            No installing. {profile.name || 'Bencris'} runs in Safari, and you can add it to your
            Home Screen so it opens like an app.
          </p>

          <ol className="mt-4 space-y-2.5 text-sm opacity-75 leading-relaxed list-decimal pl-5">
            <li>Open this website in <strong>Safari</strong>.</li>
            <li>
              Tap the <Share size={13} className="inline -mt-0.5" /> <strong>Share</strong> button
              at the bottom of the screen.
            </li>
            <li>Scroll down and choose <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong>. It will sit beside your other apps.</li>
          </ol>

          <a
            href="/menu"
            className="mt-5 flex items-center justify-center h-12 rounded-full border border-diner-ink/25 font-medium"
          >
            Open the menu
          </a>
        </section>

        <p className="mt-8 text-center text-xs opacity-45 leading-relaxed">
          {[profile.address_line, profile.district, profile.city]
            .filter((part) => part && !part.includes('['))
            .join(', ')}
        </p>
      </main>
    </div>
  );
}
