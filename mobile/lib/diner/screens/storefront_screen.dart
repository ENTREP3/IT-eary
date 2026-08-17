import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../services/api.dart';
import '../../theme.dart';
import 'account_screen.dart';
import 'menu_screen.dart';

/// The first screen a diner meets, matching the website's landing page.
///
/// Its whole job is to answer three questions in about five seconds: what is
/// this, is it open, and where is it. The app opened straight onto the menu
/// before, which is fine for somebody who already knows Bencris and useless for
/// somebody who just scanned a poster on a wall and has never heard of it.
///
/// Everything here is read from the shop's own settings, so the owner corrects
/// the address or the hours once on the dashboard and every app follows.
class StorefrontScreen extends StatefulWidget {
  const StorefrontScreen({super.key});

  @override
  State<StorefrontScreen> createState() => _StorefrontScreenState();
}

class _StorefrontScreenState extends State<StorefrontScreen> {
  Shop? _shop;
  List<Dish> _dishes = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    // The page is still worth showing if either call fails: a diner who cannot
    // see today's dishes can still find the address and the opening hours.
    final shop = await Api.shop();
    List<Dish> dishes = const [];
    try {
      dishes = await Api.menu();
    } catch (_) {}

    if (!mounted) return;
    setState(() {
      _shop = shop;
      _dishes = dishes;
      _loading = false;
    });
  }

  void _openMenu() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const MenuScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final shop = _shop;
    final cooking = _dishes.where((d) => d.available).toList();

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: PageBody(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
              children: [
                Row(
                  children: [
                    Expanded(child: _Wordmark(district: shop?.district ?? '')),
                    TextButton.icon(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const AccountScreen()),
                      ),
                      icon: const Icon(Icons.person_outline, size: 18),
                      label: Text(Api.signedIn ? 'My orders' : 'Sign in'),
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                if (shop != null) _OpenPill(open: shop.isOpenNow),
                const SizedBox(height: 14),

                // Blank until the settings arrive rather than showing a bundled
                // guess the database then contradicts, which reads as a flicker.
                Text(
                  shop?.tagline ?? '',
                  style: const TextStyle(
                    fontSize: 38,
                    fontWeight: FontWeight.w600,
                    height: 1.02,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  shop?.blurb ?? '',
                  style: TextStyle(
                    height: 1.5,
                    color: Palette.ink.withValues(alpha: 0.7),
                  ),
                ),

                const SizedBox(height: 24),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: Palette.ink,
                    foregroundColor: Palette.cream,
                    minimumSize: const Size.fromHeight(54),
                    shape: const StadiumBorder(),
                  ),
                  onPressed: _openMenu,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Text(
                        'See what is cooking today',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(width: 8),
                      const Icon(Icons.arrow_forward, size: 18),
                    ],
                  ),
                ),
                if (!_loading) ...[
                  const SizedBox(height: 8),
                  Center(
                    child: Text(
                      cooking.isEmpty
                          ? 'Nothing is cooking right now'
                          : '${cooking.length} dishes available right now',
                      style: TextStyle(
                        fontSize: 12,
                        color: Palette.ink.withValues(alpha: 0.5),
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 26),
                if (shop != null) ...[
                  _InfoCard(
                    icon: Icons.schedule,
                    label: 'OPENING HOURS',
                    lines: shop.hours.isEmpty
                        ? const ['Ask at the counter']
                        : shop.hours
                            .map((h) => '${h.days}: ${h.opens} to ${h.closes}')
                            .toList(),
                  ),
                  const SizedBox(height: 10),
                  _InfoCard(
                    icon: Icons.place_outlined,
                    label: 'WHERE TO FIND US',
                    lines: [shop.address],
                  ),
                  const SizedBox(height: 10),
                  _InfoCard(
                    icon: Icons.call_outlined,
                    label: 'CONTACT',
                    lines: [
                      if (shop.phone.isNotEmpty) shop.phone,
                      'Cash and GCash accepted',
                    ],
                  ),
                ],

                if (cooking.isNotEmpty) ...[
                  const SizedBox(height: 28),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Cooking today',
                        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
                      ),
                      TextButton(
                        onPressed: _openMenu,
                        child: const Text('See the whole menu'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ...cooking.take(3).map((d) => _DishPreview(dish: d, onTap: _openMenu)),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Wordmark extends StatelessWidget {
  const _Wordmark({required this.district});

  final String district;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RichText(
          text: const TextSpan(
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: Palette.ink,
            ),
            children: [
              TextSpan(text: 'Ben'),
              TextSpan(
                text: 'cris',
                style: TextStyle(fontStyle: FontStyle.italic, color: Palette.red),
              ),
            ],
          ),
        ),
        if (district.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              district.toUpperCase(),
              style: TextStyle(
                fontSize: 10,
                letterSpacing: 3,
                color: Palette.ink.withValues(alpha: 0.55),
              ),
            ),
          ),
      ],
    );
  }
}

class _OpenPill extends StatelessWidget {
  const _OpenPill({required this.open});

  final bool open;

  @override
  Widget build(BuildContext context) {
    final colour = open ? Palette.green : Palette.ink.withValues(alpha: 0.4);
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: colour.withValues(alpha: 0.5)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: colour, shape: BoxShape.circle),
            ),
            const SizedBox(width: 7),
            Text(
              open ? 'Open now' : 'Closed right now',
              style: TextStyle(fontSize: 11, color: colour, letterSpacing: 0.3),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.icon, required this.label, required this.lines});

  final IconData icon;
  final String label;
  final List<String> lines;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Palette.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Palette.ink.withValues(alpha: 0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 15, color: Palette.red),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10,
                  letterSpacing: 2,
                  fontWeight: FontWeight.w600,
                  color: Palette.red.withValues(alpha: 0.9),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ...lines.map(
            (l) => Padding(
              padding: const EdgeInsets.only(bottom: 3),
              child: Text(l, style: const TextStyle(height: 1.45)),
            ),
          ),
        ],
      ),
    );
  }
}

class _DishPreview extends StatelessWidget {
  const _DishPreview({required this.dish, required this.onTap});

  final Dish dish;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 9),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 62,
                height: 62,
                child: dish.image.isEmpty
                    ? Container(color: Palette.card)
                    : Image.network(
                        dish.image,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => Container(color: Palette.card),
                      ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    dish.name,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    dish.tagalog,
                    style: TextStyle(
                      fontSize: 12,
                      fontStyle: FontStyle.italic,
                      color: Palette.ink.withValues(alpha: 0.55),
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            Text(
              '₱${dish.price.toStringAsFixed(0)}',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
    );
  }
}
