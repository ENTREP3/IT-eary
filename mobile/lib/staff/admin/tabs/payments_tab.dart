import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:file_saver/file_saver.dart';
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
              const SizedBox(height: 4),
              StorageWarning(pct: pct),
              ReceiptRetention(onChanged: _load),
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

/// Keeping GCash receipts for as long as they are useful, and no longer.
///
/// Receipts were kept forever. That is fine for a while and then it is not: the
/// free tier is 1 GB, and a receipt carries the sender's real name and mobile
/// number, so holding thousands of them indefinitely is a liability as much as
/// a storage problem.
///
/// The rule enforced here is that nothing can be deleted until it has been
/// saved off the system IN THIS SESSION. A dialog that merely suggests saving
/// first is something people learn to tap through; a delete button that stays
/// disabled until the files are actually out cannot be tapped through.
class ReceiptRetention extends StatefulWidget {
  const ReceiptRetention({super.key, required this.onChanged});

  final Future<void> Function() onChanged;

  @override
  State<ReceiptRetention> createState() => _ReceiptRetentionState();
}

class _ReceiptRetentionState extends State<ReceiptRetention> {
  static const _ages = [
    ('Older than 30 days', 30),
    ('Older than 60 days', 60),
    ('Older than 90 days', 90),
    ('Everything', 0),
  ];

  int _days = 90;
  List<Map<String, dynamic>>? _rows;
  String? _busy;
  String? _error;
  int _done = 0;

  /// Which batch has been safely saved. Keyed by the age selected, so changing
  /// the selection correctly re-arms the guard: having saved the 90 day batch
  /// says nothing about the 30 day one.
  int? _saved;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final rows = await AdminApi.receipts(olderThanDays: _days);
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

  /// Pulls every receipt down through a short-lived signed link, writes them
  /// beside a CSV naming which ticket each file belongs to, and saves the lot
  /// to the device's own Downloads folder.
  ///
  /// A share sheet was the first attempt and it was the wrong tool: it asks the
  /// owner to choose a destination for every batch, and on a browser it hands
  /// the files to whatever the platform decides to do with them. A download
  /// lands somewhere the owner can find again, which is the whole point of
  /// taking them off the system before deleting them.
  ///
  /// Without the CSV the images are a folder of meaningless filenames the
  /// moment they leave.
  Future<void> _download() async {
    final rows = _rows;
    if (rows == null || rows.isEmpty) return;

    setState(() {
      _busy = 'download';
      _error = null;
      _done = 0;
    });

    try {
      final stamp = DateTime.now().toIso8601String().substring(0, 10);
      final manifest = <String>['ticket_code,date,amount,file'];
      var saved = 0;

      for (final r in rows) {
        final url = await AdminApi.proofUrl(r['proof_path'] as String);
        if (url == null) continue;

        final bytes = await _fetch(url);
        if (bytes == null) continue;

        final date = (r['created_at'] as String).substring(0, 10);
        final name = '${r['ticket_code']}-$date';

        await FileSaver.instance.saveFile(
          name: name,
          bytes: Uint8List.fromList(bytes),
          ext: 'jpg',
          mimeType: MimeType.jpeg,
        );

        manifest.add('${r['ticket_code']},$date,${r['total']},$name.jpg');
        saved++;
        if (mounted) setState(() => _done = saved);
      }

      if (saved == 0) {
        throw Exception('None of the images could be fetched.');
      }

      await FileSaver.instance.saveFile(
        name: 'receipts-$stamp',
        bytes: Uint8List.fromList(utf8.encode(manifest.join('\n'))),
        ext: 'csv',
        mimeType: MimeType.csv,
      );

      if (mounted) setState(() => _saved = _days);
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = 'Could not save them all. Nothing has been deleted. '
              '$e',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  static Future<List<int>?> _fetch(String url) async {
    try {
      final client = HttpClient();
      final request = await client.getUrl(Uri.parse(url));
      final response = await request.close();
      if (response.statusCode != 200) return null;
      final bytes = <int>[];
      await for (final chunk in response) {
        bytes.addAll(chunk);
      }
      client.close();
      return bytes;
    } catch (_) {
      return null;
    }
  }

  Future<void> _delete() async {
    final rows = _rows;
    if (rows == null || rows.isEmpty) return;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Tokens.staffCard,
        title: Text(
          'Delete ${rows.length} receipt${rows.length == 1 ? '' : 's'}?',
          style: const TextStyle(color: Tokens.staffInk, fontSize: 18),
        ),
        content: Text(
          'The images go for good. Each sale keeps its payment status and the '
          'note that it was verified — only the picture of the receipt is '
          'removed.',
          style: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.7)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep them'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(
              backgroundColor: Tokens.semanticCritical,
            ),
            child: const Text('Delete them'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    setState(() {
      _busy = 'delete';
      _error = null;
    });
    try {
      await AdminApi.deleteReceipts(rows);
      if (mounted) setState(() => _saved = null);
      await _load();
      await widget.onChanged();
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not delete them. $e');
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final count = _rows?.length ?? 0;
    final ready = _saved == _days && count > 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Divider(color: Tokens.staffInk.withValues(alpha: 0.12), height: 28),
        const Text(
          'Clearing old receipts',
          style: TextStyle(
            fontWeight: FontWeight.w600,
            color: Tokens.staffInk,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          "A receipt carries the sender's name and mobile number, so keeping "
          'them forever is a liability as well as a storage cost. Save them '
          'first, then they can go. The sale itself and the fact it was '
          'verified are kept either way.',
          style: TextStyle(
            fontSize: 12,
            height: 1.45,
            color: Tokens.staffInk.withValues(alpha: 0.55),
          ),
        ),
        const SizedBox(height: 12),

        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final (label, days) in _ages)
              ChoiceChip(
                label: Text(label, style: const TextStyle(fontSize: 12)),
                selected: _days == days,
                showCheckmark: false,
                backgroundColor: Tokens.staffGround,
                selectedColor: Tokens.staffAccent.withValues(alpha: 0.2),
                labelStyle: TextStyle(
                  color: _days == days
                      ? Tokens.staffAccent
                      : Tokens.staffInk.withValues(alpha: 0.7),
                ),
                shape: StadiumBorder(
                  side: BorderSide(
                    color: _days == days
                        ? Tokens.staffAccent.withValues(alpha: 0.5)
                        : Tokens.staffInk.withValues(alpha: 0.15),
                  ),
                ),
                onSelected: _busy != null
                    ? null
                    : (_) {
                        setState(() {
                          _days = days;
                          _saved = null;
                          _rows = null;
                        });
                        _load();
                      },
              ),
          ],
        ),
        const SizedBox(height: 12),

        Text(
          _rows == null
              ? 'Counting…'
              : count == 0
              ? 'Nothing that old is being kept.'
              : '$count receipt${count == 1 ? '' : 's'} match.',
          style: TextStyle(
            fontSize: 12,
            color: Tokens.staffInk.withValues(alpha: 0.6),
          ),
        ),
        const SizedBox(height: 10),

        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _busy != null || count == 0 ? null : _download,
                icon: _busy == 'download'
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.download_outlined, size: 16),
                label: Text(
                  _busy == 'download' ? 'Saving $_done of $count' : 'Save them',
                  style: const TextStyle(fontSize: 13),
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Tokens.staffInk,
                  side: BorderSide(
                    color: Tokens.staffInk.withValues(alpha: 0.25),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                // Deliberately dead until the files are out. This is the guard,
                // not a suggestion.
                onPressed: _busy != null || !ready ? null : _delete,
                icon: _busy == 'delete'
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.delete_outline, size: 16),
                label: const Text('Delete', style: TextStyle(fontSize: 13)),
                style: FilledButton.styleFrom(
                  backgroundColor: Tokens.semanticCritical,
                  disabledBackgroundColor: Tokens.staffInk.withValues(
                    alpha: 0.12,
                  ),
                ),
              ),
            ),
          ],
        ),

        if (!ready && count > 0)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Save them before they can be deleted.',
              style: TextStyle(
                fontSize: 11,
                color: Tokens.staffInk.withValues(alpha: 0.45),
              ),
            ),
          ),

        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text(
              _error!,
              style: const TextStyle(
                fontSize: 12,
                color: Tokens.semanticAlert,
              ),
            ),
          ),
      ],
    );
  }
}

/// Says something only when there is something to say.
///
/// A bar that is 12% full needs no commentary. What matters is the point where
/// the shop is about to lose the ability to take a GCash receipt at all, and
/// that deserves a sentence saying what actually breaks rather than a red bar
/// the owner has to interpret.
class StorageWarning extends StatelessWidget {
  const StorageWarning({super.key, required this.pct});

  final double pct;

  @override
  Widget build(BuildContext context) {
    if (pct < 75) return const SizedBox.shrink();

    final critical = pct >= 90;
    final tone = critical ? Tokens.semanticCritical : Tokens.staffAccent;

    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.warning_amber_rounded, size: 15, color: tone),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              critical
                  ? 'Storage is nearly full. Once it fills, diners can no '
                        'longer upload a GCash receipt and the counter loses '
                        'its record of payment. Save the old receipts and '
                        'clear them below.'
                  : 'Storage is filling up. Worth saving the older receipts '
                        'and clearing them before it becomes urgent.',
              style: TextStyle(fontSize: 12, height: 1.45, color: tone),
            ),
          ),
        ],
      ),
    );
  }
}
