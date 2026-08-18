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
  /**
   * The staff member who settled this ticket, not the person who paid.
   *
   * Who ordered is customer_id, or customer_name for a guest. This answers
   * "which cashier took the money", which is what matters when the day does
   * not add up.
   */
  processed_by: string | null;
  created_at: string;

  // Added by later migrations. The type had drifted behind the table, so code
  // reading these columns type-checked as an error while working perfectly at
  // runtime, and code misspelling one would not have been caught at all.

  /** Menu price of the items before any discount. subtotal - discount = total. */
  subtotal: number;
  discount: number;
  promo_code: string | null;
  /** NULL for a guest order. Set when a signed-in customer checks out. */
  customer_id: string | null;
  /** When the diner said they would collect. NULL means as soon as it is ready. */
  pickup_at: string | null;
  /** Stamped when the order is completed. What the loyalty count is based on. */
  completed_at: string | null;
};

export type Expense = {
  id: string;
  label: string;
  amount: number;
  category: string;
  spent_on: string; // date (YYYY-MM-DD)
  created_at: string;
};
