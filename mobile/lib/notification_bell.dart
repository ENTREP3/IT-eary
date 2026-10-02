import 'package:flutter/material.dart';

import 'models/models.dart';
import 'dart:async';

import 'services/api.dart';
import 'services/push.dart';
import 'theme.dart';
import 'tokens.dart';

/// Bell for the app bar, showing what the shop has recorded for this person.
///
/// One widget for the diner, the counter and the owner. They see different
/// entries because the database wrote different rows, not because this filters
/// anything.
class NotificationBell extends StatefulWidget {
  const NotificationBell.diner({super.key}) : _dark = false, _onPhoto = false;
  const NotificationBell.staff({super.key}) : _dark = true, _onPhoto = false;

  /// For the storefront header, which sits on top of the shop photograph.
  const NotificationBell.onPhoto({super.key})
    : _dark = false,
      _onPhoto = true;

  /// Staff screens are near-black; the diner's are cream.
  final bool _dark;

  /// White icon, because the thing behind it is a photograph.
  final bool _onPhoto;

  @override
  State<NotificationBell> createState() => _NotificationBellState();
}

class _NotificationBellState extends State<NotificationBell>
    with WidgetsBindingObserver {
  int _unread = 0;
  StreamSubscription<void>? _arrivals;

  @override
  void initState() {
    super.initState();
    _refresh();

    // The badge used to be read once and never again, so a notification
    // arriving while the screen was open left it showing nothing.
    _arrivals = Push.arrived.listen((_) => _refresh());
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    _arrivals?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Anything that arrived while the app was away is counted on the way back.
    if (state == AppLifecycleState.resumed) _refresh();
  }

  Future<void> _refresh() async {
    final n = await Api.unreadCount();
    if (mounted) setState(() => _unread = n);
  }

  Future<void> _open() async {
    final items = await Api.notifications();
    if (!mounted) return;

    // Marked read on opening, and the badge clears straight away.
    await Api.markNotificationsRead();
    if (mounted) setState(() => _unread = 0);

    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: widget._dark ? Tokens.staffCard : Palette.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _Sheet(items: items, dark: widget._dark),
    );
    await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final ink = widget._onPhoto
        ? Colors.white
        : (widget._dark ? Tokens.staffInk : Palette.ink);

    return Stack(
      alignment: Alignment.center,
      children: [
        IconButton(
          onPressed: _open,
          icon: Icon(Icons.notifications_none, color: ink),
          tooltip: 'Notifications',
        ),
        if (_unread > 0)
          Positioned(
            top: 8,
            right: 6,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: Palette.red,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                _unread > 99 ? '99+' : '$_unread',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _Sheet extends StatelessWidget {
  const _Sheet({required this.items, required this.dark});

  final List<AppNotification> items;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final ink = dark ? Tokens.staffInk : Palette.ink;

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.7,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Text(
                'NOTIFICATIONS',
                style: TextStyle(
                  fontSize: 11,
                  letterSpacing: 2,
                  fontWeight: FontWeight.w600,
                  color: ink.withValues(alpha: 0.55),
                ),
              ),
            ),
            if (items.isEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
                child: Text(
                  'Nothing yet. This is where the shop tells you things.',
                  style: TextStyle(color: ink.withValues(alpha: 0.6)),
                ),
              )
            else
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  padding: const EdgeInsets.only(bottom: 12),
                  itemCount: items.length,
                  separatorBuilder: (_, _) =>
                      Divider(height: 1, color: ink.withValues(alpha: 0.08)),
                  itemBuilder: (_, i) {
                    final n = items[i];
                    return ListTile(
                      title: Text(
                        n.title,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: ink,
                        ),
                      ),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (n.body != null && n.body!.trim().isNotEmpty)
                            Text(
                              n.body!,
                              style: TextStyle(
                                fontSize: 12.5,
                                height: 1.4,
                                color: ink.withValues(alpha: 0.7),
                              ),
                            ),
                          const SizedBox(height: 3),
                          Text(
                            _when(n.createdAt),
                            style: TextStyle(
                              fontSize: 10.5,
                              color: ink.withValues(alpha: 0.45),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// "just now", "12m ago", "3h ago", then the date.
  static String _when(DateTime at) {
    final mins = DateTime.now().difference(at).inMinutes;
    if (mins < 1) return 'just now';
    if (mins < 60) return '${mins}m ago';
    if (mins < 60 * 24) return '${mins ~/ 60}h ago';
    return '${at.day}/${at.month}/${at.year}';
  }
}
