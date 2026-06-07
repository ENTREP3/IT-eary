// Shared types mirroring the Supabase schema (supabase/migrations).

export type UserRole = 'customer' | 'admin';

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

export type Order = {
  id: string;
  reference: string;
  customer_id: string | null;
  customer_name: string | null;
  items: OrderItem[];
  total: number;
  payment_method: PaymentMethod;
  status: OrderStatus;
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
