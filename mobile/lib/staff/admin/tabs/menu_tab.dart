import 'package:flutter/material.dart';

import '../../../models/models.dart';
import '../../../tokens.dart';
import '../admin_api.dart';
import 'widgets.dart';

/// Menu control — flip a dish on or off, edit price and details, remove a dish.
class MenuTab extends StatefulWidget {
  const MenuTab({super.key, required this.dishes, required this.onChanged});

  final List<Dish> dishes;
  final Future<void> Function() onChanged;

  @override
  State<MenuTab> createState() => _MenuTabState();
}

class _MenuTabState extends State<MenuTab> {
  String? _busy;

  Future<void> _toggle(Dish d, bool value) async {
    setState(() => _busy = d.id);
    try {
      await AdminApi.setDishAvailable(d.id, value);
      await widget.onChanged();
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  /// Marks a dish a bestseller, or takes the mark off.
  ///
  /// Deliberately the owner's own call rather than a calculation. The badge
  /// used to be awarded to whichever dish led its category, so the shop made a
  /// claim about its own food that nobody had approved, and a new dish could
  /// never be promoted however good it was.
  Future<void> _mark(Dish d) async {
    setState(() => _busy = d.id);
    try {
      await AdminApi.updateDish(d.id, {'featured': !d.featured});
      await widget.onChanged();
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _edit(Dish d) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Tokens.staffCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _DishForm(dish: d),
    );
    if (saved == true) await widget.onChanged();
  }

  Future<void> _delete(Dish d) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Tokens.staffCard,
        title: Text('Remove ${d.name}?',
            style: const TextStyle(color: Tokens.staffInk)),
        content: const Text('It disappears from the diner menu immediately.',
            style: TextStyle(color: Tokens.staffInk)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(
                backgroundColor: Tokens.semanticCritical),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await AdminApi.deleteDish(d.id);
    await widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Above the list, because it is about these dishes and the button it
        // asks you to press is on the card below.
        _Suggestions(dishes: widget.dishes, onChanged: widget.onChanged),

        for (final d in widget.dishes)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: AdminCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (d.image.isNotEmpty)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.network(
                        d.image,
                        width: 56,
                        height: 56,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => Container(
                          width: 56,
                          height: 56,
                          color: Tokens.staffInk.withValues(alpha: 0.08),
                          child: const Icon(Icons.restaurant,
                              size: 18, color: Tokens.staffInk),
                        ),
                      ),
                    ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(d.name,
                            style: const TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 16,
                                color: Tokens.staffInk)),
                        Text(
                          '₱${d.price.toStringAsFixed(0)} · ${d.category}',
                          style: TextStyle(
                              fontSize: 12,
                              color: Tokens.staffInk.withValues(alpha: 0.55)),
                        ),
                        const SizedBox(height: 4),
                        Row(children: [
                          IconButton(
                            onPressed: () => _edit(d),
                            icon: const Icon(Icons.edit_outlined, size: 17),
                            color: Tokens.staffInk.withValues(alpha: 0.8),
                            visualDensity: VisualDensity.compact,
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(),
                          ),
                          const SizedBox(width: 14),
                          IconButton(
                            onPressed: () => _delete(d),
                            icon: const Icon(Icons.delete_outline, size: 17),
                            color: Tokens.semanticAlert,
                            visualDensity: VisualDensity.compact,
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(),
                          ),
                          const SizedBox(width: 14),

                          // One mark, doing everything: the Bestseller badge on
                          // the menu, the rotating photograph on the front page,
                          // and the order of the Best sellers row. Without it
                          // here the owner could only ever set it from a
                          // laptop, which is not where they are during service.
                          _MarkButton(
                            marked: d.featured,
                            busy: _busy == d.id,
                            onTap: () => _mark(d),
                          ),
                        ]),
                      ],
                    ),
                  ),
                  Switch(
                    value: d.available,
                    onChanged: _busy == d.id ? null : (v) => _toggle(d, v),
                    activeThumbColor: Tokens.semanticGood,
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// What the sales say, offered as a question rather than acted on.
///
/// The badge used to appear by itself, so the shop made a claim about its own
/// food on the strength of a sum. The figures stay, but they stop being the
/// decision: they come here, and the owner accepts or declines.
///
/// There is no matching suggestion to unmark a dish. The obvious candidate
/// would be a marked dish that is not selling, which is exactly the new dish
/// the owner is deliberately pushing.
class _Suggestions extends StatefulWidget {
  const _Suggestions({required this.dishes, required this.onChanged});

  final List<Dish> dishes;
  final Future<void> Function() onChanged;

  @override
  State<_Suggestions> createState() => _SuggestionsState();
}

class _SuggestionsState extends State<_Suggestions> {
  /// Sales must climb by half again before a declined dish is raised a second
  /// time.
  static const _askAgainAt = 1.5;

  Map<String, dynamic> _dismissed = const {};
  String? _busy;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _loadDismissed();
  }

  Future<void> _loadDismissed() async {
    try {
      final row = await AdminApi.shopSettings();
      final show = (row?['storefront'] as Map?) ?? const {};
      if (!mounted) return;
      setState(() {
        _dismissed = Map<String, dynamic>.from(
          (show['bestseller_dismissed'] as Map?) ?? const {},
        );
        _ready = true;
      });
    } catch (_) {
      if (mounted) setState(() => _ready = true);
    }
  }

  /// The leader of each category, where that leader is not already marked.
  ///
  /// Ranked within the category, not across the menu: drinks outsell every main
  /// dish, so a single top-of-the-shop suggestion would only ever be a drink
  /// and the owner would never hear anything about their ulam.
  List<({Dish dish, int runnerUp})> get _suggestions {
    final top = <String, Dish>{};
    final second = <String, int>{};

    for (final d in widget.dishes) {
      if (!d.available || d.soldToday <= 0) continue;
      final held = top[d.category];
      if (held == null) {
        top[d.category] = d;
      } else if (d.soldToday > held.soldToday) {
        second[d.category] = held.soldToday;
        top[d.category] = d;
      } else if (d.soldToday > (second[d.category] ?? 0)) {
        second[d.category] = d.soldToday;
      }
    }

    final out = <({Dish dish, int runnerUp})>[];
    for (final entry in top.entries) {
      final d = entry.value;
      if (d.featured) continue;
      final refusedAt = (_dismissed[d.id] as num?)?.toInt();
      if (refusedAt != null && d.soldToday < refusedAt * _askAgainAt) continue;
      out.add((dish: d, runnerUp: second[entry.key] ?? 0));
    }
    out.sort((a, b) => b.dish.soldToday.compareTo(a.dish.soldToday));
    return out;
  }

  Future<void> _accept(Dish d) async {
    setState(() => _busy = d.id);
    try {
      await AdminApi.updateDish(d.id, {'featured': true});
      await widget.onChanged();
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _decline(Dish d) async {
    setState(() => _busy = d.id);
    try {
      await AdminApi.dismissBestseller(d.id, d.soldToday);
      if (mounted) {
        setState(() => _dismissed = {..._dismissed, d.id: d.soldToday});
      }
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const SizedBox.shrink();
    final suggestions = _suggestions;
    if (suggestions.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Tokens.staffAccent.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Tokens.staffAccent.withValues(alpha: 0.25)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.local_fire_department_rounded,
                  size: 17,
                  color: Tokens.staffAccent,
                ),
                const SizedBox(width: 8),
                Text(
                  'Selling well — mark them?',
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: Tokens.staffInk.withValues(alpha: 0.95),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              'Nothing is shown to diners until you say so.',
              style: TextStyle(
                fontSize: 12,
                color: Tokens.staffInk.withValues(alpha: 0.55),
              ),
            ),
            const SizedBox(height: 12),
            for (final s in suggestions)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      s.dish.name,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        color: Tokens.staffInk,
                      ),
                    ),
                    Text(
                      '${s.dish.soldToday} sold — the most in '
                      '${s.dish.category}'
                      '${s.runnerUp > 0 ? ', ahead of the next by ${s.dish.soldToday - s.runnerUp}' : ''}.',
                      style: TextStyle(
                        fontSize: 12,
                        color: Tokens.staffInk.withValues(alpha: 0.55),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        FilledButton.icon(
                          onPressed: _busy == s.dish.id
                              ? null
                              : () => _accept(s.dish),
                          icon: const Icon(Icons.star_rounded, size: 15),
                          label: const Text('Mark as bestseller'),
                          style: FilledButton.styleFrom(
                            backgroundColor: Tokens.staffAccent,
                            foregroundColor: Tokens.staffCard,
                            textStyle: const TextStyle(fontSize: 12),
                            visualDensity: VisualDensity.compact,
                          ),
                        ),
                        const SizedBox(width: 8),
                        TextButton(
                          onPressed: _busy == s.dish.id
                              ? null
                              : () => _decline(s.dish),
                          style: TextButton.styleFrom(
                            foregroundColor: Tokens.staffInk.withValues(
                              alpha: 0.6,
                            ),
                            textStyle: const TextStyle(fontSize: 12),
                            visualDensity: VisualDensity.compact,
                          ),
                          child: const Text('Not now'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// The bestseller mark, showing its state rather than hiding it behind a tap.
class _MarkButton extends StatelessWidget {
  const _MarkButton({
    required this.marked,
    required this.busy,
    required this.onTap,
  });

  final bool marked;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: busy ? null : onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          color: marked
              ? Tokens.staffAccent.withValues(alpha: 0.15)
              : Colors.transparent,
          border: Border.all(
            color: marked
                ? Tokens.staffAccent.withValues(alpha: 0.5)
                : Tokens.staffInk.withValues(alpha: 0.18),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              marked ? Icons.star_rounded : Icons.star_outline_rounded,
              size: 15,
              color: marked
                  ? Tokens.staffAccent
                  : Tokens.staffInk.withValues(alpha: 0.6),
            ),
            const SizedBox(width: 5),
            Text(
              marked ? 'Bestseller' : 'Mark',
              style: TextStyle(
                fontSize: 11,
                color: marked
                    ? Tokens.staffAccent
                    : Tokens.staffInk.withValues(alpha: 0.6),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DishForm extends StatefulWidget {
  const _DishForm({required this.dish});

  final Dish dish;

  @override
  State<_DishForm> createState() => _DishFormState();
}

class _DishFormState extends State<_DishForm> {
  late final _name = TextEditingController(text: widget.dish.name);
  late final _price =
      TextEditingController(text: widget.dish.price.toStringAsFixed(0));
  late final _tagalog = TextEditingController(text: widget.dish.tagalog);
  late final _desc = TextEditingController(text: widget.dish.description);
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _price.dispose();
    _tagalog.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await AdminApi.updateDish(widget.dish.id, {
        'name': _name.text.trim(),
        'price': double.tryParse(_price.text) ?? widget.dish.price,
        'tagalog': _tagalog.text.trim(),
        'description': _desc.text.trim(),
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '$e';
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Edit dish',
              style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: Tokens.staffInk)),
          const SizedBox(height: 16),
          _field(_name, 'Name'),
          const SizedBox(height: 10),
          _field(_price, 'Price (₱)', number: true),
          const SizedBox(height: 10),
          _field(_tagalog, 'Tagalog subtitle'),
          const SizedBox(height: 10),
          _field(_desc, 'Description', lines: 3),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: Tokens.semanticAlert)),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _save,
            style: FilledButton.styleFrom(
              backgroundColor: Tokens.staffAccent,
              foregroundColor: Tokens.staffCard,
              minimumSize: const Size.fromHeight(48),
            ),
            child: Text(_busy ? 'Saving…' : 'Save'),
          ),
        ],
      ),
    );
  }

  Widget _field(TextEditingController c, String label,
          {bool number = false, int lines = 1}) =>
      TextField(
        controller: c,
        maxLines: lines,
        keyboardType: number
            ? const TextInputType.numberWithOptions(decimal: true)
            : TextInputType.text,
        style: const TextStyle(color: Tokens.staffInk),
        decoration: InputDecoration(
          labelText: label,
          labelStyle: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.6)),
          filled: true,
          fillColor: Tokens.staffGround,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide:
                BorderSide(color: Tokens.staffInk.withValues(alpha: 0.15)),
          ),
        ),
      );
}
