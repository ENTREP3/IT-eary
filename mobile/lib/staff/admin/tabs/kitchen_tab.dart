import 'package:flutter/material.dart';

import '../../../models/models.dart';
import '../../../tokens.dart';
import '../admin_api.dart';
import 'widgets.dart';

/// Live order queue. Oldest first, so nothing gets stranded behind a rush.
class KitchenTab extends StatefulWidget {
  const KitchenTab({super.key, required this.orders, required this.onChanged});

  final List<Ticket> orders;
  final Future<void> Function() onChanged;

  @override
  State<KitchenTab> createState() => _KitchenTabState();
}

class _KitchenTabState extends State<KitchenTab> {
  String? _busy;

  static const _lanes = [
    (
      'New',
      ['pending', 'paid'],
      'preparing',
      'Start preparing',
      Tokens.semanticGcashSoft
    ),
    ('Preparing', ['preparing'], 'ready', 'Mark ready', Tokens.staffAccent),
    ('Ready', ['ready'], 'completed', 'Complete', Tokens.semanticGood),
  ];

  Future<void> _advance(Ticket t, String next) async {
    setState(() => _busy = t.id);
    try {
      await AdminApi.setStatus(t.id, next);
      await widget.onChanged();
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        for (final (title, statuses, next, nextLabel, accent) in _lanes) ...[
          Builder(builder: (_) {
            final lane = widget.orders
                .where((o) => statuses.contains(o.status))
                .toList()
              ..sort((a, b) => a.createdAt.compareTo(b.createdAt));

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Container(width: 8, height: 8,
                      decoration: BoxDecoration(
                          color: accent, shape: BoxShape.circle)),
                  const SizedBox(width: 8),
                  Text(title,
                      style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Tokens.staffInk)),
                  const SizedBox(width: 8),
                  Text('${lane.length}',
                      style: TextStyle(
                          color: Tokens.staffInk.withValues(alpha: 0.4))),
                ]),
                const SizedBox(height: 10),
                if (lane.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 20),
                    child: Text('Nothing here.',
                        style: TextStyle(
                            fontSize: 13,
                            color: Tokens.staffInk.withValues(alpha: 0.35))),
                  )
                else
                  for (final o in lane)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: AdminCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(children: [
                              Text(o.ticketCode,
                                  style: const TextStyle(
                                    fontFamily: 'monospace',
                                    letterSpacing: 2,
                                    fontWeight: FontWeight.w700,
                                    color: Tokens.staffAccent,
                                  )),
                              const SizedBox(width: 8),
                              Pill(
                                o.isPaid ? o.paymentLabel : 'Unpaid',
                                color: o.isPaid
                                    ? Tokens.semanticGood
                                    : Tokens.semanticAlert,
                              ),
                              const Spacer(),
                              Text(shortTime(o.createdAt),
                                  style: TextStyle(
                                      fontSize: 11,
                                      color: Tokens.staffInk
                                          .withValues(alpha: 0.4))),
                            ]),
                            if (o.customerName != null)
                              Text(o.customerName!,
                                  style: TextStyle(
                                      fontSize: 12,
                                      color: Tokens.staffInk
                                          .withValues(alpha: 0.6))),
                            const SizedBox(height: 8),
                            for (final item in o.items)
                              Text('${item.qty} × ${item.name}',
                                  style: const TextStyle(
                                      fontSize: 13, color: Tokens.staffInk)),
                            const SizedBox(height: 10),
                            Row(children: [
                              Expanded(
                                child: FilledButton(
                                  onPressed: _busy == o.id
                                      ? null
                                      : () => _advance(o, next),
                                  style: FilledButton.styleFrom(
                                    backgroundColor: accent,
                                    foregroundColor: Tokens.staffCard,
                                    visualDensity: VisualDensity.compact,
                                  ),
                                  child: Text(nextLabel,
                                      style: const TextStyle(fontSize: 13)),
                                ),
                              ),
                              const SizedBox(width: 8),
                              IconButton(
                                onPressed: _busy == o.id
                                    ? null
                                    : () => _advance(o, 'cancelled'),
                                icon: const Icon(Icons.close, size: 18),
                                color: Tokens.semanticAlert,
                                tooltip: 'Cancel order',
                              ),
                            ]),
                          ],
                        ),
                      ),
                    ),
                const SizedBox(height: 12),
              ],
            );
          }),
        ],
      ],
    );
  }
}

/// The order queue, fetching its own orders.
///
/// The dashboard already holds every dataset and hands them down, so its
/// Kitchen tab takes them as a parameter. The counter holds nothing — it is a
/// till, and a cashier signing in there never loads the dashboard at all. This
/// wrapper is what lets the same queue appear on both without the counter
/// paying for an orders feed it may never open.
class SelfLoadingKitchenQueue extends StatefulWidget {
  const SelfLoadingKitchenQueue({super.key});

  @override
  State<SelfLoadingKitchenQueue> createState() =>
      _SelfLoadingKitchenQueueState();
}

class _SelfLoadingKitchenQueueState extends State<SelfLoadingKitchenQueue> {
  List<Ticket>? _orders;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final orders = await AdminApi.recentOrders(days: 2);
      if (mounted) setState(() => _orders = orders);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '$e';
          _orders = const [];
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final orders = _orders;
    if (orders == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            "Couldn't load the queue. $_error",
            textAlign: TextAlign.center,
            style: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.6)),
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: KitchenTab(orders: orders, onChanged: _load),
    );
  }
}
