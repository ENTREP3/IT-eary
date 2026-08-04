import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../../../models/models.dart';
import '../../../tokens.dart';
import '../admin_api.dart';
import 'widgets.dart';

/// Sales, costs and what's selling — plus expense entry.
class AnalyticsTab extends StatefulWidget {
  const AnalyticsTab({
    super.key,
    required this.orders,
    required this.expenses,
    required this.onChanged,
  });

  final List<Ticket> orders;
  final List<Expense> expenses;
  final Future<void> Function() onChanged;

  @override
  State<AnalyticsTab> createState() => _AnalyticsTabState();
}

class _AnalyticsTabState extends State<AnalyticsTab> {
  final _label = TextEditingController();
  final _amount = TextEditingController();
  String _category = 'Supplies';
  bool _busy = false;

  static const _categories = ['Supplies', 'Utilities', 'Labor', 'Other'];

  @override
  void dispose() {
    _label.dispose();
    _amount.dispose();
    super.dispose();
  }

  List<Ticket> get _settled => widget.orders.where((o) => o.isPaid).toList();

  String get _todayIso => DateTime.now().toIso8601String().substring(0, 10);

  double get _todayGross => _settled
      .where((o) => o.createdAt.toIso8601String().startsWith(_todayIso))
      .fold(0.0, (a, o) => a + o.total);

  double get _todayExpenses => widget.expenses
      .where((e) => e.spentOn == _todayIso)
      .fold(0.0, (a, e) => a + e.amount);

  Future<void> _addExpense() async {
    final amount = double.tryParse(_amount.text) ?? 0;
    if (_label.text.trim().isEmpty || amount <= 0) return;
    setState(() => _busy = true);
    try {
      await AdminApi.addExpense({
        'label': _label.text.trim(),
        'amount': amount,
        'category': _category,
        'spent_on': _todayIso,
      });
      _label.clear();
      _amount.clear();
      await widget.onChanged();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final net = _todayGross - _todayExpenses;
    final gcash = _settled.where((o) => o.isGcash).length;
    final cash = _settled.length - gcash;
    final mixTotal = gcash + cash;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 1.9,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          children: [
            StatTile(label: "Today's gross", value: peso(_todayGross)),
            StatTile(
              label: "Today's net",
              value: peso(net),
              delta: '${peso(_todayExpenses)} exp',
              good: net >= 0,
            ),
          ],
        ),

        const SizedBox(height: 12),
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionHeader(
                  eyebrow: 'Last 7 days', title: 'Sales vs expenses'),
              const SizedBox(height: 16),
              SizedBox(
                height: 170,
                child: _SalesChart(orders: _settled, expenses: widget.expenses),
              ),
              const SizedBox(height: 8),
              Row(children: [
                _legend('Sales', Tokens.staffAccent),
                const SizedBox(width: 14),
                _legend('Expenses', Tokens.semanticCritical),
              ]),
            ],
          ),
        ),

        const SizedBox(height: 12),
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionHeader(
                  eyebrow: 'Payment mix · settled', title: 'How diners pay'),
              const SizedBox(height: 14),
              if (mixTotal == 0)
                Text('No settled orders yet.',
                    style:
                        TextStyle(color: Tokens.staffInk.withValues(alpha: 0.5)))
              else ...[
                SizedBox(
                  height: 150,
                  child: PieChart(
                    PieChartData(
                      sectionsSpace: 2,
                      centerSpaceRadius: 40,
                      sections: [
                        PieChartSectionData(
                          value: gcash.toDouble(),
                          color: Tokens.semanticGcash,
                          title: '${(gcash / mixTotal * 100).round()}%',
                          radius: 34,
                          titleStyle: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: Colors.white),
                        ),
                        PieChartSectionData(
                          value: cash.toDouble(),
                          color: Tokens.staffAccent,
                          title: '${(cash / mixTotal * 100).round()}%',
                          radius: 34,
                          titleStyle: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: Tokens.staffCard),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  _legend('GCash · $gcash', Tokens.semanticGcash),
                  const SizedBox(width: 16),
                  _legend('Cash · $cash', Tokens.staffAccent),
                ]),
              ],
            ],
          ),
        ),

        const SizedBox(height: 12),
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionHeader(
                  eyebrow: 'Best sellers · 7d', title: "What's flying off the pan"),
              const SizedBox(height: 12),
              ..._bestSellers().map((e) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(children: [
                      Expanded(
                        child: Text(e.$1,
                            style: const TextStyle(color: Tokens.staffInk)),
                      ),
                      Text('${e.$2} sold',
                          style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              color: Tokens.staffInk)),
                    ]),
                  )),
              if (_bestSellers().isEmpty)
                Text('Nothing sold yet.',
                    style:
                        TextStyle(color: Tokens.staffInk.withValues(alpha: 0.5))),
            ],
          ),
        ),

        const SizedBox(height: 12),
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionHeader(eyebrow: 'Costs', title: 'Expenses'),
              const SizedBox(height: 14),
              TextField(
                controller: _label,
                style: const TextStyle(color: Tokens.staffInk),
                decoration: _dec('What was it for?'),
              ),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(
                  child: TextField(
                    controller: _amount,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    style: const TextStyle(color: Tokens.staffInk),
                    decoration: _dec('Amount (₱)'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _category,
                    dropdownColor: Tokens.staffCard,
                    style: const TextStyle(color: Tokens.staffInk),
                    decoration: _dec('Category'),
                    items: [
                      for (final c in _categories)
                        DropdownMenuItem(value: c, child: Text(c)),
                    ],
                    onChanged: (v) => setState(() => _category = v ?? 'Supplies'),
                  ),
                ),
              ]),
              const SizedBox(height: 10),
              FilledButton.icon(
                onPressed: _busy ? null : _addExpense,
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Add expense'),
                style: FilledButton.styleFrom(
                  backgroundColor: Tokens.staffAccent,
                  foregroundColor: Tokens.staffCard,
                  minimumSize: const Size.fromHeight(46),
                ),
              ),
              const Divider(height: 26),
              for (final e in widget.expenses.take(10))
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(e.label,
                              style: const TextStyle(color: Tokens.staffInk)),
                          Text('${e.category} · ${e.spentOn}',
                              style: TextStyle(
                                  fontSize: 11,
                                  color:
                                      Tokens.staffInk.withValues(alpha: 0.45))),
                        ],
                      ),
                    ),
                    Text(peso(e.amount),
                        style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            color: Tokens.staffInk)),
                    IconButton(
                      onPressed: () async {
                        await AdminApi.deleteExpense(e.id);
                        await widget.onChanged();
                      },
                      icon: const Icon(Icons.delete_outline, size: 17),
                      color: Tokens.semanticAlert,
                      visualDensity: VisualDensity.compact,
                    ),
                  ]),
                ),
            ],
          ),
        ),
      ],
    );
  }

  List<(String, int)> _bestSellers() {
    final tally = <String, int>{};
    for (final o in widget.orders) {
      for (final i in o.items) {
        tally[i.name] = (tally[i.name] ?? 0) + i.qty;
      }
    }
    final list = tally.entries.map((e) => (e.key, e.value)).toList()
      ..sort((a, b) => b.$2.compareTo(a.$2));
    return list.take(5).toList();
  }

  InputDecoration _dec(String label) => InputDecoration(
        labelText: label,
        labelStyle: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.6)),
        filled: true,
        fillColor: Tokens.staffGround,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide:
              BorderSide(color: Tokens.staffInk.withValues(alpha: 0.15)),
        ),
      );

  Widget _legend(String label, Color color) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 9, height: 9,
              decoration:
                  BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text(label,
              style: TextStyle(
                  fontSize: 12,
                  color: Tokens.staffInk.withValues(alpha: 0.7))),
        ],
      );
}

class _SalesChart extends StatelessWidget {
  const _SalesChart({required this.orders, required this.expenses});

  final List<Ticket> orders;
  final List<Expense> expenses;

  @override
  Widget build(BuildContext context) {
    final days = List.generate(7, (i) {
      final d = DateTime.now().subtract(Duration(days: 6 - i));
      return d.toIso8601String().substring(0, 10);
    });

    double salesOn(String iso) => orders
        .where((o) => o.createdAt.toIso8601String().startsWith(iso))
        .fold(0.0, (a, o) => a + o.total);
    double expOn(String iso) =>
        expenses.where((e) => e.spentOn == iso).fold(0.0, (a, e) => a + e.amount);

    final maxV = [
      ...days.map(salesOn),
      ...days.map(expOn),
    ].fold(0.0, (a, b) => a > b ? a : b);

    return BarChart(
      BarChartData(
        maxY: maxV == 0 ? 100 : maxV * 1.2,
        barGroups: [
          for (var i = 0; i < days.length; i++)
            BarChartGroupData(x: i, barsSpace: 2, barRods: [
              BarChartRodData(
                  toY: salesOn(days[i]),
                  color: Tokens.staffAccent,
                  width: 7,
                  borderRadius:
                      const BorderRadius.vertical(top: Radius.circular(2))),
              BarChartRodData(
                  toY: expOn(days[i]),
                  color: Tokens.semanticCritical,
                  width: 7,
                  borderRadius:
                      const BorderRadius.vertical(top: Radius.circular(2))),
            ]),
        ],
        gridData: FlGridData(
          drawVerticalLine: false,
          getDrawingHorizontalLine: (_) => FlLine(
              color: Tokens.staffInk.withValues(alpha: 0.08), strokeWidth: 1),
        ),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(),
          rightTitles: const AxisTitles(),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 40,
              getTitlesWidget: (v, _) => Text(
                v >= 1000 ? '${(v / 1000).toStringAsFixed(0)}k' : v.toInt().toString(),
                style: TextStyle(
                    fontSize: 9, color: Tokens.staffInk.withValues(alpha: 0.4)),
              ),
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              getTitlesWidget: (v, _) {
                const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                final d = DateTime.now().subtract(Duration(days: 6 - v.toInt()));
                return Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(names[d.weekday % 7],
                      style: TextStyle(
                          fontSize: 9,
                          color: Tokens.staffInk.withValues(alpha: 0.4))),
                );
              },
            ),
          ),
        ),
        barTouchData: BarTouchData(enabled: false),
      ),
    );
  }
}
