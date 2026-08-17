import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../services/api.dart';
import '../../theme.dart';

/// Rating what you just ate, from the ticket that proves you bought it.
///
/// The ticket code IS the proof of purchase, which is what lets ratings work
/// without accounts. The database refuses a rating unless that ticket was
/// settled and actually contained the dish, so nobody can manufacture praise
/// for food they never ordered.
///
/// Existing ratings are read back from the database when this opens. An earlier
/// version only remembered what was rated during that one visit to the screen,
/// so reopening a past order showed empty stars and looked as though nothing had
/// saved. What you gave now shows wherever you look at it, on any device.
class RateOrder extends StatefulWidget {
  const RateOrder({super.key, required this.ticket});

  final Ticket ticket;

  @override
  State<RateOrder> createState() => _RateOrderState();
}

class _RateOrderState extends State<RateOrder> {
  Map<String, DishReview> _given = const {};
  bool _loading = true;
  String? _busy;

  /// Which dish has its comment box open. Only one at a time: a column of empty
  /// text fields turns a two-second courtesy into a form.
  String? _commenting;
  final _commentCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final given = await Api.reviewsForTicket(widget.ticket.ticketCode);
    if (!mounted) return;
    setState(() {
      _given = given;
      _loading = false;
    });
  }

  Future<void> _rate(String dishId, int stars, {String? comment}) async {
    setState(() => _busy = dishId);
    try {
      await Api.leaveReview(
        ticketCode: widget.ticket.ticketCode,
        dishId: dishId,
        rating: stars,
        // Re-rating replaces the row, so an existing comment has to be sent
        // again or a diner changing their stars would silently lose what they
        // had written.
        comment: comment ?? _given[dishId]?.comment ?? '',
      );
      if (!mounted) return;
      setState(() {
        _given = {
          ..._given,
          dishId: DishReview(
            rating: stars,
            comment: comment ?? _given[dishId]?.comment ?? '',
          ),
        };
        if (comment != null) _commenting = null;
      });
    } catch (_) {
      // Rating is a courtesy, not part of getting fed. A failure here must never
      // interrupt somebody collecting their food.
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const SizedBox.shrink();

    final rated = _given.length;
    final total = widget.ticket.items.length;
    final allDone = total > 0 && rated >= total;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
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
            rated == 0 ? 'How was it?' : 'Your rating',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 2),
          Text(
            allDone
                ? 'Salamat po. Tap a star to change it.'
                : 'Your rating helps the next person choose.',
            style: TextStyle(fontSize: 12, color: Palette.ink.withValues(alpha: 0.6)),
          ),
          const SizedBox(height: 12),
          ...widget.ticket.items.map(_line),
        ],
      ),
    );
  }

  Widget _line(TicketItem item) {
    final mine = _given[item.id];
    final open = _commenting == item.id;

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  item.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13),
                ),
              ),
              if (_busy == item.id)
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: List.generate(5, (i) {
                    final star = i + 1;
                    final on = mine != null && star <= mine.rating;
                    return IconButton(
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(minWidth: 30, minHeight: 30),
                      iconSize: 22,
                      tooltip: star == 1 ? '1 star' : '$star stars',
                      icon: Icon(
                        on ? Icons.star_rounded : Icons.star_outline_rounded,
                        color: on ? Palette.gold : Palette.ink.withValues(alpha: 0.3),
                      ),
                      onPressed: () => _rate(item.id, star),
                    );
                  }),
                ),
            ],
          ),

          // Only offered once stars are given. Asking for words from somebody
          // who has not even tapped a star is asking too much.
          if (mine != null && !open)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                icon: const Icon(Icons.mode_comment_outlined, size: 14),
                label: Text(
                  mine.comment.isEmpty ? 'Add a comment' : 'Edit comment',
                  style: const TextStyle(fontSize: 12),
                ),
                onPressed: () => setState(() {
                  _commenting = item.id;
                  _commentCtrl.text = mine.comment;
                }),
              ),
            ),

          if (mine != null && mine.comment.isNotEmpty && !open)
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 4),
              child: Text(
                mine.comment,
                style: TextStyle(
                  fontSize: 12,
                  fontStyle: FontStyle.italic,
                  color: Palette.ink.withValues(alpha: 0.65),
                ),
              ),
            ),

          if (open) ...[
            const SizedBox(height: 4),
            TextField(
              controller: _commentCtrl,
              maxLength: 200,
              maxLines: 2,
              autofocus: true,
              decoration: const InputDecoration(
                hintText: 'Ano ang masasabi mo?',
                isDense: true,
                counterText: '',
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => setState(() => _commenting = null),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: () => _rate(
                    item.id,
                    mine!.rating,
                    comment: _commentCtrl.text.trim(),
                  ),
                  child: const Text('Save'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
