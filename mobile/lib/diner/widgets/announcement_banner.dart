import 'dart:async';

import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../services/api.dart';
import '../../staff/live_refresh.dart';
import '../../theme.dart';

/// What the shop needs to tell everybody today.
///
/// Closing early, a brownout at the palengke, kambing that will be gone by two.
/// None of it fits anywhere else on the storefront, because every other piece
/// of writing here answers a question the diner asked, and this one is the shop
/// speaking first.
///
/// A strip under the hero rather than a dialog over it. Somebody opening this
/// app has come to order lunch, and a modal between them and the food to say
/// "we close at 2 today" is the app serving itself. It can be dismissed,
/// because a person who has read it should not have to keep reading it.
///
/// Nothing on this screen waits for it, so a slow or unreachable Supabase
/// delays no part of ordering.
class AnnouncementBanner extends StatefulWidget {
  const AnnouncementBanner({super.key});

  @override
  State<AnnouncementBanner> createState() => _AnnouncementBannerState();
}

class _AnnouncementBannerState extends State<AnnouncementBanner> {
  Announcement? _item;
  LiveRefresh? _live;
  Timer? _expiry;

  /// Dismissed for this run, by id.
  ///
  /// Not remembered across restarts: the shop cannot reach a diner any other
  /// way, so something worth announcing is worth mentioning again next time the
  /// app opens. Keyed by id so a new announcement is never silenced by one the
  /// diner dismissed an hour ago.
  String? _dismissed;

  @override
  void initState() {
    super.initState();
    _load();
    _live = LiveRefresh.watch(
      name: 'diner-announcements',
      tables: const ['announcements'],
      onChange: _load,
    );
  }

  @override
  void dispose() {
    _expiry?.cancel();
    _live?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final next = await Api.liveAnnouncement();
    if (!mounted) return;
    setState(() => _item = next);
    _armExpiry();
  }

  /// Takes it down when it expires, without being told to.
  ///
  /// Expiry is the clock passing a timestamp, not a row changing, so there is
  /// no database event to listen for and realtime will never mention it. A
  /// phone left open on the menu through closing time would otherwise still be
  /// showing this afternoon's notice tomorrow morning.
  void _armExpiry() {
    _expiry?.cancel();
    final item = _item;
    if (item == null) return;

    final left = item.endsAt.difference(DateTime.now());
    if (!left.isNegative) {
      _expiry = Timer(left, () {
        if (mounted) setState(() => _item = null);
      });
      return;
    }
    // Already over by the time it arrived.
    _item = null;
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    if (item == null || _dismissed == item.id) return const SizedBox.shrink();

    final accent = item.isWarning ? Palette.red : Palette.ink;

    return Container(
      margin: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
      decoration: BoxDecoration(
        color: Palette.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accent.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            item.isWarning ? Icons.warning_amber_rounded : Icons.campaign_outlined,
            size: 18,
            color: accent,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 1),
              child: Text(
                item.message,
                style: const TextStyle(fontSize: 13, height: 1.45),
              ),
            ),
          ),
          IconButton(
            onPressed: () => setState(() => _dismissed = item.id),
            icon: const Icon(Icons.close, size: 16),
            color: Palette.ink.withValues(alpha: 0.45),
            tooltip: 'Dismiss',
          ),
        ],
      ),
    );
  }
}
