import 'package:flutter/material.dart';

import '../../../tokens.dart';
import '../admin_api.dart';
import 'widgets.dart';

/// Payment configuration plus the storage readout.
class PaymentsTab extends StatefulWidget {
  const PaymentsTab({super.key});

  @override
  State<PaymentsTab> createState() => _PaymentsTabState();
}

class _PaymentsTabState extends State<PaymentsTab> {
  final _name = TextEditingController();
  final _number = TextEditingController();
  bool _gcash = true;
  bool _cash = true;
  bool _loading = true;
  bool _saving = false;
  String? _saved;
  List<Map<String, dynamic>> _usage = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _number.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final s = await AdminApi.paymentSettings();
    List<Map<String, dynamic>> usage = [];
    try {
      usage = await AdminApi.storageUsage();
    } catch (_) {
      // Non-fatal — the settings form still works without the readout.
    }
    if (!mounted) return;
    setState(() {
      _name.text = s.gcashName;
      _number.text = s.gcashNumber;
      _gcash = s.gcashEnabled;
      _cash = s.cashEnabled;
      _usage = usage;
      _loading = false;
    });
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _saved = null;
    });
    try {
      await AdminApi.updatePaymentSettings({
        'gcash_name': _name.text.trim(),
        'gcash_number': _number.text.trim(),
        'gcash_enabled': _gcash,
        'cash_enabled': _cash,
      });
      if (mounted) setState(() => _saved = 'Saved.');
    } catch (e) {
      if (mounted) setState(() => _saved = '$e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(strokeWidth: 2));
    }

    final proofs = _usage.cast<Map<String, dynamic>?>().firstWhere(
          (r) => r?['bucket'] == 'payment-proofs',
          orElse: () => null,
        );
    final bytes = _usage.fold<int>(
        0, (a, r) => a + ((r['bytes'] as num?)?.toInt() ?? 0));
    const freeTier = 1024 * 1024 * 1024;
    final pct = (bytes / freeTier * 100).clamp(0, 100).toDouble();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionHeader(
                  eyebrow: 'GCash account', title: 'Where money lands'),
              const SizedBox(height: 16),
              TextField(
                controller: _name,
                style: const TextStyle(color: Tokens.staffInk),
                decoration: _dec('Account name'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _number,
                keyboardType: TextInputType.phone,
                style: const TextStyle(color: Tokens.staffInk),
                decoration: _dec('GCash number'),
              ),
              const SizedBox(height: 14),
              SwitchListTile(
                value: _gcash,
                onChanged: (v) => setState(() => _gcash = v),
                title: const Text('Accept GCash',
                    style: TextStyle(color: Tokens.staffInk, fontSize: 14)),
                activeThumbColor: Tokens.semanticGood,
                contentPadding: EdgeInsets.zero,
              ),
              SwitchListTile(
                value: _cash,
                onChanged: (v) => setState(() => _cash = v),
                title: const Text('Accept Cash',
                    style: TextStyle(color: Tokens.staffInk, fontSize: 14)),
                activeThumbColor: Tokens.semanticGood,
                contentPadding: EdgeInsets.zero,
              ),
              if (!_gcash && !_cash)
                const Padding(
                  padding: EdgeInsets.only(bottom: 8),
                  child: Text(
                    'With both off, nobody can check out.',
                    style: TextStyle(fontSize: 12, color: Tokens.semanticAlert),
                  ),
                ),
              const SizedBox(height: 6),
              FilledButton(
                onPressed: _saving ? null : _save,
                style: FilledButton.styleFrom(
                  backgroundColor: Tokens.staffAccent,
                  foregroundColor: Tokens.staffCard,
                  minimumSize: const Size.fromHeight(48),
                ),
                child: Text(_saving ? 'Saving…' : 'Save changes'),
              ),
              if (_saved != null) ...[
                const SizedBox(height: 8),
                Center(
                  child: Text(_saved!,
                      style: TextStyle(
                          fontSize: 12,
                          color: Tokens.staffInk.withValues(alpha: 0.6))),
                ),
              ],
            ],
          ),
        ),

        const SizedBox(height: 12),
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionHeader(eyebrow: 'Storage', title: 'Receipt images'),
              const SizedBox(height: 14),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '${proofs?['object_count'] ?? 0} receipts stored',
                    style: TextStyle(
                        color: Tokens.staffInk.withValues(alpha: 0.65)),
                  ),
                  Text(
                    '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB',
                    style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: Tokens.staffInk),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: (pct / 100).clamp(0.005, 1),
                  minHeight: 6,
                  backgroundColor: Tokens.staffInk.withValues(alpha: 0.1),
                  valueColor: AlwaysStoppedAnimation(
                    pct > 80
                        ? Tokens.semanticCritical
                        : pct > 50
                            ? Tokens.staffAccent
                            : Tokens.semanticGood,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '${pct < 1 ? 'Well under' : '${pct.toStringAsFixed(1)}% of'} the '
                '1 GB free allowance. Images are shrunk on the phone before '
                'upload, so roughly 10,000 receipts fit.',
                style: TextStyle(
                    fontSize: 11,
                    color: Tokens.staffInk.withValues(alpha: 0.45)),
              ),
            ],
          ),
        ),
      ],
    );
  }

  InputDecoration _dec(String label) => InputDecoration(
        labelText: label,
        labelStyle: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.6)),
        filled: true,
        fillColor: Tokens.staffGround,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide:
              BorderSide(color: Tokens.staffInk.withValues(alpha: 0.15)),
        ),
      );
}
