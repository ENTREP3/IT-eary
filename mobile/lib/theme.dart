import 'package:flutter/material.dart';

import 'tokens.dart';

/// Karinderya palette.
///
/// These are aliases onto [Tokens], which is generated from
/// `design/tokens.json` — the same file the React apps read. Changing a brand
/// colour means editing that one file and running `npm run tokens`; it can no
/// longer drift between the web and mobile builds.
class Palette {
  static const cream = Tokens.dinerGround;
  static const card = Tokens.dinerCard;
  static const ink = Tokens.dinerInk;
  static const red = Tokens.dinerAccent;
  static const gold = Tokens.staffAccent;
  static const green = Tokens.semanticCash;
}

/// Widest the content is allowed to get. This is a phone-shaped app, so on a
/// desktop browser we hold it to a readable column instead of letting a single
/// dish photo span 1400px.
const kMaxContentWidth = 520.0;

/// Centres its child and caps its width. Wrap every screen body in this so the
/// same build works on a phone and in a desktop browser tab.
///
/// Set [shrinkHeight] when the parent measures height intrinsically — a
/// `bottomNavigationBar`, for example. Without it the default `Center` reports
/// an unbounded height there, which starves the Scaffold body of space and
/// blanks the page.
class PageBody extends StatelessWidget {
  const PageBody({super.key, required this.child, this.shrinkHeight = false});

  final Widget child;
  final bool shrinkHeight;

  @override
  Widget build(BuildContext context) {
    return Center(
      heightFactor: shrinkHeight ? 1.0 : null,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: kMaxContentWidth),
        child: child,
      ),
    );
  }
}

/// Dark theme for the staff app — the counter and kitchen are dim, and a bright
/// screen at the till is hard to read. Mirrors the React staff palette.
ThemeData buildStaffTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: Tokens.staffGround,
    colorScheme: base.colorScheme.copyWith(
      primary: Tokens.staffAccent,
      secondary: Tokens.semanticGcash,
      surface: Tokens.staffCard,
      onSurface: Tokens.staffInk,
    ),
    textTheme: base.textTheme.apply(
      bodyColor: Tokens.staffInk,
      displayColor: Tokens.staffInk,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Tokens.staffCard,
      surfaceTintColor: Colors.transparent,
      foregroundColor: Tokens.staffInk,
      elevation: 0,
    ),
  );
}

ThemeData buildTheme() {
  final base = ThemeData.light(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: Palette.cream,
    colorScheme: base.colorScheme.copyWith(
      primary: Palette.ink,
      secondary: Palette.red,
      surface: Palette.card,
    ),
    textTheme: base.textTheme.apply(
      bodyColor: Palette.ink,
      displayColor: Palette.ink,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Palette.cream,
      surfaceTintColor: Colors.transparent,
      foregroundColor: Palette.ink,
      elevation: 0,
      centerTitle: true,
    ),
  );
}
