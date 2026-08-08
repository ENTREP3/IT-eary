import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Backend selection, shared by both entrypoints.
///
/// The hosted Supabase project, the same one the web app uses. A plain
/// `flutter run` or `flutter build apk` needs no flags and no local server.
///
/// This is why a released APK works anywhere. The app talks straight to
/// Supabase over HTTPS, so it never needs to reach the development laptop and
/// is not tied to the Wi-Fi the laptop happens to be on. Overriding these with
/// `--dart-define` to point at a machine on the LAN is what creates a
/// same-network requirement, so do not ship a build made that way.
///
/// The publishable key is safe to ship — it is designed to be public, and every
/// rule that matters is enforced by RLS and SECURITY DEFINER functions.
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
Future<void> bootstrap(Widget app) async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(url: supabaseUrl, publishableKey: supabaseAnonKey);
  runApp(app);
}
