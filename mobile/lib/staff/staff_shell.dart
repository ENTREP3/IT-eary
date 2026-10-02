import 'package:flutter/material.dart';

import '../tokens.dart';
import 'admin/admin_screen.dart';
import 'cashier/cashier_screen.dart';
import 'sign_in_screen.dart';

/// Routes a signed-in staff member to the right surface.
class StaffShell extends StatefulWidget {
  const StaffShell({
    super.key,
    required this.role,
    required this.area,
    required this.onSignOut,
  });

  final String role;
  final StaffArea area;
  final Future<void> Function() onSignOut;

  @override
  State<StaffShell> createState() => _StaffShellState();
}

class _StaffShellState extends State<StaffShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    if (widget.role != 'admin' || widget.area != StaffArea.admin) {
      return CashierScreen(onSignOut: widget.onSignOut);
    }

    return Scaffold(
      backgroundColor: Tokens.staffGround,
      body: IndexedStack(
        index: _index,
        children: [
          AdminScreen(onSignOut: widget.onSignOut),
          CashierScreen(onSignOut: widget.onSignOut),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        backgroundColor: Tokens.staffCard,
        indicatorColor: Tokens.staffAccent.withValues(alpha: 0.2),
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard, color: Tokens.staffAccent),
            label: 'Operations',
          ),
          NavigationDestination(
            icon: Icon(Icons.point_of_sale_outlined),
            selectedIcon: Icon(Icons.point_of_sale, color: Tokens.staffAccent),
            label: 'Counter',
          ),
        ],
      ),
    );
  }
}
