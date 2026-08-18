import 'package:flutter/material.dart';

import '../../../models/models.dart';
import '../../../tokens.dart';
import '../admin_api.dart';
import 'widgets.dart';

/// The shop's own details, and what the storefront is allowed to show.
///
/// The phone could read these settings and never change them, so an owner
/// standing at their own counter had to find a laptop to correct the address or
/// stop the app quoting a review. The dashboard is meant to be usable during
/// service, and service is exactly when nobody is at a laptop.
class ShopTab extends StatefulWidget {
  const ShopTab({super.key});

  @override
  State<ShopTab> createState() => _ShopTabState();
}

class _ShopTabState extends State<ShopTab> {
  Map<String, dynamic>? _row;
  Storefront _show = Storefront.defaults;
  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _saved;

  final _fields = <String, TextEditingController>{};

  static const _details = [
    ('name', 'Shop name'),
    ('tagline', 'Tagline'),
    ('blurb', 'Short description'),
    ('address_line', 'Street or stall'),
    ('district', 'Area'),
    ('city', 'City or municipality'),
    ('province', 'Province'),
    ('phone', 'Contact number'),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in _fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final row = await AdminApi.shopSettings();
      if (!mounted) return;
      setState(() {
        _row = row;
        _show = row?['storefront'] == null
            ? Storefront.defaults
            : Storefront.fromMap(
                Map<String, dynamic>.from(row!['storefront'] as Map),
              );
        for (final (key, _) in _details) {
          _fields[key] = TextEditingController(
            text: (row?[key] as String?) ?? '',
          );
        }
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

  Future<void> _saveDetails() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await AdminApi.updateShop({
        for (final entry in _fields.entries) entry.key: entry.value.text.trim(),
      });
      if (!mounted) return;
      setState(() => _saved = 'Details saved');
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Writes the whole storefront object back, not just the key that changed.
  ///
  /// The column is one jsonb value, so a patch of a single key would replace
  /// the object and quietly drop every other setting with it.
  Future<void> _commit(Storefront next) async {
    final before = _show;
    setState(() {
      _show = next;
      _busy = true;
      _error = null;
    });
    try {
      await AdminApi.updateShop({
        'storefront': {
          'ratings': next.ratings,
          'comments': next.comments,
          'bestseller': next.bestseller,
          'low_stock': next.lowStock,
          'sold_out': next.soldOut,
          'recommended': next.recommended,
          'reviews_source': next.reviewsSource,
          'reviews_min_stars': next.reviewsMinStars,
          'reviews_per_batch': next.reviewsPerBatch,
          'reviews_seconds': next.reviewsSeconds,
          'hero_seconds': next.heroSeconds,
          // Carried through untouched: this screen does not offer the
          // suggestion history, and rewriting the object without it would
          // forget every dish the owner has already declined.
          'bestseller_dismissed':
              (_row?['storefront'] as Map?)?['bestseller_dismissed'] ?? {},
        },
      });
      if (!mounted) return;
      setState(() => _saved = 'Saved');
    } catch (e) {
      // Put it back. A control that stays where you left it after a failed save
      // is lying about what diners are seeing.
      if (mounted) {
        setState(() {
          _show = before;
          _error = '$e';
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Storefront _with({
    bool? ratings,
    bool? comments,
    bool? bestseller,
    bool? lowStock,
    bool? soldOut,
    bool? recommended,
    String? reviewsSource,
    int? reviewsMinStars,
    int? reviewsPerBatch,
    int? reviewsSeconds,
    int? heroSeconds,
  }) => Storefront(
    ratings: ratings ?? _show.ratings,
    comments: comments ?? _show.comments,
    bestseller: bestseller ?? _show.bestseller,
    lowStock: lowStock ?? _show.lowStock,
    soldOut: soldOut ?? _show.soldOut,
    recommended: recommended ?? _show.recommended,
    reviewsSource: reviewsSource ?? _show.reviewsSource,
    reviewsMinStars: reviewsMinStars ?? _show.reviewsMinStars,
    reviewsPerBatch: reviewsPerBatch ?? _show.reviewsPerBatch,
    reviewsSeconds: reviewsSeconds ?? _show.reviewsSeconds,
    heroSeconds: heroSeconds ?? _show.heroSeconds,
  );

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _Note(text: _error!, tone: Tokens.semanticAlert),
          ),
        if (_saved != null && _error == null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _Note(text: _saved!, tone: Tokens.semanticGood),
          ),

        // ------------------------------------------------------- the details
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _SectionTitle(
                icon: Icons.store_outlined,
                title: 'Shop details',
                subtitle:
                    'Every app reads these, so a correction here reaches the '
                    'website and the phone at once.',
              ),
              const SizedBox(height: 14),
              for (final (key, label) in _details)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: TextField(
                    controller: _fields[key],
                    style: const TextStyle(color: Tokens.staffInk),
                    maxLines: key == 'blurb' ? 3 : 1,
                    decoration: InputDecoration(
                      labelText: label,
                      labelStyle: TextStyle(
                        color: Tokens.staffInk.withValues(alpha: 0.6),
                      ),
                      filled: true,
                      fillColor: Tokens.staffGround,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton(
                  onPressed: _busy ? null : _saveDetails,
                  style: FilledButton.styleFrom(
                    backgroundColor: Tokens.staffAccent,
                    foregroundColor: Tokens.staffCard,
                  ),
                  child: const Text('Save details'),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // --------------------------------------------------- what diners see
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _SectionTitle(
                icon: Icons.visibility_outlined,
                title: 'What the storefront shows',
                subtitle:
                    'Applies to the website and this app alike. Changes reach '
                    'a diner the next time they open it.',
              ),
              const SizedBox(height: 6),

              _Group(label: 'On the menu'),
              _SwitchRow(
                value: _show.bestseller,
                busy: _busy,
                label: 'Bestseller mark',
                help: _show.bestseller
                    ? 'Dishes you marked on the Menu screen wear a Bestseller '
                          'badge.'
                    : 'The badge is hidden. Your marked dishes still lead the '
                          'front page.',
                onChanged: (v) => _commit(_with(bestseller: v)),
              ),
              _SwitchRow(
                value: _show.lowStock,
                busy: _busy,
                label: 'Only a few left',
                help: _show.lowStock
                    ? 'A dish running low says so, which tends to pull orders '
                          'earlier in the day.'
                    : 'Stock stays private until a dish actually runs out.',
                onChanged: (v) => _commit(_with(lowStock: v)),
              ),
              _SwitchRow(
                value: _show.soldOut,
                busy: _busy,
                label: 'Sold-out dishes',
                help: _show.soldOut
                    ? 'They stay on the menu, greyed, so diners know what to '
                          'come back for.'
                    : 'They disappear until you cook more.',
                onChanged: (v) => _commit(_with(soldOut: v)),
              ),

              const SizedBox(height: 10),
              _Group(label: 'Reviews'),
              _SwitchRow(
                value: _show.ratings,
                busy: _busy,
                label: 'Star ratings',
                help: _show.ratings
                    ? 'Each dish shows its average and how many people rated '
                          'it.'
                    : 'No ratings anywhere, and everything below goes with it.',
                onChanged: (v) => _commit(_with(ratings: v)),
              ),
              if (_show.ratings) ...[
                _SwitchRow(
                  value: _show.comments,
                  busy: _busy,
                  indent: true,
                  label: 'What diners wrote',
                  help: _show.comments
                      ? 'Comments are readable from the dish and quoted in the '
                            'band below it.'
                      : 'Stars only — the band keeps the scores and drops the '
                            'words.',
                  onChanged: (v) => _commit(_with(comments: v)),
                ),
                _ChoiceRow(
                  label: 'Which reviews',
                  value: _show.reviewsSource == 'picked'
                      ? 'Only the ones I choose'
                      : 'Any that meet the star rule',
                  options: const [
                    'Any that meet the star rule',
                    'Only the ones I choose',
                  ],
                  busy: _busy,
                  onChanged: (v) => _commit(
                    _with(
                      reviewsSource:
                          v == 'Only the ones I choose' ? 'picked' : 'all',
                    ),
                  ),
                ),
                _ChoiceRow(
                  label: 'Never quote below',
                  value: '${_show.reviewsMinStars} stars',
                  options: const ['1 stars', '2 stars', '3 stars', '4 stars', '5 stars'],
                  busy: _busy,
                  onChanged: (v) => _commit(
                    _with(reviewsMinStars: int.parse(v.split(' ').first)),
                  ),
                ),
                _ChoiceRow(
                  label: 'Show at a time',
                  value: '${_show.reviewsPerBatch}',
                  options: const ['1', '2', '3', '4'],
                  busy: _busy,
                  onChanged: (v) => _commit(_with(reviewsPerBatch: int.parse(v))),
                ),
                _ChoiceRow(
                  label: 'Change every',
                  value: _seconds(_show.reviewsSeconds),
                  options: const [
                    'Do not change',
                    '5 seconds',
                    '8 seconds',
                    '12 seconds',
                    '20 seconds',
                  ],
                  busy: _busy,
                  onChanged: (v) =>
                      _commit(_with(reviewsSeconds: _parseSeconds(v))),
                ),
              ],

              const SizedBox(height: 10),
              _Group(label: 'The front page'),
              _SwitchRow(
                value: _show.recommended,
                busy: _busy,
                label: 'What we recommend',
                help: _show.recommended
                    ? 'Dishes you marked a bestseller lead the front page.'
                    : 'The front page shows whatever is cooking, in its usual '
                          'order.',
                onChanged: (v) => _commit(_with(recommended: v)),
              ),
              _ChoiceRow(
                label: 'Background changes every',
                value: _seconds(_show.heroSeconds),
                options: const [
                  'Do not change',
                  '5 seconds',
                  '7 seconds',
                  '10 seconds',
                  '15 seconds',
                  '25 seconds',
                ],
                busy: _busy,
                onChanged: (v) => _commit(_with(heroSeconds: _parseSeconds(v))),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Only when it can do anything. A picker offering to choose which
        // reviews are quoted, while the setting above says to quote them all,
        // is a control that changes nothing and reads as broken.
        if (_show.ratings && _show.reviewsSource == 'picked')
          const _ReviewPicker(),

        const SizedBox(height: 12),
        const _StaffLogins(),
      ],
    );
  }

  static String _seconds(int n) => n <= 0 ? 'Do not change' : '$n seconds';

  static int _parseSeconds(String v) =>
      v == 'Do not change' ? 0 : int.parse(v.split(' ').first);
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 17, color: Tokens.staffAccent),
            const SizedBox(width: 8),
            Text(
              title,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 15,
                color: Tokens.staffInk,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          subtitle,
          style: TextStyle(
            fontSize: 12,
            height: 1.45,
            color: Tokens.staffInk.withValues(alpha: 0.55),
          ),
        ),
      ],
    );
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 4),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          fontSize: 10,
          letterSpacing: 2.5,
          fontWeight: FontWeight.w600,
          color: Tokens.staffInk.withValues(alpha: 0.45),
        ),
      ),
    );
  }
}

/// A switch with the sentence that explains what it is doing right now.
///
/// The help text changes with the state rather than describing the control in
/// the abstract, so the owner reads what the shop is doing rather than working
/// out what it would do.
class _SwitchRow extends StatelessWidget {
  const _SwitchRow({
    required this.value,
    required this.busy,
    required this.label,
    required this.help,
    required this.onChanged,
    this.indent = false,
  });

  final bool value;
  final bool busy;
  final String label;
  final String help;
  final ValueChanged<bool> onChanged;
  final bool indent;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(left: indent ? 16 : 0, top: 6, bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontWeight: FontWeight.w500,
                    color: Tokens.staffInk,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  help,
                  style: TextStyle(
                    fontSize: 12,
                    height: 1.4,
                    color: Tokens.staffInk.withValues(alpha: 0.5),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Switch(
            value: value,
            onChanged: busy ? null : onChanged,
            activeThumbColor: Tokens.semanticGood,
          ),
        ],
      ),
    );
  }
}

class _ChoiceRow extends StatelessWidget {
  const _ChoiceRow({
    required this.label,
    required this.value,
    required this.options,
    required this.busy,
    required this.onChanged,
  });

  final String label;
  final String value;
  final List<String> options;
  final bool busy;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 16, top: 6, bottom: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                color: Tokens.staffInk.withValues(alpha: 0.8),
              ),
            ),
          ),
          DropdownButton<String>(
            value: value,
            underline: const SizedBox.shrink(),
            dropdownColor: Tokens.staffCard,
            style: const TextStyle(fontSize: 13, color: Tokens.staffInk),
            onChanged: busy ? null : (v) => v == null ? null : onChanged(v),
            items: options
                .map((o) => DropdownMenuItem(value: o, child: Text(o)))
                .toList(),
          ),
        ],
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.text, required this.tone});

  final String text;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(text, style: TextStyle(fontSize: 13, color: tone)),
    );
  }
}

/// Choosing which reviews the shop quotes on its front page.
///
/// Every review still counts towards the dish average. This only decides which
/// are put on show, which is why it appears solely when the setting above says
/// the owner is choosing them by hand.
class _ReviewPicker extends StatefulWidget {
  const _ReviewPicker();

  @override
  State<_ReviewPicker> createState() => _ReviewPickerState();
}

class _ReviewPickerState extends State<_ReviewPicker> {
  List<Map<String, dynamic>>? _rows;
  String? _busy;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = await AdminApi.allReviews();
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

  Future<void> _pick(Map<String, dynamic> r) async {
    final id = r['id'] as String;
    setState(() {
      _busy = id;
      _error = null;
    });
    try {
      final ok = await AdminApi.setReviewFeatured(
        id,
        !(r['featured'] as bool? ?? false),
      );
      if (!ok) {
        // A blocked write comes back as success with no rows, so an empty
        // result is the failure that would otherwise look exactly like success.
        if (mounted) {
          setState(
            () => _error =
                'That did not save. You may not have permission to change it.',
          );
        }
        return;
      }
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;

    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionTitle(
            icon: Icons.format_quote,
            title: 'Choose what to quote',
            subtitle:
                'Every review still counts towards the dish average. This only '
                'decides which are quoted on the front of the shop.',
          ),
          const SizedBox(height: 12),

          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _Note(text: _error!, tone: Tokens.semanticAlert),
            ),

          if (rows == null)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (rows.isEmpty)
            Text(
              'No reviews yet. They appear here as diners leave them.',
              style: TextStyle(
                fontSize: 12,
                color: Tokens.staffInk.withValues(alpha: 0.45),
              ),
            )
          else
            // Capped and scrollable rather than running the length of the page:
            // a shop with three hundred reviews would otherwise bury every
            // other control underneath it.
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 320),
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: rows.length,
                itemBuilder: (_, i) {
                  final r = rows[i];
                  final chosen = r['featured'] as bool? ?? false;
                  final rating = (r['rating'] as num?)?.toInt() ?? 0;
                  final comment = (r['comment'] as String?) ?? '';

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: InkWell(
                      onTap: _busy == r['id'] ? null : () => _pick(r),
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(12),
                          color: chosen
                              ? Tokens.staffAccent.withValues(alpha: 0.1)
                              : Colors.transparent,
                          border: Border.all(
                            color: chosen
                                ? Tokens.staffAccent.withValues(alpha: 0.5)
                                : Tokens.staffInk.withValues(alpha: 0.12),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                for (var n = 1; n <= 5; n++)
                                  Icon(
                                    n <= rating
                                        ? Icons.star_rounded
                                        : Icons.star_outline_rounded,
                                    size: 12,
                                    color: n <= rating
                                        ? Tokens.staffAccent
                                        : Tokens.staffInk.withValues(
                                            alpha: 0.25,
                                          ),
                                  ),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    (r['dish_name'] as String?) ??
                                        (r['dish_id'] as String? ?? ''),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Tokens.staffInk.withValues(
                                        alpha: 0.7,
                                      ),
                                    ),
                                  ),
                                ),
                                if (chosen)
                                  const Text(
                                    'Quoted',
                                    style: TextStyle(
                                      fontSize: 10,
                                      color: Tokens.staffAccent,
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              comment.isEmpty
                                  ? 'Stars only, no words written'
                                  : comment,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 12,
                                fontStyle: comment.isEmpty
                                    ? FontStyle.italic
                                    : FontStyle.normal,
                                color: Tokens.staffInk.withValues(
                                  alpha: comment.isEmpty ? 0.35 : 0.6,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

/// Who can sign in to the counter and the dashboard.
///
/// The account is created through a guarded database function rather than by
/// writing to a table, so this screen never handles anybody's password beyond
/// passing it straight through, and cannot promote somebody by accident.
class _StaffLogins extends StatefulWidget {
  const _StaffLogins();

  @override
  State<_StaffLogins> createState() => _StaffLoginsState();
}

class _StaffLoginsState extends State<_StaffLogins> {
  List<Map<String, dynamic>>? _rows;
  bool _busy = false;
  String? _error;
  String? _message;

  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  String _role = 'cashier';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final rows = await AdminApi.listStaff();
      if (mounted) {
        setState(() {
          _rows = rows;
          _error = null;
        });
      }
    } catch (e) {
      // Reported rather than swallowed: an empty list on a failed read makes a
      // broken query look exactly like "no staff yet", which is the worst
      // possible way for this screen to fail.
      if (mounted) {
        setState(() {
          _error = '$e';
          _rows = const [];
        });
      }
    }
  }

  Future<void> _create() async {
    setState(() {
      _busy = true;
      _error = null;
      _message = null;
    });
    try {
      final email = _email.text.trim();
      final result = await AdminApi.createStaff(
        email: email,
        password: _password.text,
        fullName: _name.text,
        role: _role,
      );
      if (mounted) {
        setState(() {
          _message = result == 'created'
              ? '$email can sign in now. Give them the password you just set.'
              : '$email already had an account, so it was given $_role access.';
        });
      }
      _name.clear();
      _email.clear();
      _password.clear();
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _revoke(String email) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Tokens.staffCard,
        title: Text(
          'Remove access for $email?',
          style: const TextStyle(color: Tokens.staffInk, fontSize: 18),
        ),
        content: Text(
          'They keep their account and their history, but can no longer sign '
          'in to the counter or the dashboard.',
          style: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.7)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(
              backgroundColor: Tokens.semanticCritical,
            ),
            child: const Text('Remove access'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    try {
      await AdminApi.revokeStaff(email);
      if (mounted) setState(() => _message = '$email no longer has access.');
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _resetPassword(String email) async {
    final controller = TextEditingController();
    final password = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Tokens.staffCard,
        title: Text(
          'New password for $email',
          style: const TextStyle(color: Tokens.staffInk, fontSize: 18),
        ),
        content: TextField(
          controller: controller,
          autofocus: true,
          style: const TextStyle(color: Tokens.staffInk),
          decoration: const InputDecoration(hintText: 'At least 6 characters'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text),
            style: FilledButton.styleFrom(
              backgroundColor: Tokens.staffAccent,
              foregroundColor: Tokens.staffCard,
            ),
            child: const Text('Set password'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (password == null || password.isEmpty) return;

    try {
      await AdminApi.setStaffPassword(email, password);
      if (mounted) setState(() => _message = 'New password set for $email.');
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;

    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionTitle(
            icon: Icons.group_outlined,
            title: 'Staff logins',
            subtitle:
                'Who can open the counter and this dashboard. A cashier sees '
                'the queue and takes payment; an owner sees everything.',
          ),
          const SizedBox(height: 14),

          _StaffField(controller: _name, label: 'Name'),
          _StaffField(controller: _email, label: 'Email'),
          _StaffField(controller: _password, label: 'Password', obscure: true),
          DropdownButtonFormField<String>(
            initialValue: _role,
            dropdownColor: Tokens.staffCard,
            style: const TextStyle(color: Tokens.staffInk, fontSize: 14),
            decoration: InputDecoration(
              labelText: 'Access',
              labelStyle: TextStyle(
                color: Tokens.staffInk.withValues(alpha: 0.6),
              ),
              filled: true,
              fillColor: Tokens.staffGround,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            items: const [
              DropdownMenuItem(value: 'cashier', child: Text('Cashier')),
              DropdownMenuItem(value: 'admin', child: Text('Owner')),
            ],
            onChanged: (v) => setState(() => _role = v ?? 'cashier'),
          ),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.icon(
              onPressed: _busy ? null : _create,
              icon: const Icon(Icons.person_add_alt, size: 16),
              label: const Text('Create login'),
              style: FilledButton.styleFrom(
                backgroundColor: Tokens.staffAccent,
                foregroundColor: Tokens.staffCard,
              ),
            ),
          ),

          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: _Note(text: _error!, tone: Tokens.semanticAlert),
            ),
          if (_message != null && _error == null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: _Note(text: _message!, tone: Tokens.semanticGood),
            ),

          const SizedBox(height: 14),
          if (rows == null)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (rows.isEmpty && _error == null)
            Text(
              'No staff logins yet. Create one above.',
              style: TextStyle(
                fontSize: 12,
                color: Tokens.staffInk.withValues(alpha: 0.5),
              ),
            )
          else
            for (final s in rows)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            (s['email'] as String?) ?? '',
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Tokens.staffInk),
                          ),
                          Text(
                            s['role'] == 'admin' ? 'Owner' : 'Cashier',
                            style: TextStyle(
                              fontSize: 11,
                              color: s['role'] == 'admin'
                                  ? Tokens.staffAccent
                                  : Tokens.staffInk.withValues(alpha: 0.5),
                            ),
                          ),
                        ],
                      ),
                    ),
                    TextButton(
                      onPressed: () => _resetPassword(s['email'] as String),
                      style: TextButton.styleFrom(
                        foregroundColor: Tokens.staffInk.withValues(alpha: 0.6),
                        textStyle: const TextStyle(fontSize: 11),
                        visualDensity: VisualDensity.compact,
                      ),
                      child: const Text('Reset password'),
                    ),
                    IconButton(
                      onPressed: () => _revoke(s['email'] as String),
                      icon: const Icon(Icons.person_remove_outlined, size: 17),
                      color: Tokens.semanticAlert,
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
              ),
        ],
      ),
    );
  }
}

class _StaffField extends StatelessWidget {
  const _StaffField({
    required this.controller,
    required this.label,
    this.obscure = false,
  });

  final TextEditingController controller;
  final String label;
  final bool obscure;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextField(
        controller: controller,
        obscureText: obscure,
        style: const TextStyle(color: Tokens.staffInk),
        decoration: InputDecoration(
          labelText: label,
          labelStyle: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.6)),
          filled: true,
          fillColor: Tokens.staffGround,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
    );
  }
}
