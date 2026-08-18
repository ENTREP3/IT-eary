import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../tokens.dart';
import '../admin/tabs/kitchen_tab.dart';
import '../staff_api.dart';

enum _CounterView { counter, kitchen }

/// The counter. Mirrors the React cashier screen exactly, because the rules it
/// enforces live in Postgres — this is a second face on the same system, not a
/// second system.
class CashierScreen extends StatefulWidget {
  const CashierScreen({super.key, this.onSignOut});

  final VoidCallback? onSignOut;

  @override
  State<CashierScreen> createState() => _CashierScreenState();
}

class _CashierScreenState extends State<CashierScreen> {
  final _codeCtrl = TextEditingController();
  Ticket? _ticket;
  String? _proofUrl;
  bool _busy = false;
  bool _proofLoading = false;
  String? _error;
  _CounterView _view = _CounterView.counter;

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _lookup() async {
    final code = _codeCtrl.text.trim();
    if (code.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final t = await StaffApi.findTicket(code);
      if (!mounted) return;
      if (t == null) {
        setState(() {
          _error = 'No ticket "${code.toUpperCase()}".';
          _busy = false;
        });
        return;
      }
      setState(() {
        _ticket = t;
        _busy = false;
      });
      _loadProof(t);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _busy = false;
      });
    }
  }

  Future<void> _loadProof(Ticket t) async {
    if (t.proofPath == null) {
      setState(() => _proofUrl = null);
      return;
    }
    setState(() => _proofLoading = true);
    final url = await StaffApi.proofUrl(t.proofPath!);
    if (mounted) {
      setState(() {
        _proofUrl = url;
        _proofLoading = false;
      });
    }
  }

  Future<void> _settle(
    String method, {
    String status = 'verified',
    bool inPerson = false,
    String? note,
  }) async {
    final t = _ticket;
    if (t == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final paid = await StaffApi.markPaid(
        ticketCode: t.ticketCode,
        method: method,
        status: status,
        inPerson: inPerson,
        note: note,
      );
      if (!mounted) return;
      setState(() {
        _ticket = paid;
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _busy = false;
      });
    }
  }

  void _reset() {
    setState(() {
      _ticket = null;
      _proofUrl = null;
      _codeCtrl.clear();
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = _ticket;

    return Scaffold(
      backgroundColor: Tokens.staffGround,
      appBar: AppBar(
        backgroundColor: Tokens.staffCard,
        foregroundColor: Tokens.staffInk,
        centerTitle: false,
        title: const Text('Counter', style: TextStyle(fontWeight: FontWeight.w600)),
        actions: [
          if (widget.onSignOut != null)
            IconButton(
              onPressed: widget.onSignOut,
              icon: const Icon(Icons.logout, size: 18),
              tooltip: 'Sign out',
            ),
        ],

        // The queue, a tap from the till.
        //
        // In a karinderya this size the person taking the money is the person
        // calling to the kitchen thirty seconds later. It matters most for a
        // cashier: they never see the dashboard at all, so before this the
        // order queue was somewhere they simply could not reach.
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(54),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: SizedBox(
              width: double.infinity,
              child: SegmentedButton<_CounterView>(
                segments: const [
                  ButtonSegment(
                    value: _CounterView.counter,
                    icon: Icon(Icons.point_of_sale_outlined, size: 16),
                    label: Text('Counter'),
                  ),
                  ButtonSegment(
                    value: _CounterView.kitchen,
                    icon: Icon(Icons.restaurant_outlined, size: 16),
                    label: Text('Kitchen'),
                  ),
                ],
                selected: {_view},
                showSelectedIcon: false,
                style: SegmentedButton.styleFrom(
                  backgroundColor: Tokens.staffGround,
                  foregroundColor: Tokens.staffInk,
                  selectedBackgroundColor: Tokens.staffAccent,
                  selectedForegroundColor: Tokens.staffCard,
                  textStyle: const TextStyle(fontSize: 12),
                ),
                onSelectionChanged: (s) => setState(() => _view = s.first),
              ),
            ),
          ),
        ),
      ),
      body: SafeArea(
        child: _view == _CounterView.kitchen
            ? const SelfLoadingKitchenQueue()
            : Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 520),
                  child: t == null ? _lookupView() : _ticketView(t),
                ),
              ),
      ),
    );
  }

  Widget _lookupView() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(height: 40),
          const Text(
            'Enter ticket code',
            style: TextStyle(
                fontSize: 28, fontWeight: FontWeight.w600, color: Tokens.staffInk),
          ),
          const SizedBox(height: 6),
          Text(
            "Type the code on the diner's screen.",
            textAlign: TextAlign.center,
            style: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.6)),
          ),
          const SizedBox(height: 22),
          TextField(
            controller: _codeCtrl,
            autofocus: true,
            textAlign: TextAlign.center,
            textCapitalization: TextCapitalization.characters,
            maxLength: 12,
            style: const TextStyle(
              fontSize: 30,
              letterSpacing: 8,
              fontFamily: 'monospace',
              color: Tokens.staffInk,
            ),
            decoration: InputDecoration(
              counterText: '',
              hintText: 'K7M2Q9',
              hintStyle: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.25)),
              filled: true,
              fillColor: Tokens.staffCard,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide(color: Tokens.staffInk.withValues(alpha: 0.15)),
              ),
            ),
            onSubmitted: (_) => _lookup(),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: Tokens.semanticAlert)),
          ],
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: _busy ? null : _lookup,
            icon: _busy
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Tokens.staffCard),
                  )
                : const Icon(Icons.search),
            label: const Text('Look up ticket'),
            style: FilledButton.styleFrom(
              backgroundColor: Tokens.staffAccent,
              foregroundColor: Tokens.staffCard,
              minimumSize: const Size.fromHeight(52),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _ticketView(Ticket t) {
    final paid = t.isPaid;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextButton.icon(
            onPressed: _reset,
            icon: const Icon(Icons.arrow_back, size: 15),
            label: Text(paid ? 'Next customer' : 'Another ticket'),
            style: TextButton.styleFrom(
              foregroundColor: Tokens.staffInk.withValues(alpha: 0.6),
              alignment: Alignment.centerLeft,
            ),
          ),
          const SizedBox(height: 6),

          _card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('TICKET',
                              style: TextStyle(
                                fontSize: 10,
                                letterSpacing: 3,
                                color: Tokens.staffInk.withValues(alpha: 0.4),
                              )),
                          Text(
                            t.ticketCode,
                            style: const TextStyle(
                              fontSize: 28,
                              letterSpacing: 4,
                              fontWeight: FontWeight.w800,
                              color: Tokens.staffAccent,
                            ),
                          ),
                          if (t.customerName != null)
                            Text(t.customerName!,
                                style: TextStyle(
                                    color: Tokens.staffInk.withValues(alpha: 0.6))),
                        ],
                      ),
                    ),
                    _methodBadge(t),
                  ],
                ),
                const Divider(height: 24),
                for (final item in t.items)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text('${item.qty} × ${item.name}',
                              style: TextStyle(
                                  color: Tokens.staffInk.withValues(alpha: 0.85))),
                        ),
                        Text('₱${item.lineTotal.toStringAsFixed(2)}',
                            style: TextStyle(
                                color: Tokens.staffInk.withValues(alpha: 0.6))),
                      ],
                    ),
                  ),
                const Divider(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text('TOTAL DUE',
                        style: TextStyle(
                          fontSize: 11,
                          letterSpacing: 3,
                          color: Tokens.staffInk.withValues(alpha: 0.5),
                        )),
                    Text('₱${t.total.toStringAsFixed(2)}',
                        style: const TextStyle(
                          fontSize: 30,
                          fontWeight: FontWeight.w800,
                          color: Tokens.staffInk,
                        )),
                  ],
                ),
              ],
            ),
          ),

          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: Tokens.semanticAlert)),
          ],

          if (paid) ...[
            const SizedBox(height: 16),
            _settledBanner(t),
          ] else if (t.isGcash) ...[
            const SizedBox(height: 16),
            _proofPanel(t),
            const SizedBox(height: 16),
            _gcashActions(t),
          ] else ...[
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _busy ? null : () => _settle('cash'),
              icon: const Icon(Icons.payments_outlined),
              label: Text('Confirm ₱${t.total.toStringAsFixed(2)} in cash'),
              style: FilledButton.styleFrom(
                backgroundColor: Tokens.semanticCash,
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(56),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _busy ? null : () => _settle('gcash'),
              icon: const Icon(Icons.smartphone_outlined, size: 16),
              label: const Text("They're paying by GCash instead"),
              style: OutlinedButton.styleFrom(
                foregroundColor: Tokens.staffInk,
                side: BorderSide(color: Tokens.staffInk.withValues(alpha: 0.15)),
                minimumSize: const Size.fromHeight(46),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _card({required Widget child}) => Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Tokens.staffCard,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Tokens.staffInk.withValues(alpha: 0.1)),
        ),
        child: child,
      );

  Widget _methodBadge(Ticket t) {
    final gcash = t.isGcash;
    final color = gcash ? Tokens.semanticGcash : Tokens.semanticCash;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(gcash ? Icons.smartphone : Icons.payments_outlined,
              size: 12, color: gcash ? Tokens.semanticGcashSoft : Tokens.semanticGood),
          const SizedBox(width: 5),
          Text(
            gcash ? 'GCash' : 'Cash',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: gcash ? Tokens.semanticGcashSoft : Tokens.semanticGood,
            ),
          ),
        ],
      ),
    );
  }

  Widget _proofPanel(Ticket t) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Tokens.staffCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Tokens.semanticGcash.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('GCASH RECEIPT',
              style: TextStyle(
                fontSize: 10,
                letterSpacing: 3,
                color: Tokens.staffInk.withValues(alpha: 0.4),
              )),
          const SizedBox(height: 12),
          if (_proofLoading)
            const SizedBox(
              height: 120,
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            )
          else if (_proofUrl != null)
            GestureDetector(
              onTap: () => _showFullProof(_proofUrl!),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.network(
                  _proofUrl!,
                  fit: BoxFit.contain,
                  height: 240,
                  width: double.infinity,
                  errorBuilder: (_, _, _) => _proofBroken(),
                ),
              ),
            )
          else if (t.proofPath != null)
            _proofBroken()
          else
            Row(
              children: [
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    "Waiting for the diner's receipt.",
                    style: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.7)),
                  ),
                ),
              ],
            ),
          const SizedBox(height: 10),
          Text(
            'Check the amount matches ₱${t.total.toStringAsFixed(2)} and the '
            'reference is readable.',
            style: TextStyle(
                fontSize: 11, color: Tokens.staffInk.withValues(alpha: 0.5)),
          ),
        ],
      ),
    );
  }

  Widget _proofBroken() => Row(
        children: [
          const Icon(Icons.image_not_supported_outlined,
              size: 18, color: Tokens.semanticAlert),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              "The receipt image can't be loaded. Ask to see their GCash app.",
              style: TextStyle(
                  color: Tokens.semanticAlert.withValues(alpha: 0.9), fontSize: 13),
            ),
          ),
        ],
      );

  void _showFullProof(String url) {
    showDialog<void>(
      context: context,
      builder: (ctx) => Dialog.fullscreen(
        backgroundColor: Colors.black87,
        child: Stack(
          children: [
            Center(child: InteractiveViewer(child: Image.network(url))),
            Positioned(
              top: 12,
              right: 12,
              child: IconButton(
                onPressed: () => Navigator.of(ctx).pop(),
                icon: const Icon(Icons.close, color: Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// The three outs, plus the cash fallback — no path leaves either side stuck.
  Widget _gcashActions(Ticket t) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('SETTLE THIS TICKET',
            style: TextStyle(
              fontSize: 10,
              letterSpacing: 3,
              color: Tokens.staffInk.withValues(alpha: 0.4),
            )),
        const SizedBox(height: 10),
        _action(
          enabled: !_busy && _proofUrl != null,
          filled: true,
          color: Tokens.semanticGcash,
          icon: Icons.verified_user_outlined,
          title: 'Receipt looks right',
          blurb: 'Confirm as paid by GCash',
          onTap: () => _settle('gcash'),
        ),
        _action(
          enabled: !_busy,
          icon: Icons.smartphone_outlined,
          title: 'Checked their GCash app',
          blurb: 'No usable screenshot, but you saw the payment',
          onTap: () => _settle('gcash', inPerson: true),
        ),
        _action(
          enabled: !_busy,
          color: Tokens.staffAccent,
          tinted: true,
          icon: Icons.flag_outlined,
          title: 'Release & flag',
          blurb: 'Give them the food; the owner reconciles it later',
          onTap: () => _settle(
            'gcash',
            status: 'needs_review',
            note: 'Diner says paid; no verifiable proof at the counter.',
          ),
        ),
        _action(
          enabled: !_busy,
          icon: Icons.payments_outlined,
          iconColor: Tokens.semanticGood,
          title: 'Paying cash instead',
          blurb: 'Switch the method and take cash now',
          onTap: () => _settle('cash'),
        ),
      ],
    );
  }

  Widget _action({
    required bool enabled,
    required IconData icon,
    required String title,
    required String blurb,
    required VoidCallback onTap,
    Color? color,
    Color? iconColor,
    bool filled = false,
    bool tinted = false,
  }) {
    final base = color ?? Tokens.staffInk;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Opacity(
        opacity: enabled ? 1 : 0.35,
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: filled
                  ? base
                  : tinted
                      ? base.withValues(alpha: 0.12)
                      : Colors.transparent,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: filled
                    ? base
                    : tinted
                        ? base.withValues(alpha: 0.4)
                        : Tokens.staffInk.withValues(alpha: 0.18),
              ),
            ),
            child: Row(
              children: [
                Icon(icon,
                    size: 20,
                    color: filled
                        ? Colors.white
                        : iconColor ?? (tinted ? base : Tokens.staffInk)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            color: filled ? Colors.white : Tokens.staffInk,
                          )),
                      Text(blurb,
                          style: TextStyle(
                            fontSize: 11,
                            color: (filled ? Colors.white : Tokens.staffInk)
                                .withValues(alpha: 0.7),
                          )),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _settledBanner(Ticket t) {
    final flagged = t.paymentStatus == 'needs_review';
    final color = flagged ? Tokens.staffAccent : Tokens.semanticGood;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Icon(flagged ? Icons.flag_outlined : Icons.check_circle, color: color),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  flagged ? 'Released and flagged' : 'Paid — sent to the kitchen',
                  style: const TextStyle(
                      fontWeight: FontWeight.w600, color: Tokens.staffInk),
                ),
                Text(
                  flagged
                      ? 'The owner will reconcile this against GCash history.'
                      : 'Paid via ${t.paymentLabel}'
                          '${t.verifiedInPerson ? ' · checked in person' : ''}',
                  style: TextStyle(
                      fontSize: 12,
                      color: Tokens.staffInk.withValues(alpha: 0.65)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
