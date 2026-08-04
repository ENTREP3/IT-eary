import 'package:flutter/material.dart';

import '../../../models/models.dart';
import '../../../tokens.dart';
import '../admin_api.dart';
import 'widgets.dart';

/// Stock room — full create/edit/delete, matching the web admin.
class InventoryTab extends StatefulWidget {
  const InventoryTab({super.key, required this.items, required this.onChanged});

  final List<InventoryItem> items;
  final Future<void> Function() onChanged;

  @override
  State<InventoryTab> createState() => _InventoryTabState();
}

class _InventoryTabState extends State<InventoryTab> {
  Future<void> _edit([InventoryItem? item]) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Tokens.staffCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _InventoryForm(item: item),
    );
    if (saved == true) await widget.onChanged();
  }

  Future<void> _delete(InventoryItem item) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Tokens.staffCard,
        title: Text('Remove ${item.name}?',
            style: const TextStyle(color: Tokens.staffInk)),
        content: const Text('This cannot be undone.',
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
    await AdminApi.deleteInventory(item.id);
    await widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _edit(),
        backgroundColor: Tokens.staffAccent,
        foregroundColor: Tokens.staffCard,
        icon: const Icon(Icons.add),
        label: const Text('Add ingredient'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
        children: [
          if (widget.items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: Text('No ingredients recorded yet.',
                    style:
                        TextStyle(color: Tokens.staffInk.withValues(alpha: 0.5))),
              ),
            ),
          for (final i in widget.items)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: AdminCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Expanded(
                        child: Text(i.name,
                            style: const TextStyle(
                                fontWeight: FontWeight.w600,
                                color: Tokens.staffInk)),
                      ),
                      IconButton(
                        onPressed: () => _edit(i),
                        icon: const Icon(Icons.edit_outlined, size: 18),
                        color: Tokens.staffInk.withValues(alpha: 0.8),
                        visualDensity: VisualDensity.compact,
                      ),
                      IconButton(
                        onPressed: () => _delete(i),
                        icon: const Icon(Icons.delete_outline, size: 18),
                        color: Tokens.semanticAlert,
                        visualDensity: VisualDensity.compact,
                      ),
                    ]),
                    Text(
                      '${i.stock.toStringAsFixed(i.stock % 1 == 0 ? 0 : 1)} ${i.unit}',
                      style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: Tokens.staffInk),
                    ),
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: LinearProgressIndicator(
                        value: i.level,
                        minHeight: 6,
                        backgroundColor:
                            Tokens.staffInk.withValues(alpha: 0.1),
                        valueColor: AlwaysStoppedAnimation(
                          i.isOut
                              ? Tokens.semanticCritical
                              : i.isLow
                                  ? Tokens.staffAccent
                                  : Tokens.semanticGood,
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Reorder at ${i.reorderAt.toStringAsFixed(i.reorderAt % 1 == 0 ? 0 : 1)} ${i.unit}',
                          style: TextStyle(
                              fontSize: 11,
                              color: Tokens.staffInk.withValues(alpha: 0.5)),
                        ),
                        if (i.lastDelivery != null)
                          Text('Last delivery · ${i.lastDelivery}',
                              style: TextStyle(
                                  fontSize: 11,
                                  color: Tokens.staffInk
                                      .withValues(alpha: 0.5))),
                      ],
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _InventoryForm extends StatefulWidget {
  const _InventoryForm({this.item});

  final InventoryItem? item;

  @override
  State<_InventoryForm> createState() => _InventoryFormState();
}

class _InventoryFormState extends State<_InventoryForm> {
  late final _name = TextEditingController(text: widget.item?.name ?? '');
  late final _stock =
      TextEditingController(text: widget.item?.stock.toString() ?? '');
  late final _unit = TextEditingController(text: widget.item?.unit ?? 'kg');
  late final _reorder =
      TextEditingController(text: widget.item?.reorderAt.toString() ?? '');
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _stock.dispose();
    _unit.dispose();
    _reorder.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _error = 'Give the ingredient a name.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final row = {
        'name': _name.text.trim(),
        'stock': double.tryParse(_stock.text) ?? 0,
        'unit': _unit.text.trim(),
        'reorder_at': double.tryParse(_reorder.text) ?? 0,
      };
      if (widget.item == null) {
        await AdminApi.addInventory(row);
      } else {
        await AdminApi.updateInventory(widget.item!.id, row);
      }
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
          Text(widget.item == null ? 'Add ingredient' : 'Edit ingredient',
              style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: Tokens.staffInk)),
          const SizedBox(height: 16),
          _field(_name, 'Name'),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: _field(_stock, 'Stock', number: true)),
            const SizedBox(width: 10),
            Expanded(child: _field(_unit, 'Unit')),
          ]),
          const SizedBox(height: 10),
          _field(_reorder, 'Reorder at', number: true),
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

  Widget _field(TextEditingController c, String label, {bool number = false}) =>
      TextField(
        controller: c,
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
