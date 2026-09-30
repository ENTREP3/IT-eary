import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api.dart';

/// Reaching a diner who has closed the app.
///
/// Everything the system tells somebody today needs them to be watching: the
/// ticket screen updates itself, the banner appears, the menu changes under
/// them. All of it over a connection that exists only while the app is open.
/// Close it and the shop cannot reach you — which is exactly when it most
/// needs to, because you are waiting for food and therefore doing something
/// else.
///
/// The same machinery as the website: one `push_tokens` table, one sender, one
/// set of rules about who gets told what. This is only the half that runs on
/// the phone.
///
/// ---------------------------------------------------------------------------
/// Permission is never asked for on startup
///
/// Android has asked before showing notifications since 13, and a prompt that
/// appears before somebody has done anything is why people refuse reflexively.
/// A refusal is also close to permanent — the app cannot ask twice, and the
/// diner has to go into system settings, which nobody does. So the question is
/// only put when they press something that says what it is for.
class Push {
  const Push._();

  static bool _ready = false;

  /// Starts Firebase. Safe to call more than once.
  ///
  /// Failure is swallowed on purpose. A missing google-services.json, a
  /// Play-Services-less handset, a network that is not there yet — none of it
  /// should stop somebody ordering lunch, and all of it means the same thing
  /// here: no notifications, everything else as normal.
  static Future<void> start() async {
    if (_ready) return;
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(_whileClosed);
      _ready = true;
    } catch (_) {
      _ready = false;
    }
  }

  /// Whether this device could receive a notification at all.
  static Future<bool> available() async {
    if (kIsWeb) return false;
    await start();
    return _ready;
  }

  /// Whether the diner has already agreed, without asking them again.
  static Future<bool> allowed() async {
    if (!await available()) return false;
    final settings = await FirebaseMessaging.instance.getNotificationSettings();
    return settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  /// Asks, and records where to send if allowed.
  ///
  /// Returns whether notifications are now on. Every way this can decline to
  /// work returns false, because the diner's position is the same in all of
  /// them and a red error over a convenience they just opted into is out of
  /// proportion to what was lost.
  static Future<bool> enable() async {
    if (!await available()) return false;

    final settings = await FirebaseMessaging.instance.requestPermission();
    final granted =
        settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
    if (!granted) return false;

    final token = await FirebaseMessaging.instance.getToken();
    if (token == null) return false;

    try {
      await Api.registerPushToken(token, 'android');
    } catch (_) {
      // Allowed by the phone but not recorded by the shop, so nothing would
      // actually arrive. Saying yes here would be a promise discovered to be
      // false only by missing the notification they asked for.
      return false;
    }

    /*
     * Firebase reissues tokens — on reinstall, on restore to a new phone, and
     * occasionally for its own reasons. A token the shop recorded once and
     * never revisited quietly stops being the address of this device, and the
     * diner is unreachable without anything appearing to be wrong.
     */
    FirebaseMessaging.instance.onTokenRefresh.listen((fresh) {
      Api.registerPushToken(fresh, 'android').catchError((_) {});
    });

    return true;
  }

  /// Stops notifications to this device, leaving the diner's others alone.
  static Future<void> disable() async {
    if (!await available()) return;
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) {
      try {
        await Api.forgetPushToken(token);
      } catch (_) {
        /* the phone will stop asking either way once permission is revoked */
      }
    }
    // Deleting the token means Firebase will not deliver to this install even
    // if a row somewhere survives.
    await FirebaseMessaging.instance.deleteToken();
  }

  /// Re-registers an already-granted device against whoever is signed in now.
  ///
  /// A diner who allowed notifications as a guest and then made an account had
  /// their device recorded against the anonymous identity they used to be.
  /// Called after signing in, it costs one round trip and fixes that. Raises
  /// no prompt: it returns at once unless permission was already given.
  static Future<void> reregister() async {
    if (!await allowed()) return;
    final token = await FirebaseMessaging.instance.getToken();
    if (token == null) return;
    try {
      await Api.registerPushToken(token, 'android');
    } catch (_) {
      /* nothing the diner can do about this, and nothing they need told */
    }
  }

  /// Notifications that arrive while the diner is looking at the app.
  ///
  /// The system tray only shows a message when the app is in the background,
  /// so without this a notification landing while somebody stares at their
  /// ticket is delivered and then silently dropped — which is the one they are
  /// most likely to be waiting for.
  static StreamSubscription<RemoteMessage> watchForeground(
    void Function(String title, String body) onNotice,
  ) {
    return FirebaseMessaging.onMessage.listen((message) {
      final data = message.data;
      final title = data['title'] ?? message.notification?.title ?? 'Bencris';
      final body = data['body'] ?? message.notification?.body ?? '';
      if (title.isNotEmpty) onNotice(title, body);
    });
  }
}

/// Runs when a message arrives with the app closed.
///
/// Must be a top-level function: Android starts a separate Dart isolate to run
/// it, with none of the app's state, so anything captured from a class or a
/// closure simply is not there.
///
/// Deliberately empty. The sender posts data-only messages and Android shows
/// the tray notification itself; doing anything here as well would produce two
/// banners for one event.
@pragma('vm:entry-point')
Future<void> _whileClosed(RemoteMessage message) async {}
