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

  // ---- the shop's own settings ---------------------------------------------

  /// The whole settings row, including what the storefront is told to show.
  ///
  /// Read as a map rather than through [Shop] because this screen edits the
  /// individual columns and needs the raw values back to fill the form.
  static Future<Map<String, dynamic>?> shopSettings() async {
    final row =
        await _db.from('business_settings').select().eq('id', 1).maybeSingle();
    return row == null ? null : Map<String, dynamic>.from(row);
  }

  static Future<void> updateShop(Map<String, dynamic> patch) => _db
      .from('business_settings')
      .update({...patch, 'updated_at': DateTime.now().toIso8601String()})
      .eq('id', 1);

  /// Records that the owner turned down a bestseller suggestion, against the
  /// sales figure at the time.
  ///
  /// Reads the settings object and writes it back whole, because the column is
  /// one jsonb value: patching a single key would replace the object and take
  /// every other setting with it. Keeping the number rather than a plain list
  /// is what stops the panel becoming nagware — a dish declined at 30 sold
  /// stays quiet, but at 45 the question is a genuinely new one.
  static Future<void> dismissBestseller(String dishId, int sold) async {
    final row = await shopSettings();
    final show = Map<String, dynamic>.from(
      (row?['storefront'] as Map?) ?? const {},
    );
    final dismissed = Map<String, dynamic>.from(
      (show['bestseller_dismissed'] as Map?) ?? const {},
    );
    dismissed[dishId] = sold;
    show['bestseller_dismissed'] = dismissed;
    await updateShop({'storefront': show});
  }

  /// Forgets both answers the owner has given about one dish, so unmarking it
  /// starts either question fresh rather than inheriting a stale threshold.
  static Future<void> forgetBestsellerAnswers(String dishId) async {
    final row = await shopSettings();
    final show = Map<String, dynamic>.from(
      (row?['storefront'] as Map?) ?? const {},
    );
    final dismissed = Map<String, dynamic>.from(
      (show['bestseller_dismissed'] as Map?) ?? const {},
    );
    dismissed.remove(dishId);
    dismissed.remove('unmark:$dishId');
    show['bestseller_dismissed'] = dismissed;
    await updateShop({'storefront': show});
  }

  // ---- promotions ----------------------------------------------------------
  //
  // The discount is never decided here. This only writes the rule; the database
  // works out what a code is worth when the order is priced, which is why a
  // tampered app cannot invent one.

  static Future<List<Map<String, dynamic>>> promos() async {
    final rows = await _db
        .from('promo_codes')
        .select(
          'code, label, kind, value, min_subtotal, max_discount, ends_at, '
          'usage_limit, used_count, active',
        )
        .order('created_at', ascending: false);
    return rows.map((r) => Map<String, dynamic>.from(r)).toList();
  }

  static Future<void> createPromo(Map<String, dynamic> row) =>
      _db.from('promo_codes').insert(row);

  static Future<void> setPromoActive(String code, bool active) =>
      _db.from('promo_codes').update({'active': active}).eq('code', code);

  static Future<void> deletePromo(String code) =>
      _db.from('promo_codes').delete().eq('code', code);

  // ---- reviews -------------------------------------------------------------

  /// Every review, including the ones no diner sees, so the owner can choose
  /// which are quoted on the front of the shop.
  static Future<List<Map<String, dynamic>>> allReviews() async {
    final rows = await _db.rpc('all_reviews');
    return (rows as List).map((r) => Map<String, dynamic>.from(r as Map)).toList();
  }

  /// Marks a review as one to quote.
  ///
  /// Returns false when the write was refused. A blocked write comes back as
  /// success with no rows, which looks exactly like success unless the rows are
  /// counted — and a control that silently does nothing is worse than one that
  /// fails loudly.
  static Future<bool> setReviewFeatured(String id, bool featured) async {
    final rows = await _db
        .from('reviews')
        .update({'featured': featured})
        .eq('id', id)
        .select('id');
    return (rows as List).isNotEmpty;
  }

  // ---- staff logins --------------------------------------------------------

  static Future<List<Map<String, dynamic>>> listStaff() async {
    final rows = await _db.rpc('list_staff');
    return (rows as List).map((r) => Map<String, dynamic>.from(r as Map)).toList();
  }

  static Future<String> createStaff({
    required String email,
    required String password,
    required String fullName,
    required String role,
  }) async {
    final result = await _db.rpc(
      'create_staff_account',
      params: {
        'p_email': email.trim(),
        'p_password': password,
        'p_full_name': fullName.trim(),
        'p_role': role,
      },
    );
    return '$result';
  }

  static Future<void> setStaffPassword(String email, String password) =>
      _db.rpc(
        'set_staff_password',
        params: {'p_email': email, 'p_password': password},
      );

  static Future<void> revokeStaff(String email) =>
      _db.rpc('revoke_staff', params: {'target_email': email});

  // ---- receipts ------------------------------------------------------------

  /// Orders still holding a GCash receipt, optionally only the old ones.
  static Future<List<Map<String, dynamic>>> receipts({int olderThanDays = 90}) async {
    var q = _db
        .from('orders')
        .select('ticket_code, proof_path, created_at, total')
        .not('proof_path', 'is', null);

    if (olderThanDays > 0) {
      q = q.lt(
        'created_at',
        DateTime.now()
            .subtract(Duration(days: olderThanDays))
            .toUtc()
            .toIso8601String(),
      );
    }

    final rows = await q.order('created_at');
    return rows.map((r) => Map<String, dynamic>.from(r)).toList();
  }

  /// Removes the images and clears the pointers.
  ///
  /// The order keeps its payment status and the note that it was verified. Only
  /// the picture goes, which is the whole point: the record of the sale
  /// survives, the customer's name and mobile number do not linger.
  static Future<void> deleteReceipts(List<Map<String, dynamic>> rows) async {
    if (rows.isEmpty) return;
    await _db.storage
        .from('payment-proofs')
        .remove(rows.map((r) => r['proof_path'] as String).toList());
    await _db
        .from('orders')
        .update({'proof_path': null, 'proof_uploaded_at': null})
        .inFilter(
          'ticket_code',
          rows.map((r) => r['ticket_code'] as String).toList(),
        );
  }

  // ---- recipes -------------------------------------------------------------
  //
  // A dish's recipe is recorded per BATCH, the way a cook actually thinks: one
  // pot of sinigang takes a kilo and a half of pork and feeds twenty. Recording
  // that a batch was cooked is the only thing that draws ingredients out of the
  // store room, which is why the numbers stay honest — selling a serving lowers
  // the servings left, cooking lowers the ingredients, and the two never
  // overlap.

  static Future<List<Map<String, dynamic>>> recipeFor(String dishId) async {
    final rows = await _db
        .from('recipe_items')
        .select('inventory_id, quantity')
        .eq('dish_id', dishId);
    return rows.map((r) => Map<String, dynamic>.from(r)).toList();
  }

  static Future<int> batchYield(String dishId) async {
    final row = await _db
        .from('dishes')
        .select('batch_yield')
        .eq('id', dishId)
        .maybeSingle();
    return (row?['batch_yield'] as num?)?.toInt() ?? 10;
  }

  static Future<void> setBatchYield(String dishId, int n) =>
      _db.from('dishes').update({'batch_yield': n}).eq('id', dishId);

  /// How many batches the store room can currently support.
  static Future<int?> canCook(String dishId) async {
    try {
      final result = await _db.rpc('can_cook', params: {'p_dish_id': dishId});
      return (result as num?)?.toInt();
    } catch (_) {
      return null;
    }
  }

  static Future<void> setRecipeItem(
    String dishId,
    String inventoryId,
    double quantity,
  ) => _db.from('recipe_items').upsert({
    'dish_id': dishId,
    'inventory_id': inventoryId,
    'quantity': quantity,
  });

  static Future<void> removeRecipeItem(String dishId, String inventoryId) => _db
      .from('recipe_items')
      .delete()
      .eq('dish_id', dishId)
      .eq('inventory_id', inventoryId);

  /// Records that a batch was cooked: servings up, ingredients down, in one
  /// guarded call so the two can never disagree.
  static Future<void> cookBatch(String dishId, int batches) => _db.rpc(
    'cook_batch',
    params: {'p_dish_id': dishId, 'p_batches': batches},
  );

  // ---- costing -------------------------------------------------------------

  /// What the food sold actually cost to make, day by day.
  ///
  /// Absent until the migration is applied, and empty until ingredients are
  /// costed. Either way this is an extra, so it stays quiet rather than
  /// breaking the screen around it.
  static Future<List<Map<String, dynamic>>> cogsByDay({int days = 7}) async {
    try {
      final rows = await _db.rpc('cogs_by_day', params: {'p_days': days});
      return (rows as List)
          .map((r) => Map<String, dynamic>.from(r as Map))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// Dishes whose ingredients have gone up enough to eat the margin.
  static Future<List<Map<String, dynamic>>> priceSuggestions() async {
    try {
      final rows = await _db.rpc('price_suggestions');
      return (rows as List)
          .map((r) => Map<String, dynamic>.from(r as Map))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// Accepts a new price, or dismisses the suggestion by passing null.
  static Future<void> confirmDishPrice(String dishId, double? price) =>
      _db.rpc(
        'confirm_dish_price',
        params: {'p_dish_id': dishId, 'p_price': price},
      );

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
