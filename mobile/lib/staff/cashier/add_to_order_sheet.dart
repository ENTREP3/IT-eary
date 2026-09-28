import 'package:flutter/material.dart';
import '../../errors.dart';

import '../../models/models.dart';
import '../../tokens.dart';
import '../staff_api.dart';

/// Adding to a ticket at the counter.
///
/// Only reachable before payment. After that it is no longer an order being
/// built: taking more money against a settled ticket is a second sale, and
/// handing food over without it is a hole in the till. The database refuses it
/// either way; this simply never offers it.
///
/// Sold-out dishes are left out rather than greyed. The cashier is standing in
/// front of somebody waiting, and a list of things they cannot have is slower
/// to read than a list of things they can.
class AddToOrderSheet extends StatefulWidget {
  const AddToOrderSheet({super.key, required this.ticketCode});

  final String ticketCode;

  /// Resolves with the updated ticket, or null if nothing was added.
  static Future<Ticket?> open(BuildContext context, String ticketCode) =>
      showModalBottomSheet<Ticket>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Tokens.staffCard,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (_) => AddToOrderSheet(ticketCode: ticketCode),
      );

  @override
  State<AddToOrderSheet> createState() => _AddToOrderSheetState();
}

class _AddToOrderSheetState extends State<AddToOrderSheet> {
  final _search = TextEditingController();
  List<Dish>? _dishes;
  String? _busy;
  String? _error;

  /// The latest ticket, so several dishes can be added before going back.
  Ticket? _updated;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = await StaffApi.availableDishes();
      // Rice to the top. It is the thing most often asked for at the counter,
      // and hunting for it down a list of twenty-five ulam is the difference
      // between a quick yes and a queue.
      d.sort((a, b) {
        final ar = a.category == 'Kanin' ? 0 : 1;
        final br = b.category == 'Kanin' ? 0 : 1;
        return ar != br ? ar - br : a.name.compareTo(b.name);
      });
      if (mounted) setState(() => _dishes = d);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = humanError(e);
          _dishes = const [];
        });
      }
    }
  }

  Future<void> _add(Dish d) async {
    setState(() {
      _busy = d.id;
      _error = null;
    });
    try {
      final t = await StaffApi.addItems(widget.ticketCode, d.id);
      if (!mounted) return;
      setState(() {
        _updated = t;
        _busy = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Added ${d.name}.')),
      );
    } catch (e) {
      // The refusal is the rule speaking, so it is shown as written.
      if (mounted) {
        setState(() {
          _error = humanError(e);
          _busy = null;
        });
      }
    }
  }

  List<Dish> get _shown {
    final all = _dishes ?? const <Dish>[];
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return all;
    return all
        .where((d) =>
            d.name.toLowerCase().contains(q) ||
            d.tagalog.toLowerCase().contains(q))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final faint = Tokens.staffInk.withValues(alpha: 0.55);
    final rows = _shown;

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
          Row(children: [
            const Text(
              'Add to this order',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: Tokens.staffInk,
              ),
            ),
            const Spacer(),
            IconButton(
              onPressed: () => Navigator.pop(context, _updated),
              icon: const Icon(Icons.close, size: 18),
              color: faint,
            ),
          ]),
          const SizedBox(height: 10),

          TextField(
            controller: _search,
            autofocus: true,
            onChanged: (_) => setState(() {}),
            style: const TextStyle(color: Tokens.staffInk),
            decoration: InputDecoration(
              isDense: true,
              hintText: 'Search the menu',
              hintStyle:
                  TextStyle(color: Tokens.staffInk.withValues(alpha: 0.35)),
              prefixIcon: Icon(Icons.search, size: 18, color: faint),
              filled: true,
              fillColor: Tokens.staffGround,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide:
                    BorderSide(color: Tokens.staffInk.withValues(alpha: 0.15)),
              ),
            ),
          ),

          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style:
                  const TextStyle(fontSize: 12, color: Tokens.semanticAlert),
            ),
          ],

          const SizedBox(height: 10),
          SizedBox(
            height: 320,
            child: _dishes == null
                ? const Center(child: CircularProgressIndicator())
                : rows.isEmpty
                    ? Center(
                        child: Text(
                          'Nothing on the menu matches that.',
                          style: TextStyle(color: faint),
                        ),
                      )
                    : ListView.builder(
                        itemCount: rows.length,
                        itemBuilder: (_, i) {
                          final d = rows[i];
                          return ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            onTap: _busy == null ? () => _add(d) : null,
                            title: Text(
                              d.name,
                              style: const TextStyle(
                                  fontSize: 14, color: Tokens.staffInk),
                            ),
                            subtitle: d.stockCount == null
                                ? null
                                : Text(
                                    '${d.stockCount} left',
                                    style:
                                        TextStyle(fontSize: 11, color: faint),
                                  ),
                            trailing: _busy == d.id
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2),
                                  )
                                : Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        '₱${d.price.toStringAsFixed(2)}',
                                        style: TextStyle(
                                            fontSize: 13, color: faint),
                                      ),
                                      const SizedBox(width: 6),
                                      const Icon(Icons.add,
                                          size: 16,
                                          color: Tokens.staffAccent),
                                    ],
                                  ),
                          );
                        },
                      ),
          ),

          if (_updated != null) ...[
            const SizedBox(height: 6),
            Text(
              'New total ₱${_updated!.total.toStringAsFixed(2)}',
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontWeight: FontWeight.w600, color: Tokens.staffInk),
            ),
          ],
          const SizedBox(height: 10),
          FilledButton(
            onPressed: () => Navigator.pop(context, _updated),
            style: FilledButton.styleFrom(
              backgroundColor: Tokens.staffAccent,
              foregroundColor: Tokens.staffCard,
              minimumSize: const Size.fromHeight(46),
            ),
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }
}
