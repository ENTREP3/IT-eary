import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/update_check.dart';
import '../../theme.dart';

/// Tells a diner a newer app exists, once, quietly.
class UpdateBanner extends StatefulWidget {
  const UpdateBanner({super.key});

  @override
  State<UpdateBanner> createState() => _UpdateBannerState();
}

class _UpdateBannerState extends State<UpdateBanner> {
  AppUpdate? _update;

  /// Dismissed for this run. Deliberately not remembered across restarts: the
  /// shop cannot push a fix any other way, so an update worth shipping is
  /// worth mentioning again next time the app opens.
  bool _hidden = false;

  @override
  void initState() {
    super.initState();
    // Fire and forget. Nothing on this screen waits for it, so a slow or
    // unreachable GitHub delays no part of ordering.
    UpdateCheck.latest().then((u) {
      if (mounted && u != null) setState(() => _update = u);
    });
  }

  Future<void> _open() async {
    final u = _update;
    if (u == null || u.url.isEmpty) return;
    final uri = Uri.tryParse(u.url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final u = _update;
    if (u == null || _hidden) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
      decoration: BoxDecoration(
        color: Palette.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Palette.red.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.system_update, size: 18, color: Palette.red),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Version ${u.version} is out',
                  style: const TextStyle(
                      fontWeight: FontWeight.w600, fontSize: 13),
                ),
                Text(
                  'Tap to download the new app.',
                  style: TextStyle(
                    fontSize: 12,
                    color: Palette.ink.withValues(alpha: 0.65),
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: _open,
            child: const Text('Get it'),
          ),
          IconButton(
            onPressed: () => setState(() => _hidden = true),
            icon: const Icon(Icons.close, size: 16),
            color: Palette.ink.withValues(alpha: 0.45),
            tooltip: 'Not now',
          ),
        ],
      ),
    );
  }
}
