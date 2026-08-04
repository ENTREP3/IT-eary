// Shared types mirroring the Supabase schema (supabase/migrations).

// 'customer' is legacy — diners no longer have accounts. Staff are admin/cashier.
export type UserRole = 'customer' | 'admin' | 'cashier';

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  created_at: string;
};

export type PaymentSettings = {
  id: number;
  gcash_enabled: boolean;
  gcash_name: string;
  gcash_number: string;
  gcash_qr_url: string | null;
  cash_enabled: boolean;
  updated_at: string;
};

export type PaymentMethod = 'cash' | 'gcash';

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled';

export type OrderItem = {
  id?: string;
  name: string;
  qty: number;
  price: number;
};

/**
 * What the cashier concluded about the money — deliberately separate from
 * `payment_method`, which is only the diner's declared intent.
 *
 * `needs_review` is the no-loss outcome: the food is released so the diner
 * isn't stuck at the counter, but the sale is flagged for the owner to
 * reconcile against the real GCash history.
 */
export type PaymentStatus = 'unpaid' | 'verified' | 'needs_review';

export type Order = {
  id: string;
  reference: string;
  /** Short code the diner shows at the counter, e.g. "K7M2Q9". */
  ticket_code: string;
  customer_name: string | null;
  items: OrderItem[];
  total: number;
  /** Chosen by the diner at checkout; the cashier may switch it. */
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  /** Object path in the private payment-proofs bucket — never a public URL. */
  proof_path: string | null;
  proof_uploaded_at: string | null;
  verified_in_person: boolean;
  review_note: string | null;
  status: OrderStatus;
  paid_at: string | null;
  paid_by: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
  label: string;
  amount: number;
  category: string;
  spent_on: string; // date (YYYY-MM-DD)
  created_at: string;
};
