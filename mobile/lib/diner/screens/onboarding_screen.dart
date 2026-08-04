import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../theme.dart';
import '../../tokens.dart';

/// Four swipeable cards shown once, on first launch.
///
/// Ordering by ticket code is unfamiliar to most diners — they expect either a
/// waiter or an online payment. Explaining the shape of it up front is cheaper
/// than confusion at the counter.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key, required this.onDone});

  final VoidCallback onDone;

  static const _seenKey = 'onboarding_seen_v1';

  static Future<bool> hasSeen() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_seenKey) ?? false;
  }

  static Future<void> markSeen() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_seenKey, true);
  }

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;

  static const _pages = [
    (
      Icons.restaurant_menu,
      'Only what’s cooking',
      'The menu shows exactly what the kitchen has today. If a dish is greyed '
          'out, it has sold out — no disappointment at the counter.',
    ),
    (
      Icons.shopping_bag_outlined,
      'Build your order',
      'Tap to add, adjust the quantity, and choose Cash or GCash. No account, '
          'no password, nothing to sign up for.',
    ),
    (
      Icons.confirmation_number_outlined,
      'Get a ticket code',
      'You’ll get a short code like K7M2Q9. Show it to the cashier — that code '
          'is your order.',
    ),
    (
      Icons.check_circle_outline,
      'Pay and watch it update',
      'Paying by GCash? Send it, then upload the receipt so the cashier can '
          'confirm. Your ticket turns Paid on its own.',
    ),
  ];

  Future<void> _finish() async {
    await OnboardingScreen.markSeen();
    widget.onDone();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isLast = _page == _pages.length - 1;

    return Scaffold(
      backgroundColor: Palette.cream,
      body: SafeArea(
        child: PageBody(
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: _finish,
                  style: TextButton.styleFrom(
                    foregroundColor: Palette.ink.withValues(alpha: 0.6),
                  ),
                  child: const Text('Skip'),
                ),
              ),
              Expanded(
                child: PageView.builder(
                  controller: _controller,
                  itemCount: _pages.length,
                  onPageChanged: (i) => setState(() => _page = i),
                  itemBuilder: (_, i) {
                    final (icon, title, blurb) = _pages[i];
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 28),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            width: 92,
                            height: 92,
                            decoration: BoxDecoration(
                              color: Palette.card,
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: Palette.ink.withValues(alpha: 0.1),
                              ),
                            ),
                            child: Icon(icon, size: 40, color: Tokens.dinerAccent),
                          ),
                          const SizedBox(height: 28),
                          Text(
                            title,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 26,
                              fontWeight: FontWeight.w600,
                              height: 1.15,
                              color: Palette.ink,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            blurb,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 15,
                              height: 1.5,
                              color: Palette.ink.withValues(alpha: 0.7),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < _pages.length; i++)
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 220),
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      width: i == _page ? 22 : 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: i == _page
                            ? Tokens.dinerAccent
                            : Palette.ink.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
                child: FilledButton(
                  onPressed: isLast
                      ? _finish
                      : () => _controller.nextPage(
                            duration: const Duration(milliseconds: 260),
                            curve: Curves.easeOut,
                          ),
                  style: FilledButton.styleFrom(
                    backgroundColor: Palette.ink,
                    foregroundColor: Palette.cream,
                    minimumSize: const Size.fromHeight(54),
                    shape: const StadiumBorder(),
                  ),
                  child: Text(isLast ? 'Start ordering' : 'Next'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
