import 'package:supabase_flutter/supabase_flutter.dart';

import '../../models/models.dart';

/// Owner-only reads and writes. Every one of these is also gated in Postgres by
/// RLS or an `is_admin()` check, so a cashier calling them directly gets
/// nothing — this class is convenience, not the security boundary.
class AdminApi {
  static SupabaseClient get _db => Supabase.instance.client;

  // ---- orders --------------------------------------------------------------

  static Future<List<Ticket>> recentOrders({int days = 7}) async {
    final since = DateTime.now().subtract(Duration(days: days)).toUtc();
    final rows = await _db
        .from('orders')
        .select()
        .gte('created_at', since.toIso8601String())
        .order('created_at', ascending: false)
        .limit(500);
    return rows.map<Ticket>((r) => Ticket.fromMap(r)).toList();
  }

  static Future<void> setStatus(String id, String status) =>
      _db.from('orders').update({'status': status}).eq('id', id);

  static Future<Ticket> resolveReview(String code, bool verified,
      {String? note}) async {
    final row = await _db.rpc('resolve_payment_review', params: {
      'p_ticket_code': code.trim().toUpperCase(),
      'p_verified': verified,
      'p_note': note,
    });
    return Ticket.fromMap(Map<String, dynamic>.from(row as Map));
  }

  // ---- menu ----------------------------------------------------------------

  static Future<List<Dish>> dishes() async {
    final rows = await _db.from('dishes').select().order('name');
    return rows.map<Dish>((r) => Dish.fromMap(r)).toList();
  }

  static Future<void> setDishAvailable(String id, bool available) =>
      _db.from('dishes').update({'available': available}).eq('id', id);

  static Future<void> updateDish(String id, Map<String, dynamic> patch) =>
      _db.from('dishes').update(patch).eq('id', id);

  static Future<void> deleteDish(String id) =>
      _db.from('dishes').delete().eq('id', id);

  static Future<List<String>> categories() async {
    final rows = await _db.from('categories').select('name').order('name');
    return rows.map<String>((r) => r['name'] as String).toList();
  }

  // ---- inventory -----------------------------------------------------------

  static Future<List<InventoryItem>> inventory() async {
    final rows = await _db.from('inventory').select().order('name');
    return rows.map<InventoryItem>((r) => InventoryItem.fromMap(r)).toList();
  }

  static Future<void> updateInventory(String id, Map<String, dynamic> patch) =>
      _db.from('inventory').update(patch).eq('id', id);

  static Future<void> deleteInventory(String id) =>
      _db.from('inventory').delete().eq('id', id);

  static Future<void> addInventory(Map<String, dynamic> row) =>
      _db.from('inventory').insert(row);

  // ---- expenses ------------------------------------------------------------

  static Future<List<Expense>> expenses({int days = 30}) async {
    final since = DateTime.now().subtract(Duration(days: days));
    final rows = await _db
        .from('expenses')
        .select()
        .gte('spent_on', since.toIso8601String().substring(0, 10))
        .order('spent_on', ascending: false);
    return rows.map<Expense>((r) => Expense.fromMap(r)).toList();
  }

  static Future<void> addExpense(Map<String, dynamic> row) =>
      _db.from('expenses').insert(row);

  static Future<void> deleteExpense(String id) =>
      _db.from('expenses').delete().eq('id', id);

  // ---- payments ------------------------------------------------------------

  static Future<PaymentSettings> paymentSettings() async {
    final row =
        await _db.from('payment_settings').select().eq('id', 1).maybeSingle();
    return row == null
        ? PaymentSettings.fallback
        : PaymentSettings.fromMap(row);
  }

  static Future<void> updatePaymentSettings(Map<String, dynamic> patch) =>
      _db.from('payment_settings').update(patch).eq('id', 1);

  static Future<List<Map<String, dynamic>>> storageUsage() async {
    final rows = await _db.rpc('storage_usage');
    return (rows as List).map((r) => Map<String, dynamic>.from(r as Map)).toList();
  }

  static Future<String?> proofUrl(String path) async {
    try {
      return await _db.storage.from('payment-proofs').createSignedUrl(path, 300);
    } catch (_) {
      return null;
    }
  }
}
