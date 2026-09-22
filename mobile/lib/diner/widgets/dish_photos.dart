import 'dart:async';

import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../widgets/dish_image.dart';

/// A dish's photographs, full screen, taking turns.
///
/// One picture was never going to sell food. A karinderya has the plate, the
/// serving in the platter and the meal with rice beside it, and all three say
/// something different — so tapping the photo on the menu opens the lot rather
/// than making the owner choose which one to tell the truth with.
///
/// Swiping stops the timer. The diner is now driving, and a slideshow that
/// pulls away from you while you are looking is worse than one that never
/// moved at all.
class DishPhotoViewer extends StatefulWidget {
  const DishPhotoViewer({
    super.key,
    required this.dish,
    required this.seconds,
    this.startAt = 0,
  });

  final Dish dish;

  /// How long each photo is held. Zero or less holds on the first.
  final int seconds;
  final int startAt;

  static Future<void> open(BuildContext context, Dish dish, int seconds) {
    final photos = dish.images.isNotEmpty
        ? dish.images
        : (dish.image.isEmpty ? const <String>[] : [dish.image]);
    if (photos.isEmpty) return Future.value();
    return Navigator.of(context).push(
      PageRouteBuilder<void>(
        opaque: false,
        barrierColor: Colors.black87,
        pageBuilder: (_, _, _) =>
            DishPhotoViewer(dish: dish, seconds: seconds),
        transitionsBuilder: (_, anim, _, child) =>
            FadeTransition(opacity: anim, child: child),
      ),
    );
  }

  @override
  State<DishPhotoViewer> createState() => _DishPhotoViewerState();
}

class _DishPhotoViewerState extends State<DishPhotoViewer> {
  late final _pages = PageController(initialPage: widget.startAt);
  late int _at = widget.startAt;
  Timer? _timer;

  List<String> get _photos => widget.dish.images.isNotEmpty
      ? widget.dish.images
      : (widget.dish.image.isEmpty ? const <String>[] : [widget.dish.image]);

  @override
  void initState() {
    super.initState();
    _start();
  }

  void _start() {
    _timer?.cancel();
    if (widget.seconds <= 0 || _photos.length < 2) return;
    _timer = Timer.periodic(Duration(seconds: widget.seconds.clamp(2, 60)), (_) {
      if (!mounted) return;
      _pages.animateToPage(
        (_at + 1) % _photos.length,
        duration: const Duration(milliseconds: 450),
        curve: Curves.easeInOut,
      );
    });
  }

  /// Stops the slideshow for good once the diner has taken over.
  void _hold() {
    _timer?.cancel();
    _timer = null;
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final photos = _photos;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Stack(children: [
        Listener(
          // Any touch means the diner is looking on their own terms now.
          onPointerDown: (_) => _hold(),
          child: PageView.builder(
            controller: _pages,
            itemCount: photos.length,
            onPageChanged: (i) => setState(() => _at = i),
            itemBuilder: (_, i) => InteractiveViewer(
              minScale: 1,
              maxScale: 4,
              child: Center(
                child: DishImage(
                  url: photos[i],
                  fit: BoxFit.contain,
                  errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined,
                      size: 40, color: Colors.white54),
                ),
              ),
            ),
          ),
        ),

        Positioned(
          top: MediaQuery.of(context).padding.top + 8,
          right: 8,
          child: IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.close, color: Colors.white),
            tooltip: 'Close',
          ),
        ),

        Positioned(
          left: 0,
          right: 0,
          bottom: MediaQuery.of(context).padding.bottom + 24,
          child: Column(children: [
            Text(
              widget.dish.name,
              style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.w600),
            ),
            if (photos.length > 1) ...[
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < photos.length; i++)
                    GestureDetector(
                      onTap: () {
                        _hold();
                        _pages.animateToPage(i,
                            duration: const Duration(milliseconds: 300),
                            curve: Curves.easeInOut);
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 250),
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        height: 6,
                        width: i == _at ? 20 : 6,
                        decoration: BoxDecoration(
                          color: i == _at
                              ? Colors.white
                              : Colors.white.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ]),
        ),
      ]),
    );
  }
}

/// Says a dish has more to see, without the card itself moving.
///
/// A grid of tiles all cross-fading on their own timers reads as a page
/// malfunctioning, and it would make every photo of every dish download before
/// the menu could finish loading.
class MorePhotosBadge extends StatelessWidget {
  const MorePhotosBadge({super.key, required this.count});

  final int count;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.photo_library_outlined,
              size: 11, color: Colors.white),
          const SizedBox(width: 4),
          Text('$count',
              style: const TextStyle(fontSize: 10, color: Colors.white)),
        ]),
      );
}
