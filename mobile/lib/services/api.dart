import 'dart:math';

import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/models.dart';

/// Every call the diner app makes. Diners are anonymous — there is no sign-in
/// anywhere in this app, and every write goes through a guarded RPC.
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
