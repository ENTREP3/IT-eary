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
