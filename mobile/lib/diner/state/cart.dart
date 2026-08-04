import 'package:flutter/foundation.dart';

import '../../models/models.dart';

/// The diner's in-progress order. Prices here are only ever used for display —
/// the authoritative total is computed server-side by `create_ticket()`.
class Cart extends ChangeNotifier {
  final Map<String, int> _qty = {};
  final Map<String, Dish> _dishes = {};

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
    _dishes[dish.id] = dish;
    _qty[dish.id] = (_qty[dish.id] ?? 0) + 1;
    notifyListeners();
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
  }

  void clear() {
    _qty.clear();
    _dishes.clear();
    notifyListeners();
  }
}
