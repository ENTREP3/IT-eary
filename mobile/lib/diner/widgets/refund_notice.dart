import 'package:flutter/material.dart';

import '../../services/api.dart';
import '../../theme.dart';

/// What the shop sent back, shown to the person who was refunded.
///
/// The shop kept a screenshot for its own protection and showed the customer
/// nothing, which is the wrong way round — the proof is most use to the person
/// waiting for the money.
class RefundNotice extends StatefulWidget {
  const RefundNotice({super.key, required this.ticketCode});

  final String ticketCode;

  @override
  State<RefundNotice> createState() => _RefundNoticeState();
}

class _RefundNoticeState extends State<RefundNotice> {
  Map<String, dynamic>? _refund;
  String? _proofUrl;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final r = await Api.myRefund(widget.ticketCode);
    if (!mounted) return;
    setState(() {
      _refund = r;
      _loading = false;
    });

    // Fetched separately and allowed to fail: a guest can see that the refund
    // happened but not the screenshot, because storage rules cannot check a
    // device the way the function can.
    final path = r?['proof_path'] as String?;
    if (path != null && path.isNotEmpty) {
      final url = await Api.signedProofUrl(path);
      if (mounted) setState(() => _proofUrl = url);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = _refund;
    if (_loading || r == null) return const SizedBox.shrink();

    final amount = (r['amount'] as num?) ?? 0;
    final method = r['method'] as String?;
    final reason = r['reason'] as String?;
    final at = DateTime.tryParse(r['issued_at'] as String? ?? '')?.toLocal();

    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Palette.green.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Palette.green.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'REFUNDED',
            style: TextStyle(
              fontSize: 10,
              letterSpacing: 2,
              fontWeight: FontWeight.w600,
              color: Palette.green,
            ),
          ),
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '₱${amount.toStringAsFixed(2)}',
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(width: 8),
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Text(
                  method == 'gcash' ? 'sent by GCash' : 'in cash',
                  style: TextStyle(
                    fontSize: 12,
                    color: Palette.ink.withValues(alpha: 0.6),
                  ),
                ),
              ),
            ],
          ),
          if (at != null || (reason ?? '').isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                [
                  if (at != null) '${at.day}/${at.month}/${at.year}',
                  if ((reason ?? '').isNotEmpty) reason!,
                ].join(' · '),
                style: TextStyle(
                  fontSize: 11.5,
                  color: Palette.ink.withValues(alpha: 0.55),
                ),
              ),
            ),

          if (_proofUrl != null) ...[
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.network(
                _proofUrl!,
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) => const SizedBox.shrink(),
              ),
            ),
          ] else if (method == 'gcash') ...[
            const SizedBox(height: 8),
            Text(
              'Ask at the counter if you need a copy of the transfer.',
              style: TextStyle(
                fontSize: 11.5,
                height: 1.4,
                color: Palette.ink.withValues(alpha: 0.55),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
