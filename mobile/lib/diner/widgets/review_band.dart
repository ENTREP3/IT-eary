import 'dart:async';

import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../services/api.dart';
import '../../theme.dart';

/// What diners said, a few at a time, cycling.
///
/// Food is bought on trust and a first-time diner has nothing else to go on. A
/// wall of every review is unreadable and a single static quote looks planted;
/// a small group that changes reads like a board of testimonials and gives
/// every good review a turn.
///
/// The owner controls all of it from the dashboard: which reviews qualify, the
/// star floor, how many are on screen and how often they change. Switching
/// comments off keeps the scores and drops the sentences, which is what that
/// switch says it does.
class ReviewBand extends StatefulWidget {
  const ReviewBand({super.key, required this.show, required this.dishNames});

  final Storefront show;

  /// Dish id to name, so a quote can say what it is about.
  final Map<String, String> dishNames;

  @override
  State<ReviewBand> createState() => _ReviewBandState();
}

class _ReviewBandState extends State<ReviewBand> {
  List<Review> _quotes = const [];
  int _page = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant ReviewBand old) {
    super.didUpdateWidget(old);
    final s = widget.show, o = old.show;
    if (s.comments != o.comments ||
        s.reviewsSource != o.reviewsSource ||
        s.reviewsMinStars != o.reviewsMinStars) {
      _load();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    if (!widget.show.ratings) return;
    final quotes = await Api.showcaseReviews(widget.show);
    if (!mounted) return;
    setState(() {
      _quotes = quotes;
      _page = 0;
    });
    _restart();
  }

  int get _size => widget.show.reviewsPerBatch < 1 ? 1 : widget.show.reviewsPerBatch;

  int get _pages =>
      _quotes.isEmpty ? 1 : ((_quotes.length + _size - 1) ~/ _size);

  void _restart() {
    _timer?.cancel();
    if (widget.show.reviewsSeconds <= 0 || _pages < 2) return;
    _timer = Timer.periodic(Duration(seconds: widget.show.reviewsSeconds), (_) {
      if (!mounted) return;
      setState(() => _page = (_page + 1) % _pages);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.show.ratings || _quotes.isEmpty) return const SizedBox.shrink();
    if (MediaQuery.of(context).disableAnimations) _timer?.cancel();

    final start = _page * _size;
    final batch = _quotes.skip(start).take(_size).toList();
    // Hidden entirely rather than shown empty: a testimonial band with nothing
    // in it says the food has no admirers, which is worse than saying nothing.
    if (batch.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.show.comments ? 'WHAT DINERS SAID' : 'HOW DINERS RATED US',
          style: TextStyle(
            fontSize: 10,
            letterSpacing: 3,
            fontWeight: FontWeight.w600,
            color: Palette.ink.withValues(alpha: 0.5),
          ),
        ),
        const SizedBox(height: 12),

        // A column rather than the website's row of cards. Four quotes side by
        // side on a phone would be four unreadable slivers; stacked, each one
        // keeps the same width whether the batch is full or short, which is the
        // part of the web layout that actually mattered.
        ...batch.map(
          (q) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _QuoteCard(
              quote: q,
              dish: widget.dishNames[q.dishId] ?? '',
              showComment: widget.show.comments,
            ),
          ),
        ),

        if (_pages > 1)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Row(
              children: List.generate(
                _pages,
                (i) => GestureDetector(
                  onTap: () => setState(() => _page = i),
                  child: Container(
                    margin: const EdgeInsets.only(right: 6),
                    width: i == _page ? 22 : 6,
                    height: 5,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(999),
                      color: i == _page
                          ? Palette.red
                          : Palette.ink.withValues(alpha: 0.2),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _QuoteCard extends StatelessWidget {
  const _QuoteCard({
    required this.quote,
    required this.dish,
    required this.showComment,
  });

  final Review quote;
  final String dish;
  final bool showComment;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Palette.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Palette.ink.withValues(alpha: 0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Stars(value: quote.rating),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  dish,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    color: Palette.ink.withValues(alpha: 0.55),
                  ),
                ),
              ),
            ],
          ),
          if (showComment && quote.comment.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(quote.comment, style: const TextStyle(height: 1.45)),
          ],
          if ((quote.authorName ?? '').isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              quote.authorName!,
              style: TextStyle(
                fontSize: 12,
                color: Palette.ink.withValues(alpha: 0.5),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Five stars, filled to [value]. Shared so a rating looks the same everywhere.
class Stars extends StatelessWidget {
  const Stars({super.key, required this.value, this.size = 14});

  final int value;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(
        5,
        (i) => Icon(
          i < value ? Icons.star_rounded : Icons.star_outline_rounded,
          size: size,
          color: i < value ? Palette.red : Palette.ink.withValues(alpha: 0.25),
        ),
      ),
    );
  }
}
