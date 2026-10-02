import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';

/// Whether a newer APK has been published, and where to get it.
class UpdateCheck {
  const UpdateCheck._();

  /// Where the releases live. Public, so this needs no credentials.
  static const _latest =
      'https://api.github.com/repos/ENTREP3/IT-eary-release-apk/releases/latest';

  /// Looks for a newer release. Null means there is nothing to say.
  static Future<AppUpdate?> latest() async {
    // The web builds update by being reloaded, so asking GitHub there would be
    // a question with no useful answer.
    if (kIsWeb) return null;

    try {
      final res = await http
          .get(Uri.parse(_latest), headers: const {
            'Accept': 'application/vnd.github+json',
          })
          .timeout(const Duration(seconds: 6));

      // 404 is the ordinary answer until the first release is published. It is
      // not a failure and must not be reported as one.
      if (res.statusCode != 200) return null;

      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (body['draft'] == true || body['prerelease'] == true) return null;

      final tag = (body['tag_name'] as String?)?.trim();
      if (tag == null || tag.isEmpty) return null;

      final info = await PackageInfo.fromPlatform();
      if (!_isNewer(tag, info.version)) return null;

      return AppUpdate(
        version: _clean(tag),
        notes: (body['body'] as String?)?.trim() ?? '',
        // The .apk asset if the release has one, otherwise the release page,
        // which at least gets somebody to the file with one more tap.
        url: _apkUrl(body) ?? (body['html_url'] as String? ?? ''),
      );
    } catch (_) {
      // Offline, slow, rate-limited, or something unexpected in the shape of
      // the response. None of it is the diner's problem.
      return null;
    }
  }

  /// The customer APK attached to a release, by name rather than by luck.
  static String? _apkUrl(Map<String, dynamic> body) {
    final assets = body['assets'];
    if (assets is! List) return null;

    String? fallback;
    for (final a in assets) {
      if (a is! Map) continue;
      final name = (a['name'] as String? ?? '').toLowerCase();
      if (!name.endsWith('.apk')) continue;

      // Never offer a staff build to a diner, whatever else is attached.
      if (name.contains('counter') || name.contains('owner')) continue;

      if (name == 'bencris.apk') return a['browser_download_url'] as String?;
      fallback ??= a['browser_download_url'] as String?;
    }
    return fallback;
  }

  /// Strips a leading v and anything after the version, so `v1.2.0` and
  /// `1.2.0+7` both compare as `1.2.0`.
  static String _clean(String raw) {
    var s = raw.trim();
    if (s.startsWith('v') || s.startsWith('V')) s = s.substring(1);
    return s.split('+').first.trim();
  }

  /// Compares two dotted versions a part at a time.
  ///
  /// String comparison would put 1.10.0 behind 1.9.0, which is exactly the
  /// release where somebody would notice.
  @visibleForTesting
  static bool isNewer(String candidate, String current) =>
      _isNewer(candidate, current);

  static bool _isNewer(String candidate, String current) {
    List<int> parts(String v) => _clean(v)
        .split('.')
        .map((p) => int.tryParse(p.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0)
        .toList();

    final a = parts(candidate);
    final b = parts(current);
    for (var i = 0; i < (a.length > b.length ? a.length : b.length); i++) {
      final x = i < a.length ? a[i] : 0;
      final y = i < b.length ? b[i] : 0;
      if (x != y) return x > y;
    }
    return false;
  }
}

/// A release newer than what is installed.
class AppUpdate {
  const AppUpdate({
    required this.version,
    required this.notes,
    required this.url,
  });

  final String version;

  /// What the owner wrote on the release, shown as-is.
  final String notes;

  /// The .apk if the release carries one, otherwise the release page.
  final String url;
}
