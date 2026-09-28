import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

/// Keeps a staff screen current without anybody pressing anything.
///
/// The staff side of the app had no live connection at all: it fetched once at
/// sign-in and then sat there, which is the only reason the dashboard ever
/// needed a Refresh button. The diner app has always listened to its own
/// ticket; the counter and the kitchen, where being a minute out of date
/// actually costs something, did not.
///
/// This is a WebSocket, not polling. Postgres publishes the change, Supabase
/// forwards it, and the callback runs — nothing asks "anything new?" on a
/// timer, and there is no server of ours for a webhook to arrive at.
///
/// Reloading everything on any change is deliberate. The alternative is patching
/// rows into local lists by hand, which is more code and a second, quieter
/// definition of what the data is — the sort that drifts. At a karinderya's
/// volume a refetch costs a few kilobytes and is always right.
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
