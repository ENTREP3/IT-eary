import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Expense } from '../lib/types';

type ExpensesState = {
  expenses: Expense[];
  loading: boolean;
  load: () => Promise<void>;
  add: (args: { label: string; amount: number; category: string; spentOn?: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export const useExpensesStore = create<ExpensesState>((set) => ({
  expenses: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .gte('spent_on', since)
      .order('spent_on', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[expenses] load failed', error);
      set({ loading: false });
      return;
    }
    set({ expenses: (data as Expense[]) ?? [], loading: false });
  },

  add: async ({ label, amount, category, spentOn }) => {
    const row = {
      label,
      amount,
      category,
      spent_on: spentOn ?? new Date().toISOString().slice(0, 10),
    };
    const { data, error } = await supabase.from('expenses').insert(row).select('*').single();
    if (error) throw error;
    set((s) => ({ expenses: [data as Expense, ...s.expenses] }));
  },

  remove: async (id) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
  },
}));

// ---- analytics helpers -----------------------------------------------------
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Total expenses per day for the last 7 days (oldest → newest). */
export function expensesByDay(expenses: Expense[]) {
  const out: { day: string; expenses: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const sum = expenses
      .filter((e) => e.spent_on === key)
      .reduce((a, e) => a + Number(e.amount), 0);
    out.push({ day: DAY[d.getDay()], expenses: sum });
  }
  return out;
}

export function expensesToday(expenses: Expense[]) {
  const key = new Date().toISOString().slice(0, 10);
  return expenses.filter((e) => e.spent_on === key).reduce((a, e) => a + Number(e.amount), 0);
}
