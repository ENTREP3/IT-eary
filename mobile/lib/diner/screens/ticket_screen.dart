import 'dart:async';
import 'dart:ui' show ImageByteFormat;

import 'package:file_saver/file_saver.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

import '../../errors.dart';

import '../../models/models.dart';
import '../../services/api.dart';
import '../../theme.dart';
import '../state/order_history.dart';
import 'rate_order.dart';
import '../../tokens.dart';

/// The ticket the diner shows at the counter. Subscribes to Realtime so it
/// flips to Paid / Ready on its own while they're standing there.
/// Where a shared receipt sends the person reading it.
///
/// The customer site, never a staff address: this link is forwarded to
/// friends, and the only thing they should land on is the menu.
const _siteUrl = 'https://bencris.iteary.site';


class TicketScreen extends StatefulWidget {
  const TicketScreen({super.key, required this.ticket});

  final Ticket ticket;

  @override
  State<TicketScreen> createState() => _TicketScreenState();
}

class _TicketScreenState extends State<TicketScreen> {
  /// Identifies the receipt so it can be rasterised when saving.
  final _receiptKey = GlobalKey();

  late Ticket _ticket = widget.ticket;
  PaymentSettings? _settings;
  bool _uploading = false;
  String? _uploadError;

  Timer? _poll;

  @override
  void initState() {
    super.initState();

    // Pushed for anybody with an identity, which since anonymous sign-ins is
    // everybody — Realtime checks the row against the caller's own id, and a
    // guest now has one. The polling below is only the fallback for a device
    // that could not get a session at all.
    if (Api.identified) {
      Api.watchTicket(widget.ticket.id).listen(
        (t) {
          if (mounted) setState(() => _ticket = t);
        },
        onError: (_) {
          /* Realtime unavailable — the shown data is still valid. */
        },
      );
    } else {
      _poll = Timer.periodic(const Duration(seconds: 6), (_) async {
        // Nothing more is coming once it is done with; stop asking.
        if (_ticket.status == 'completed' ||
            _ticket.status == 'cancelled' ||
            _ticket.status == 'refunded' ||
            _ticket.status == 'expired') {
          _poll?.cancel();
          return;
        }
        final fresh = await Api.findTicket(_ticket.ticketCode);
        if (fresh != null && mounted) setState(() => _ticket = fresh);
      });
    }

    if (widget.ticket.isGcash) _loadSettings();
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
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
        _uploadError = humanError(e, 'Could not upload that image.');
        _uploading = false;
      });
    }
  }

  bool _cancelling = false;

  /// Calls the order off, behind a confirmation.
  ///
  /// There is no undo: the ticket code dies with it, and re-ordering means
  /// going through the menu again. The dialog says that plainly instead of
  /// asking "are you sure?", which tells nobody anything.
  Future<void> _cancel() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Palette.cream,
        title: Text(
          'Cancel order ${_ticket.ticketCode}?',
          style: const TextStyle(fontSize: 18),
        ),
        content: const Text(
          'The kitchen stops seeing it and the code stops working. If you '
          'still want the food you will have to order again.',
          style: TextStyle(height: 1.45),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep my order'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Palette.red),
            child: const Text('Yes, cancel it'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() => _cancelling = true);
    try {
      await Api.cancelMyOrder(_ticket.ticketCode);
      // Out of this device's own list too, so "Order again" cannot offer back
      // something that no longer exists.
      await OrderHistory.forget(_ticket.ticketCode);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      // Most likely the counter settled it, or the kitchen started, in the
      // seconds since this screen last heard about it.
      if (mounted) {
        setState(() => _cancelling = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not cancel that. $e')),
        );
      }
    }
  }

  /// Saves the receipt to the phone as a picture.
  ///
  /// It used to write a .txt to a temporary folder and open the system share
  /// sheet. Two things were wrong with that. A receipt gets sent to somebody
  /// — a housemate, a group chat, whoever is being paid back — and a text
  /// file in a chat is an attachment nobody opens, while a picture is simply
  /// there in the conversation. And a share sheet is not a download: it asked
  /// where to send the thing, and because the file was text, Android offered
  /// Print among the targets, on a receipt for a karinderya.
  ///
  /// So it saves rather than shares. The button said Download; now that is
  /// what it does.
  /// The receipt as a PNG, rasterised from the widget on screen.
  ///
  /// Shared by both buttons, so what gets saved and what gets sent to
  /// somebody are the same picture, and there is one place where the
  /// resolution is decided.
  Future<Uint8List> _receiptPng() async {
    final boundary = _receiptKey.currentContext?.findRenderObject()
        as RenderRepaintBoundary?;
    if (boundary == null) throw StateError('receipt not on screen');

    // Three times the logical size: a receipt gets pinched open to check a
    // figure, and a blurry total is the one thing it cannot afford.
    final image = await boundary.toImage(pixelRatio: 3);
    final bytes = await image.toByteData(format: ImageByteFormat.png);
    if (bytes == null) throw StateError('could not encode the receipt');
    return bytes.buffer.asUint8List();
  }

  /// Sends the receipt on to somebody, with a way back to the shop.
  ///
  /// The picture carries what they ordered, which is the part people actually
  /// forward — "this is what I had" — and the link is so the person reading it
  /// can order the same thing rather than ask where it came from.
  Future<void> _shareReceipt() async {
    try {
      final png = await _receiptPng();
      await SharePlus.instance.share(
        ShareParams(
          files: [
            XFile.fromData(
              png,
              name: 'bencris-${_ticket.ticketCode}.png',
              mimeType: 'image/png',
            ),
          ],
          text: 'My order from Bencris Karinderya — $_siteUrl',
        ),
      );
    } catch (e) {
      // A picture is the point, but a phone that will not hand one over
      // should still manage to pass on what was ordered. The plain-text
      // receipt is the same record in the form that always travels.
      try {
        await SharePlus.instance.share(
          ShareParams(
            text: '${buildReceiptText(_ticket)}\n\n$_siteUrl',
          ),
        );
      } catch (_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(humanError(e, 'Could not share the receipt.')),
          ),
        );
      }
    }
  }

  Future<void> _saveReceipt() async {
    try {
      await FileSaver.instance.saveFile(
        name: 'bencris-${_ticket.ticketCode}',
        bytes: await _receiptPng(),
        ext: 'png',
        mimeType: MimeType.png,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Receipt ${_ticket.ticketCode} saved.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(humanError(e, 'Could not save the receipt.'))),
      );
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
            // Only once the meal is actually paid for. The database refuses a
            // rating from an unsettled ticket anyway, so offering it earlier
            // would just be a button that fails.
            if (paid) RateOrder(ticket: _ticket),
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
            // Wrapped so the receipt can be rasterised exactly as it looks
            // here. Capturing the widget already on screen is what keeps the
            // saved picture and the displayed receipt from drifting apart,
            // which a second hand-drawn copy of the layout would not.
            RepaintBoundary(
              key: _receiptKey,
              child: _ReceiptCard(ticket: _ticket),
            ),
            const SizedBox(height: 16),
            // Two different things, so two buttons. Saving puts a picture in
            // the phone's files; sharing hands it to somebody else along with
            // a way back to the shop. Collapsing them into one button is what
            // made Download open a share sheet, which is not what the word
            // means.
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _saveReceipt,
                    icon: const Icon(Icons.download, size: 18),
                    label: Text(paid ? 'Download' : 'Save a copy'),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(50),
                      foregroundColor: Palette.ink,
                      side: BorderSide(
                        color: Palette.ink.withValues(alpha: 0.3),
                      ),
                      shape: const StadiumBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _shareReceipt,
                    icon: const Icon(Icons.ios_share, size: 18),
                    label: const Text('Share'),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(50),
                      foregroundColor: Palette.ink,
                      side: BorderSide(
                        color: Palette.ink.withValues(alpha: 0.3),
                      ),
                      shape: const StadiumBorder(),
                    ),
                  ),
                ),
              ],
            ),

            // Calling it off. Only while it is unpaid and the kitchen has not
            // started — the database enforces both, and past either point this
            // is a conversation with a person rather than a button.
            if (!paid && _ticket.status == 'pending') ...[
              const SizedBox(height: 10),
              TextButton(
                onPressed: _cancelling ? null : _cancel,
                style: TextButton.styleFrom(
                  minimumSize: const Size.fromHeight(46),
                  foregroundColor: Palette.ink.withValues(alpha: 0.65),
                ),
                child: _cancelling
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Cancel this order'),
              ),
            ],

            // The refund rule, as a live fact about this order rather than a
            // policy page nobody opens. It says so while it is still true and
            // goes away by itself the moment the kitchen marks the food ready,
            // which is the only moment the answer changes.
            if (paid &&
                (_ticket.status == 'paid' ||
                    _ticket.status == 'preparing')) ...[
              const SizedBox(height: 14),
              Text(
                'Changed your mind? Ask at the counter and we will refund you, '
                'up until the kitchen marks your order ready.',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 12,
                    height: 1.5,
                    color: Palette.ink.withValues(alpha: 0.6)),
              ),
            ],
            if (_ticket.status == 'refunded') ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Palette.red.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Palette.red.withValues(alpha: 0.35)),
                ),
                child: Column(children: [
                  const Text('This order was refunded.',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 3),
                  Text(
                    '₱${_ticket.total.toStringAsFixed(2)} has been returned to you.',
                    style: TextStyle(
                        fontSize: 12,
                        color: Palette.ink.withValues(alpha: 0.7)),
                  ),
                ]),
              ),
            ],
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
          if (ticket.discount > 0) ...[
            _ReceiptLine(
              label: 'Subtotal',
              value: '₱${ticket.subtotal.toStringAsFixed(2)}',
            ),
            _ReceiptLine(
              label: ticket.promoCode == null
                  ? 'Discount'
                  : 'Discount (${ticket.promoCode})',
              value: '-₱${ticket.discount.toStringAsFixed(2)}',
            ),
            const SizedBox(height: 6),
          ],
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
          // The person, not their job title. A diner has no use for knowing
          // whether it was the owner or a cashier at the till.
          if ((ticket.servedByName ?? '').trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            _ReceiptLine(
              label: 'Served by',
              value: ticket.servedByName!,
            ),
          ],
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
        _error = humanError(e);
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

/// One label-and-value line on the receipt.
class _ReceiptLine extends StatelessWidget {
  const _ReceiptLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 2),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 12.5,
            color: Palette.ink.withValues(alpha: 0.6),
          ),
        ),
        Text(value, style: const TextStyle(fontSize: 12.5)),
      ],
    ),
  );
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

  out.add(rule);

  // Named, not just subtracted: somebody checking a discount wants to
  // know which code did it.
  if (t.discount > 0) {
    out.add(line('Subtotal', '₱${t.subtotal.toStringAsFixed(2)}'));
    out.add(line(
      t.promoCode == null ? 'Discount' : 'Discount (${t.promoCode})',
      '-₱${t.discount.toStringAsFixed(2)}',
    ));
  }

  out
    ..add(line('TOTAL', '₱${t.total.toStringAsFixed(2)}'))
    ..add('');

  // The person, not their job title. A diner has no use for knowing
  // whether it was the owner or a cashier at the till.
  if ((t.servedByName ?? '').trim().isNotEmpty) {
    out.add(line('Served by', t.servedByName!));
  }

  out
    ..add('')
    ..add('Salamat po!')
    ..add('');
  return out.join('\n');
}
