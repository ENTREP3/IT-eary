import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../services/api.dart';
import '../../theme.dart';
import '../../tokens.dart';
import '../state/order_history.dart';
import 'onboarding_screen.dart';

/// Trust page: who the karinderya is, where it is, and how ordering works.
///
/// Lab 3 flagged "no trust signals" as a real gap — a first-time diner had no
/// address, hours, or contact to judge the business by. Also the home for the
/// device-local order history.
class AboutScreen extends StatefulWidget {
  const AboutScreen({super.key, this.onReorder});

  /// Refills the cart from a past order and pops back to the menu.
  final void Function(Map<String, int> quantities)? onReorder;

  @override
  State<AboutScreen> createState() => _AboutScreenState();
}

class _AboutScreenState extends State<AboutScreen> {
  List<PastOrder> _history = [];
  PaymentSettings? _settings;

  // Static business details. Kept here rather than in the database because they
  // change roughly never, and a diner should see them even offline.
  static const _address = 'Sampaloc 1 Bridge, SM Dasmariñas\n'
      "Governor's Drive, Dasmariñas, Cavite 4114";
  static const _hours = 'Monday – Saturday · 6:00 AM – 8:00 PM\nSunday · 7:00 AM – 2:00 PM';
  static const _phone = '(0939) 915-1561';

  @override
  void initState() {
    super.initState();
    OrderHistory.load().then((h) {
      if (mounted) setState(() => _history = h);
    });
    Api.paymentSettings().then((s) {
      if (mounted) setState(() => _settings = s);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('About & past orders')),
      body: PageBody(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            _card(
              icon: Icons.storefront_outlined,
              title: 'IT-eary Karinderya',
              child: Text(
                'Home-style Filipino cooking, made fresh each morning and served '
                'until it runs out. Order from your phone, pay at the counter.',
                style: TextStyle(
                    height: 1.5, color: Palette.ink.withValues(alpha: 0.75)),
              ),
            ),
            const SizedBox(height: 12),
            _card(
              icon: Icons.place_outlined,
              title: 'Where to find us',
              child: Text(_address,
                  style: TextStyle(
                      height: 1.5, color: Palette.ink.withValues(alpha: 0.75))),
            ),
            const SizedBox(height: 12),
            _card(
              icon: Icons.schedule,
              title: 'Opening hours',
              child: Text(_hours,
                  style: TextStyle(
                      height: 1.5, color: Palette.ink.withValues(alpha: 0.75))),
            ),
            const SizedBox(height: 12),
            _card(
              icon: Icons.call_outlined,
              title: 'Contact',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SelectableText(_phone,
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  if (_settings != null && _settings!.gcashNumber.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text('GCash · ${_settings!.gcashName}',
                        style: TextStyle(
                            fontSize: 13,
                            color: Palette.ink.withValues(alpha: 0.65))),
                    SelectableText(_settings!.gcashNumber,
                        style: const TextStyle(
                            fontFamily: 'monospace',
                            fontWeight: FontWeight.w600)),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            _card(
              icon: Icons.receipt_long_outlined,
              title: 'How ordering works',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final step in const [
                    'Browse today’s menu and add what you want.',
                    'Choose Cash or GCash, then get a ticket code.',
                    'Show the code at the counter and pay.',
                    'Your ticket turns Paid — collect when it says Ready.',
                  ])
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('• '),
                          Expanded(
                            child: Text(step,
                                style: TextStyle(
                                    height: 1.45,
                                    color:
                                        Palette.ink.withValues(alpha: 0.75))),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => OnboardingScreen(
                          onDone: () => Navigator.of(context).pop(),
                        ),
                      ),
                    ),
                    icon: const Icon(Icons.slideshow, size: 16),
                    label: const Text('Show the walkthrough again'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Palette.ink,
                      side: BorderSide(color: Palette.ink.withValues(alpha: 0.25)),
                      shape: const StadiumBorder(),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 22),
            Text('YOUR PAST ORDERS',
                style: TextStyle(
                  fontSize: 11,
                  letterSpacing: 2,
                  fontWeight: FontWeight.w600,
                  color: Palette.ink.withValues(alpha: 0.55),
                )),
            const SizedBox(height: 4),
            Text(
              'Kept on this phone only — nothing is stored against your name.',
              style: TextStyle(
                  fontSize: 12, color: Palette.ink.withValues(alpha: 0.5)),
            ),
            const SizedBox(height: 12),

            if (_history.isEmpty)
              Text('No orders yet.',
                  style: TextStyle(color: Palette.ink.withValues(alpha: 0.5)))
            else
              for (final o in _history)
                Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Palette.card,
                    borderRadius: BorderRadius.circular(16),
                    border:
                        Border.all(color: Palette.ink.withValues(alpha: 0.1)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(o.ticketCode,
                              style: const TextStyle(
                                fontFamily: 'monospace',
                                letterSpacing: 2,
                                fontWeight: FontWeight.w700,
                              )),
                          const Spacer(),
                          Text('₱${o.total.toStringAsFixed(2)}',
                              style:
                                  const TextStyle(fontWeight: FontWeight.w600)),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(o.summary,
                          style: TextStyle(
                              fontSize: 13,
                              color: Palette.ink.withValues(alpha: 0.7))),
                      Text(
                        '${o.placedAt.month}/${o.placedAt.day}/${o.placedAt.year}',
                        style: TextStyle(
                            fontSize: 11,
                            color: Palette.ink.withValues(alpha: 0.45)),
                      ),
                      if (widget.onReorder != null) ...[
                        const SizedBox(height: 10),
                        FilledButton.icon(
                          onPressed: () {
                            widget.onReorder!(o.quantities);
                            Navigator.of(context).pop();
                          },
                          icon: const Icon(Icons.refresh, size: 16),
                          label: const Text('Order this again'),
                          style: FilledButton.styleFrom(
                            backgroundColor: Palette.ink,
                            foregroundColor: Palette.cream,
                            minimumSize: const Size.fromHeight(42),
                            shape: const StadiumBorder(),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
          ],
        ),
      ),
    );
  }

  Widget _card({
    required IconData icon,
    required String title,
    required Widget child,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Palette.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Palette.ink.withValues(alpha: 0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(icon, size: 17, color: Tokens.dinerAccent),
            const SizedBox(width: 8),
            Text(title,
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w600)),
          ]),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}
