import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Backend selection, shared by both entrypoints.
///
/// Defaults to the **hosted** project, so the real staff accounts created in
/// the Supabase dashboard work with a plain `flutter run` — no flags, no demo
/// credentials.
///
/// To develop against the local Docker stack instead:
///
///   flutter run -t lib/main_diner.dart \
///     --dart-define=SUPABASE_URL=http://127.0.0.1:55321 \
///     --dart-define=SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
///
/// Android emulator note: 127.0.0.1 inside the emulator is the emulator itself,
/// so use http://10.0.2.2:55321 to reach Supabase running on the host machine.
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
