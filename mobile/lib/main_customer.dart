import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'bootstrap.dart';
import 'diner/screens/menu_screen.dart';
import 'diner/screens/onboarding_screen.dart';
import 'diner/state/cart.dart';
import 'theme.dart';

/// The diner app: browse, order, hold a ticket. No sign-in anywhere.
///
///   flutter run -t lib/main_diner.dart
Future<void> main() => bootstrap(const DinerApp());

class DinerApp extends StatelessWidget {
  const DinerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => Cart(),
      child: MaterialApp(
        title: 'IT-eary',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: const _FirstRunGate(),
      ),
    );
  }
}

/// Shows the tutorial once, then never again.
class _FirstRunGate extends StatefulWidget {
  const _FirstRunGate();

  @override
  State<_FirstRunGate> createState() => _FirstRunGateState();
}

class _FirstRunGateState extends State<_FirstRunGate> {
  bool? _needsOnboarding;

  @override
  void initState() {
    super.initState();
    OnboardingScreen.hasSeen().then((seen) {
      if (mounted) setState(() => _needsOnboarding = !seen);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_needsOnboarding == null) {
      // Blank rather than a spinner: this resolves in a frame or two, and a
      // flash of loading on every cold start looks broken.
      return const Scaffold();
    }
    if (_needsOnboarding!) {
      return OnboardingScreen(
        onDone: () => setState(() => _needsOnboarding = false),
      );
    }
    return const MenuScreen();
  }
}
