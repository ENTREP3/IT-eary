import 'package:flutter/material.dart';

import '../../errors.dart';
import '../../models/models.dart';
import '../../services/api.dart';
import '../../tokens.dart';

/// Taking an order at the counter, without the diner's phone.
///
/// Until now every ticket began on a customer's device. That is fine while the
/// website is up and the diner has a phone with battery, and it is the whole
/// ordering system when either is not true — which is exactly when a queue
/// forms.
///
/// Raises the ticket with the same `create_ticket` the storefront uses. That
/// function already detaches an order from a staff account, so a ticket made
/// here belongs to nobody, like the walk-in it is.
class CounterOrderScreen extends StatefulWidget {
  const CounterOrderScreen({super.key});

  @override
  State<CounterOrderScreen> createState() => _CounterOrderScreenState();
}

class _CounterOrderScreenState extends State<CounterOrderScreen> {
  final _name = TextEditingController();
  final _qty = <String, int>{};

  List<Dish> _menu = const [];
  bool _loading = true;
  bool _busy = false;
  String _method = 'cash';
  String? _error;
  PaymentSettings? _settings;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final menu = await Api.menu();
    final settings = await Api.paymentSettings();
    if (!mounted) return;
    setState(() {
      _menu = menu.where((d) => d.available).toList();
      _settings = settings;
      if (!settings.cashEnabled && settings.gcashEnabled) _method = 'gcash';
      _loading = false;
    });
  }

  double get _total => _qty.entries.fold(0, (sum, e) {
    final dish = _menu.where((d) => d.id == e.key).firstOrNull;
    return sum + (dish?.price ?? 0) * e.value;
  });

  int get _count => _qty.values.fold(0, (a, b) => a + b);

  Future<void> _place() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final ticket = await Api.createTicket(
        quantitiesByDishId: Map.fromEntries(
          _qty.entries.where((e) => e.value > 0),
        ),
        customerName: _name.text,
        paymentMethod: _method,
        atCounter: true,
      );
      if (!mounted) return;
      // Handed back to the till, which already knows how to take money.
      Navigator.of(context).pop(ticket);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = humanError(e);
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Tokens.staffGround,
      appBar: AppBar(
        backgroundColor: Tokens.staffCard,
        foregroundColor: Tokens.staffInk,
        title: const Text('Take an order'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Expanded(
                  child: _menu.isEmpty
                      ? Center(
                          child: Text(
                            'Nothing is available to sell right now.',
                            style: TextStyle(
                              color: Tokens.staffInk.withValues(alpha: 0.6),
                            ),
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.all(16),
                          itemCount: _menu.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 8),
                          itemBuilder: (_, i) => _row(_menu[i]),
                        ),
                ),
                _summary(),
              ],
            ),
    );
  }

  Widget _row(Dish d) {
    final n = _qty[d.id] ?? 0;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
      decoration: BoxDecoration(
        color: n > 0 ? Tokens.staffAccent.withValues(alpha: 0.12) : Tokens.staffCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: n > 0
              ? Tokens.staffAccent
              : Tokens.staffInk.withValues(alpha: 0.1),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  d.name,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    color: Tokens.staffInk,
                  ),
                ),
                Text(
                  '₱${d.price.toStringAsFixed(2)}',
                  style: TextStyle(
                    fontSize: 12,
                    color: Tokens.staffInk.withValues(alpha: 0.6),
                  ),
                ),
              ],
            ),
          ),
          if (n > 0) ...[
            IconButton(
              onPressed: () => setState(() {
                final next = n - 1;
                if (next <= 0) {
                  _qty.remove(d.id);
                } else {
                  _qty[d.id] = next;
                }
              }),
              icon: const Icon(Icons.remove_circle_outline, size: 20),
              color: Tokens.staffInk,
            ),
            Text(
              '$n',
              style: const TextStyle(fontSize: 15, color: Tokens.staffInk),
            ),
          ],
          IconButton(
            onPressed: () => setState(() => _qty[d.id] = n + 1),
            icon: const Icon(Icons.add_circle_outline, size: 20),
            color: Tokens.staffAccent,
          ),
        ],
      ),
    );
  }

  Widget _summary() {
    final cashOk = _settings?.cashEnabled ?? true;
    final gcashOk = _settings?.gcashEnabled ?? true;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      decoration: BoxDecoration(
        color: Tokens.staffCard,
        border: Border(
          top: BorderSide(color: Tokens.staffInk.withValues(alpha: 0.1)),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              style: const TextStyle(color: Tokens.staffInk),
              decoration: InputDecoration(
                labelText: 'Name to call (optional)',
                labelStyle: TextStyle(
                  color: Tokens.staffInk.withValues(alpha: 0.6),
                ),
                filled: true,
                fillColor: Tokens.staffGround,
                isDense: true,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                if (cashOk)
                  Expanded(child: _methodButton('cash', 'Cash')),
                if (cashOk && gcashOk) const SizedBox(width: 8),
                if (gcashOk)
                  Expanded(child: _methodButton('gcash', 'GCash')),
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(
                _error!,
                style: const TextStyle(color: Tokens.semanticAlert, fontSize: 13),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    _count == 0
                        ? 'Tap a dish to start.'
                        : '$_count item${_count == 1 ? '' : 's'}  ·  ₱${_total.toStringAsFixed(2)}',
                    style: TextStyle(
                      color: Tokens.staffInk.withValues(alpha: 0.75),
                      fontSize: 13,
                    ),
                  ),
                ),
                FilledButton(
                  onPressed: _busy || _count == 0 ? null : _place,
                  style: FilledButton.styleFrom(
                    backgroundColor: Tokens.staffAccent,
                    foregroundColor: Tokens.staffCard,
                    minimumSize: const Size(150, 46),
                    shape: const StadiumBorder(),
                  ),
                  child: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Make the ticket'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _methodButton(String value, String label) {
    final on = _method == value;
    return OutlinedButton(
      onPressed: () => setState(() => _method = value),
      style: OutlinedButton.styleFrom(
        backgroundColor: on ? Tokens.staffAccent : null,
        foregroundColor: on ? Tokens.staffCard : Tokens.staffInk,
        side: BorderSide(
          color: on ? Tokens.staffAccent : Tokens.staffInk.withValues(alpha: 0.2),
        ),
        minimumSize: const Size.fromHeight(40),
      ),
      child: Text(label),
    );
  }
}
