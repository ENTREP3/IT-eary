import 'dart:math';

import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/models.dart';

/// Every call the diner app makes.
///
/// Signing in is optional and adds history, live order tracking and loyalty.
/// Ordering without an account works exactly as it always has, and every write
/// still goes through a guarded function rather than touching a table directly.
class Api {
  static SupabaseClient get _db => Supabase.instance.client;

  static const proofBucket = 'payment-proofs';

  static Future<List<String>> categories() async {
    final rows = await _db.from('categories').select('name').order('name');
    return rows.map<String>((r) => r['name'] as String).toList();
  }

  static Future<List<Dish>> menu() async {
    final rows = await _db.from('dishes').select().order('name');
    return rows.map<Dish>((r) => Dish.fromMap(r)).toList();
  }

  /// The shop's own details, as the owner set them on the dashboard.
  ///
  /// Read rather than hardcoded so the apps cannot disagree with the website
  /// about the address, the hours, or what the karinderya calls itself. Returns
  /// null when the row cannot be read, and callers show nothing rather than a
  /// stale guess.
  static Future<Shop?> shop() async {
    try {
      final row = await _db
          .from('business_settings')
          .select()
          .eq('id', 1)
          .maybeSingle();
      return row == null ? null : Shop.fromMap(row);
    } catch (_) {
      return null;
    }
  }

  // --------------------------------------------------------------- accounts
  //
  // An account is optional and always will be. On a meal costing under a
  // hundred pesos a signup wall is the surest way to lose the sale, and the
  // ticket-code flow is what keeps the counter fast. What an account adds is
  // everything that needs memory across visits: history that survives a new
  // phone, a live view of the order, and loyalty.

  static User? get currentUser => _db.auth.currentUser;

  static bool get signedIn => currentUser != null;

  /// Fires whenever the diner signs in or out, so screens can follow along
  /// instead of each one polling for a session.
  static Stream<AuthState> get authChanges => _db.auth.onAuthStateChange;

  /// Returns true when the account is ready to use, false when the project
  /// requires the address to be confirmed by email first.
  static Future<bool> signUp(String email, String password) async {
    final res = await _db.auth.signUp(email: email.trim(), password: password);
    return res.session != null;
  }

  static Future<void> signIn(String email, String password) =>
      _db.auth.signInWithPassword(email: email.trim(), password: password);

  static Future<void> signOut() => _db.auth.signOut();

  /// This diner's own orders, newest first.
  ///
  /// Filtered by customer here on purpose. The access rules would return rows
  /// without it, because anybody may read orders from the last 24 hours so a
  /// guest ticket can follow itself, and the screen would quietly list other
  /// people's orders. Access rules decide what you MAY read, not what a screen
  /// means. The web app had exactly this bug.
  static Future<List<Ticket>> myOrders() async {
    final uid = currentUser?.id;
    if (uid == null) return const [];

    final rows = await _db
        .from('orders')
        .select()
        .eq('customer_id', uid)
        .order('created_at', ascending: false)
        .limit(30);
    return rows.map<Ticket>((r) => Ticket.fromMap(r)).toList();
  }

  /// Every change to this diner's orders, so the card moves through Preparing
  /// and Ready without them standing at the counter watching for it.
  static Stream<List<Ticket>> watchMyOrders() {
    final uid = currentUser?.id;
    if (uid == null) return const Stream.empty();

    return _db
        .from('orders')
        .stream(primaryKey: ['id'])
        .eq('customer_id', uid)
        .order('created_at')
        .map((rows) => rows.map<Ticket>((r) => Ticket.fromMap(r)).toList());
  }

  /// Completed orders, and how many more until the next reward.
  static Future<Loyalty?> loyalty() async {
    if (!signedIn) return null;
    try {
      final rows = await _db.rpc('my_loyalty');
      final row = (rows is List && rows.isNotEmpty) ? rows.first : rows;
      return row == null ? null : Loyalty.fromMap(Map<String, dynamic>.from(row as Map));
    } catch (_) {
      return null;
    }
  }

  /// Discount codes the owner is running now, so a diner with an account learns
  /// about them without the shop paying to advertise anywhere.
  static Future<List<Promo>> activePromos() async {
    try {
      final rows = await _db
          .from('promo_codes')
          .select('code, label')
          .eq('active', true);
      return rows.map<Promo>((r) => Promo.fromMap(r)).toList();
    } catch (_) {
      return const [];
    }
  }

  /// What a discount code is worth on this order, before committing to it.
  ///
  /// Priced by the same database rule that will charge it, so the cart can never
  /// quote a discount the checkout then refuses. On failure it returns the
  /// reason, so the diner is told "spend 20 pesos more" instead of a flat
  /// "invalid", which is the difference between an abandoned cart and a bigger
  /// one.
  static Future<PromoPreview> previewPromo(String code, double subtotal) async {
    try {
      final rows = await _db.rpc(
        'preview_promo',
        params: {'p_code': code.trim(), 'p_subtotal': subtotal},
      );
      final row = (rows is List && rows.isNotEmpty) ? rows.first : rows;
      if (row == null) {
        return const PromoPreview(valid: false, discount: 0, label: '', reason: 'That code does not exist.');
      }
      return PromoPreview.fromMap(Map<String, dynamic>.from(row as Map));
    } catch (e) {
      return const PromoPreview(
        valid: false,
        discount: 0,
        label: '',
        reason: 'Could not check that code right now.',
      );
    }
  }

  /// Average star rating per dish, keyed by dish id.
  ///
  /// Food is bought on trust, and a first-time diner has nothing else to go on.
  /// Ratings used to live in one browser, which made them social proof that
  /// proved nothing to anybody else.
  static Future<Map<String, DishRating>> dishRatings() async {
    try {
      final rows = await _db.from('dish_ratings').select();
      return {
        for (final r in rows) r['dish_id'] as String: DishRating.fromMap(r),
      };
    } catch (_) {
      return const {};
    }
  }

  /// Ratings already left against a ticket, keyed by dish id.
  ///
  /// Read from the database rather than remembered in the screen, so reopening
  /// a past order shows the stars you actually gave, on any device. Keeping it
  /// only in memory is why a revisited order used to look unrated.
  static Future<Map<String, DishReview>> reviewsForTicket(String ticketCode) async {
    try {
      final rows = await _db
          .from('reviews')
          .select('dish_id, rating, comment')
          .eq('ticket_code', ticketCode.trim().toUpperCase());
      return {
        for (final r in rows) r['dish_id'] as String: DishReview.fromMap(r),
      };
    } catch (_) {
      return const {};
    }
  }
  /// Rates a dish the diner actually bought.
  ///
  /// The ticket code is the proof of purchase. The database refuses a rating
  /// unless that ticket was settled AND contained the dish, so ratings cannot
  /// be manufactured by anyone holding the public key.
  static Future<void> leaveReview({
    required String ticketCode,
    required String dishId,
    required int rating,
    String comment = '',
  }) async {
    await _db.rpc(
      'leave_review',
      params: {
        'p_ticket_code': ticketCode,
        'p_dish_id': dishId,
        'p_rating': rating,
        'p_comment': comment,
      },
    );
  }
  /// Asks to be told when a sold-out dish comes back.
  ///
  /// A diner who wanted sinigang and found it gone is a sale already lost. This
  /// is the cheapest way to win it back, and it costs the shop nothing: the
  /// flag is set by a trigger when the owner marks the dish available again.
  static Future<void> alertMeWhenBack(String dishId) async {
    final uid = currentUser?.id;
    if (uid == null) return;
    await _db.from('stock_alerts').insert({'customer_id': uid, 'dish_id': dishId});
  }

  /// Dish ids this diner is already waiting on, so the button does not offer
  /// to do something they have already done.
  static Future<Set<String>> myStockAlerts() async {
    if (!signedIn) return const {};
    try {
      final rows = await _db.from('stock_alerts').select('dish_id');
      return rows.map<String>((r) => r['dish_id'] as String).toSet();
    } catch (_) {
      return const {};
    }
  }
  /// How the karinderya is accepting money right now, so a method the owner has
  /// switched off is never offered at checkout.
  static Future<PaymentSettings> paymentSettings() async {
    try {
      final row =
          await _db.from('payment_settings').select().eq('id', 1).maybeSingle();
      return row == null
          ? PaymentSettings.fallback
          : PaymentSettings.fromMap(row);
    } catch (_) {
      return PaymentSettings.fallback;
    }
  }

  /// Raises a ticket. Only dish ids + quantities are sent — the server prices
  /// the order from `public.dishes`, so the total cannot be tampered with.
  static Future<Ticket> createTicket({
    required Map<String, int> quantitiesByDishId,
    String? customerName,
    String paymentMethod = 'cash',
    String? promoCode,
  }) async {
    final items = quantitiesByDishId.entries
        .map((e) => {'id': e.key, 'qty': e.value})
        .toList();

    final row = await _db.rpc(
      'create_ticket',
      params: {
        'p_items': items,
        'p_customer_name': (customerName ?? '').trim().isEmpty
            ? null
            : customerName!.trim(),
        'p_payment_method': paymentMethod,
        // The code only, never a discount amount. What it is worth is decided
        // by the database, so a tampered app cannot invent its own reduction.
        'p_promo_code': (promoCode ?? '').trim().isEmpty ? null : promoCode!.trim(),
      },
    );
    return Ticket.fromMap(Map<String, dynamic>.from(row as Map));
  }

  static Future<Ticket?> findTicket(String code) async {
    final row = await _db
        .from('orders')
        .select()
        .eq('ticket_code', code.trim().toUpperCase())
        .maybeSingle();
    return row == null ? null : Ticket.fromMap(row);
  }

  /// Picks a GCash receipt from the gallery and uploads it against [ticketCode].
  ///
  /// image_picker caps the image at 1200px / 70% quality itself, which works on
  /// both mobile and web. That matters: Supabase's server-side image transform
  /// is a paid feature, and a raw phone screenshot is 1–2 MB, so shrinking here
  /// is what keeps the project inside the free 1 GB storage allowance.
  ///
  /// Returns null if the diner backs out of the picker.
  static Future<Ticket?> pickAndUploadProof(String ticketCode) async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1200,
      imageQuality: 70,
    );
    if (picked == null) return null;

    final code = ticketCode.trim().toUpperCase();
    final bytes = await picked.readAsBytes();

    // A fresh random name each time: replacing a blurry shot uploads a new
    // object rather than overwriting one, which keeps the storage policy simple.
    final isPng = picked.name.toLowerCase().endsWith('.png');
    final suffix = Random().nextInt(1 << 32).toRadixString(36);
    final path = '$code/$suffix.${isPng ? 'png' : 'jpg'}';

    await _db.storage.from(proofBucket).uploadBinary(
          path,
          bytes,
          fileOptions: FileOptions(
            contentType: isPng ? 'image/png' : 'image/jpeg',
          ),
        );

    final row = await _db.rpc(
      'attach_payment_proof',
      params: {'p_ticket_code': code, 'p_path': path},
    );
    return Ticket.fromMap(Map<String, dynamic>.from(row as Map));
  }

  /// Clears a recorded receipt so a replacement can be uploaded.
  static Future<Ticket> clearProof(String ticketCode) async {
    final row = await _db.rpc(
      'clear_payment_proof',
      params: {'p_ticket_code': ticketCode.trim().toUpperCase()},
    );
    return Ticket.fromMap(Map<String, dynamic>.from(row as Map));
  }

  /// Live updates for one ticket, so the diner sees it flip to Paid / Ready
  /// without refreshing. Falls back to nothing if Realtime is unavailable.
  static Stream<Ticket> watchTicket(String ticketId) {
    return _db
        .from('orders')
        .stream(primaryKey: ['id'])
        .eq('id', ticketId)
        .map((rows) => rows.isEmpty ? null : Ticket.fromMap(rows.first))
        .where((t) => t != null)
        .cast<Ticket>();
  }
}
