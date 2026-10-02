import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

/// Keeps a staff screen current without anybody pressing anything.
class LiveRefresh {
  LiveRefresh._(this._channel, this._debounce);

  final RealtimeChannel _channel;
  final Timer? _debounce;

  /// Listens to [tables] and calls [onChange] when any of them moves.
  ///
  /// Changes are debounced: settling one ticket writes the order and then the
  /// dish it came from, and a screen that reloaded twice in the same breath
  /// would flicker for no reason.
  static LiveRefresh watch({
    required String name,
    required List<String> tables,
    required void Function() onChange,
    Duration settle = const Duration(milliseconds: 400),
  }) {
    Timer? debounce;
    final client = Supabase.instance.client;
    var channel = client.channel(name);

    for (final table in tables) {
      channel = channel.onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: table,
        callback: (_) {
          debounce?.cancel();
          debounce = Timer(settle, onChange);
        },
      );
    }

    channel.subscribe();
    return LiveRefresh._(channel, debounce);
  }

  void dispose() {
    _debounce?.cancel();
    Supabase.instance.client.removeChannel(_channel);
  }
}
