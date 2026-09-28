import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../theme.dart';

/// What the diner chose: the ulam, and how much rice with it.
class RiceChoice {
  const RiceChoice({this.rice, this.servings = 0});

  /// Null when they said no rice.
  final Dish? rice;
  final int servings;
}

/// Asks whether rice goes with the ulam.
///
/// Every dish on this menu is the ulam on its own — rice is priced and cooked
/// separately, a cup or a half cup, and the shop sells plenty of both. The app
/// used to add the ulam straight to the cart and never mention it, so a diner
/// on a phone had to know to go back to the Kanin category and add rice as a
/// separate dish. The website has asked all along; this is the same question,
/// in the shape a phone expects.
///
/// Rice is read from the menu rather than hardcoded, so when the pot runs out
/// the owner marks it sold out and the question simply stops being asked.
class RiceSheet extends StatefulWidget {
  const RiceSheet({super.key, required this.dish, required this.rice});

  final Dish dish;

  /// The rice servings on the menu, cheapest first.
  final List<Dish> rice;

  /// Returns null if the diner backed out without adding anything.
  static Future<RiceChoice?> open(
    BuildContext context,
    Dish dish,
    List<Dish> rice,
  ) =>
      showModalBottomSheet<RiceChoice>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Palette.cream,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        builder: (_) => RiceSheet(dish: dish, rice: rice),
      );

  @override
  State<RiceSheet> createState() => _RiceSheetState();
}

class _RiceSheetState extends State<RiceSheet> {
  /// Null is the honest default. Most diners take one ulam and one rice, but
  /// plenty share, and nobody should be charged for a cup they did not ask for.
  Dish? _chosen;
  int _servings = 1;

  double get _total =>
      widget.dish.price + (_chosen == null ? 0 : _chosen!.price * _servings);

  @override
  Widget build(BuildContext context) {
    final faint = Palette.ink.withValues(alpha: 0.6);

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).padding.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            widget.dish.name,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
          ),
          if (widget.dish.tagalog.isNotEmpty)
            Text(
              widget.dish.tagalog,
              style: TextStyle(fontSize: 13, fontStyle: FontStyle.italic, color: faint),
            ),
          const SizedBox(height: 14),

          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Palette.card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Palette.ink.withValues(alpha: 0.12)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'ADD RICE?',
                  style: TextStyle(fontSize: 11, letterSpacing: 2, color: faint),
                ),
                const SizedBox(height: 4),
                Text(
                  'The price above is for the ulam on its own.',
                  style: TextStyle(fontSize: 12, color: faint),
                ),
                const SizedBox(height: 12),

                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _choice(
                      label: 'No rice',
                      on: _chosen == null,
                      onTap: () => setState(() => _chosen = null),
                    ),
                    for (final r in widget.rice)
                      _choice(
                        label:
                            '${r.tagalog.isNotEmpty ? r.tagalog : r.name} · ₱${r.price.toStringAsFixed(0)}',
                        on: _chosen?.id == r.id,
                        onTap: () => setState(() => _chosen = r),
                      ),
                  ],
                ),

                if (_chosen != null) ...[
                  const SizedBox(height: 14),
                  Row(children: [
                    Text('How many?', style: TextStyle(fontSize: 13, color: faint)),
                    const Spacer(),
                    IconButton.outlined(
                      onPressed: _servings > 1
                          ? () => setState(() => _servings--)
                          : null,
                      icon: const Icon(Icons.remove, size: 16),
                      constraints: const BoxConstraints.tightFor(width: 36, height: 36),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      child: Text(
                        '$_servings',
                        style: const TextStyle(
                            fontSize: 17, fontWeight: FontWeight.w600),
                      ),
                    ),
                    IconButton.outlined(
                      onPressed: _servings < 10
                          ? () => setState(() => _servings++)
                          : null,
                      icon: const Icon(Icons.add, size: 16),
                      constraints: const BoxConstraints.tightFor(width: 36, height: 36),
                    ),
                  ]),
                ],
              ],
            ),
          ),

          const SizedBox(height: 16),
          FilledButton(
            onPressed: () => Navigator.pop(
              context,
              RiceChoice(rice: _chosen, servings: _chosen == null ? 0 : _servings),
            ),
            style: FilledButton.styleFrom(
              backgroundColor: Palette.ink,
              foregroundColor: Palette.cream,
              minimumSize: const Size.fromHeight(52),
              shape: const StadiumBorder(),
            ),
            child: Text('Add to order · ₱${_total.toStringAsFixed(2)}'),
          ),
        ],
      ),
    );
  }

  Widget _choice({
    required String label,
    required bool on,
    required VoidCallback onTap,
  }) =>
      GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
            color: on ? Palette.ink : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: on ? Palette.ink : Palette.ink.withValues(alpha: 0.25),
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              color: on ? Palette.cream : Palette.ink,
              fontWeight: on ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        ),
      );
}
