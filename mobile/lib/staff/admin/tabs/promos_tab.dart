import 'package:flutter/material.dart';

import '../../../tokens.dart';
import '../admin_api.dart';
import 'widgets.dart';

/// Where the owner runs a promotion without needing a developer.
///
/// The discount itself is never decided here. This screen only writes the rule;
/// the database works out what a code is worth at checkout, which is why a
/// tampered app cannot invent one.
class PromosTab extends StatefulWidget {
  const PromosTab({super.key});

  @override
  State<PromosTab> createState() => _PromosTabState();
}

class _PromosTabState extends State<PromosTab> {
  List<Map<String, dynamic>>? _rows;
  bool _busy = false;
  String? _error;

  final _code = TextEditingController();
  final _label = TextEditingController();
  final _value = TextEditingController(text: '10');
  final _minimum = TextEditingController(text: '100');
  String _kind = 'percent';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _code.dispose();
    _label.dispose();
    _value.dispose();
    _minimum.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final rows = await AdminApi.promos();
      if (mounted) setState(() => _rows = rows);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '$e';
          _rows = const [];
        });
      }
    }
  }

  Future<void> _create() async {
    final code = _code.text.trim().toUpperCase();
    final value = double.tryParse(_value.text.trim()) ?? 0;

    if (code.isEmpty) {
      setState(() => _error = 'Give the code a name, for example SULIT10.');
      return;
    }
    if (value <= 0) {
      setState(() => _error = 'The discount must be more than zero.');
      return;
    }
    if (_kind == 'percent' && value > 100) {
      setState(() => _error = 'A percentage cannot be more than 100.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await AdminApi.createPromo({
        'code': code,
        'label': _label.text.trim().isEmpty
            ? (_kind == 'percent'
                  ? '${value.toStringAsFixed(0)}% off'
                  : '${value.toStringAsFixed(0)} pesos off')
            : _label.text.trim(),
        'kind': _kind,
        'value': value,
        'min_subtotal': double.tryParse(_minimum.text.trim()) ?? 0,
      });
      _code.clear();
      _label.clear();
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _toggle(Map<String, dynamic> p) async {
    await AdminApi.setPromoActive(
      p['code'] as String,
      !(p['active'] as bool? ?? false),
    );
    await _load();
  }

  Future<void> _delete(Map<String, dynamic> p) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Tokens.staffCard,
        title: Text(
          'Delete ${p['code']}?',
          style: const TextStyle(color: Tokens.staffInk),
        ),
        content: Text(
          'Diners who have not used it yet will be told the code does not '
          'exist.',
          style: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.7)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep it'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(
              backgroundColor: Tokens.semanticCritical,
            ),
            child: const Text('Delete code'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await AdminApi.deletePromo(p['code'] as String);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(
                    Icons.sell_outlined,
                    size: 17,
                    color: Tokens.staffAccent,
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    'Run a new promotion',
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: Tokens.staffInk,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'Diners type the code at checkout. What it is worth is worked '
                'out when the order is priced, so it cannot be faked or used '
                'past its limit.',
                style: TextStyle(
                  fontSize: 12,
                  height: 1.45,
                  color: Tokens.staffInk.withValues(alpha: 0.55),
                ),
              ),
              const SizedBox(height: 14),

              _Field(controller: _code, label: 'Code', hint: 'HAPON15'),
              _Field(
                controller: _label,
                label: 'What diners see',
                hint: '15 pesos off merienda',
              ),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _kind,
                      dropdownColor: Tokens.staffCard,
                      style: const TextStyle(
                        color: Tokens.staffInk,
                        fontSize: 14,
                      ),
                      decoration: _decoration('Kind'),
                      items: const [
                        DropdownMenuItem(
                          value: 'percent',
                          child: Text('Percent off'),
                        ),
                        DropdownMenuItem(
                          value: 'fixed',
                          child: Text('Pesos off'),
                        ),
                      ],
                      onChanged: (v) => setState(() => _kind = v ?? 'percent'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _Field(
                      controller: _value,
                      label: _kind == 'percent' ? 'Percent' : 'Pesos',
                      number: true,
                      bare: true,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              _Field(
                controller: _minimum,
                label: 'Minimum spend (₱)',
                number: true,
              ),

              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    _error!,
                    style: const TextStyle(
                      fontSize: 13,
                      color: Tokens.semanticAlert,
                    ),
                  ),
                ),

              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.icon(
                  onPressed: _busy ? null : _create,
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Start this promotion'),
                  style: FilledButton.styleFrom(
                    backgroundColor: Tokens.staffAccent,
                    foregroundColor: Tokens.staffCard,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        if (rows == null)
          const Padding(
            padding: EdgeInsets.all(30),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (rows.isEmpty)
          AdminCard(
            child: Text(
              'No promotions yet.',
              style: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.6)),
            ),
          )
        else
          for (final p in rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: AdminCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            p['code'] as String? ?? '',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.5,
                              color: Tokens.staffInk,
                            ),
                          ),
                        ),
                        InkWell(
                          onTap: () => _toggle(p),
                          borderRadius: BorderRadius.circular(999),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                color: (p['active'] as bool? ?? false)
                                    ? Tokens.semanticGood.withValues(alpha: 0.5)
                                    : Tokens.staffInk.withValues(alpha: 0.25),
                              ),
                            ),
                            child: Text(
                              (p['active'] as bool? ?? false)
                                  ? 'Running'
                                  : 'Paused',
                              style: TextStyle(
                                fontSize: 11,
                                color: (p['active'] as bool? ?? false)
                                    ? Tokens.semanticGood
                                    : Tokens.staffInk.withValues(alpha: 0.6),
                              ),
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: () => _delete(p),
                          icon: const Icon(Icons.delete_outline, size: 17),
                          color: Tokens.semanticAlert,
                          visualDensity: VisualDensity.compact,
                        ),
                      ],
                    ),
                    Text(
                      p['label'] as String? ?? '',
                      style: TextStyle(
                        color: Tokens.staffInk.withValues(alpha: 0.75),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      _summary(p),
                      style: TextStyle(
                        fontSize: 12,
                        color: Tokens.staffInk.withValues(alpha: 0.5),
                      ),
                    ),
                  ],
                ),
              ),
            ),
      ],
    );
  }

  static String _summary(Map<String, dynamic> p) {
    final value = (p['value'] as num?)?.toStringAsFixed(0) ?? '0';
    final takes = p['kind'] == 'percent' ? '$value%' : '₱$value';
    final min = (p['min_subtotal'] as num?)?.toStringAsFixed(0) ?? '0';
    final used = (p['used_count'] as num?)?.toInt() ?? 0;
    final limit = (p['usage_limit'] as num?)?.toInt();

    return 'Takes off $takes · minimum ₱$min · used $used'
        '${limit == null ? '' : ' of $limit'}';
  }

  static InputDecoration _decoration(String label) => InputDecoration(
    labelText: label,
    labelStyle: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.6)),
    filled: true,
    fillColor: Tokens.staffGround,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
  );
}

class _Field extends StatelessWidget {
  const _Field({
    required this.controller,
    required this.label,
    this.hint,
    this.number = false,
    this.bare = false,
  });

  final TextEditingController controller;
  final String label;
  final String? hint;
  final bool number;

  /// Set when the field is already inside a row that handles its own spacing.
  final bool bare;

  @override
  Widget build(BuildContext context) {
    final field = TextField(
      controller: controller,
      keyboardType: number ? TextInputType.number : null,
      style: const TextStyle(color: Tokens.staffInk),
      decoration: _PromosTabState._decoration(label).copyWith(hintText: hint),
    );
    return bare
        ? field
        : Padding(padding: const EdgeInsets.only(bottom: 10), child: field);
  }
}
