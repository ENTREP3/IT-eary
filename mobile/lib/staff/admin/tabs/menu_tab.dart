import 'package:flutter/material.dart';

import '../../../models/models.dart';
import '../../../tokens.dart';
import '../admin_api.dart';
import 'widgets.dart';

/// Menu control — flip a dish on or off, edit price and details, remove a dish.
class MenuTab extends StatefulWidget {
  const MenuTab({
    super.key,
    required this.dishes,
    required this.inventory,
    required this.onChanged,
  });

  final List<Dish> dishes;

  /// Needed for the recipes: a dish's ingredients are inventory lines, and the
  /// sheet has to name them and check what is in stock.
  final List<InventoryItem> inventory;
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

  /// Opens the recipe for one dish.
  Future<void> _recipe(Dish d) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Tokens.staffCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _RecipeSheet(dish: d, inventory: widget.inventory),
    );
    await widget.onChanged();
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
                          IconButton(
                            onPressed: () => _recipe(d),
                            icon: const Icon(Icons.receipt_long_outlined, size: 17),
                            color: Tokens.staffInk.withValues(alpha: 0.8),
                            tooltip: 'Recipe',
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

/// The link between the menu and the store room.
///
/// A recipe is recorded per BATCH, the way a cook actually thinks: one pot of
/// sinigang takes a kilo and a half of pork and feeds twenty. Recording that a
/// batch was cooked is the only thing that draws ingredients out of the store
/// room, which is why the numbers stay honest — selling a serving lowers the
/// servings left, cooking lowers the ingredients, and the two never overlap.
class _RecipeSheet extends StatefulWidget {
  const _RecipeSheet({required this.dish, required this.inventory});

  final Dish dish;
  final List<InventoryItem> inventory;

  @override
  State<_RecipeSheet> createState() => _RecipeSheetState();
}

class _RecipeSheetState extends State<_RecipeSheet> {
  List<Map<String, dynamic>>? _rows;
  int _yield = 10;
  int? _canCook;
  bool _busy = false;
  String? _message;
  bool _failed = false;

  String? _newItem;
  final _newQty = TextEditingController(text: '1');
  final _batches = TextEditingController(text: '1');

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _newQty.dispose();
    _batches.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        AdminApi.recipeFor(widget.dish.id),
        AdminApi.batchYield(widget.dish.id),
        AdminApi.canCook(widget.dish.id).then((v) => v ?? -1),
      ]);
      if (!mounted) return;
      setState(() {
        _rows = results[0] as List<Map<String, dynamic>>;
        _yield = results[1] as int;
        final c = results[2] as int;
        _canCook = c < 0 ? null : c;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _rows = const [];
          _message = '$e';
          _failed = true;
        });
      }
    }
  }

  InventoryItem? _item(String id) {
    for (final i in widget.inventory) {
      if (i.id == id) return i;
    }
    return null;
  }

  Future<void> _add() async {
    final id = _newItem;
    final qty = double.tryParse(_newQty.text.trim()) ?? 0;
    if (id == null || qty <= 0) return;

    setState(() => _busy = true);
    try {
      await AdminApi.setRecipeItem(widget.dish.id, id, qty);
      _newItem = null;
      _newQty.text = '1';
      await _load();
    } catch (e) {
      if (mounted) {
        setState(() {
          _message = '$e';
          _failed = true;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cook() async {
    final n = int.tryParse(_batches.text.trim()) ?? 1;
    setState(() {
      _busy = true;
      _message = null;
      _failed = false;
    });
    try {
      await AdminApi.cookBatch(widget.dish.id, n);
      if (mounted) {
        setState(() {
          _message = 'Cooked. ${_yield * n} servings added, ingredients '
              'deducted.';
          _failed = false;
        });
      }
      await _load();
    } catch (e) {
      if (mounted) {
        setState(() {
          _message = '$e';
          _failed = true;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 4,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              widget.dish.name,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w600,
                color: Tokens.staffInk,
              ),
            ),
            Text(
              'What one batch takes, and what it makes.',
              style: TextStyle(
                fontSize: 12,
                color: Tokens.staffInk.withValues(alpha: 0.55),
              ),
            ),
            const SizedBox(height: 16),

            if (rows == null)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            else ...[
              if (rows.isEmpty)
                Text(
                  'No ingredients recorded yet. Add them and this dish can be '
                  'costed and cooked from stock.',
                  style: TextStyle(
                    fontSize: 12,
                    height: 1.45,
                    color: Tokens.staffInk.withValues(alpha: 0.5),
                  ),
                ),

              for (final r in rows)
                Builder(
                  builder: (_) {
                    final id = r['inventory_id'] as String;
                    final item = _item(id);
                    final qty = (r['quantity'] as num?)?.toDouble() ?? 0;
                    final short = item != null && item.stock < qty;

                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              item?.name ?? id,
                              style: const TextStyle(color: Tokens.staffInk),
                            ),
                          ),
                          Text(
                            '${qty.toStringAsFixed(qty % 1 == 0 ? 0 : 2)} '
                            '${item?.unit ?? ''}',
                            style: TextStyle(
                              fontSize: 13,
                              color: short
                                  ? Tokens.semanticAlert
                                  : Tokens.staffInk.withValues(alpha: 0.7),
                            ),
                          ),
                          IconButton(
                            onPressed: _busy
                                ? null
                                : () async {
                                    await AdminApi.removeRecipeItem(
                                      widget.dish.id,
                                      id,
                                    );
                                    await _load();
                                  },
                            icon: const Icon(Icons.close, size: 16),
                            color: Tokens.staffInk.withValues(alpha: 0.5),
                            visualDensity: VisualDensity.compact,
                          ),
                        ],
                      ),
                    );
                  },
                ),

              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: DropdownButtonFormField<String>(
                      initialValue: _newItem,
                      isExpanded: true,
                      dropdownColor: Tokens.staffCard,
                      style: const TextStyle(
                        color: Tokens.staffInk,
                        fontSize: 13,
                      ),
                      decoration: _dec('Ingredient'),
                      items: [
                        for (final i in widget.inventory)
                          DropdownMenuItem(
                            value: i.id,
                            child: Text(
                              i.name,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                      onChanged: (v) => setState(() => _newItem = v),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _newQty,
                      keyboardType: TextInputType.number,
                      style: const TextStyle(color: Tokens.staffInk),
                      decoration: _dec('Qty'),
                    ),
                  ),
                  IconButton(
                    onPressed: _busy ? null : _add,
                    icon: const Icon(Icons.add),
                    color: Tokens.staffAccent,
                  ),
                ],
              ),

              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'One batch makes',
                      style: TextStyle(
                        fontSize: 13,
                        color: Tokens.staffInk.withValues(alpha: 0.8),
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 90,
                    child: TextField(
                      controller: TextEditingController(text: '$_yield'),
                      keyboardType: TextInputType.number,
                      style: const TextStyle(color: Tokens.staffInk),
                      decoration: _dec('servings'),
                      onSubmitted: (v) async {
                        final n = int.tryParse(v.trim());
                        if (n == null || n <= 0) return;
                        setState(() => _yield = n);
                        await AdminApi.setBatchYield(widget.dish.id, n);
                      },
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Tokens.staffGround,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _canCook == null
                          ? 'Stock cannot be checked for this dish yet.'
                          : _canCook == 0
                          ? 'Not enough in the store room for a single batch.'
                          : 'Enough in stock for $_canCook '
                                'batch${_canCook == 1 ? '' : 'es'}.',
                      style: TextStyle(
                        fontSize: 12,
                        color: _canCook == 0
                            ? Tokens.semanticAlert
                            : Tokens.staffInk.withValues(alpha: 0.6),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        SizedBox(
                          width: 80,
                          child: TextField(
                            controller: _batches,
                            keyboardType: TextInputType.number,
                            style: const TextStyle(color: Tokens.staffInk),
                            decoration: _dec('Batches'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton.icon(
                            onPressed: _busy || rows.isEmpty ? null : _cook,
                            icon: const Icon(Icons.local_fire_department, size: 16),
                            label: const Text('Record as cooked'),
                            style: FilledButton.styleFrom(
                              backgroundColor: Tokens.staffAccent,
                              foregroundColor: Tokens.staffCard,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              if (_message != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    _message!,
                    style: TextStyle(
                      fontSize: 12,
                      color: _failed
                          ? Tokens.semanticAlert
                          : Tokens.semanticGood,
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }

  static InputDecoration _dec(String label) => InputDecoration(
    labelText: label,
    labelStyle: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.6)),
    filled: true,
    fillColor: Tokens.staffGround,
    isDense: true,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
  );
}
