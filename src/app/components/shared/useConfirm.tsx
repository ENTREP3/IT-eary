import React, { createContext, useCallback, useContext, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

/**
 * One "are you sure?" for the whole system.
 *
 * Most destructive actions here used to fire the instant they were tapped:
 * cancelling a diner's order, revoking a staff login, deleting a promo code,
 * removing an ingredient from a recipe. None of them can be undone, and all sit
 * next to buttons pressed all day on a phone at a busy counter.
 *
 * Provided through context rather than mounted per screen, so a component only
 * asks for `confirm` and never has to remember to render a dialog. Forgetting
 * that would be silent: `confirm` would fall through to window.confirm, which
 * takes a string, so the message would read "[object Object]" and the action
 * would never run.
 *
 *   const confirm = useConfirm();
 *   <button onClick={() => confirm({
 *     title: 'Cancel this order?',
 *     body: 'The diner will see it as cancelled. This cannot be undone.',
 *     action: 'Cancel order',
 *     danger: true,
 *     onConfirm: () => setStatus(code, 'cancelled'),
 *   })}>…</button>
 *
 * Deliberately NOT used for ordinary saves. Adding an ingredient already means
 * opening a dialog and pressing Save; a second confirmation on top is how staff
 * learn to dismiss dialogs without reading them, which is exactly what makes the
 * one that matters useless.
 */

export type Ask = {
  title: string;
  /** What actually happens, in plain words. Say the consequence, not the verb. */
  body?: string;
  /** Label on the confirming button. "Delete", not "OK". */
  action?: string;
  /** Red button, for anything that destroys or cannot be reversed. */
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
};

const ConfirmContext = createContext<(ask: Ask) => void>(() => {
  // Reaching this means a screen asked to confirm something while sitting
  // outside the provider. Silently doing nothing would look like a dead button,
  // so say so where a developer will see it.
  console.error('[confirm] useConfirm() used outside <ConfirmProvider>. Nothing was shown.');
});

export function useConfirm() {
  return useContext(ConfirmContext);
}

/**
 * Which of the two palettes the dialog should wear.
 *
 * The staff screens are near-black with cream text; the customer site is cream
 * with dark text. The dialog was written for the first and hardcoded to it, so
 * mounting it on the customer site dropped a black box onto a cream page.
 */
type Tone = 'staff' | 'diner';

const SKIN: Record<Tone, { content: string; body: string; cancel: string }> = {
  staff: {
    content: 'bg-[#0a0d0a] border-[#e8dfc8]/15 text-[#e8dfc8]',
    body: 'text-[#e8dfc8]/60',
    cancel: 'bg-transparent border-[#e8dfc8]/20 text-[#e8dfc8] hover:bg-[#e8dfc8]/10',
  },
  diner: {
    content: 'bg-[#fbf4e3] border-[#2a1810]/15 text-[#2a1810]',
    body: 'text-[#2a1810]/65',
    cancel: 'bg-transparent border-[#2a1810]/20 text-[#2a1810] hover:bg-[#2a1810]/10',
  },
};

export function ConfirmProvider({
  children,
  tone = 'staff',
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  const skin = SKIN[tone];
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = useCallback((next: Ask) => setAsk(next), []);

  const run = async () => {
    if (!ask) return;
    setBusy(true);
    try {
      await ask.onConfirm();
    } finally {
      // Closed even when the action throws. Leaving the dialog open on failure
      // reads as a frozen button, and the screen underneath reports the error.
      setBusy(false);
      setAsk(null);
    }
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={!!ask} onOpenChange={(open) => !open && !busy && setAsk(null)}>
        <AlertDialogContent className={skin.content}>
          <AlertDialogHeader>
            <AlertDialogTitle>{ask?.title}</AlertDialogTitle>
            {ask?.body && (
              <AlertDialogDescription className={skin.body}>
                {ask.body}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={skin.cancel}>
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // The dialog closes itself on click; closing before the write
                // finishes would unmount the busy state mid-flight.
                e.preventDefault();
                run();
              }}
              disabled={busy}
              className={
                ask?.danger
                  ? 'bg-[#c8442a] text-white hover:bg-[#c8442a]/85'
                  : 'bg-[#e8a84a] text-[#0a0d0a] hover:bg-[#e8a84a]/85'
              }
            >
              {busy ? 'Working…' : (ask?.action ?? 'Yes, do it')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
