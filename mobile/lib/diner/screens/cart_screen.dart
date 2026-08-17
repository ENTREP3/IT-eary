import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../services/api.dart';
import '../state/cart.dart';
import '../state/order_history.dart';
import '../../theme.dart';
import '../../tokens.dart';
import 'ticket_screen.dart';

class CartScreen extends StatefulWidget {
  const CartScreen({super.key});

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  final _nameCtrl = TextEditingController();
  bool _submitting = false;
  String? _error;

  final _promoCtrl = TextEditingController();
  PromoPreview? _promo;
  bool _checkingPromo = false;

  String _method = 'cash';
  PaymentSettings? _settings;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final s = await Api.paymentSettings();
    if (!mounted) return;
    setState(() {
      _settings = s;
      // Don't preselect a method the owner has switched off.
      if (!s.cashEnabled && s.gcashEnabled) _method = 'gcash';
      if (!s.gcashEnabled && s.cashEnabled) _method = 'cash';
    });
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _promoCtrl.dispose();
    super.dispose();
  }

  /// Checks the typed code against the order as it stands.
  ///
  /// Priced by the database, never here. The app only ever sends the code, so a
  /// tampered build cannot invent its own discount, and the amount shown is the
  /// amount that will actually be charged.
  Future<void> _applyPromo() async {
    final code = _promoCtrl.text.trim();
    if (code.isEmpty) {
      setState(() => _promo = null);
      return;
    }
    setState(() => _checkingPromo = true);
    final subtotal = context.read<Cart>().estimatedTotal;
    final preview = await Api.previewPromo(code, subtotal);
    if (!mounted) return;
    setState(() {
      _promo = preview;
      _checkingPromo = false;
    });
  }

  Future<void> _checkout() async {
    final cart = context.read<Cart>();
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final ticket = await Api.createTicket(
        quantitiesByDishId: cart.quantities,
        customerName: _nameCtrl.text,
        paymentMethod: _method,
        promoCode: _promo?.valid == true ? _promoCtrl.text : null,
      );
      // Remember it on the device so a regular can reorder in one tap. Nothing
      // leaves the phone — no account, no extra database rows.
      await OrderHistory.add(PastOrder(
        ticketCode: ticket.ticketCode,
        placedAt: ticket.createdAt,
        total: ticket.total,
        quantities: Map.of(cart.quantities),
        names: cart.lines.map((l) => l.key.name).toList(),
      ));
      cart.clear();
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => TicketScreen(ticket: ticket)),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _submitting = false;
      });
    }
  }

  Widget _methodOption({
    required String value,
    required String label,
    required String blurb,
    required IconData icon,
    required Color accent,
  }) {
    final selected = _method == value;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _method = value),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
          decoration: BoxDecoration(
            color: selected ? accent.withValues(alpha: 0.12) : Palette.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected ? accent : Palette.ink.withValues(alpha: 0.15),
              width: selected ? 2 : 1,
            ),
          ),
          child: Column(
            children: [
              Icon(icon, color: selected ? accent : Palette.ink, size: 24),
              const SizedBox(height: 6),
              Text(
                label,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: selected ? accent : Palette.ink,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                blurb,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 11,
                  height: 1.25,
                  color: Palette.ink.withValues(alpha: 0.6),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<Cart>();
    final lines = cart.lines;

    return Scaffold(
      appBar: AppBar(title: const Text('Your order')),
      body: lines.isEmpty
          ? const Center(child: Text('Your cart is empty.'))
          : PageBody(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                children: [
                  for (final line in lines)
                    Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Palette.card,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: Palette.ink.withValues(alpha: 0.1),
                        ),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  line.key.name,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                Text(
                                  '₱${line.key.price.toStringAsFixed(2)} each',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Palette.ink.withValues(alpha: 0.6),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            onPressed: () =>
                                context.read<Cart>().remove(line.key.id),
                            icon: const Icon(Icons.remove_circle_outline),
                          ),
                          Text(
                            '${line.value}',
                            style: const TextStyle(fontSize: 16),
                          ),
                          IconButton(
                            onPressed: () => context.read<Cart>().add(line.key),
                            icon: const Icon(Icons.add_circle_outline),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _nameCtrl,
                    textCapitalization: TextCapitalization.words,
                    decoration: InputDecoration(
                      labelText: 'Your name (optional)',
                      helperText: 'Helps staff call your order',
                      filled: true,
                      fillColor: Palette.card,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(
                          color: Palette.ink.withValues(alpha: 0.15),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _promoCtrl,
                          textCapitalization: TextCapitalization.characters,
                          autocorrect: false,
                          onSubmitted: (_) => _applyPromo(),
                          decoration: InputDecoration(
                            labelText: 'Discount code (optional)',
                            filled: true,
                            fillColor: Palette.card,
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: BorderSide(
                                color: Palette.ink.withValues(alpha: 0.15),
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        height: 58,
                        child: OutlinedButton(
                          onPressed: _checkingPromo ? null : _applyPromo,
                          child: _checkingPromo
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Text('Apply'),
                        ),
                      ),
                    ],
                  ),
                  if (_promo != null) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(
                          _promo!.valid ? Icons.check_circle : Icons.info_outline,
                          size: 15,
                          color: _promo!.valid ? Palette.green : Palette.red,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            // The reason on failure, so a diner is told to spend
                            // 20 pesos more rather than just "invalid".
                            _promo!.valid
                                ? '${_promo!.label}. ₱${_promo!.discount.toStringAsFixed(2)} off.'
                                : _promo!.reason,
                            style: TextStyle(
                              fontSize: 12,
                              color: _promo!.valid ? Palette.green : Palette.red,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],

                  const SizedBox(height: 22),
                  Text(
                    'HOW WILL YOU PAY?',
                    style: TextStyle(
                      fontSize: 11,
                      letterSpacing: 2,
                      fontWeight: FontWeight.w600,
                      color: Palette.ink.withValues(alpha: 0.55),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    spacing: 10,
                    children: [
                      if (_settings?.cashEnabled ?? true)
                        _methodOption(
                          value: 'cash',
                          label: 'Cash',
                          blurb: 'Pay at the counter',
                          icon: Icons.payments_outlined,
                          accent: Tokens.semanticCash,
                        ),
                      if (_settings?.gcashEnabled ?? true)
                        _methodOption(
                          value: 'gcash',
                          label: 'GCash',
                          blurb: 'Send, then upload the receipt',
                          icon: Icons.smartphone_outlined,
                          accent: Tokens.semanticGcash,
                        ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Total',
                        style: TextStyle(
                          color: Palette.ink.withValues(alpha: 0.6),
                        ),
                      ),
                      // Both figures while a discount applies, so the diner can
                      // see the code did something rather than trusting that it
                      // did. The final amount is still the server's to decide.
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          if (_promo?.valid == true)
                            Text(
                              '₱${cart.estimatedTotal.toStringAsFixed(2)}',
                              style: TextStyle(
                                fontSize: 14,
                                decoration: TextDecoration.lineThrough,
                                color: Palette.ink.withValues(alpha: 0.45),
                              ),
                            ),
                          Text(
                            '₱${(cart.estimatedTotal - (_promo?.valid == true ? _promo!.discount : 0)).toStringAsFixed(2)}',
                            style: const TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _method == 'gcash'
                        ? "You'll get the GCash details and a ticket next. Send the payment, upload the receipt, then show the ticket at the counter."
                        : 'You pay at the counter. The cashier confirms the final amount.',
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.35,
                      color: Palette.ink.withValues(alpha: 0.55),
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      _error!,
                      style: const TextStyle(color: Palette.red, fontSize: 13),
                    ),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _submitting ? null : _checkout,
                    style: FilledButton.styleFrom(
                      backgroundColor: Palette.ink,
                      foregroundColor: Palette.cream,
                      minimumSize: const Size.fromHeight(56),
                      shape: const StadiumBorder(),
                    ),
                    child: _submitting
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Palette.cream,
                            ),
                          )
                        : const Text(
                            'Get my ticket',
                            style: TextStyle(fontSize: 16),
                          ),
                  ),
                ],
              ),
            ),
    );
  }
}
