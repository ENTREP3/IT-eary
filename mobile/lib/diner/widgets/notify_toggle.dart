import 'package:flutter/material.dart';

import '../../services/push.dart';
import '../../theme.dart';

/// Where a diner turns "tell me when it's ready" on.
///
/// The wording is about the food, not the technology. "Enable notifications"
/// asks somebody to weigh a vague future benefit against a known annoyance and
/// they decline; "tell me when my food is ready" is the thing they already
/// want while they are standing there waiting for it.
///
/// Renders nothing when the phone cannot do it — no Play Services, no Firebase
/// configuration, an emulator without Google apps. A switch that cannot work
/// is worse than no switch, because the diner flips it, believes they will be
/// told, and stands outside waiting.
class NotifyToggle extends StatefulWidget {
  const NotifyToggle({super.key});

  @override
  State<NotifyToggle> createState() => _NotifyToggleState();
}

class _NotifyToggleState extends State<NotifyToggle> {
  /// Null while the check runs, so nothing flashes on screen and vanishes.
  bool? _available;
  bool _on = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _look();
  }

  Future<void> _look() async {
    final can = await Push.available();
    final on = can && await Push.allowed();
    if (!mounted) return;
    setState(() {
      _available = can;
      _on = on;
    });
  }

  Future<void> _flip() async {
    setState(() => _busy = true);
    try {
      if (_on) {
        await Push.disable();
        if (mounted) setState(() => _on = false);
      } else {
        final ok = await Push.enable();
        if (!mounted) return;
        setState(() => _on = ok);

        /*
         * Said only on refusal, and said once.
         *
         * Android will not raise the prompt a second time, so somebody who
         * declined by reflex has no way back from inside the app and would
         * otherwise press this button forever wondering why nothing happens.
         */
        if (!ok) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Notifications are off for this app. You can turn them on in '
                'your phone settings.',
              ),
            ),
          );
        }
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_available != true) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
      decoration: BoxDecoration(
        color: Palette.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Palette.ink.withValues(alpha: 0.12)),
      ),
      child: Row(
        children: [
          Icon(
            _on ? Icons.notifications_active_outlined : Icons.notifications_off_outlined,
            size: 18,
            color: _on ? Palette.red : Palette.ink.withValues(alpha: 0.5),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _on ? 'You will be told when food is ready' : 'Tell me when my food is ready',
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                ),
                const SizedBox(height: 2),
                Text(
                  _on
                      ? 'Only about your own orders, and when a dish you asked '
                            'about is back.'
                      : 'A notification when your order is ready, even with the '
                            'app closed. Nothing else.',
                  style: TextStyle(
                    fontSize: 11.5,
                    height: 1.4,
                    color: Palette.ink.withValues(alpha: 0.6),
                  ),
                ),
              ],
            ),
          ),
          if (_busy)
            const Padding(
              padding: EdgeInsets.all(12),
              child: SizedBox(
                height: 16,
                width: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else
            Switch(value: _on, onChanged: (_) => _flip()),
        ],
      ),
    );
  }
}
