import 'package:flutter/material.dart';

import '../theme.dart';
import 'sign_in_screen.dart';
import 'staff_api.dart';
import 'staff_shell.dart';

/// Shared shell for the two staff apps.
///
/// Each staff app is its own build with its own door, so a cashier's phone
/// never carries the owner UI and vice versa. This widget holds the bit they
/// genuinely share: restore a session, gate on role, hand off to the surface.
///
/// The role check here is convenience. What actually protects the owner's data
/// is RLS and the `is_admin()` guards in Postgres — a cashier running a
/// tampered build still gets nothing.
class StaffEntry extends StatefulWidget {
  const StaffEntry({super.key, required this.area, required this.title});

  final StaffArea area;
  final String title;

  @override
  State<StaffEntry> createState() => _StaffEntryState();
}

class _StaffEntryState extends State<StaffEntry> {
  String? _role;
  bool _checking = true;

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    final userId = StaffApi.session?.user.id;
    final role = userId == null ? null : await StaffApi.roleOf(userId);
    if (!mounted) return;
    setState(() {
      // A session only counts if the account may use *this* app. An owner who
      // signed into the cashier build stays on the till.
      _role = (role != null && widget.area.allowed.contains(role)) ? role : null;
      _checking = false;
    });
  }

  Future<void> _signOut() async {
    await StaffApi.signOut();
    if (mounted) setState(() => _role = null);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: widget.title,
      debugShowCheckedModeBanner: false,
      theme: buildStaffTheme(),
      home: Builder(
        builder: (_) {
          if (_checking) {
            return const Scaffold(
              body: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            );
          }
          if (_role == null) {
            return SignInScreen(
              area: widget.area,
              onSignedIn: (role) => setState(() => _role = role),
            );
          }
          return StaffShell(
            role: _role!,
            area: widget.area,
            onSignOut: _signOut,
          );
        },
      ),
    );
  }
}
