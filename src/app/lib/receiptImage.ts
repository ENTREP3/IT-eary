import type { Order } from './types';

/**
 * Draws a receipt as a picture.
 *
 * Downloading used to hand over a .txt file, on the reasoning that a receipt is
 * read, kept and occasionally forwarded, and plain text does all three without
 * a library. That was wrong about the forwarding, which is most of what happens
 * to one: it goes to a housemate or a group chat, and a text file in a chat is
 * an attachment nobody opens, while a picture is simply there.
 *
 * Drawn onto a canvas rather than screenshotted from the page. Screenshotting
 * needs a library whose whole job is re-implementing CSS, and it would capture
 * whatever the layout happened to be at that width — including the dialog's
 * buttons. This draws the record itself, at a fixed size, identically on every
 * screen.
 *
 * ---------------------------------------------------------------------------
 * The address is part of the picture
 *
 * It is printed at the foot of the receipt rather than left to the share sheet
 * to carry. Android drops the text of a share when a file is attached, and most
 * desktop browsers have no share sheet at all — so a link passed alongside the
 * image arrives perhaps half the time, which is the same as not having one. On
 * the picture it cannot be separated from the thing being shared.
 */

/** Logical width of the paper. Doubled when rasterised, for a crisp result. */
const W = 420;
const PAD = 32;
const SCALE = 2;

const INK = '#1a1410';
const MUTED = 'rgba(26, 20, 16, 0.5)';
const FAINT = 'rgba(26, 20, 16, 0.38)';
const PAPER = '#ffffff';

const FONT = (size: number, weight = 400) =>
  `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

const peso = (n: number) => `₱${Number(n ?? 0).toFixed(2)}`;

type Shop = { name?: string | null };

/**
 * How the payment reads.
 *
 * An unpaid ticket saying only "Cash" reads as though the money has already
 * changed hands. The phone's receipt has always said so out loud, and this is
 * the same rule: name the method, then say if it has not been settled.
 */
function paymentLabel(order: Order): string {
  const method = order.payment_method === 'gcash' ? 'GCash' : 'Cash';
  return order.paid_at ? method : `${method} (UNPAID)`;
}

/**
 * Measures and draws in one pass.
 *
 * The height is not known until the items have been laid out, and a canvas is
 * cleared when it is resized — so the same drawing runs twice: once against a
 * throwaway context to find the height, then again for real. Keeping it as one
 * function is what stops the two from drifting apart, which is the bug that
 * would otherwise show up as a receipt with its last line cut off.
 *
 * `y` is always the baseline of the line last drawn, and every step moves it
 * down by a stated amount. Tracking the baseline rather than the top is what
 * keeps the first line from being clipped by the edge of the paper.
 */
function render(
  ctx: CanvasRenderingContext2D,
  order: Order,
  shop: Shop,
  link: string,
): number {
  let y = 0;

  const draw = (
    text: string,
    font: string,
    colour: string,
    align: CanvasTextAlign,
    x: number,
    spacing = '0px',
  ) => {
    ctx.font = font;
    ctx.fillStyle = colour;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    // Chromium only; elsewhere the text sits at its natural spacing, which is
    // not worth refusing to draw a receipt over.
    try {
      ctx.letterSpacing = spacing;
    } catch {
      /* unsupported */
    }
    ctx.fillText(text, x, y);
    try {
      ctx.letterSpacing = '0px';
    } catch {
      /* unsupported */
    }
  };

  /** Label on the left, value on the right, sharing a baseline. */
  const row = (label: string, value: string, gap = 21) => {
    y += gap;
    draw(label, FONT(13), MUTED, 'left', PAD);
    draw(value, FONT(13, 600), INK, 'right', W - PAD);
  };

  const rule = (gap = 18) => {
    y += gap;
    ctx.strokeStyle = 'rgba(26, 20, 16, 0.22)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    // Half a pixel down, so a 1px line lands on one row of pixels instead of
    // straddling two and coming out grey.
    ctx.moveTo(PAD, y + 0.5);
    ctx.lineTo(W - PAD, y + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // ---- heading ------------------------------------------------------------
  y = PAD + 19;
  draw(`${shop.name || 'Bencris'} Karinderya`, FONT(20, 800), INK, 'center', W / 2);

  y += 15;
  draw('OFFICIAL RECEIPT', FONT(9, 600), FAINT, 'center', W / 2, '2.4px');

  // ---- the ticket ---------------------------------------------------------
  y += 10;
  row('Ticket', order.ticket_code);
  row('Date', new Date(order.paid_at ?? order.created_at).toLocaleString());
  if (order.customer_name) row('Name', order.customer_name);
  row('Payment', paymentLabel(order));

  rule();

  // ---- what was ordered ---------------------------------------------------
  for (const item of order.items ?? []) {
    y += 24;
    draw(`${item.qty} × ${item.name ?? ''}`, FONT(13.5), INK, 'left', PAD);
    draw(peso(Number(item.price) * item.qty), FONT(13.5, 600), INK, 'right', W - PAD);
    y += 14;
    draw(`${peso(Number(item.price))} each`, FONT(11), FAINT, 'left', PAD);
  }

  rule(22);

  // Only when there was one. A subtotal line identical to the total is noise
  // on something read in a few seconds.
  if (order.discount > 0) {
    row('Subtotal', peso(order.subtotal || order.total));
    row(
      order.promo_code ? `Discount (${order.promo_code})` : 'Discount',
      `−${peso(order.discount)}`,
    );
  }

  // ---- the total ----------------------------------------------------------
  // Both parts share one baseline, so the word and the figure line up along
  // their feet rather than floating at different heights.
  y += 38;
  draw('TOTAL', FONT(11, 600), INK, 'left', PAD, '2.4px');
  draw(peso(order.total), FONT(27, 800), INK, 'right', W - PAD);

  if (order.served_by_name) row('Served by', order.served_by_name, 26);

  // ---- the foot -----------------------------------------------------------
  y += 30;
  draw('Salamat po!', FONT(12.5), MUTED, 'center', W / 2);

  if (link) {
    y += 17;
    draw(`Order again at ${link}`, FONT(10.5), FAINT, 'center', W / 2);
  }

  return y + PAD;
}

/** The domain on its own. A receipt is read, not clicked. */
function readableLink(link: string): string {
  if (!link) return '';
  try {
    return new URL(link).host;
  } catch {
    return link.replace(/^https?:\/\//, '');
  }
}

/** The receipt as a PNG blob, at twice its logical size. */
export async function receiptPng(order: Order, shop: Shop, link = ''): Promise<Blob> {
  const foot = readableLink(link);

  // A first pass purely to find out how tall the paper needs to be.
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('This browser cannot draw the receipt.');
  const height = Math.ceil(render(probe, order, shop, foot));

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = height * SCALE;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the receipt.');
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, height);

  render(ctx, order, shop, foot);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not save the receipt.'))),
      'image/png',
    ),
  );
}

/**
 * Hands a blob to the browser as a download.
 *
 * The object URL is released on a timer rather than on the line after the
 * click. Revoking it immediately is a documented way to produce a truncated
 * file: the click only *schedules* the download, and pulling the URL out from
 * under it can leave a partial PNG on disk that an image viewer then refuses as
 * corrupt. It went unnoticed with text receipts because they were small enough
 * to be read before the revoke landed.
 */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  // Some browsers ignore a click on an anchor that is not in the document.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
