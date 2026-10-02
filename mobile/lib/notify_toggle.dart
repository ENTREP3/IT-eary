import 'package:flutter/material.dart';

import 'services/push.dart';
import 'theme.dart';
import 'tokens.dart';

/// Where somebody turns notifications on.
class NotifyToggle extends StatefulWidget {
  /// For the diner: their own order, and dishes they asked after.
  const NotifyToggle.diner({super.key})
    : _onTitle = 'You will be told when food is ready',
      _offTitle = 'Tell me when my food is ready',
      _onBlurb =
          'Only about your own orders, and when a dish you asked about is back.',
      _offBlurb =
          'A notification when your order is ready, even with the app closed. '
              'Nothing else.',
      _dark = false;

  /// For the counter and the owner: what the shop needs them to know.
  const NotifyToggle.staff({super.key})
    : _onTitle = 'You will be told what happens in the shop',
      _offTitle = 'Tell me what happens in the shop',
      _onBlurb =
          'Sold-out dishes, low stock, GCash proofs waiting, cancellations '
              'and poor ratings.',
      _offBlurb =
          'The shop can reach this phone when something needs attention, even '
              'with the app closed.',
      _dark = true;

  final String _onTitle;
  final String _offTitle;
  final String _onBlurb;
  final String _offBlurb;

  /// Staff screens are near-black; the diner's are cream.
  final bool _dark;

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
         * otherwise press this forever wondering why nothing happens.
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

    final card = widget._dark ? Tokens.staffCard : Palette.card;
    final ink = widget._dark ? Tokens.staffInk : Palette.ink;
    final accent = widget._dark ? Tokens.staffAccent : Palette.red;

    return Container(
      margin: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
      decoration: BoxDecoration(
        color: card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ink.withValues(alpha: 0.12)),
      ),
      child: Row(
        children: [
          Icon(
            _on
                ? Icons.notifications_active_outlined
                : Icons.notifications_off_outlined,
            size: 18,
            color: _on ? accent : ink.withValues(alpha: 0.5),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _on ? widget._onTitle : widget._offTitle,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                    color: ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _on ? widget._onBlurb : widget._offBlurb,
                  style: TextStyle(
                    fontSize: 11.5,
                    height: 1.4,
                    color: ink.withValues(alpha: 0.6),
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
