import React from 'react';
import { QrCode } from 'lucide-react';
import { usePaymentStore } from '../../store/paymentStore';
import type { Order } from '../../lib/types';

/**
 * The half of the till screen the customer is meant to look at.
 */
export function ShowToCustomer({
  order,
  method,
}: {
  order: Order;
  /** What they have said they will pay with, which may differ from the ticket. */
  method?: Order['payment_method'] | null;
}) {
  const settings = usePaymentStore((s) => s.settings);
  if (order.paid_at) return null;

  const gcash = (method ?? order.payment_method) === 'gcash';

  return (
    <div className="mt-4 rounded-2xl border border-[#e8a84a]/35 bg-[#e8a84a]/5 p-4">
      <div className="text-[10px] tracking-[0.25em] uppercase text-[#e8a84a] mb-3">
        Turn the screen around
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <div>
          <div className="text-[11px] opacity-55 mb-1">Ticket</div>
          <div
            style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
            className="text-4xl tracking-[0.15em] leading-none"
          >
            {order.ticket_code}
          </div>
          <div className="text-[11px] opacity-55 mt-2 max-w-[16rem] leading-relaxed">
            Ask them to photograph this. It is how they collect the order, and
            there is no copy on their phone.
          </div>
        </div>

        {gcash && (
          <div className="flex items-center gap-4">
            {settings?.gcash_qr_url ? (
              <img
                src={settings.gcash_qr_url}
                alt="The shop's GCash QR code"
                className="w-32 h-32 rounded-xl bg-white object-contain p-1.5"
              />
            ) : (
              <div className="w-32 h-32 rounded-xl border border-dashed border-[#e8dfc8]/20 grid place-items-center text-center px-2">
                <span className="text-[10px] opacity-45 leading-relaxed">
                  <QrCode size={16} className="mx-auto mb-1 opacity-60" />
                  No QR uploaded yet
                </span>
              </div>
            )}

            <div className="text-sm">
              <div className="text-[11px] opacity-55">Send exactly</div>
              <div
                style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                className="text-2xl tabular-nums"
              >
                ₱{Number(order.total).toFixed(2)}
              </div>
              {settings?.gcash_name && (
                <div className="mt-1.5 text-[12px] opacity-70">{settings.gcash_name}</div>
              )}
              {settings?.gcash_number && (
                <div className="text-[12px] opacity-70 tabular-nums">{settings.gcash_number}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
