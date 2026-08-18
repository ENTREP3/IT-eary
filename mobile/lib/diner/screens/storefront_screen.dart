import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../services/api.dart';
import '../../theme.dart';
import '../widgets/hero_header.dart';
import '../widgets/review_band.dart';
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
    final show = shop?.storefront ?? Storefront.defaults;
    final cooking = _dishes.where((d) => d.available).toList();

    /// Under "Best sellers", only the dishes the owner marked as such.
    ///
    /// They used to lead a list the rest of the menu then filled out, which
    /// made the heading a lie: five picks and eight tiles meant three dishes
    /// were being called best sellers by nobody. It stays honest in the other
    /// direction too, because a marked dish still has to be available.
    final picks = cooking.where((d) => d.featured).toList();
    final hasPicks = show.recommended && picks.isNotEmpty;
    final preview = (hasPicks ? picks : cooking).take(8).toList();

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: PageBody(
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              // The photograph runs to the very top of the screen, under the
              // status bar, so it reads as the page rather than as a picture
              // pasted onto one. The header floats on it.
              Stack(
                children: [
                  HeroHeader(
                    shop: shop,
                    cooking: cooking,
                    onSeeMenu: _openMenu,
                    loaded: !_loading,
                  ),
                  Positioned(
                    top: 0,
                    left: 0,
                    right: 0,
                    child: SafeArea(
                      bottom: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 8, 8, 0),
                        child: Row(
                          children: [
                            Expanded(
                              child: _Wordmark(
                                district: shop?.district ?? '',
                                onDark: true,
                              ),
                            ),
                            TextButton.icon(
                              style: TextButton.styleFrom(
                                foregroundColor: Colors.white,
                              ),
                              onPressed: () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => const AccountScreen(),
                                ),
                              ),
                              icon: const Icon(Icons.person_outline, size: 18),
                              label: Text(Api.signedIn ? 'My orders' : 'Sign in'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),

              if (preview.isNotEmpty) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        hasPicks ? 'Best sellers' : 'Cooking today',
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      TextButton(
                        onPressed: _openMenu,
                        child: const Text('See the whole menu'),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Column(
                    children: preview
                        .map((d) => _DishPreview(dish: d, onTap: _openMenu))
                        .toList(),
                  ),
                ),
              ],

              Padding(
                padding: const EdgeInsets.fromLTRB(20, 26, 20, 0),
                child: ReviewBand(
                  show: show,
                  dishNames: {for (final d in _dishes) d.id: d.name},
                ),
              ),

              const Padding(
                padding: EdgeInsets.fromLTRB(20, 26, 20, 0),
                child: _HowItWorks(),
              ),

              // The address, hours and phone number live at the foot of the
              // page, exactly as they do on the website. They used to sit
              // above the food, which put the least appetising thing on the
              // screen in the most valuable place.
              if (shop != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 26, 20, 36),
                  child: _Footer(shop: shop),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The three steps, so a first-time diner knows what happens after they tap.
class _HowItWorks extends StatelessWidget {
  const _HowItWorks();

  static const _steps = [
    ('Build your order', 'Browse what is actually cooking. Anything that has run out is already hidden.'),
    ('Get a ticket code', 'No account and no app needed. A short code lands on your phone.'),
    ('Show it at the counter', 'Pay cash or GCash. Your screen updates to Paid on its own.'),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'How ordering works',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 12),
        for (var i = 0; i < _steps.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Container(
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
                  Text(
                    '0${i + 1}',
                    style: const TextStyle(
                      fontSize: 11,
                      letterSpacing: 3,
                      color: Palette.red,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _steps[i].$1,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _steps[i].$2,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.45,
                      color: Palette.ink.withValues(alpha: 0.7),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer({required this.shop});

  final Shop shop;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Divider(color: Palette.ink.withValues(alpha: 0.12), height: 30),
        _Wordmark(district: shop.district),
        const SizedBox(height: 10),
        Text(
          shop.tagline,
          style: TextStyle(color: Palette.ink.withValues(alpha: 0.65)),
        ),
        const SizedBox(height: 8),
        _OpenPill(open: shop.isOpenNow),
        const SizedBox(height: 20),
        _FooterBlock(
          label: 'WHERE TO FIND US',
          lines: [shop.address, if (shop.phone.isNotEmpty) shop.phone],
        ),
        const SizedBox(height: 16),
        _FooterBlock(
          label: 'OPENING HOURS',
          lines: shop.hours.isEmpty
              ? const ['Ask at the counter']
              : shop.hours
                  .map((h) => '${h.days}: ${h.opens} to ${h.closes}')
                  .toList(),
        ),
      ],
    );
  }
}

class _FooterBlock extends StatelessWidget {
  const _FooterBlock({required this.label, required this.lines});

  final String label;
  final List<String> lines;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 10,
            letterSpacing: 3,
            fontWeight: FontWeight.w600,
            color: Palette.ink.withValues(alpha: 0.5),
          ),
        ),
        const SizedBox(height: 8),
        ...lines.map(
          (l) => Padding(
            padding: const EdgeInsets.only(bottom: 3),
            child: Text(
              l,
              style: TextStyle(
                height: 1.45,
                color: Palette.ink.withValues(alpha: 0.75),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Wordmark extends StatelessWidget {
  const _Wordmark({required this.district, this.onDark = false});

  final String district;

  /// Over the hero photograph the wordmark has to be white, and "cris" keeps
  /// the accent red because that half of the name is the brand.
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final base = onDark ? Colors.white : Palette.ink;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RichText(
          text: TextSpan(
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: base,
            ),
            children: const [
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
                color: base.withValues(alpha: onDark ? 0.75 : 0.55),
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
