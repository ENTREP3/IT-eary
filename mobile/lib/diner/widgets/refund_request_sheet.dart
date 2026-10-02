import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../errors.dart';
import '../../models/models.dart';
import '../../services/api.dart';
import '../../theme.dart';

/// Asking for money back, with a reason and a photograph.
///
/// Opened only once the food has been handed over. Before that there is nothing
/// to complain about yet and the ticket can simply be cancelled.
class RefundRequestSheet extends StatefulWidget {
  const RefundRequestSheet({super.key, required this.ticket});

  final Ticket ticket;

  /// Returns true when a request was sent.
  static Future<bool> open(BuildContext context, Ticket ticket) async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Palette.cream,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => RefundRequestSheet(ticket: ticket),
    );
    return sent ?? false;
  }

  @override
  State<RefundRequestSheet> createState() => _RefundRequestSheetState();
}

/// Written as a diner would say it, not as a form would label it.
const _reasons = [
  'The food was spoiled',
  'There was hair in it',
  'There was an insect in it',
  'It was undercooked or raw',
  'It was cold',
  'Wrong dish was given',
  'Something was missing',
];

class _RefundRequestSheetState extends State<RefundRequestSheet> {
  final _picked = <String>{};
  final _note = TextEditingController();
  XFile? _photo;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final shot = await ImagePicker().pickImage(source: ImageSource.camera);
    final chosen = shot ??
        await ImagePicker().pickImage(source: ImageSource.gallery);
    if (chosen != null && mounted) setState(() => _photo = chosen);
  }

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_photo == null) throw Exception('Add a photo of the food first.');
      if (_picked.isEmpty) throw Exception('Say what was wrong with it.');

      await Api.requestRefund(
        ticketCode: widget.ticket.ticketCode,
        reasons: _picked.toList(),
        photo: _photo!,
        note: _note.text,
      );
      if (mounted) Navigator.of(context).pop(true);
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
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.85,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Ask for a refund',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(false),
                    icon: const Icon(Icons.close, size: 18),
                  ),
                ],
              ),
            ),

            Flexible(
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                children: [
                  Text(
                    'Ticket ${widget.ticket.ticketCode} · '
                    '₱${widget.ticket.total.toStringAsFixed(2)}. The counter '
                    'reads this and decides. Being asked is not the same as '
                    'being refunded.',
                    style: TextStyle(
                      fontSize: 12.5,
                      height: 1.45,
                      color: Palette.ink.withValues(alpha: 0.65),
                    ),
                  ),
                  const SizedBox(height: 14),

                  Text(
                    'What was wrong with it?',
                    style: TextStyle(
                      fontSize: 11,
                      color: Palette.ink.withValues(alpha: 0.55),
                    ),
                  ),
                  const SizedBox(height: 6),
                  for (final r in _reasons)
                    CheckboxListTile(
                      value: _picked.contains(r),
                      onChanged: (on) => setState(() {
                        if (on == true) {
                          _picked.add(r);
                        } else {
                          _picked.remove(r);
                        }
                      }),
                      title: Text(r, style: const TextStyle(fontSize: 13.5)),
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      controlAffinity: ListTileControlAffinity.leading,
                      activeColor: Palette.red,
                    ),

                  const SizedBox(height: 10),
                  // Required, and said so before the button is pressed. The
                  // counter cannot judge food it cannot see.
                  Text(
                    'A photo of the food — required',
                    style: TextStyle(
                      fontSize: 11,
                      color: Palette.ink.withValues(alpha: 0.55),
                    ),
                  ),
                  const SizedBox(height: 6),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _pick,
                    icon: const Icon(Icons.photo_camera_outlined, size: 17),
                    label: Text(
                      _photo == null ? 'Take or choose a photo' : 'Photo added',
                    ),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(46),
                      foregroundColor: Palette.ink,
                      side: BorderSide(
                        color: _photo == null
                            ? Palette.ink.withValues(alpha: 0.3)
                            : Palette.green,
                      ),
                    ),
                  ),

                  const SizedBox(height: 12),
                  TextField(
                    controller: _note,
                    maxLines: 3,
                    maxLength: 300,
                    decoration: InputDecoration(
                      labelText: 'Anything else (optional)',
                      filled: true,
                      fillColor: Palette.card,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),

                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      _error!,
                      style: const TextStyle(color: Palette.red, fontSize: 13),
                    ),
                  ],
                ],
              ),
            ),

            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: SafeArea(
                top: false,
                child: FilledButton(
                  onPressed: _busy ? null : _send,
                  style: FilledButton.styleFrom(
                    backgroundColor: Palette.ink,
                    foregroundColor: Palette.cream,
                    minimumSize: const Size.fromHeight(50),
                    shape: const StadiumBorder(),
                  ),
                  child: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Palette.cream,
                          ),
                        )
                      : const Text('Send to the counter'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
