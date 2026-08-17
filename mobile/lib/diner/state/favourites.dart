import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Dishes this diner has marked, kept **on the device only**.
///
/// Deliberately not in the database. A favourite is a private preference that
/// helps one person find their usual order faster; it is not something the shop
/// needs to know, and storing it would mean a row per diner per dish for no
/// business benefit. Keeping it local also means it works without an account,
/// which is the whole point of the guest flow.
///
/// A [ChangeNotifier] rather than a plain read, so tapping the heart on the menu
/// updates the header count in the same frame instead of on the next rebuild.
class Favourites extends ChangeNotifier {
  static const _key = 'bencris.favourites';

  Set<String> _ids = {};

  Set<String> get ids => Set.unmodifiable(_ids);

  bool contains(String dishId) => _ids.contains(dishId);

  bool get isEmpty => _ids.isEmpty;

  int get count => _ids.length;

  /// Reads what the device already had. Safe to call more than once.
  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _ids = (prefs.getStringList(_key) ?? const []).toSet();
    notifyListeners();
  }

  Future<void> toggle(String dishId) async {
    if (!_ids.remove(dishId)) _ids.add(dishId);
    notifyListeners();

    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, _ids.toList());
  }
}
