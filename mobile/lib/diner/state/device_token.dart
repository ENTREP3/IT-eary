import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

/// This device's own identity, for ordering without an account.
class DeviceToken {
  static const _key = 'device_token_v1';
  static String? _cached;

  static Future<String> get() async {
    final cached = _cached;
    if (cached != null) return cached;

    final prefs = await SharedPreferences.getInstance();
    var token = prefs.getString(_key);
    if (token == null || token.isEmpty) {
      token = _uuidV4();
      await prefs.setString(_key, token);
    }
    _cached = token;
    return token;
  }

  /// A version 4 UUID from the platform's secure random.
  ///
  /// Written out rather than pulling in a uuid package for one call: the format
  /// matters because the column is a uuid, and the randomness matters because
  /// the value is what separates one diner's orders from another's.
  static String _uuidV4() {
    final r = Random.secure();
    final bytes = List<int>.generate(16, (_) => r.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1

    String hex(int from, int to) => bytes
        .sublist(from, to)
        .map((b) => b.toRadixString(16).padLeft(2, '0'))
        .join();

    return '${hex(0, 4)}-${hex(4, 6)}-${hex(6, 8)}-${hex(8, 10)}-${hex(10, 16)}';
  }
}
