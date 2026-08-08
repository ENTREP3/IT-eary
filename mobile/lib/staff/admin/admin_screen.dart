import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../tokens.dart';
import 'admin_api.dart';
import 'tabs/analytics_tab.dart';
import 'tabs/dashboard_tab.dart';
import 'tabs/inventory_tab.dart';
import 'tabs/kitchen_tab.dart';
import 'tabs/menu_tab.dart';
import 'tabs/payments_tab.dart';

/// Owner dashboard — the mobile twin of the React admin, same six tabs.
class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key, this.onSignOut});

  final Future<void> Function()? onSignOut;

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  int _tab = 0;

  List<Ticket> _orders = [];
  List<Dish> _dishes = [];
  List<InventoryItem> _inventory = [];
  List<Expense> _expenses = [];
  bool _loading = true;
  String? _error;

  static const _titles = [
    ('Overview', 'Magandang hapon'),
    ('Order queue', 'Orders on the line'),
    ('Stock room', 'What we have in stock'),
    ('Sales & profit', 'The numbers, in plain sight'),
    ('Menu control', "Today's menu"),
    ('Payment settings', 'How customers pay you'),
  ];

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  /// Loads every owner-only dataset.
  ///
  /// This runs after sign-in on purpose. Fetching at app start would run while
  /// the user is still anonymous, and RLS would correctly return nothing — the
  /// exact bug that once left the web inventory screen permanently empty.
  Future<void> _loadAll() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        AdminApi.recentOrders(),
        AdminApi.dishes(),
        AdminApi.inventory(),
        AdminApi.expenses(),
      ]);
      if (!mounted) return;
      setState(() {
        _orders = results[0] as List<Ticket>;
        _dishes = results[1] as List<Dish>;
        _inventory = results[2] as List<InventoryItem>;
        _expenses = results[3] as List<Expense>;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  int get _activeOrders => _orders
      .where((o) => const ['pending', 'paid', 'preparing', 'ready'].contains(o.status))
      .length;

  int get _lowStock => _inventory.where((i) => i.isLow).length;

  @override
  Widget build(BuildContext context) {
    final (eyebrow, title) = _titles[_tab];

    return Scaffold(
      backgroundColor: Tokens.staffGround,
      appBar: AppBar(
        backgroundColor: Tokens.staffCard,
        titleSpacing: 16,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              eyebrow.toUpperCase(),
              style: TextStyle(
                fontSize: 9,
                letterSpacing: 2.5,
                color: Tokens.staffInk.withValues(alpha: 0.45),
              ),
            ),
            Text(
              title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: _loadAll,
            icon: const Icon(Icons.refresh, size: 20),
            tooltip: 'Refresh',
          ),
          if (widget.onSignOut != null)
            IconButton(
              onPressed: widget.onSignOut,
              icon: const Icon(Icons.logout, size: 18),
              tooltip: 'Sign out',
            ),
        ],
      ),
      drawer: _drawer(),
      body: _loading
          ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
          : _error != null
              ? _errorView()
              : RefreshIndicator(
                  onRefresh: _loadAll,
                  child: _body(),
                ),
    );
  }

  Widget _body() => switch (_tab) {
        0 => DashboardTab(
            orders: _orders,
            inventory: _inventory,
            onResolved: _loadAll,
          ),
        1 => KitchenTab(orders: _orders, onChanged: _loadAll),
        2 => InventoryTab(items: _inventory, onChanged: _loadAll),
        3 => AnalyticsTab(orders: _orders, expenses: _expenses, onChanged: _loadAll),
        4 => MenuTab(dishes: _dishes, onChanged: _loadAll),
        _ => const PaymentsTab(),
      };

  Widget _errorView() => ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 60),
          const Icon(Icons.cloud_off, size: 36, color: Tokens.semanticAlert),
          const SizedBox(height: 12),
          Center(
            child: Text(
              "Couldn't load the dashboard.",
              style: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.8)),
            ),
          ),
          const SizedBox(height: 6),
          Center(
            child: Text(
              _error!,
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 12, color: Tokens.staffInk.withValues(alpha: 0.5)),
            ),
          ),
          const SizedBox(height: 16),
          Center(
            child: OutlinedButton(onPressed: _loadAll, child: const Text('Try again')),
          ),
        ],
      );

  Widget _drawer() {
    const items = [
      (Icons.dashboard_outlined, 'Dashboard'),
      (Icons.restaurant_outlined, 'Kitchen'),
      (Icons.inventory_2_outlined, 'Inventory'),
      (Icons.show_chart, 'Sales & Profit'),
      (Icons.menu_book_outlined, 'Menu'),
      (Icons.credit_card_outlined, 'Payments'),
    ];

    return Drawer(
      backgroundColor: Tokens.staffCard,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  RichText(
                    text: const TextSpan(
                      style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w800,
                          color: Tokens.staffInk),
                      children: [
                        TextSpan(text: 'Ben'),
                        TextSpan(
                          text: 'cris',
                          style: TextStyle(
                              fontStyle: FontStyle.italic,
                              color: Tokens.staffAccent),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    'OPERATIONS',
                    style: TextStyle(
                      fontSize: 9,
                      letterSpacing: 3,
                      color: Tokens.staffInk.withValues(alpha: 0.35),
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(8),
                itemCount: items.length,
                itemBuilder: (_, i) {
                  final (icon, label) = items[i];
                  final selected = i == _tab;
                  final badge = i == 1
                      ? _activeOrders
                      : i == 2
                          ? _lowStock
                          : 0;
                  return ListTile(
                    selected: selected,
                    selectedTileColor: Tokens.staffAccent,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                    leading: Icon(icon,
                        size: 20,
                        color: selected ? Tokens.staffCard : Tokens.staffInk),
                    title: Text(
                      label,
                      style: TextStyle(
                        fontSize: 14,
                        color: selected ? Tokens.staffCard : Tokens.staffInk,
                        fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                      ),
                    ),
                    trailing: badge > 0
                        ? Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 7, vertical: 2),
                            decoration: BoxDecoration(
                              color: selected
                                  ? Tokens.staffCard
                                  : Tokens.semanticCritical,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              '$badge',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: selected
                                    ? Tokens.staffAccent
                                    : Colors.white,
                              ),
                            ),
                          )
                        : null,
                    onTap: () {
                      setState(() => _tab = i);
                      Navigator.of(context).pop();
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
