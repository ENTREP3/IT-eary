import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../tokens.dart';
import '../admin/admin_api.dart';
import '../admin/tabs/widgets.dart' show peso;

/// Handing money back over the counter.
///
/// A refund is not a cancellation and the shop is careful about the difference:
/// cancelling is for a ticket nobody paid for, refunding is for one they did.
/// This is only ever offered while the food can still go back in the platter,
/// and the database refuses it otherwise — so an error here is the rule
/// speaking rather than a bug, and it is shown as written.
///
/// A reason is required. A refund with no reason is a hole in the day's takings
/// that nobody can explain a week later, which is exactly when it gets asked
/// about.
class RefundSheet extends StatefulWidget {
  const RefundSheet({super.key, required this.order});

  final Ticket order;

  /// Opens the sheet. Resolves true when money actually went back.
  static Future<bool> open(BuildContext context, Ticket order) async =>
      await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Tokens.staffCard,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (_) => RefundSheet(order: order),
      ) ??
      false;

  @override
  State<RefundSheet> createState() => _RefundSheetState();
}

const _reasons = [
  'We ran out of the dish',
  'Diner changed their mind',
  'Wrong order taken',
  'Diner waited too long',
  'Paid twice by mistake',
];

class _RefundSheetState extends State<RefundSheet> {
  late String _reason = _reasons.first;
  final _other = TextEditingController();
  final _note = TextEditingController();
  late String _method = widget.order.paymentMethod ?? 'cash';
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _other.dispose();
    _note.dispose();
    super.dispose();
  }

  String get _finalReason =>
      _reason == 'Other' ? _other.text.trim() : _reason;

  Future<void> _submit() async {
    if (_finalReason.isEmpty) {
      setState(() => _error = 'Say what the refund is for.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await AdminApi.refundOrder(
        widget.order.ticketCode,
        reason: _finalReason,
        method: _method,
        note: _note.text.trim().isEmpty ? null : _note.text.trim(),
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '$e';
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.order;
    final faint = Tokens.staffInk.withValues(alpha: 0.55);

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom +
            MediaQuery.of(context).padding.bottom +
            20,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('REFUND',
                style: TextStyle(fontSize: 10, letterSpacing: 3, color: faint)),
            const SizedBox(height: 4),
            Text(
              o.ticketCode,
              style: const TextStyle(
                fontSize: 26,
                letterSpacing: 4,
                fontWeight: FontWeight.w600,
                color: Tokens.staffAccent,
              ),
            ),
            const SizedBox(height: 14),

            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border:
                    Border.all(color: Tokens.staffInk.withValues(alpha: 0.12)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Text('Giving back',
                        style: TextStyle(fontSize: 13, color: faint)),
                    const Spacer(),
                    Text(
                      peso(o.total),
                      style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          color: Tokens.staffInk),
                    ),
                  ]),
                  if (o.discount > 0) ...[
                    const SizedBox(height: 6),
                    // Said plainly, because the figure is smaller than the menu
                    // price and whoever is counting notes needs to know that is
                    // deliberate.
                    Text(
                      'What they paid, not the menu price. ${peso(o.subtotal)} '
                      'less the ${peso(o.discount)} discount'
                      '${o.promoCode != null ? ' from ${o.promoCode}' : ''}.',
                      style: TextStyle(fontSize: 11, height: 1.4, color: faint),
                    ),
                  ],
                  const SizedBox(height: 6),
                  Text(
                    'Every serving goes back on the menu, and the order stops '
                    'counting towards the day.',
                    style: TextStyle(fontSize: 11, height: 1.4, color: faint),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            InputDecorator(
              decoration: _dec('Why'),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _reason,
                  isExpanded: true,
                  isDense: true,
                  dropdownColor: Tokens.staffCard,
                  style:
                      const TextStyle(color: Tokens.staffInk, fontSize: 14),
                  items: [
                    for (final r in _reasons)
                      DropdownMenuItem(value: r, child: Text(r)),
                    const DropdownMenuItem(value: 'Other', child: Text('Other')),
                  ],
                  onChanged: (v) => setState(() => _reason = v ?? _reasons.first),
                ),
              ),
            ),
            if (_reason == 'Other') ...[
              const SizedBox(height: 10),
              TextField(
                controller: _other,
                autofocus: true,
                style: const TextStyle(color: Tokens.staffInk),
                decoration: _dec('Say what happened'),
              ),
            ],
            const SizedBox(height: 12),

            Text('Handed back as',
                style: TextStyle(fontSize: 11, color: faint)),
            const SizedBox(height: 6),
            Row(children: [
              for (final m in const ['cash', 'gcash'])
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(right: m == 'cash' ? 8 : 0),
                    child: OutlinedButton(
                      onPressed: () => setState(() => _method = m),
                      style: OutlinedButton.styleFrom(
                        backgroundColor: _method == m
                            ? Tokens.staffAccent.withValues(alpha: 0.15)
                            : null,
                        foregroundColor: _method == m
                            ? Tokens.staffAccent
                            : Tokens.staffInk,
                        side: BorderSide(
                          color: _method == m
                              ? Tokens.staffAccent.withValues(alpha: 0.6)
                              : Tokens.staffInk.withValues(alpha: 0.15),
                        ),
                        minimumSize: const Size.fromHeight(44),
                      ),
                      child: Text(m == 'gcash' ? 'GCash' : 'Cash'),
                    ),
                  ),
                ),
            ]),
            if (o.paymentMethod != null && _method != o.paymentMethod) ...[
              const SizedBox(height: 6),
              // Normal, not a mistake: a GCash payment is often handed back as
              // notes across the counter because it is faster.
              Text(
                'They paid by ${o.paymentMethod == 'gcash' ? 'GCash' : 'cash'}. '
                'Sending it back a different way is fine, it is just recorded '
                'as it happened.',
                style: TextStyle(fontSize: 11, height: 1.4, color: faint),
              ),
            ],
            const SizedBox(height: 12),

            TextField(
              controller: _note,
              style: const TextStyle(color: Tokens.staffInk),
              decoration: _dec('Note (optional)'),
            ),

            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!,
                  style: const TextStyle(color: Tokens.semanticAlert)),
            ],
            const SizedBox(height: 16),

            Row(children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _busy ? null : () => Navigator.pop(context, false),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Tokens.staffInk,
                    side: BorderSide(
                        color: Tokens.staffInk.withValues(alpha: 0.2)),
                    minimumSize: const Size.fromHeight(48),
                  ),
                  child: const Text('Never mind'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: _busy ? null : _submit,
                  icon: _busy
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.undo, size: 16),
                  label: Text(_busy ? 'Recording…' : 'Refund ${peso(o.total)}'),
                  style: FilledButton.styleFrom(
                    backgroundColor: Tokens.staffAccent,
                    foregroundColor: Tokens.staffCard,
                    minimumSize: const Size.fromHeight(48),
                  ),
                ),
              ),
            ]),
          ],
        ),
      ),
    );
  }

  InputDecoration _dec(String label) => InputDecoration(
        labelText: label,
        isDense: true,
        labelStyle: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.6)),
        filled: true,
        fillColor: Tokens.staffGround,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide:
              BorderSide(color: Tokens.staffInk.withValues(alpha: 0.15)),
        ),
      );
}
