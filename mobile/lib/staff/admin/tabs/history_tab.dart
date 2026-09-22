import 'package:flutter/material.dart';

import '../../../models/models.dart';
import '../../../tokens.dart';
import '../admin_api.dart';
import 'widgets.dart';

/// Every order the shop has taken, not just the ones still on the board.
///
/// The dashboard shows a handful. That is the right number for a glance during
/// service and the wrong number for every other question an owner has: what a
/// regular usually orders, whether a refund argument is genuine, what last
/// Tuesday actually took. Those need the whole record and a way through it.
///
/// Loaded on its own rather than from the dashboard's order list. That list is
/// what the kitchen board and today's figures read, and widening it to ninety
/// days to serve this screen would put old tickets back on the line.
class HistoryTab extends StatefulWidget {
  const HistoryTab({super.key});

  @override
  State<HistoryTab> createState() => _HistoryTabState();
}

const _ranges = [
  (7, 'Last 7 days'),
  (30, 'Last 30 days'),
  (90, 'Last 90 days'),
  (0, 'Everything'),
];

const _statuses = [
  'all',
  'pending',
  'paid',
  'preparing',
  'ready',
  'completed',
  'cancelled',
  'refunded',
  'expired',
];

class _HistoryTabState extends State<HistoryTab> {
  final _search = TextEditingController();
  int _days = 30;
  String _status = 'all';
  List<Ticket>? _rows;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _rows = null;
      _error = null;
    });
    try {
      final rows = await AdminApi.orderHistory(days: _days);
      if (mounted) setState(() => _rows = rows);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '$e';
          _rows = const [];
        });
      }
    }
  }

  List<Ticket> get _shown {
    final all = _rows ?? const <Ticket>[];
    final q = _search.text.trim().toLowerCase();
    return all.where((o) {
      if (_status != 'all' && o.status != _status) return false;
      if (q.isEmpty) return true;
      return o.ticketCode.toLowerCase().contains(q) ||
          (o.customerName ?? '').toLowerCase().contains(q) ||
          o.items.any((i) => i.name.toLowerCase().contains(q));
    }).toList();
  }

  Future<void> _open(Ticket t) => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Tokens.staffCard,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (_) => OrderDetailSheet(order: t),
      );

  @override
  Widget build(BuildContext context) {
    final rows = _shown;

    // Counted from what is on screen, so the totals always describe the list
    // below them rather than a wider set the owner has filtered away.
    final takings = rows
        .where((o) => o.countsAsSale)
        .fold(0.0, (a, o) => a + o.total);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _search,
            onChanged: (_) => setState(() {}),
            style: const TextStyle(color: Tokens.staffInk),
            decoration: InputDecoration(
              isDense: true,
              hintText: 'Ticket code, name or dish',
              hintStyle:
                  TextStyle(color: Tokens.staffInk.withValues(alpha: 0.35)),
              prefixIcon: Icon(Icons.search,
                  size: 18, color: Tokens.staffInk.withValues(alpha: 0.4)),
              suffixIcon: _search.text.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.close, size: 16),
                      color: Tokens.staffInk.withValues(alpha: 0.5),
                      onPressed: () {
                        _search.clear();
                        setState(() {});
                      },
                    ),
              filled: true,
              fillColor: Tokens.staffGround,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide:
                    BorderSide(color: Tokens.staffInk.withValues(alpha: 0.15)),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: _dropdown<int>(
                value: _days,
                items: [
                  for (final (d, label) in _ranges)
                    DropdownMenuItem(value: d, child: Text(label)),
                ],
                onChanged: (v) {
                  if (v == null || v == _days) return;
                  setState(() => _days = v);
                  _load();
                },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _dropdown<String>(
                value: _status,
                items: [
                  for (final s in _statuses)
                    DropdownMenuItem(
                      value: s,
                      child: Text(s == 'all'
                          ? 'Every status'
                          : '${s[0].toUpperCase()}${s.substring(1)}'),
                    ),
                ],
                onChanged: (v) => setState(() => _status = v ?? 'all'),
              ),
            ),
          ]),
          const SizedBox(height: 12),

          Text(
            '${rows.length} order${rows.length == 1 ? '' : 's'} · '
            'takings ${peso(takings)}',
            style: TextStyle(
                fontSize: 12, color: Tokens.staffInk.withValues(alpha: 0.6)),
          ),
          const SizedBox(height: 2),
          Text(
            'Unpaid, cancelled, refunded and expired orders are listed, but '
            'not counted in the takings.',
            style: TextStyle(
                fontSize: 11, color: Tokens.staffInk.withValues(alpha: 0.4)),
          ),
          const SizedBox(height: 12),

          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(_error!,
                  style: const TextStyle(color: Tokens.semanticAlert)),
            ),

          if (_rows == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (rows.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: Text('Nothing matches that.',
                    style: TextStyle(
                        color: Tokens.staffInk.withValues(alpha: 0.5))),
              ),
            )
          else
            for (final o in rows)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: InkWell(
                  onTap: () => _open(o),
                  borderRadius: BorderRadius.circular(14),
                  child: AdminCard(child: OrderRow(order: o)),
                ),
              ),
        ],
      ),
    );
  }

  Widget _dropdown<T>({
    required T value,
    required List<DropdownMenuItem<T>> items,
    required void Function(T?) onChanged,
  }) =>
      InputDecorator(
        decoration: InputDecoration(
          isDense: true,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          filled: true,
          fillColor: Tokens.staffGround,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide:
                BorderSide(color: Tokens.staffInk.withValues(alpha: 0.15)),
          ),
        ),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<T>(
            value: value,
            isExpanded: true,
            isDense: true,
            dropdownColor: Tokens.staffCard,
            style: const TextStyle(color: Tokens.staffInk, fontSize: 13),
            items: items,
            onChanged: onChanged,
          ),
        ),
      );
}

/// What the kitchen did with a ticket.
class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (status) {
      'cancelled' || 'refunded' || 'expired' => (
          Tokens.semanticCritical.withValues(alpha: 0.22),
          Tokens.semanticAlert
        ),
      'completed' => (
          Tokens.semanticGood.withValues(alpha: 0.2),
          Tokens.semanticGood
        ),
      'pending' => (
          Tokens.staffInk.withValues(alpha: 0.1),
          Tokens.staffInk.withValues(alpha: 0.7)
        ),
      _ => (Tokens.staffAccent.withValues(alpha: 0.2), Tokens.staffAccent),
    };
    return _Pill(
      text: '${status[0].toUpperCase()}${status.substring(1)}',
      bg: bg,
      fg: fg,
    );
  }
}

/// What the money did, which is not the same question as what the kitchen did.
class MoneyPill extends StatelessWidget {
  const MoneyPill({super.key, required this.order});

  final Ticket order;

  @override
  Widget build(BuildContext context) {
    if (order.status == 'expired') {
      return _Pill(
        text: 'Never collected',
        bg: Tokens.staffInk.withValues(alpha: 0.1),
        fg: Tokens.staffInk.withValues(alpha: 0.7),
      );
    }
    if (order.status == 'refunded') {
      return _Pill(
        text: 'Money returned',
        bg: Tokens.semanticCritical.withValues(alpha: 0.22),
        fg: Tokens.semanticAlert,
      );
    }
    if (!order.isPaid) {
      return _Pill(
        text: 'Unpaid',
        bg: Tokens.staffInk.withValues(alpha: 0.1),
        fg: Tokens.staffInk.withValues(alpha: 0.7),
      );
    }
    if (order.paymentStatus == 'needs_review') {
      return _Pill(
        text: 'Needs review',
        bg: Tokens.staffAccent.withValues(alpha: 0.2),
        fg: Tokens.staffAccent,
      );
    }
    return _Pill(
      text: order.isGcash ? 'GCash' : 'Cash',
      bg: Tokens.semanticGood.withValues(alpha: 0.2),
      fg: Tokens.semanticGood,
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text, required this.bg, required this.fg});

  final String text;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration:
            BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
        child: Text(text,
            style: TextStyle(fontSize: 10, color: fg)),
      );
}

/// One line of the history list. Also used on the dashboard, so a ticket reads
/// the same wherever the owner meets it.
class OrderRow extends StatelessWidget {
  const OrderRow({super.key, required this.order});

  final Ticket order;

  @override
  Widget build(BuildContext context) {
    final summary = order.items.map((i) => '${i.qty}x ${i.name}').join(', ');
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 6,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    order.ticketCode,
                    style: TextStyle(
                      fontFamily: 'monospace',
                      letterSpacing: 1.2,
                      fontSize: 13,
                      color: Tokens.staffInk.withValues(alpha: 0.85),
                    ),
                  ),
                  StatusPill(status: order.status),
                  MoneyPill(order: order),
                ],
              ),
              const SizedBox(height: 3),
              Text(
                '${order.customerName != null ? '${order.customerName} · ' : ''}$summary',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 12,
                    color: Tokens.staffInk.withValues(alpha: 0.55)),
              ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              peso(order.total),
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: Tokens.staffInk,
                decoration: order.status == 'cancelled'
                    ? TextDecoration.lineThrough
                    : null,
              ),
            ),
            Text(
              _shortTime(order.createdAt),
              style: TextStyle(
                  fontSize: 10,
                  color: Tokens.staffInk.withValues(alpha: 0.45)),
            ),
          ],
        ),
      ],
    );
  }
}

String _shortTime(DateTime d) {
  final now = DateTime.now();
  final sameDay =
      d.year == now.year && d.month == now.month && d.day == now.day;
  final hour = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final time =
      '$hour:${d.minute.toString().padLeft(2, '0')} ${d.hour < 12 ? 'AM' : 'PM'}';
  return sameDay ? time : '${d.month}/${d.day} · $time';
}

/// One order in full.
///
/// Shared with the dashboard: two different-looking answers to "what was on
/// this ticket" is one answer too many.
class OrderDetailSheet extends StatelessWidget {
  const OrderDetailSheet({super.key, required this.order});

  final Ticket order;

  @override
  Widget build(BuildContext context) {
    final faint = Tokens.staffInk.withValues(alpha: 0.55);
    final subtotal = order.subtotal > 0 ? order.subtotal : order.total;

    Widget line(String label, String value, {Color? tone}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 5),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: TextStyle(fontSize: 13, color: faint)),
              const Spacer(),
              Flexible(
                child: Text(
                  value,
                  textAlign: TextAlign.right,
                  style: TextStyle(
                      fontSize: 13, color: tone ?? Tokens.staffInk),
                ),
              ),
            ],
          ),
        );

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).padding.bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'ORDER',
              style: TextStyle(
                  fontSize: 10, letterSpacing: 3, color: faint),
            ),
            const SizedBox(height: 4),
            Text(
              order.ticketCode,
              style: const TextStyle(
                fontSize: 26,
                letterSpacing: 4,
                fontWeight: FontWeight.w600,
                color: Tokens.staffAccent,
              ),
            ),
            const SizedBox(height: 10),
            Wrap(spacing: 6, runSpacing: 6, children: [
              StatusPill(status: order.status),
              MoneyPill(order: order),
              if (order.verifiedInPerson)
                _Pill(
                  text: 'Checked at the counter',
                  bg: Tokens.staffInk.withValues(alpha: 0.1),
                  fg: Tokens.staffInk.withValues(alpha: 0.7),
                ),
            ]),
            const SizedBox(height: 14),

            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: Tokens.staffInk.withValues(alpha: 0.12)),
              ),
              child: Column(
                children: [
                  for (final i in order.items)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Row(children: [
                        Text('${i.qty} × ',
                            style: TextStyle(fontSize: 13, color: faint)),
                        Expanded(
                          child: Text(i.name,
                              style: const TextStyle(
                                  fontSize: 13, color: Tokens.staffInk)),
                        ),
                        Text(peso(i.price * i.qty),
                            style: const TextStyle(
                                fontSize: 13, color: Tokens.staffInk)),
                      ]),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 10),

            line('Subtotal', peso(subtotal)),
            if (order.discount > 0)
              line(
                order.promoCode != null
                    ? 'Discount (${order.promoCode})'
                    : 'Discount',
                '−${peso(order.discount)}',
                tone: Tokens.semanticGood,
              ),
            line('Total', peso(order.total)),
            line('Ordered by', order.customerName ?? 'Walk-in guest'),
            line('Placed', order.createdAt.toString().substring(0, 16)),
            if (order.paidAt != null)
              line('Paid', order.paidAt!.toString().substring(0, 16)),
            if (order.completedAt != null)
              line('Completed', order.completedAt!.toString().substring(0, 16)),
            if (order.proofPath != null)
              line('Receipt', 'Uploaded, viewable from the dashboard'),

            if (order.status == 'cancelled' ||
                order.status == 'refunded' ||
                order.status == 'expired') ...[
              const SizedBox(height: 10),
              Text(
                '${switch (order.status) {
                  'refunded' =>
                    '${peso(order.total)} was handed back and every serving '
                        'went back on the menu. ',
                  'expired' =>
                    'Nobody came for it, so its servings went back on the '
                        'menu. Nothing was ever paid. ',
                  _ => 'Nothing was paid, so nothing went back. ',
                }}'
                'The order is kept rather than deleted, so the record of what '
                'happened stays complete, and it is left out of every sales '
                'and profit figure.',
                style: TextStyle(fontSize: 11, height: 1.4, color: faint),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
