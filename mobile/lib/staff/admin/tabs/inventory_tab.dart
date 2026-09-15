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

  /// Records a delivery against one ingredient.
  Future<void> _receive(InventoryItem item) async {
    final done = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Tokens.staffCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _ReceiveForm(item: item),
    );
    if (done == true) await widget.onChanged();
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
                      // A delivery, not a correction: this books the expense
                      // and stamps the date rather than silently moving a
                      // number nobody can later explain.
                      IconButton(
                        onPressed: () => _receive(i),
                        icon: const Icon(Icons.add_box_outlined, size: 18),
                        color: Tokens.semanticGood,
                        tooltip: 'Add to stock',
                        visualDensity: VisualDensity.compact,
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
                        // Against a full stock where the owner has set one:
                        // "12 of 20 kg" says what to do, where a bare count
                        // only says what is there.
                        Text(
                          i.parLevel > 0
                              ? '${_trim(i.stock)} of ${_trim(i.parLevel)} ${i.unit}'
                                  '${i.shortfall > 0 ? ' · buy ${_trim(i.shortfall)}' : ''}'
                              : 'Set a full stock to track this',
                          style: TextStyle(
                              fontSize: 11,
                              color: i.parLevel > 0 && i.shortfall > 0
                                  ? Tokens.staffAccent
                                  : Tokens.staffInk.withValues(alpha: 0.5)),
                        ),
                        if (i.lastDelivery != null)
                          Text('Last delivery · ${i.lastDelivery}',
                              style: TextStyle(
                                  fontSize: 11,
                                  color: Tokens.staffInk
                                      .withValues(alpha: 0.5))),
                      ],
                    ),
                    const SizedBox(height: 3),

                    // An uncosted ingredient is not a small gap: one of them
                    // makes every dish containing it uncostable, so the margin
                    // warnings go quiet without saying why. Better to name it.
                    if (i.costPerUnit > 0)
                      Text(
                        '₱${i.costPerUnit.toStringAsFixed(2)} per ${i.unit} · '
                        'stock worth ₱${(i.costPerUnit * i.stock).toStringAsFixed(2)}',
                        style: TextStyle(
                            fontSize: 10,
                            color: Tokens.staffInk.withValues(alpha: 0.45)),
                      )
                    else
                      GestureDetector(
                        onTap: () => _edit(i),
                        child: const Text(
                          'No cost set — dishes using this cannot be costed',
                          style: TextStyle(
                              fontSize: 10,
                              color: Tokens.staffAccent,
                              decoration: TextDecoration.underline),
                        ),
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

/// Drops the decimal point from a whole number: "2 kg", not "2.0 kg".
String _trim(double v) => v.toStringAsFixed(v % 1 == 0 ? 0 : 2);

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
  late final _cost = TextEditingController(
      text: (widget.item?.costPerUnit ?? 0) == 0
          ? ''
          : widget.item!.costPerUnit.toStringAsFixed(2));
  late final _par = TextEditingController(
      text: (widget.item?.parLevel ?? 0) == 0
          ? ''
          : _trim(widget.item!.parLevel));
  late final _lastDelivery =
      TextEditingController(text: widget.item?.lastDelivery ?? '');
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _stock.dispose();
    _unit.dispose();
    _reorder.dispose();
    _cost.dispose();
    _par.dispose();
    _lastDelivery.dispose();
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
        'cost_per_unit': double.tryParse(_cost.text.trim()) ?? 0,
        'par_level': double.tryParse(_par.text.trim()) ?? 0,
        // The em dash is the placeholder the web admin writes for "no delivery
        // recorded", and the row reads it back as one.
        'last_delivery':
            _lastDelivery.text.trim().isEmpty ? '—' : _lastDelivery.text.trim(),
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
          Row(children: [
            Expanded(child: _field(_reorder, 'Reorder at', number: true)),
            const SizedBox(width: 10),
            Expanded(child: _field(_par, 'Full stock', number: true)),
          ]),
          const SizedBox(height: 6),
          Text(
            'Full stock is how much of this you should have. The screen then '
            'shows your count out of it, and what to buy to get back there.',
            style: _hint,
          ),
          const SizedBox(height: 12),
          _field(_cost, 'Price per ${_unitWord()} (₱)', number: true),
          const SizedBox(height: 6),
          // Everything the dish costing rests on. Without a price here the
          // system can count the pork but not say whether the sinigang still
          // makes money, so the margin and the cost of goods sold both stay
          // blank rather than guess.
          Text(
            'What you pay for one ${_unitWord()}. This is what lets the system '
            'work out the cost of each dish and warn you when a price rise has '
            'eaten your margin.',
            style: _hint,
          ),
          const SizedBox(height: 12),
          _field(_lastDelivery, 'Last delivery', hint: 'Apr 22'),
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

  /// The unit as a word, for sentences: "one kg", "one unit" before it is set.
  String _unitWord() =>
      _unit.text.trim().isEmpty ? 'unit' : _unit.text.trim();

  TextStyle get _hint => TextStyle(
        fontSize: 11,
        height: 1.4,
        color: Tokens.staffInk.withValues(alpha: 0.55),
      );

  Widget _field(TextEditingController c, String label,
          {bool number = false, String? hint}) =>
      TextField(
        controller: c,
        keyboardType: number
            ? const TextInputType.numberWithOptions(decimal: true)
            : TextInputType.text,
        style: const TextStyle(color: Tokens.staffInk),
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          hintStyle: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.35)),
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

/// Recording a delivery.
///
/// Deliberately not the same thing as editing the stock figure. Typing over the
/// count is a correction and explains nothing; a delivery has a quantity, a
/// price and a date, and the shop is owed an expense entry for it. Doing it
/// here means the owner never types the same delivery twice, and the cost of
/// every dish using the ingredient moves with the new price.
class _ReceiveForm extends StatefulWidget {
  const _ReceiveForm({required this.item});

  final InventoryItem item;

  @override
  State<_ReceiveForm> createState() => _ReceiveFormState();
}

class _ReceiveFormState extends State<_ReceiveForm> {
  final _qty = TextEditingController();
  late final _cost = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _qty.dispose();
    _cost.dispose();
    super.dispose();
  }

  double get _quantity => double.tryParse(_qty.text.trim()) ?? 0;

  double get _unitCost =>
      double.tryParse(_cost.text.trim()) ?? widget.item.costPerUnit;

  Future<void> _save() async {
    if (_quantity <= 0) {
      setState(() => _error = 'How much arrived?');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await AdminApi.receiveStock(
        widget.item.id,
        _quantity,
        // Null, not zero. Zero would wipe the recorded price; null means
        // "unchanged", which is what an empty field actually says.
        unitCost: _cost.text.trim().isEmpty
            ? null
            : double.tryParse(_cost.text.trim()),
      );
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
    final item = widget.item;
    final total = _quantity * _unitCost;
    final faint = Tokens.staffInk.withValues(alpha: 0.55);

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Add to stock',
                style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                    color: Tokens.staffInk)),
            const SizedBox(height: 4),
            Text(
              '${item.name} · ${_trim(item.stock)} ${item.unit} on hand'
              '${item.shortfall > 0 ? ', ${_trim(item.shortfall)} short of full' : ''}',
              style: TextStyle(fontSize: 12, color: faint),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _qty,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              onChanged: (_) => setState(() {}),
              style: const TextStyle(color: Tokens.staffInk),
              decoration: _dec('How much arrived (${item.unit})'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _cost,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              onChanged: (_) => setState(() {}),
              style: const TextStyle(color: Tokens.staffInk),
              decoration: _dec(
                'Price per ${item.unit} (₱)',
                hint: item.costPerUnit > 0
                    ? item.costPerUnit.toStringAsFixed(2)
                    : '350',
              ),
            ),
            const SizedBox(height: 6),
            Text(
              _quantity > 0 && _unitCost > 0
                  ? 'Records a ₱${total.toStringAsFixed(2)} expense for you, and '
                      'updates the cost of every dish using this.'
                  : 'The expense is recorded for you, so you never type a '
                      'delivery twice.',
              style: TextStyle(fontSize: 11, height: 1.4, color: faint),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!,
                  style: const TextStyle(color: Tokens.semanticAlert)),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy || _quantity <= 0 ? null : _save,
              style: FilledButton.styleFrom(
                backgroundColor: Tokens.semanticGood,
                foregroundColor: Tokens.staffCard,
                minimumSize: const Size.fromHeight(48),
              ),
              child: Text(_busy ? 'Recording…' : 'Add to stock'),
            ),
          ],
        ),
      ),
    );
  }

  InputDecoration _dec(String label, {String? hint}) => InputDecoration(
        labelText: label,
        hintText: hint,
        hintStyle: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.35)),
        labelStyle: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.6)),
        filled: true,
        fillColor: Tokens.staffGround,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Tokens.staffInk.withValues(alpha: 0.15)),
        ),
      );
}
