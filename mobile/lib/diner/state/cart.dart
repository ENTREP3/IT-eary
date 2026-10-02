import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../models/models.dart';
import '../../services/api.dart';

/// The diner's in-progress order. Prices here are only ever used for display —
/// the authoritative total is computed server-side by `create_ticket()`.
const _key = 'bencris.cart';

class Cart extends ChangeNotifier {
  final Map<String, int> _qty = {};
  final Map<String, Dish> _dishes = {};

  /// Ids and counts read back from the phone, waiting for a menu to resolve
  /// them against. Empty once [hydrate] has run.
Map<String, int> _pending = {};

  Map<String, int> get quantities => Map.unmodifiable(_qty);

  int qtyOf(String dishId) => _qty[dishId] ?? 0;

  int get itemCount => _qty.values.fold(0, (a, b) => a + b);

  bool get isEmpty => _qty.isEmpty;

  double get estimatedTotal => _qty.entries.fold(
    0,
    (sum, e) => sum + (_dishes[e.key]?.price ?? 0) * e.value,
  );

  List<MapEntry<Dish, int>> get lines => _qty.entries
      .where((e) => _dishes.containsKey(e.key))
      .map((e) => MapEntry(_dishes[e.key]!, e.value))
      .toList();

  void add(Dish dish) {
    // The first item is the cart being started. Counted once a day per
    // device, and paired with a ticket later to say how many were left.
    final wasEmpty = _qty.isEmpty;

    _dishes[dish.id] = dish;
    _qty[dish.id] = (_qty[dish.id] ?? 0) + 1;
    notifyListeners();

    if (wasEmpty) Api.recordStorefrontEvent('cart_started');
    _save();
  }

  void remove(String dishId) {
    final current = _qty[dishId] ?? 0;
    if (current <= 1) {
      _qty.remove(dishId);
      _dishes.remove(dishId);
    } else {
      _qty[dishId] = current - 1;
    }
    notifyListeners();
    _save();
  }

  /// Drops a line outright, however many of it there are.
  ///
  /// `remove` steps the count down by one and only clears the line when it
  /// reaches zero. That is the right behaviour for a minus button and the wrong
  /// one for "I don't want this after all".
  void removeLine(String dishId) {
    if (_qty.remove(dishId) == null) return;
    _dishes.remove(dishId);
    notifyListeners();
    _save();
  }

  void clear() {
    _qty.clear();
    _dishes.clear();
    notifyListeners();
    _save();
  }

  /// Reads the saved cart. Ids and counts only, never names or prices.
  ///
  /// Those come from the menu when the cart is rebuilt, so a dish that
  /// changed price or sold out overnight cannot be ordered at yesterday’s
  /// terms out of a stale copy sitting on the phone.
  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw == null || raw.isEmpty) return;

      final decoded = jsonDecode(raw);
      if (decoded is! Map) return;
      _pending = decoded.map(
        (k, v) => MapEntry(k as String, (v as num).toInt()),
      )..removeWhere((_, qty) => qty <= 0);
    } catch (_) {
      // A cart nobody can parse is one worth forgetting.
    }
  }

  /// Stands in for [load] in tests, which have no phone to read from.
  @visibleForTesting
  void debugPending(Map<String, int> saved) => _pending = Map.of(saved);

  /// Rebuilds the saved cart against a menu, once there is one.
  ///
  /// Anything sold out or taken off simply does not come back, which is the
  /// honest outcome — the alternative is somebody reaching the counter with
  /// a ticket for food that no longer exists.
  void hydrate(List<Dish> menu) {
    if (_pending.isEmpty || _qty.isNotEmpty) return;

    var restored = false;
    for (final entry in _pending.entries) {
      final dish = menu
          .where((d) => d.id == entry.key && d.available)
          .firstOrNull;
      if (dish == null) continue;
      _dishes[dish.id] = dish;
      _qty[dish.id] = entry.value;
      restored = true;
    }

    _pending = {};
    if (restored) {
      notifyListeners();
      _save();
    }
  }

  Future<void> _save() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (_qty.isEmpty) {
        await prefs.remove(_key);
      } else {
        await prefs.setString(_key, jsonEncode(_qty));
      }
    } catch (_) {
      // Losing a saved cart is a small thing; failing an order over it is
      // not.
    }
  }
}
