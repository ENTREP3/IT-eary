import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../services/api.dart';

/// Dishes this diner has marked, on the device and on their account.
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

    // Then catch up with the account, which may know about hearts made on
    // another device. Not awaited by the caller: the menu paints from what the
    // phone already had and corrects itself a moment later.
    unawaited(sync());
  }

  Future<void> toggle(String dishId) async {
    final nowFavourite = !_ids.contains(dishId);
    if (nowFavourite) {
      _ids.add(dishId);
    } else {
      _ids.remove(dishId);
    }
    notifyListeners();

    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, _ids.toList());

    unawaited(Api.setFavourite(dishId, nowFavourite));
  }

  /// Brings the device's list and the account's together.
  ///
  /// Neither wins. A diner may have hearted things on this phone before signing
  /// in, and their account may hold things hearted elsewhere; taking either
  /// side as the truth silently deletes the other, and a disappearing favourite
  /// is the kind of small wrongness nobody reports but everybody notices.
  Future<void> sync() async {
    final merged = await Api.mergeFavourites(_ids.toList());
    if (merged == null) return;

    _ids = merged.toSet();
    notifyListeners();

    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, _ids.toList());
  }
}
