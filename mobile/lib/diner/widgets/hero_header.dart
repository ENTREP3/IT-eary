import 'dart:async';

import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../widgets/photo_sizes.dart';
import '../../theme.dart';
import '../../widgets/dish_image.dart';

/// The front page opens on the food, not on a paragraph.
class HeroHeader extends StatefulWidget {
  const HeroHeader({
    super.key,
    required this.shop,
    required this.cooking,
    required this.onSeeMenu,
    required this.loaded,
  });

  final Shop? shop;

  /// Everything available today, in menu order.
  final List<Dish> cooking;

  final VoidCallback onSeeMenu;
  final bool loaded;

  @override
  State<HeroHeader> createState() => _HeroHeaderState();
}

class _HeroHeaderState extends State<HeroHeader> {
  int _i = 0;
  Timer? _timer;

  /// The owner's picks, and only ones that actually have a photograph.
  ///
  /// A marked dish with no image would rotate to a blank screen, which looks
  /// broken rather than minimal. With nothing marked at all it falls back to
  /// whatever is cooking, so a shop that has never opened the dashboard still
  /// gets a hero.
  List<Dish> get _slides {
    final picked = widget.cooking
        .where((d) => d.featured && d.image.isNotEmpty)
        .toList();
    if (picked.isNotEmpty) return picked;
    return widget.cooking.where((d) => d.image.isNotEmpty).take(5).toList();
  }

  @override
  void initState() {
    super.initState();
    // Started here as well as on update. It used to run only from
    // didUpdateWidget, so the very first mount had no timer at all and the
    // photograph sat still until some unrelated rebuild happened to wake it.
    _restart();
  }

  @override
  void didUpdateWidget(covariant HeroHeader old) {
    super.didUpdateWidget(old);
    // Only when something the timer actually depends on has moved. Restarting
    // on every parent rebuild reset the countdown each time, so a page that
    // rebuilt more often than every seven seconds never reached the next
    // slide — a timer permanently starting over looks exactly like a timer
    // that was never set.
    final was = old.shop?.storefront.heroSeconds ?? 0;
    final now = widget.shop?.storefront.heroSeconds ?? 0;
    if (was != now || _slideCount != _slides.length) _restart();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  /// How many slides the running timer was set up for.
  int _slideCount = 0;

  void _restart() {
    _timer?.cancel();
    _slideCount = _slides.length;
    final seconds = widget.shop?.storefront.heroSeconds ?? 0;
    // No timer for a single slide, and none when the owner asked it to hold
    // still. A timer that only ever redraws the same picture is wasted battery.
    if (seconds <= 0 || _slideCount < 2) return;
    _timer = Timer.periodic(Duration(seconds: seconds), (_) {
      if (!mounted) return;
      setState(() => _i = (_i + 1) % _slides.length);
    });
  }

  /// Moves the hero by hand, and stops it moving on its own.
  ///
  /// Somebody who swipes has taken over. A slideshow that carries on pulling
  /// away under their thumb is worse than one that never moved.
  void _step(int by) {
    final n = _slides.length;
    if (n < 2) return;
    _timer?.cancel();
    _timer = null;
    setState(() => _i = (_i + by) % n < 0 ? n - 1 : (_i + by) % n);
  }

  @override
  Widget build(BuildContext context) {
    final slides = _slides;
    final shop = widget.shop;
    final media = MediaQuery.of(context);

    // Somebody who has asked their phone to stop moving things gets a still
    // photograph. This is exactly what that setting exists to prevent.
    //
    // Cancelling it here, in build, was a mistake: build runs for all sorts of
    // reasons and a side effect inside it fires every time. Now it is only
    // read, and the timer is stopped once, where the reading happens.
    final still = media.disableAnimations;
    if (still && _timer != null) {
      _timer!.cancel();
      _timer = null;
    }

    final current = slides.isEmpty ? null : slides[_i % slides.length];

    // Tall enough to be the screen, short enough that the best sellers below
    // peek over the fold and invite a scroll.
    final height = (media.size.height * 0.68).clamp(420.0, 720.0);

    return SizedBox(
      height: height,
      // Swiping the photograph moves it, which is what everybody tries first
      // on a picture with dots under it. Horizontal only, so a swipe never
      // steals the vertical drag that scrolls the page.
      child: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onHorizontalDragEnd: slides.length < 2
            ? null
            : (details) {
                final v = details.primaryVelocity ?? 0;
                if (v == 0) return;
                // A leftward flick means "next", the way every carousel works.
                _step(v < 0 ? 1 : -1);
              },
        child: Stack(
          fit: StackFit.expand,
          children: [
            Container(color: Palette.ink),

            if (current != null)
              AnimatedSwitcher(
                duration: still
                    ? Duration.zero
                    : const Duration(milliseconds: 900),
                // SizedBox.expand, not a bare Image: AnimatedSwitcher lays its
                // child out loosely inside a centring Stack, so the photograph
                // took its own size and sat letterboxed in the middle with bands
                // of dead colour above and below it.
                child: SizedBox.expand(
                  key: ValueKey(current.id),
                  child: DishImage(
                    url: displayPhoto(current.image),
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => Container(color: Palette.ink),
                  ),
                ),
              ),

            // Two layers rather than one flat wash: a vertical gradient so the
            // words at the bottom sit on near-black, and a light overall tint so
            // a very bright photograph cannot wash out the pill at the top.
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [
                    Color(0xD9000000),
                    Color(0x73000000),
                    Color(0x40000000),
                  ],
                  stops: [0, 0.55, 1],
                ),
              ),
              child: SizedBox.expand(),
            ),

            Align(
              alignment: Alignment.bottomLeft,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 22),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (shop != null) _OpenPill(open: shop.isOpenNow),
                    const SizedBox(height: 14),

                    // Blank until the settings arrive rather than showing a
                    // bundled guess the database then contradicts.
                    Text(
                      shop?.tagline ?? '',
                      style: const TextStyle(
                        fontSize: 40,
                        height: 1.0,
                        letterSpacing: -0.8,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      shop?.blurb ?? '',
                      style: TextStyle(
                        height: 1.45,
                        color: Colors.white.withValues(alpha: 0.82),
                      ),
                    ),

                    const SizedBox(height: 18),
                    FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: Palette.ink,
                        minimumSize: const Size.fromHeight(52),
                        shape: const StadiumBorder(),
                      ),
                      onPressed: widget.onSeeMenu,
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            'See what is cooking today',
                            style: TextStyle(fontWeight: FontWeight.w600),
                          ),
                          SizedBox(width: 8),
                          Icon(Icons.arrow_forward, size: 18),
                        ],
                      ),
                    ),

                    if (widget.loaded) ...[
                      const SizedBox(height: 10),
                      Text(
                        widget.cooking.isEmpty
                            ? 'Nothing is cooking right now'
                            : '${widget.cooking.length} dishes available right now',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.white.withValues(alpha: 0.7),
                        ),
                      ),
                    ],

                    // Which dish is behind the words. Without this the photograph
                    // is decoration; with it, it is the shop showing you
                    // something.
                    if (current != null) ...[
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              '${current.name.toUpperCase()}  ·  '
                              '₱${current.price.toStringAsFixed(0)}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 11,
                                letterSpacing: 2,
                                color: Colors.white.withValues(alpha: 0.65),
                              ),
                            ),
                          ),
                          if (slides.length > 1) ...[
                            const SizedBox(width: 12),
                            ...List.generate(
                              slides.length,
                              (n) => GestureDetector(
                                onTap: () => setState(() => _i = n),
                                child: Container(
                                  margin: const EdgeInsets.only(right: 5),
                                  width: n == _i ? 20 : 6,
                                  height: 4,
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(999),
                                    color: Colors.white.withValues(
                                      alpha: n == _i ? 1 : 0.4,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OpenPill extends StatelessWidget {
  const _OpenPill({required this.open});

  final bool open;

  @override
  Widget build(BuildContext context) {
    final colour = open ? Palette.green : Colors.white.withValues(alpha: 0.6);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: Colors.black.withValues(alpha: 0.35),
        border: Border.all(color: Colors.white.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: open ? Palette.green : Colors.white70,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 7),
          Text(
            open ? 'Open now' : 'Closed right now',
            style: TextStyle(
              fontSize: 11,
              letterSpacing: 0.3,
              color: open ? colour : Colors.white.withValues(alpha: 0.85),
            ),
          ),
        ],
      ),
    );
  }
}
