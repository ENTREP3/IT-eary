import 'dart:async';

import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../services/api.dart';
import '../../tokens.dart';

/// What the owner needs the counter to know today.
///
/// The website's staff screens have had this since announcements were built;
/// the phone apps were missed, so an owner posting "we close at 4 today" reached
/// every customer and neither of their own staff.
///
/// Shows the customers' announcements too, labelled, because the person at the
/// till is the one being asked about whatever the menu page is saying.
class StaffAnnouncement extends StatefulWidget {
  const StaffAnnouncement({super.key});

  @override
  State<StaffAnnouncement> createState() => _StaffAnnouncementState();
}

class _StaffAnnouncementState extends State<StaffAnnouncement> {
  Announcement? _item;
  bool _dismissed = false;
  Timer? _expiry;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _expiry?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final a = await Api.liveAnnouncement();
    if (!mounted) return;
    setState(() => _item = a);

    // Takes itself down when it expires, without being told to.
    _expiry?.cancel();
    if (a != null) {
      final left = a.endsAt.difference(DateTime.now());
      if (left.isNegative) {
        setState(() => _item = null);
      } else {
        _expiry = Timer(left, () {
          if (mounted) setState(() => _item = null);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = _item;
    if (a == null || _dismissed) return const SizedBox.shrink();

    final warning = a.isWarning;
    final tint = warning ? Tokens.semanticAlert : Tokens.staffAccent;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.fromLTRB(12, 10, 6, 10),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: tint.withValues(alpha: 0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            warning ? Icons.warning_amber_rounded : Icons.campaign_outlined,
            size: 17,
            color: tint,
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  a.audience == 'diners'
                      ? 'Customers are seeing this'
                      : 'From the owner',
                  style: TextStyle(
                    fontSize: 10,
                    letterSpacing: 1.4,
                    fontWeight: FontWeight.w600,
                    color: tint,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  a.message,
                  style: const TextStyle(
                    fontSize: 13,
                    height: 1.4,
                    color: Tokens.staffInk,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: () => setState(() => _dismissed = true),
            icon: const Icon(Icons.close, size: 16),
            color: Tokens.staffInk.withValues(alpha: 0.5),
            visualDensity: VisualDensity.compact,
            tooltip: 'Dismiss',
          ),
        ],
      ),
    );
  }
}
