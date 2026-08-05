import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../models/models.dart';
import '../../services/api.dart';
import '../../theme.dart';
import '../../tokens.dart';

/// The ticket the diner shows at the counter. Subscribes to Realtime so it
/// flips to Paid / Ready on its own while they're standing there.
class TicketScreen extends StatefulWidget {
  const TicketScreen({super.key, required this.ticket});

  final Ticket ticket;

  @override
  State<TicketScreen> createState() => _TicketScreenState();
}

class _TicketScreenState extends State<TicketScreen> {
  late Ticket _ticket = widget.ticket;
  PaymentSettings? _settings;
  bool _uploading = false;
  String? _uploadError;

  @override
  void initState() {
    super.initState();
    Api.watchTicket(widget.ticket.id).listen(
      (t) {
        if (mounted) setState(() => _ticket = t);
      },
      onError: (_) {
        /* Realtime unavailable — the shown data is still valid. */
      },
    );
    if (widget.ticket.isGcash) _loadSettings();
  }

  Future<void> _loadSettings() async {
    final s = await Api.paymentSettings();
    if (mounted) setState(() => _settings = s);
  }

  Future<void> _uploadProof({bool replace = false}) async {
    setState(() {
      _uploading = true;
      _uploadError = null;
    });
    try {
      if (replace) await Api.clearProof(_ticket.ticketCode);
      final updated = await Api.pickAndUploadProof(_ticket.ticketCode);
      if (!mounted) return;
      setState(() {
        // null means the diner backed out of the picker; if they had cleared a
        // previous proof first, reflect that rather than showing a stale one.
        if (updated != null) {
          _ticket = updated;
        } else if (replace) {
          _ticket = _ticket.copyWithProofCleared();
        }
        _uploading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _uploadError = 'Could not upload that image. $e';
        _uploading = false;
      });
    }
  }

  Future<void> _shareReceipt() async {
    final text = buildReceiptText(_ticket);
    try {
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/receipt-${_ticket.ticketCode}.txt');
      await file.writeAsString(text);
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path)],
          text: 'Bencris receipt ${_ticket.ticketCode}',
        ),
      );
    } catch (_) {
      await SharePlus.instance.share(ShareParams(text: text));
    }
  }

  /// Everything a diner needs to pay by GCash: where to send it, and a way to
  /// hand the cashier proof they did.
  Widget _gcashPanel() {
    final s = _settings;
    final hasProof = _ticket.hasProof;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Palette.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Tokens.semanticGcash.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.smartphone_outlined,
                  size: 18, color: Tokens.semanticGcash),
              const SizedBox(width: 8),
              Text(
                'PAY VIA GCASH',
                style: TextStyle(
                  fontSize: 11,
                  letterSpacing: 2,
                  fontWeight: FontWeight.w700,
                  color: Tokens.semanticGcash,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          if (s == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('Loading payment details…'),
            )
          else ...[
            _gcashRow('Send to', s.gcashName.isEmpty ? '—' : s.gcashName),
            _gcashRow('Number', s.gcashNumber.isEmpty ? '—' : s.gcashNumber,
                copyable: true),
            _gcashRow('Amount', '₱${_ticket.total.toStringAsFixed(2)}'),
            if (s.gcashQrUrl != null && s.gcashQrUrl!.isNotEmpty) ...[
              const SizedBox(height: 12),
              Center(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.network(
                    s.gcashQrUrl!,
                    height: 160,
                    errorBuilder: (_, _, _) => const SizedBox.shrink(),
                  ),
                ),
              ),
            ],
          ],

          const Divider(height: 26),

          if (hasProof)
            Row(
              children: [
                const Icon(Icons.check_circle,
                    size: 18, color: Tokens.semanticGood),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Receipt uploaded — show this ticket at the counter.',
                    style: TextStyle(
                      fontSize: 12.5,
                      color: Palette.ink.withValues(alpha: 0.75),
                    ),
                  ),
                ),
              ],
            )
          else
            Text(
              'Send the payment, then upload the GCash receipt so the cashier '
              'can confirm it.',
              style: TextStyle(
                fontSize: 12.5,
                height: 1.35,
                color: Palette.ink.withValues(alpha: 0.7),
              ),
            ),

          if (_uploadError != null) ...[
            const SizedBox(height: 8),
            Text(
              _uploadError!,
              style: const TextStyle(fontSize: 12, color: Palette.red),
            ),
          ],

          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _uploading ? null : () => _uploadProof(replace: hasProof),
            icon: _uploading
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                : Icon(hasProof ? Icons.refresh : Icons.upload_file),
            label: Text(
              _uploading
                  ? 'Uploading…'
                  : hasProof
                      ? 'Replace receipt'
                      : 'Upload GCash receipt',
            ),
            style: FilledButton.styleFrom(
              backgroundColor: Tokens.semanticGcash,
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(48),
              shape: const StadiumBorder(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _gcashRow(String label, String value, {bool copyable = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: Palette.ink.withValues(alpha: 0.55),
            ),
          ),
          Row(
            children: [
              SelectableText(
                value,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontFamily: 'monospace',
                ),
              ),
              if (copyable) ...[
                const SizedBox(width: 6),
                InkWell(
                  onTap: () {
                    Clipboard.setData(ClipboardData(text: value));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('GCash number copied')),
                    );
                  },
                  child: Icon(Icons.copy,
                      size: 14, color: Palette.ink.withValues(alpha: 0.5)),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final paid = _ticket.isPaid;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Your ticket'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
        ),
      ),
      body: PageBody(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            Container(
              padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 20),
              decoration: BoxDecoration(
                color: Palette.ink,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                children: [
                  Text(
                    'SHOW THIS AT THE COUNTER',
                    style: TextStyle(
                      color: Palette.cream.withValues(alpha: 0.6),
                      fontSize: 11,
                      letterSpacing: 3,
                    ),
                  ),
                  const SizedBox(height: 14),
                  SelectableText(
                    _ticket.ticketCode,
                    style: const TextStyle(
                      color: Palette.gold,
                      fontSize: 52,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 8,
                      fontFamily: 'monospace',
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextButton.icon(
                    onPressed: () {
                      Clipboard.setData(
                        ClipboardData(text: _ticket.ticketCode),
                      );
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Ticket code copied')),
                      );
                    },
                    icon: const Icon(
                      Icons.copy,
                      size: 16,
                      color: Palette.cream,
                    ),
                    label: const Text(
                      'Copy code',
                      style: TextStyle(color: Palette.cream),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: paid
                    ? Palette.green.withValues(alpha: 0.12)
                    : Palette.gold.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: paid
                      ? Palette.green.withValues(alpha: 0.4)
                      : Palette.gold.withValues(alpha: 0.5),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    paid ? Icons.check_circle : Icons.hourglass_top,
                    color: paid ? Palette.green : Palette.ink,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _ticket.statusLabel,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        if (paid)
                          Text(
                            _ticket.reviewNotice ??
                                'Paid via ${_ticket.paymentLabel}',
                            style: TextStyle(
                              fontSize: 12,
                              color: Palette.ink.withValues(alpha: 0.65),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (_ticket.isGcash && !paid) ...[
              const SizedBox(height: 16),
              _gcashPanel(),
            ],
            const SizedBox(height: 20),
            _ReceiptCard(ticket: _ticket),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: _shareReceipt,
              icon: const Icon(Icons.download),
              label: Text(paid ? 'Download receipt' : 'Save a copy'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(50),
                foregroundColor: Palette.ink,
                side: BorderSide(color: Palette.ink.withValues(alpha: 0.3)),
                shape: const StadiumBorder(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReceiptCard extends StatelessWidget {
  const _ReceiptCard({required this.ticket});

  final Ticket ticket;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Palette.ink.withValues(alpha: 0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Center(
            child: Text(
              'Bencris Karinderya',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 16),
          _row('Ticket', ticket.ticketCode),
          _row('Date', _formatDate(ticket.paidAt ?? ticket.createdAt)),
          if (ticket.customerName != null) _row('Name', ticket.customerName!),
          _row('Payment', ticket.receiptPaymentLabel),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 14),
            child: DottedDivider(),
          ),
          for (final item in ticket.items)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${item.qty} × ${item.name}'),
                        Text(
                          '₱${item.price.toStringAsFixed(2)} each',
                          style: const TextStyle(
                            fontSize: 11,
                            color: Colors.black54,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Text('₱${item.lineTotal.toStringAsFixed(2)}'),
                ],
              ),
            ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 14),
            child: DottedDivider(),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              const Text(
                'TOTAL',
                style: TextStyle(letterSpacing: 2, fontSize: 12),
              ),
              Text(
                '₱${ticket.total.toStringAsFixed(2)}',
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Center(
            child: Text(
              'Salamat po!',
              style: TextStyle(fontSize: 12, color: Colors.black45),
            ),
          ),
        ],
      ),
    );
  }

  Widget _row(String label, String value) => Padding(
    padding: const EdgeInsets.only(bottom: 4),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: Colors.black54),
        ),
        Text(
          value,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
        ),
      ],
    ),
  );
}

class DottedDivider extends StatelessWidget {
  const DottedDivider({super.key});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (_, c) => Flex(
        direction: Axis.horizontal,
        mainAxisSize: MainAxisSize.max,
        children: List.generate(
          (c.constrainWidth() / 8).floor(),
          (_) => const SizedBox(
            width: 4,
            height: 1,
            child: DecoratedBox(
              decoration: BoxDecoration(color: Colors.black26),
            ),
          ),
        ),
      ),
    );
  }
}

String _formatDate(DateTime d) {
  final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final ampm = d.hour < 12 ? 'AM' : 'PM';
  return '${d.month}/${d.day}/${d.year}, $h:${d.minute.toString().padLeft(2, '0')} $ampm';
}

/// 32-column plain-text receipt, matching the cashier's thermal-roll format.
String buildReceiptText(Ticket t) {
  const w = 32;
  String line(String l, String r) => l + r.padLeft((w - l.length).clamp(1, w));
  final rule = '-' * w;
  const title = 'Bencris Karinderya';

  final out = <String>[
    title.padLeft(((w + title.length) / 2).floor()),
    '',
    'Ticket:  ${t.ticketCode}',
    'Date:    ${_formatDate(t.paidAt ?? t.createdAt)}',
  ];
  if (t.customerName != null) out.add('Name:    ${t.customerName}');
  out
    ..add('Payment: ${t.receiptPaymentLabel}')
    ..add(rule);

  for (final item in t.items) {
    out.add('${item.qty} x ${item.name}');
    out.add(line('', '₱${item.lineTotal.toStringAsFixed(2)}'));
  }

  out
    ..add(rule)
    ..add(line('TOTAL', '₱${t.total.toStringAsFixed(2)}'))
    ..add('')
    ..add('Salamat po!')
    ..add('');
  return out.join('\n');
}

/// Lets a diner pull a ticket back up on a different device or after a restart.
class FindTicketScreen extends StatefulWidget {
  const FindTicketScreen({super.key});

  @override
  State<FindTicketScreen> createState() => _FindTicketScreenState();
}

class _FindTicketScreenState extends State<FindTicketScreen> {
  final _ctrl = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _find() async {
    final code = _ctrl.text.trim();
    if (code.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final ticket = await Api.findTicket(code);
      if (!mounted) return;
      if (ticket == null) {
        setState(() {
          _error = 'No ticket "${code.toUpperCase()}".';
          _busy = false;
        });
      } else {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => TicketScreen(ticket: ticket)),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Find my ticket')),
      body: PageBody(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Text('Enter the code from your ticket.'),
              const SizedBox(height: 20),
              TextField(
                controller: _ctrl,
                autofocus: true,
                textAlign: TextAlign.center,
                textCapitalization: TextCapitalization.characters,
                maxLength: 12,
                style: const TextStyle(
                  fontSize: 30,
                  letterSpacing: 8,
                  fontFamily: 'monospace',
                ),
                decoration: InputDecoration(
                  hintText: 'K7M2Q9',
                  counterText: '',
                  filled: true,
                  fillColor: Palette.card,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                onSubmitted: (_) => _find(),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: Palette.red)),
              ],
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _busy ? null : _find,
                style: FilledButton.styleFrom(
                  backgroundColor: Palette.ink,
                  foregroundColor: Palette.cream,
                  minimumSize: const Size.fromHeight(52),
                  shape: const StadiumBorder(),
                ),
                child: _busy
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Palette.cream,
                        ),
                      )
                    : const Text('Find ticket'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
