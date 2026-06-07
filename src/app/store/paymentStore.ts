import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { PaymentSettings } from '../lib/types';

type PaymentState = {
  settings: PaymentSettings | null;
  loading: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Omit<PaymentSettings, 'id' | 'updated_at'>>) => Promise<void>;
  /** Uploads a QR image to the payment-assets bucket and saves its public URL. */
  uploadQr: (file: File) => Promise<string>;
};

const QR_BUCKET = 'payment-assets';

export const usePaymentStore = create<PaymentState>((set, get) => ({
  settings: null,
  loading: false,

  load: async () => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('payment_settings')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) {
      console.error('[payments] failed to load settings', error);
      set({ loading: false });
      return;
    }
    set({ settings: data as PaymentSettings, loading: false });
  },

  update: async (patch) => {
    const { data, error } = await supabase
      .from('payment_settings')
      .update(patch)
      .eq('id', 1)
      .select('*')
      .single();
    if (error) throw error;
    set({ settings: data as PaymentSettings });
  },

  uploadQr: async (file) => {
    const ext = file.name.split('.').pop() || 'png';
    // Overwrite a stable path so we don't accumulate orphaned files.
    const path = `gcash-qr.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(QR_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;

    const { data } = supabase.storage.from(QR_BUCKET).getPublicUrl(path);
    // Cache-bust so the <img> refreshes after re-upload.
    const url = `${data.publicUrl}?v=${Date.now()}`;
    await get().update({ gcash_qr_url: url });
    return url;
  },
}));
