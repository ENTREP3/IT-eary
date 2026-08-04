import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/models.dart';
import '../services/api.dart';

/// Backend calls that require a signed-in staff account.
///
/// Every guard here is also enforced in Postgres — `mark_ticket_paid()` checks
/// `is_staff()`, `resolve_payment_review()` checks `is_admin()`. This class is
/// convenience, never the security boundary.
class StaffApi {
  static SupabaseClient get _db => Supabase.instance.client;

  static Session? get session => _db.auth.currentSession;

  static Stream<AuthState> get authChanges => _db.auth.onAuthStateChange;

  /// Signs in, then reads the role. Returns the role, or throws if the account
  /// isn't staff — a customer must never land in the counter UI.
  static Future<String> signIn(String email, String password) async {
    final res = await _db.auth.signInWithPassword(
      email: email.trim(),
      password: password,
    );
    final id = res.user?.id;
    if (id == null) throw Exception('Sign-in failed.');

    final role = await roleOf(id);
    if (role != 'cashier' && role != 'admin') {
      await _db.auth.signOut();
      throw Exception('This account is not staff.');
    }
    return role!;
  }

  static Future<String?> roleOf(String userId) async {
    final row = await _db
        .from('profiles')
        .select('role, full_name')
        .eq('id', userId)
        .maybeSingle();
    return row?['role'] as String?;
  }

  static Future<String?> nameOf(String userId) async {
    final row = await _db
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle();
    return row?['full_name'] as String?;
  }

  static Future<void> signOut() => _db.auth.signOut();

  // ---- counter -------------------------------------------------------------

  static Future<Ticket?> findTicket(String code) => Api.findTicket(code);

  /// Short-lived URL for a GCash receipt. The bucket is private, so a public
  /// URL would never resolve — and these images carry personal details.
  static Future<String?> proofUrl(String path) async {
    try {
      return await _db.storage.from(Api.proofBucket).createSignedUrl(path, 300);
    } catch (_) {
      // The path is recorded separately from the upload, so a missing object is
      // a real possibility. Show the "can't load" state rather than crashing.
      return null;
    }
  }

  /// Records payment. [status] carries which of the three outcomes was taken:
  /// `verified` (evidence seen) or `needs_review` (released, owner reconciles).
  static Future<Ticket> markPaid({
    required String ticketCode,
    required String method,
    String status = 'verified',
    bool inPerson = false,
    String? note,
  }) async {
    final row = await _db.rpc(
      'mark_ticket_paid',
      params: {
        'p_ticket_code': ticketCode.trim().toUpperCase(),
        'p_method': method,
        'p_status': status,
        'p_in_person': inPerson,
        'p_note': note,
      },
    );
    return Ticket.fromMap(Map<String, dynamic>.from(row as Map));
  }
}
