import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'services/api.dart';
import 'services/push.dart';

/// Backend selection, shared by both entrypoints.
const supabaseUrl = String.fromEnvironment(
  'SUPABASE_URL',
  defaultValue: 'https://tgazemsmihvodammodfu.supabase.co',
);
const supabaseAnonKey = String.fromEnvironment(
  'SUPABASE_ANON_KEY',
  defaultValue: 'sb_publishable_B3mvYfF2pMn2owzwGoHR8Q_Wx74GB7R',
);

/// Starts Flutter and Supabase, then runs [app].
///
/// The diner and staff apps are separate builds from one codebase, so this is
/// the single place either of them is wired to a backend.
Future<void> bootstrap(Widget app, {bool anonymousIdentity = false}) async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(url: supabaseUrl, publishableKey: supabaseAnonKey);

  // Only the diner app. Giving a device an identity is what makes a guest
  // ticket provably theirs; the counter and the dashboard sign in as people,
  // and an anonymous session there would only get in the way of the sign-in
  // screen they are supposed to meet.
  if (anonymousIdentity) await Api.ensureIdentity();

  /*
   * Firebase is started, but nobody is asked anything.
   */
  unawaited(Push.start());

  runApp(app);
}
