import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../services/api.dart';

/// Dishes this diner has marked, on the device and on their account.
///
/// Two copies, and each is there for a reason the other cannot serve.
///
/// The device copy is what fills the heart in the same frame it is tapped,
/// what works with no signal, and what a guest who never signs in still gets.
/// Waiting on a round trip before colouring a heart would make the whole menu
/// feel broken on shop wifi.
///
/// The account copy is the one that survives a new phone, a reinstall, or two
/// people sharing a handset — which was the real problem. Favourites used to
/// live only here, and the comment explaining why said ordering was anonymous
/// so there was no account to hang them off. There are accounts now, and what
/// that reasoning left behind was a list belonging to the phone rather than to
/// whoever was holding it.
///
/// The device is always written first and never waited on. A failed sync means
/// a heart that does not follow the diner to their next phone, which is exactly
/// where they were before any of this existed.
///
/// A [ChangeNotifier] rather than a plain read, so tapping the heart on the
/// menu updates the header count in the same frame instead of on the next
/// rebuild.
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
