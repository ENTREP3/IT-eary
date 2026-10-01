import type { Order } from './types';

/**
 * Draws a receipt as a picture.
 *
 * Downloading used to hand over a .txt file, on the reasoning that a receipt is
 * read, kept and forwarded, and plain text does all three without a library.
 * That was wrong about what people do with one. A receipt gets sent to somebody
 * — a housemate, a group chat, whoever is being paid back — and a text file in
 * a chat is an attachment nobody opens, while a picture is just there in the
 * conversation. It is also what a receipt looks like, which is most of why it
 * reads as proof of anything.
 *
 * Drawn onto a canvas rather than screenshotted from the page. Screenshotting
 * needs a library whose whole job is re-implementing CSS, and it would capture
 * whatever the layout happened to be at that width — including the dialog's
 * buttons. This draws the record itself, at a fixed size, identically on every
 * screen.
 */

/** Logical width of the paper. Doubled when rasterised, for a crisp result. */
const W = 420;
const PAD = 28;
const SCALE = 2;

const INK = '#1a1410';
const MUTED = 'rgba(26, 20, 16, 0.55)';
const PAPER = '#ffffff';

const FONT = (size: number, weight = 400) =>
  `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

const peso = (n: number) => `₱${Number(n ?? 0).toFixed(2)}`;

type Shop = { name?: string | null };

/**
 * Measures and draws in one pass.
 *
 * The height is not known until the items have been laid out, and a canvas is
 * cleared when it is resized — so the same drawing runs twice: once against a
 * throwaway context to find the height, then again for real. Keeping it as one
 * function is what stops the two from drifting apart, which is the bug that
 * would otherwise appear as a receipt with its last line cut off.
 */
function render(ctx: CanvasRenderingContext2D, order: Order, shop: Shop): number {
  let y = PAD;

  const line = (text: string, font: string, colour: string, align: CanvasTextAlign, x: number) => {
    ctx.font = font;
    ctx.fillStyle = colour;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  };

  /** Label on the left, value on the right, sharing a baseline. */
  const row = (label: string, value: string, bold = false) => {
    y += 18;
    line(label, FONT(13), MUTED, 'left', PAD);
    line(value, FONT(13, bold ? 700 : 500), INK, 'right', W - PAD);
  };

  const rule = () => {
    y += 18;
    ctx.strokeStyle = 'rgba(26, 20, 16, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // Heading
  y += 10;
  line(`${shop.name || 'Bencris'} Karinderya`, FONT(19, 800), INK, 'center', W / 2);

  y += 10;
  row('Ticket', order.ticket_code);
  row('Date', new Date(order.paid_at ?? order.created_at).toLocaleString());
  if (order.customer_name) row('Name', order.customer_name);
  row('Payment', order.payment_method === 'gcash' ? 'GCash' : 'Cash');

  rule();

  for (const item of order.items ?? []) {
    y += 22;
    line(`${item.qty} × ${item.name ?? ''}`, FONT(13), INK, 'left', PAD);
    line(peso(Number(item.price) * item.qty), FONT(13), INK, 'right', W - PAD);
    y += 14;
    line(`${peso(Number(item.price))} each`, FONT(11), 'rgba(26, 20, 16, 0.5)', 'left', PAD);
  }

  rule();

  // Only when there was one, exactly as the screen decides it.
  if (order.discount > 0) {
    row('Subtotal', peso(order.subtotal || order.total));
    row(
      order.promo_code ? `Discount (${order.promo_code})` : 'Discount',
      `−${peso(order.discount)}`,
    );
    y += 4;
  }

  y += 30;
  line('TOTAL', FONT(11, 600), INK, 'left', PAD);
  line(peso(order.total), FONT(26, 800), INK, 'right', W - PAD);

  if (order.served_by_name) row('Served by', order.served_by_name);

  y += 28;
  line('Salamat po!', FONT(12), 'rgba(26, 20, 16, 0.45)', 'center', W / 2);

  return y + PAD;
}

/** The receipt as a PNG blob, at twice its logical size. */
export async function receiptPng(order: Order, shop: Shop): Promise<Blob> {
  // A first pass purely to find out how tall the paper needs to be.
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('This browser cannot draw the receipt.');
  const height = render(probe, order, shop);

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = height * SCALE;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the receipt.');
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, height);

  render(ctx, order, shop);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not save the receipt.'))),
      'image/png',
    ),
  );
}
