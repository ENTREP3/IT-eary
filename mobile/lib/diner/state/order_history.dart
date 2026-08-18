import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// A past order, remembered **on the device only**.
///
/// Ordering is anonymous, so there is no account to hang history off. Keeping
/// it in local storage gives regulars one-tap reordering without adding a
/// single database row, an account, or any cost.
class PastOrder {
  final String ticketCode;
  final DateTime placedAt;
  final double total;
  final Map<String, int> quantities;
  final List<String> names;

  const PastOrder({
    required this.ticketCode,
    required this.placedAt,
    required this.total,
    required this.quantities,
    required this.names,
  });

  Map<String, dynamic> toJson() => {
        'code': ticketCode,
        'at': placedAt.toIso8601String(),
        'total': total,
        'qty': quantities,
        'names': names,
      };

  factory PastOrder.fromJson(Map<String, dynamic> j) => PastOrder(
        ticketCode: j['code'] as String,
        placedAt: DateTime.parse(j['at'] as String),
        total: (j['total'] as num).toDouble(),
        quantities: Map<String, int>.from(
          (j['qty'] as Map).map((k, v) => MapEntry(k as String, (v as num).toInt())),
        ),
        names: List<String>.from(j['names'] as List? ?? const []),
      );

  String get summary => names.join(', ');
}

class OrderHistory {
  static const _key = 'order_history_v1';
  static const _max = 20;

  static Future<List<PastOrder>> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? const [];
    final out = <PastOrder>[];
    for (final s in raw) {
      try {
        out.add(PastOrder.fromJson(jsonDecode(s) as Map<String, dynamic>));
      } catch (_) {
        // A malformed entry from an older build shouldn't wipe the rest.
      }
    }
    return out;
  }

  static Future<void> add(PastOrder order) async {
    final prefs = await SharedPreferences.getInstance();
    final existing = await load()
      ..removeWhere((o) => o.ticketCode == order.ticketCode);
    final next = [order, ...existing].take(_max).toList();
    await prefs.setStringList(
      _key,
      next.map((o) => jsonEncode(o.toJson())).toList(),
    );
  }

  /// Drops one ticket from this device's list.
  ///
  /// Used when a diner cancels: leaving it in history would let "Order again"
  /// offer back a ticket that no longer exists, and would show a cancelled
  /// order among the ones they actually ate.
  static Future<void> forget(String ticketCode) async {
    final prefs = await SharedPreferences.getInstance();
    final rest = (await load())
      ..removeWhere((o) => o.ticketCode == ticketCode);
    await prefs.setStringList(
      _key,
      rest.map((o) => jsonEncode(o.toJson())).toList(),
    );
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}
