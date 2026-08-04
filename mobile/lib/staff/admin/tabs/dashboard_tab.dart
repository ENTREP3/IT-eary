import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../../../models/models.dart';
import '../../../tokens.dart';
import '../admin_api.dart';
import 'widgets.dart';

/// Today at a glance: money in, what needs attention, and the last few orders.
class DashboardTab extends StatelessWidget {
  const DashboardTab({
    super.key,
    required this.orders,
    required this.inventory,
    required this.onResolved,
  });

  final List<Ticket> orders;
  final List<InventoryItem> inventory;
  final Future<void> Function() onResolved;

  List<Ticket> get _today {
    final start = DateTime.now().copyWith(
        hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0);
    return orders.where((o) => o.createdAt.isAfter(start)).toList();
  }

  double _sales(List<Ticket> list) =>
      list.where((o) => o.isPaid).fold(0.0, (a, o) => a + o.total);

  @override
  Widget build(BuildContext context) {
    final today = _today;
    final flagged =
        orders.where((o) => o.paymentStatus == 'needs_review').toList();
    final low = inventory.where((i) => i.isLow).toList();

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
            StatTile(label: 'Sales · 7d', value: peso(_sales(orders))),
            StatTile(label: 'Orders · 7d', value: '${orders.length}'),
            StatTile(label: 'Orders today', value: '${today.length}'),
            StatTile(label: "Today's sales", value: peso(_sales(today))),
          ],
        ),

        if (flagged.isNotEmpty) ...[
          const SizedBox(height: 12),
          _ReconciliationCard(flagged: flagged, onResolved: onResolved),
        ],

        if (low.isNotEmpty) ...[
          const SizedBox(height: 12),
          AdminCard(
            background: Tokens.semanticCritical.withValues(alpha: 0.1),
            borderColor: Tokens.semanticCritical.withValues(alpha: 0.4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  const Icon(Icons.warning_amber_rounded,
                      size: 15, color: Tokens.semanticAlert),
                  const SizedBox(width: 6),
                  Eyebrow('Low stock alert',
                      color: Tokens.semanticAlert),
                ]),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final i in low)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: Tokens.staffGround,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          '${i.name} — ${i.stock.toStringAsFixed(i.stock % 1 == 0 ? 0 : 1)} ${i.unit} left',
                          style: const TextStyle(
                              fontSize: 12, color: Tokens.staffInk),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],

        const SizedBox(height: 12),
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionHeader(
                  eyebrow: 'Orders by hour · today', title: "Today's pulse"),
              const SizedBox(height: 16),
              SizedBox(height: 160, child: _PulseChart(orders: today)),
            ],
          ),
        ),

        const SizedBox(height: 12),
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Eyebrow('Latest orders'),
              const SizedBox(height: 10),
              if (orders.isEmpty)
                Text('No orders yet.',
                    style:
                        TextStyle(color: Tokens.staffInk.withValues(alpha: 0.5)))
              else
                for (final o in orders.take(6))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(children: [
                                Text(
                                  o.ticketCode,
                                  style: const TextStyle(
                                    fontFamily: 'monospace',
                                    letterSpacing: 1.5,
                                    color: Tokens.staffInk,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Pill(
                                  o.isPaid ? o.paymentLabel : 'Unpaid',
                                  color: !o.isPaid
                                      ? Tokens.semanticAlert
                                      : o.isGcash
                                          ? Tokens.semanticGcashSoft
                                          : Tokens.semanticGood,
                                ),
                              ]),
                              Text(
                                o.items.map((i) => '${i.qty}× ${i.name}').join(', '),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Tokens.staffInk.withValues(alpha: 0.55),
                                ),
                              ),
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(peso(o.total),
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    color: Tokens.staffInk)),
                            Text(shortTime(o.createdAt),
                                style: TextStyle(
                                  fontSize: 11,
                                  color:
                                      Tokens.staffInk.withValues(alpha: 0.4),
                                )),
                          ],
                        ),
                      ],
                    ),
                  ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Sales released without verified proof — real money questions, so they sit
/// near the top until the owner has checked them against GCash.
class _ReconciliationCard extends StatefulWidget {
  const _ReconciliationCard({required this.flagged, required this.onResolved});

  final List<Ticket> flagged;
  final Future<void> Function() onResolved;

  @override
  State<_ReconciliationCard> createState() => _ReconciliationCardState();
}

class _ReconciliationCardState extends State<_ReconciliationCard> {
  String? _busy;
  String? _error;

  Future<void> _resolve(Ticket t, bool verified) async {
    setState(() {
      _busy = t.ticketCode;
      _error = null;
    });
    try {
      await AdminApi.resolveReview(
        t.ticketCode,
        verified,
        note: verified
            ? 'Confirmed against GCash history'
            : 'Not found in GCash history',
      );
      await widget.onResolved();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _viewProof(Ticket t) async {
    final url = await AdminApi.proofUrl(t.proofPath!);
    if (!mounted || url == null) return;
    showDialog<void>(
      context: context,
      builder: (ctx) => Dialog.fullscreen(
        backgroundColor: Colors.black87,
        child: Stack(children: [
          Center(child: InteractiveViewer(child: Image.network(url))),
          Positioned(
            top: 12,
            right: 12,
            child: IconButton(
              onPressed: () => Navigator.of(ctx).pop(),
              icon: const Icon(Icons.close, color: Colors.white),
            ),
          ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AdminCard(
      background: Tokens.staffAccent.withValues(alpha: 0.1),
      borderColor: Tokens.staffAccent.withValues(alpha: 0.4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            const Icon(Icons.flag_outlined, size: 15, color: Tokens.staffAccent),
            const SizedBox(width: 6),
            Eyebrow('Needs reconciliation · ${widget.flagged.length}',
                color: Tokens.staffAccent),
          ]),
          const SizedBox(height: 6),
          Text(
            'Released without verified proof. Check your GCash history, then '
            'confirm or cancel each one.',
            style: TextStyle(
                fontSize: 12, color: Tokens.staffInk.withValues(alpha: 0.6)),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!,
                style: const TextStyle(
                    fontSize: 12, color: Tokens.semanticAlert)),
          ],
          const SizedBox(height: 12),
          for (final t in widget.flagged)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Tokens.staffGround,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Text(t.ticketCode,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          letterSpacing: 2,
                          fontWeight: FontWeight.w700,
                          color: Tokens.staffAccent,
                        )),
                    const SizedBox(width: 8),
                    Text(peso(t.total),
                        style: TextStyle(
                            color: Tokens.staffInk.withValues(alpha: 0.75))),
                  ]),
                  Text(
                    '${t.customerName ?? 'Walk-in'} · ${shortTime(t.createdAt)}',
                    style: TextStyle(
                        fontSize: 11,
                        color: Tokens.staffInk.withValues(alpha: 0.45)),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (t.hasProof)
                        OutlinedButton(
                          onPressed: () => _viewProof(t),
                          style: OutlinedButton.styleFrom(
                            visualDensity: VisualDensity.compact,
                            foregroundColor: Tokens.staffInk,
                            side: BorderSide(
                                color:
                                    Tokens.staffInk.withValues(alpha: 0.2)),
                          ),
                          child: const Text('View proof',
                              style: TextStyle(fontSize: 12)),
                        ),
                      FilledButton(
                        onPressed: _busy == t.ticketCode
                            ? null
                            : () => _resolve(t, true),
                        style: FilledButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          backgroundColor: Tokens.semanticGood,
                          foregroundColor: Tokens.staffCard,
                        ),
                        child: Text(
                          _busy == t.ticketCode ? '…' : 'Payment found',
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                      OutlinedButton(
                        onPressed: _busy == t.ticketCode
                            ? null
                            : () => _resolve(t, false),
                        style: OutlinedButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          foregroundColor: Tokens.semanticAlert,
                          side: BorderSide(
                              color: Tokens.semanticCritical
                                  .withValues(alpha: 0.5)),
                        ),
                        child: const Text('Never paid',
                            style: TextStyle(fontSize: 12)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Orders per hour across the 6am–9pm service window.
class _PulseChart extends StatelessWidget {
  const _PulseChart({required this.orders});

  final List<Ticket> orders;

  @override
  Widget build(BuildContext context) {
    final buckets = <int, int>{};
    for (final o in orders) {
      buckets[o.createdAt.hour] = (buckets[o.createdAt.hour] ?? 0) + 1;
    }
    final maxY =
        (buckets.values.isEmpty ? 0 : buckets.values.reduce((a, b) => a > b ? a : b))
            .toDouble();

    return BarChart(
      BarChartData(
        maxY: maxY == 0 ? 4 : maxY + 1,
        barGroups: [
          for (var h = 6; h <= 21; h++)
            BarChartGroupData(x: h, barRods: [
              BarChartRodData(
                toY: (buckets[h] ?? 0).toDouble(),
                color: Tokens.staffAccent,
                width: 8,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
              ),
            ]),
        ],
        gridData: FlGridData(
          drawVerticalLine: false,
          getDrawingHorizontalLine: (_) => FlLine(
            color: Tokens.staffInk.withValues(alpha: 0.08),
            strokeWidth: 1,
          ),
        ),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(),
          rightTitles: const AxisTitles(),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 26,
              interval: maxY <= 4 ? 1 : (maxY / 4).ceilToDouble(),
              getTitlesWidget: (v, _) => Text(
                v.toInt().toString(),
                style: TextStyle(
                    fontSize: 10,
                    color: Tokens.staffInk.withValues(alpha: 0.4)),
              ),
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              interval: 3,
              getTitlesWidget: (v, _) {
                final h = v.toInt();
                final label = h == 12 ? '12P' : (h > 12 ? '${h - 12}P' : '${h}A');
                return Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(label,
                      style: TextStyle(
                          fontSize: 10,
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
