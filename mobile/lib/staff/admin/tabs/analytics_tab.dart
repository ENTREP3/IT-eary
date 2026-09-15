import 'dart:convert';
import 'dart:typed_data';

import 'package:file_saver/file_saver.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../../../models/models.dart';
import '../../../tokens.dart';
import '../admin_api.dart';
import 'widgets.dart';

/// Quotes a cell only when it would otherwise break the row.
String _csvCell(Object? v) {
  final s = v?.toString() ?? '';
  if (RegExp(r'[",\n\r]').hasMatch(s)) return '"${s.replaceAll('"', '""')}"';
  return s;
}

/// Builds the same multi-section sheet the web admin exports.
///
/// One file with titled blocks rather than six downloads, because the owner
/// opens it in a spreadsheet to compare the sections against each other.
String _buildCsv(
    List<({String title, List<String> headers, List<List<Object?>> rows})> s) {
  final out = <String>[];
  for (final section in s) {
    out.add(section.title);
    out.add(section.headers.map(_csvCell).join(','));
    for (final r in section.rows) {
      out.add(r.map(_csvCell).join(','));
    }
    out.add('');
  }
  // Byte order mark, so Excel reads the peso signs as UTF-8 rather than mojibake.
  return '﻿${out.join('\r\n')}';
}

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
  bool _exporting = false;

  /// The day the money went out, which is not always today. A sack of rice
  /// bought yesterday and logged this morning belongs to yesterday, or both
  /// days' profit lines are wrong.
  DateTime _spentOn = DateTime.now();

  static const _categories = [
    'Supplies',
    'Utilities',
    'Labor',
    'Rent',
    'Other'
  ];

  @override
  void dispose() {
    _label.dispose();
    _amount.dispose();
    super.dispose();
  }

  List<Ticket> get _settled =>
      widget.orders.where((o) => o.countsAsSale).toList();

  static String _iso(DateTime d) => d.toIso8601String().substring(0, 10);

  String get _todayIso => _iso(DateTime.now());

  double get _todayGross => _settled
      .where((o) => o.createdAt.toIso8601String().startsWith(_todayIso))
      .fold(0.0, (a, o) => a + o.total);

  double get _todayExpenses => widget.expenses
      .where((e) => e.spentOn == _todayIso)
      .fold(0.0, (a, e) => a + e.amount);

  /// Saves everything on this screen as one spreadsheet.
  ///
  /// The menu and inventory are fetched here rather than passed in: this screen
  /// does not otherwise need them, and an export is rare enough that a read at
  /// the moment it is asked for is cheaper than holding two more lists in
  /// memory all day.
  Future<void> _export() async {
    setState(() => _exporting = true);
    try {
      final dishes = await AdminApi.dishes();
      final inventory = await AdminApi.inventory();

      final days = List.generate(7, (i) {
        final d = DateTime.now().subtract(Duration(days: 6 - i));
        return _iso(d);
      });
      final gcash = _settled.where((o) => o.isGcash).length;
      final cash = _settled.length - gcash;
      final mixTotal = gcash + cash;
      int pct(int n) => mixTotal == 0 ? 0 : ((n / mixTotal) * 100).round();

      final csv = _buildCsv([
        (
          title: 'Sales (last 7 days, paid and not cancelled)',
          headers: ['day', 'sales_php'],
          rows: [
            for (final d in days)
              [
                d,
                _settled
                    .where((o) => o.createdAt.toIso8601String().startsWith(d))
                    .fold(0.0, (a, o) => a + o.total)
                    .toStringAsFixed(2),
              ],
          ],
        ),
        (
          title: 'Orders (all loaded)',
          headers: [
            'ticket',
            'items',
            'total_php',
            'method',
            'status',
            'created_at',
            'paid_at',
          ],
          rows: [
            for (final o in widget.orders)
              [
                o.ticketCode,
                o.items.map((i) => '${i.qty}x ${i.name}').join('; '),
                o.total.toStringAsFixed(2),
                o.paymentMethod ?? 'unpaid',
                o.status,
                o.createdAt.toIso8601String(),
                o.paidAt?.toIso8601String() ?? '',
              ],
          ],
        ),
        (
          title: 'Payment mix (paid and not cancelled)',
          headers: ['method', 'orders', 'percent'],
          rows: [
            ['GCash', gcash, pct(gcash)],
            ['Cash', cash, pct(cash)],
          ],
        ),
        (
          title: 'Expenses',
          headers: ['spent_on', 'label', 'category', 'amount_php'],
          rows: [
            for (final e in widget.expenses)
              [e.spentOn, e.label, e.category, e.amount.toStringAsFixed(2)],
          ],
        ),
        (
          title: 'Menu items (current)',
          headers: ['id', 'name', 'tagalog', 'category', 'price_php', 'available'],
          rows: [
            for (final d in dishes)
              [
                d.id,
                d.name,
                d.tagalog,
                d.category,
                d.price.toStringAsFixed(2),
                d.available,
              ],
          ],
        ),
        (
          title: 'Inventory (current)',
          headers: [
            'id',
            'name',
            'unit',
            'stock',
            'reorder_at',
            'cost_per_unit_php',
            'last_delivery',
          ],
          rows: [
            for (final i in inventory)
              [
                i.id,
                i.name,
                i.unit,
                i.stock,
                i.reorderAt,
                i.costPerUnit.toStringAsFixed(2),
                i.lastDelivery ?? '',
              ],
          ],
        ),
      ]);

      await FileSaver.instance.saveFile(
        name: 'bencris-analytics-${_iso(DateTime.now())}',
        bytes: Uint8List.fromList(utf8.encode(csv)),
        ext: 'csv',
        mimeType: MimeType.csv,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Saved to your downloads.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Export failed: $e')));
      }
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  Future<void> _pickSpentOn() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _spentOn,
      firstDate: DateTime(now.year - 1),
      // Money cannot go out in the future.
      lastDate: now,
    );
    if (picked != null && mounted) setState(() => _spentOn = picked);
  }

  Future<void> _addExpense() async {
    final amount = double.tryParse(_amount.text) ?? 0;
    if (_label.text.trim().isEmpty || amount <= 0) return;
    setState(() => _busy = true);
    try {
      await AdminApi.addExpense({
        'label': _label.text.trim(),
        'amount': amount,
        'category': _category,
        'spent_on': _iso(_spentOn),
      });
      _label.clear();
      _amount.clear();
      _spentOn = DateTime.now();
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
        // Above the figures on purpose. A margin quietly eaten by a supplier
        // price rise is the thing most worth acting on, and it is invisible in
        // a sales chart, which only ever shows money coming in.
        PriceSuggestions(onChanged: widget.onChanged),
        const CogsPanel(),
        Align(
          alignment: Alignment.centerRight,
          child: OutlinedButton.icon(
            onPressed: _exporting ? null : _export,
            icon: const Icon(Icons.download_outlined, size: 16),
            label: Text(_exporting ? 'Preparing…' : 'Export CSV'),
            style: OutlinedButton.styleFrom(
              foregroundColor: Tokens.staffInk,
              side: BorderSide(color: Tokens.staffInk.withValues(alpha: 0.2)),
            ),
          ),
        ),
        const SizedBox(height: 12),
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
              InkWell(
                onTap: _pickSpentOn,
                borderRadius: BorderRadius.circular(12),
                child: InputDecorator(
                  decoration: _dec('Date'),
                  child: Row(children: [
                    const Icon(Icons.event_outlined,
                        size: 16, color: Tokens.staffInk),
                    const SizedBox(width: 8),
                    Text(
                      _iso(_spentOn) == _todayIso
                          ? 'Today, ${_iso(_spentOn)}'
                          : _iso(_spentOn),
                      style: const TextStyle(color: Tokens.staffInk),
                    ),
                  ]),
                ),
              ),
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
        .where((o) =>
            o.countsAsSale && o.createdAt.toIso8601String().startsWith(iso))
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

/// What the food actually cost to make, above what it sold for.
///
/// Sales minus what was bought is cash flow. Sales minus what was *sold* is
/// profit. The owner needs the first to survive the week and the second to know
/// whether the menu is priced right, so both are on the screen.
class CogsPanel extends StatefulWidget {
  const CogsPanel({super.key});

  @override
  State<CogsPanel> createState() => _CogsPanelState();
}

class _CogsPanelState extends State<CogsPanel> {
  List<Map<String, dynamic>>? _rows;

  @override
  void initState() {
    super.initState();
    AdminApi.cogsByDay().then((rows) {
      if (mounted) setState(() => _rows = rows);
    });
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    if (rows == null || rows.isEmpty) return const SizedBox.shrink();

    double sum(String key) => rows.fold(
      0.0,
      (n, r) => n + ((r[key] as num?)?.toDouble() ?? 0),
    );

    final sales = sum('sales');
    final cogs = sum('cogs');
    final gross = sales - cogs;
    final margin = sales == 0 ? 0.0 : (gross / sales) * 100;

    // Zero cost of goods means no dish has a full costed recipe yet, so the
    // gross margin would read as 100% — worse than showing nothing.
    if (cogs <= 0) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Cost of goods sold',
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: Tokens.staffInk,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Put a price per unit on each ingredient in Inventory and this '
                'will show what the food you sold actually cost to make, and '
                'the profit above it. It uses the recipes you already have, so '
                'there is nothing extra to type.',
                style: TextStyle(
                  fontSize: 12,
                  height: 1.45,
                  color: Tokens.staffInk.withValues(alpha: 0.55),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AdminCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Cost of goods sold',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: Tokens.staffInk,
              ),
            ),
            Text(
              'Last ${rows.length} day${rows.length == 1 ? '' : 's'}',
              style: TextStyle(
                fontSize: 11,
                color: Tokens.staffInk.withValues(alpha: 0.45),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                _Figure(label: 'Sold', value: sales),
                _Figure(label: 'Cost to make', value: cogs),
                _Figure(label: 'Gross profit', value: gross, strong: true),
              ],
            ),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: (margin / 100).clamp(0.0, 1.0),
                minHeight: 6,
                backgroundColor: Tokens.staffInk.withValues(alpha: 0.1),
                valueColor: AlwaysStoppedAnimation(
                  margin < 20
                      ? Tokens.semanticCritical
                      : margin < 40
                      ? Tokens.staffAccent
                      : Tokens.semanticGood,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '${margin.toStringAsFixed(1)}% of every peso taken is left after '
              'the ingredients.',
              style: TextStyle(
                fontSize: 11,
                color: Tokens.staffInk.withValues(alpha: 0.5),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure({required this.label, required this.value, this.strong = false});

  final String label;
  final double value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: TextStyle(
              fontSize: 9,
              letterSpacing: 1.5,
              color: Tokens.staffInk.withValues(alpha: 0.45),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '₱${value.toStringAsFixed(0)}',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: strong ? Tokens.semanticGood : Tokens.staffInk,
            ),
          ),
        ],
      ),
    );
  }
}

/// Dishes whose ingredients have gone up enough to eat the margin.
///
/// This sits above the sales figures on purpose. A margin quietly eaten by a
/// supplier price rise is the thing most worth acting on, and it is invisible
/// in a sales chart, which only ever shows money coming in.
///
/// The new price is never applied on its own. The system works out what would
/// restore the old margin and the owner decides — a system that repriced a
/// menu by itself would be one the owner could not trust.
class PriceSuggestions extends StatefulWidget {
  const PriceSuggestions({super.key, required this.onChanged});

  final Future<void> Function() onChanged;

  @override
  State<PriceSuggestions> createState() => _PriceSuggestionsState();
}

class _PriceSuggestionsState extends State<PriceSuggestions> {
  List<Map<String, dynamic>>? _rows;
  String? _busy;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final rows = await AdminApi.priceSuggestions();
    if (mounted) setState(() => _rows = rows);
  }

  Future<void> _decide(String dishId, double? price) async {
    setState(() {
      _busy = dishId;
      _error = null;
    });
    try {
      await AdminApi.confirmDishPrice(dishId, price);
      await _load();
      await widget.onChanged();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    if (rows == null || rows.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Tokens.staffAccent.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Tokens.staffAccent.withValues(alpha: 0.25)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.trending_up,
                  size: 17,
                  color: Tokens.staffAccent,
                ),
                const SizedBox(width: 8),
                Text(
                  'Ingredients have gone up',
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: Tokens.staffInk.withValues(alpha: 0.95),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              'Nothing is repriced until you say so.',
              style: TextStyle(
                fontSize: 12,
                color: Tokens.staffInk.withValues(alpha: 0.55),
              ),
            ),
            const SizedBox(height: 12),

            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Text(
                  _error!,
                  style: const TextStyle(
                    fontSize: 12,
                    color: Tokens.semanticAlert,
                  ),
                ),
              ),

            for (final r in rows)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      (r['name'] as String?) ?? '',
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        color: Tokens.staffInk,
                      ),
                    ),
                    Text(
                      'Costs ₱${_n(r['cost_now']).toStringAsFixed(2)} to make, '
                      'up from ₱${_n(r['cost_before']).toStringAsFixed(2)}. '
                      'Margin ${_n(r['margin_now']).toStringAsFixed(0)}%, was '
                      '${_n(r['margin_before']).toStringAsFixed(0)}%.',
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.4,
                        color: Tokens.staffInk.withValues(alpha: 0.55),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        FilledButton(
                          onPressed: _busy == r['dish_id']
                              ? null
                              : () => _decide(
                                  r['dish_id'] as String,
                                  _n(r['suggested']),
                                ),
                          style: FilledButton.styleFrom(
                            backgroundColor: Tokens.staffAccent,
                            foregroundColor: Tokens.staffCard,
                            textStyle: const TextStyle(fontSize: 12),
                            visualDensity: VisualDensity.compact,
                          ),
                          child: Text(
                            'Raise to ₱${_n(r['suggested']).toStringAsFixed(0)}',
                          ),
                        ),
                        const SizedBox(width: 8),
                        TextButton(
                          onPressed: _busy == r['dish_id']
                              ? null
                              : () => _decide(r['dish_id'] as String, null),
                          style: TextButton.styleFrom(
                            foregroundColor: Tokens.staffInk.withValues(
                              alpha: 0.6,
                            ),
                            textStyle: const TextStyle(fontSize: 12),
                            visualDensity: VisualDensity.compact,
                          ),
                          child: Text('Keep ₱${_n(r['price']).toStringAsFixed(0)}'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  static double _n(Object? v) => (v as num?)?.toDouble() ?? 0;
}
