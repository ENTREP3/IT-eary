import 'package:flutter/material.dart';

import '../../../tokens.dart';
import '../admin_api.dart';
import 'widgets.dart';

/// The questions a kitchen asks, which the sales chart cannot answer.
///
/// Takings and expenses say whether money moved. They do not say which dish is
/// quietly sold at a loss, what went in the bin at closing, or which ingredient
/// price ate the margin. Every figure comes from a function that checks
/// is_admin() for itself, so this panel is only ever as trusted as the caller.
///
/// Deliberately blunt where the news is bad. A dish below cost is shown in red
/// with the loss spelled out, because the whole point of working it out is that
/// somebody does something about it.
class KitchenInsights extends StatefulWidget {
  const KitchenInsights({super.key});

  @override
  State<KitchenInsights> createState() => _KitchenInsightsState();
}

class _KitchenInsightsState extends State<KitchenInsights> {
  bool _loading = true;
  String? _error;

  Map<String, dynamic>? _outcomes;
  Map<String, dynamic>? _value;
  List<Map<String, dynamic>> _margins = const [];
  List<Map<String, dynamic>> _drift = const [];
  List<Map<String, dynamic>> _waste = const [];
  List<Map<String, dynamic>> _reasons = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        AdminApi.orderOutcomes(),
        AdminApi.customerValue(),
        AdminApi.dishMargins(),
        AdminApi.priceDrift(),
        AdminApi.wasteByDay(),
        AdminApi.refundReasons(),
      ]);
      if (!mounted) return;
      setState(() {
        _outcomes = results[0] as Map<String, dynamic>?;
        _value = results[1] as Map<String, dynamic>?;
        _margins = results[2] as List<Map<String, dynamic>>;
        _drift = results[3] as List<Map<String, dynamic>>;
        _waste = results[4] as List<Map<String, dynamic>>;
        _reasons = results[5] as List<Map<String, dynamic>>;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  double _num(Object? v) => v == null ? 0 : (v as num).toDouble();
  String _peso(Object? v) => v == null ? '—' : peso(_num(v));

  @override
  Widget build(BuildContext context) {
    final faint = Tokens.staffInk.withValues(alpha: 0.55);

    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_error != null) {
      return AdminCard(
        child: Text(_error!,
            style: const TextStyle(color: Tokens.semanticAlert)),
      );
    }

    final losing = _margins
        .where((m) => m['margin_pct'] != null && _num(m['margin_pct']) < 0)
        .toList();
    final uncosted = _margins.where((m) => m['unit_cost'] == null).toList();
    final wasteTotal =
        _waste.fold(0.0, (a, w) => a + _num(w['wasted_value']));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          const SectionHeader(
              eyebrow: 'The kitchen', title: 'In numbers'),
          const Spacer(),
          IconButton(
            onPressed: _load,
            icon: const Icon(Icons.refresh, size: 18),
            color: faint,
            tooltip: 'Refresh',
          ),
        ]),
        const SizedBox(height: 8),

        // The loudest thing on the screen, because it is the most expensive.
        if (losing.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Tokens.semanticCritical.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                  color: Tokens.semanticCritical.withValues(alpha: 0.5)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  const Icon(Icons.warning_amber_rounded,
                      size: 16, color: Tokens.semanticAlert),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      losing.length == 1
                          ? 'One dish is sold below what it costs to make'
                          : '${losing.length} dishes are sold below cost',
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Tokens.semanticAlert),
                    ),
                  ),
                ]),
                const SizedBox(height: 8),
                for (final m in losing)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(
                      '${m['dish']} sells at ${_peso(m['price'])}, costs '
                      '${_peso(m['unit_cost'])} — losing '
                      '${peso(_num(m['margin']).abs())} a serving',
                      style: TextStyle(fontSize: 11, height: 1.4, color: faint),
                    ),
                  ),
              ],
            ),
          ),

        _card(
          'What happened to the orders',
          'Last 30 days. Collected is the only one that ends with somebody eating.',
          _outcomes == null
              ? const Text('—')
              : Column(children: [
                  Row(children: [
                    _stat('Placed', '${_outcomes!['placed']}'),
                    _stat('Paid', '${_outcomes!['paid']}'),
                    _stat(
                      'Collected',
                      _outcomes!['collected_pct'] == null
                          ? '—'
                          : '${_outcomes!['collected_pct']}%',
                      tone: Tokens.semanticGood,
                    ),
                  ]),
                  const SizedBox(height: 10),
                  Text(
                    'Cancelled ${_outcomes!['cancelled']} · never collected '
                    '${_outcomes!['expired']} · refunded ${_outcomes!['refunded']}'
                    '${_num(_outcomes!['needs_review']) > 0 ? ' · payment unchecked ${_outcomes!['needs_review']}' : ''}',
                    style: TextStyle(fontSize: 11, color: faint),
                  ),
                ]),
        ),

        _card(
          'Who is buying',
          'Only diners with an account can be recognised on a second visit. '
              'Guests are counted, but never linked.',
          _value == null
              ? const Text('—')
              : Column(children: [
                  Row(children: [
                    _stat('Buyers', '${_value!['buyers']}'),
                    _stat(
                      'Come back',
                      _value!['repeat_pct'] == null
                          ? '—'
                          : '${_value!['repeat_pct']}%',
                      tone: Tokens.semanticGood,
                    ),
                    _stat('Avg order', _peso(_value!['avg_order'])),
                  ]),
                  const SizedBox(height: 10),
                  Text(
                    'Lifetime ${_peso(_value!['avg_lifetime'])} each · '
                    '${_value!['guest_orders']} guest orders, unlinked',
                    style: TextStyle(fontSize: 11, color: faint),
                  ),
                ]),
        ),

        _card(
          'What went in the bin',
          'Cooked against sold, valued at what the ingredients cost on the day.',
          _waste.isEmpty
              ? Text(
                  'Nothing recorded yet. Use Record cooking under a recipe and '
                  'this fills in by itself.',
                  style: TextStyle(fontSize: 12, color: faint),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Icon(Icons.delete_outline, size: 15, color: faint),
                      const SizedBox(width: 6),
                      Text(peso(wasteTotal),
                          style: const TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.w700,
                              color: Tokens.staffInk)),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text('thrown away in 7 days',
                            style: TextStyle(fontSize: 11, color: faint)),
                      ),
                    ]),
                    const SizedBox(height: 8),
                    for (final w in _waste.take(6))
                      Padding(
                        padding: const EdgeInsets.only(bottom: 3),
                        child: Row(children: [
                          Expanded(
                            child: Text('${w['dish']}',
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontSize: 12, color: Tokens.staffInk)),
                          ),
                          Text(
                            'cooked ${w['cooked']}, sold ${w['sold']} · '
                            '${w['left_over']} left',
                            style: TextStyle(
                                fontSize: 11,
                                color: _num(w['left_over']) > 0
                                    ? Tokens.semanticAlert
                                    : Tokens.semanticGood),
                          ),
                        ]),
                      ),
                  ],
                ),
        ),

        _card(
          'What each dish earns',
          'Last 30 days of sales against today\'s ingredient prices.',
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final m in _margins.take(10))
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(children: [
                    Expanded(
                      flex: 3,
                      child: Text('${m['dish']}',
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 12, color: Tokens.staffInk)),
                    ),
                    Expanded(
                      child: Text(
                        m['margin_pct'] == null
                            ? '—'
                            : '${m['margin_pct']}%',
                        textAlign: TextAlign.right,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: m['margin_pct'] == null
                              ? faint
                              : _num(m['margin_pct']) < 0
                                  ? Tokens.semanticAlert
                                  : _num(m['margin_pct']) < 10
                                      ? Tokens.staffAccent
                                      : Tokens.semanticGood,
                        ),
                      ),
                    ),
                    Expanded(
                      flex: 2,
                      child: Text(_peso(m['profit_30d']),
                          textAlign: TextAlign.right,
                          style: TextStyle(fontSize: 11, color: faint)),
                    ),
                  ]),
                ),
              if (uncosted.isNotEmpty) ...[
                const SizedBox(height: 4),
                // A dash is not a rounding quirk: it means a recipe is missing
                // or an ingredient has no price, and every figure for that dish
                // is silently absent until somebody fixes it.
                Text(
                  '${uncosted.length} ${uncosted.length == 1 ? 'dish has' : 'dishes have'} '
                  'no cost yet, so nothing above can be worked out for them.',
                  style: TextStyle(fontSize: 11, height: 1.4, color: faint),
                ),
              ],
            ],
          ),
        ),

        _card(
          'What the shopping is doing to you',
          'How ingredient prices have moved since you first recorded them.',
          _drift.isEmpty
              ? Text('No price has moved yet.',
                  style: TextStyle(fontSize: 12, color: faint))
              : Column(
                  children: [
                    for (final d in _drift.take(6))
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Row(children: [
                          Expanded(
                            child: Text(
                              '${d['ingredient']}  ·  in ${d['dishes_using']} '
                              '${_num(d['dishes_using']) == 1 ? 'dish' : 'dishes'}',
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 12, color: Tokens.staffInk),
                            ),
                          ),
                          Text(
                            '${_peso(d['first_cost'])} → ${_peso(d['latest_cost'])}  ',
                            style: TextStyle(fontSize: 11, color: faint),
                          ),
                          Text(
                            '${_num(d['change_pct']) > 0 ? '+' : ''}${d['change_pct']}%',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: _num(d['change_pct']) > 0
                                  ? Tokens.semanticAlert
                                  : Tokens.semanticGood,
                            ),
                          ),
                        ]),
                      ),
                  ],
                ),
        ),

        _card(
          'Why money went back',
          'Refunds in the last 30 days, grouped by what staff said happened.',
          _reasons.isEmpty
              ? Text('No refunds. Nothing to explain.',
                  style: TextStyle(fontSize: 12, color: faint))
              : Column(
                  children: [
                    for (final r in _reasons)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 3),
                        child: Row(children: [
                          Expanded(
                            child: Text('${r['reason']}',
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontSize: 12, color: Tokens.staffInk)),
                          ),
                          Text('${r['times']}× · ${_peso(r['amount'])}',
                              style: TextStyle(fontSize: 11, color: faint)),
                        ]),
                      ),
                  ],
                ),
        ),
      ],
    );
  }

  Widget _card(String title, String hint, Widget child) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Tokens.staffInk)),
              const SizedBox(height: 3),
              Text(hint,
                  style: TextStyle(
                      fontSize: 11,
                      height: 1.4,
                      color: Tokens.staffInk.withValues(alpha: 0.5))),
              const SizedBox(height: 12),
              child,
            ],
          ),
        ),
      );

  Widget _stat(String label, String value, {Color? tone}) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label.toUpperCase(),
                style: TextStyle(
                    fontSize: 9,
                    letterSpacing: 1.5,
                    color: Tokens.staffInk.withValues(alpha: 0.45))),
            const SizedBox(height: 2),
            Text(value,
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: tone ?? Tokens.staffInk)),
          ],
        ),
      );
}
