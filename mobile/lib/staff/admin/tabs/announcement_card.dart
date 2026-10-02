import 'package:flutter/material.dart';

import '../../../errors.dart';
import '../../../models/models.dart';
import '../../../services/api.dart';
import '../../../tokens.dart';
import 'widgets.dart';

/// Saying one thing to every diner at once, from behind the counter.
class AnnouncementCard extends StatefulWidget {
  const AnnouncementCard({super.key});

  @override
  State<AnnouncementCard> createState() => _AnnouncementCardState();
}

/// How long it runs, in wording the owner thinks in.
const _units = <String, Duration>{
  'minutes': Duration(minutes: 1),
  'hours': Duration(hours: 1),
  'days': Duration(days: 1),
  'weeks': Duration(days: 7),
  'months': Duration(days: 30),
};

/// The longest one may run, so none of them becomes furniture.
const _maxRun = Duration(days: 180);

DateTime _endsAt(String unit, int amount) {
  if (unit == 'today') {
    final n = DateTime.now();
    return DateTime(n.year, n.month, n.day, 23, 59, 59);
  }
  final span = _units[unit]! * (amount < 1 ? 1 : amount);
  return DateTime.now().add(span > _maxRun ? _maxRun : span);
}

const _limit = 280;

class _AnnouncementCardState extends State<AnnouncementCard> {
  final _message = TextEditingController();

  List<Announcement> _rows = const [];
  String _tone = 'notice';
  String _audience = 'diners';
  bool _notify = false;
  String _unit = 'today';
  final _amount = TextEditingController(text: '2');
  bool _busy = false;
  String? _error;
  String? _saved;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final rows = await Api.allAnnouncements();
      if (mounted) setState(() => _rows = rows);
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    }
  }

  Future<void> _post() async {
    final text = _message.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
      _saved = null;
    });
    try {
      await Api.postAnnouncement(
        message: text,
        tone: _tone,
        audience: _audience,
        notify: _notify,
        endsAt: _endsAt(_unit, int.tryParse(_amount.text.trim()) ?? 1),
      );

      // Only once the row is safely in. A notification for an announcement
      // that failed to save would point at nothing.
      if (_notify) await Api.notifyAnnouncement(text, _audience);
      _message.clear();
      if (mounted) {
        setState(() {
          _tone = 'notice';
          _notify = false;
          _saved = 'Posted. Every customer screen has it now.';
        });
      }
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove(Announcement a) async {
    try {
      await Api.removeAnnouncement(a.id);
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.campaign_outlined,
                size: 17,
                color: Tokens.staffAccent,
              ),
              const SizedBox(width: 8),
              const Text(
                'Announcement',
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 15,
                  color: Tokens.staffInk,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Shows at the top of the menu for every customer, account or not. '
            'Use it for today. Every announcement ends by itself.',
            style: TextStyle(
              fontSize: 12,
              height: 1.45,
              color: Tokens.staffInk.withValues(alpha: 0.55),
            ),
          ),
          const SizedBox(height: 14),

          TextField(
            controller: _message,
            maxLines: 3,
            maxLength: _limit,
            style: const TextStyle(fontSize: 14, color: Tokens.staffInk),
            decoration: const InputDecoration(
              hintText:
                  'Sarado kami ngayong hapon, may brownout sa palengke. '
                  'Bukas po ulit 6AM.',
              border: OutlineInputBorder(),
              isDense: true,
            ),
            onChanged: (_) => setState(() {}),
          ),

          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _tone,
                  isDense: true,
                  decoration: const InputDecoration(
                    labelText: 'Kind',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: const [
                    DropdownMenuItem(value: 'notice', child: Text('Notice')),
                    DropdownMenuItem(
                      value: 'warning',
                      child: Text('Important'),
                    ),
                  ],
                  onChanged: (v) => setState(() => _tone = v ?? 'notice'),
                ),
              ),
              const SizedBox(width: 10),
              // A typed number beside the unit, so "two weeks" is possible
              // without a list that has to guess every span in advance.
              if (_unit != 'today')
                SizedBox(
                  width: 54,
                  child: TextField(
                    controller: _amount,
                    keyboardType: TextInputType.number,
                    textAlign: TextAlign.center,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(
                      labelText: 'For',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                ),
              if (_unit != 'today') const SizedBox(width: 8),
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _unit,
                  isDense: true,
                  decoration: const InputDecoration(
                    labelText: 'Show for',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: [
                    const DropdownMenuItem(
                      value: 'today',
                      child: Text('Rest of today'),
                    ),
                    ..._units.keys.map(
                      (k) => DropdownMenuItem(value: k, child: Text(k)),
                    ),
                  ],
                  onChanged: (v) => setState(() => _unit = v ?? 'today'),
                ),
              ),
            ],
          ),

          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _audience,
            isDense: true,
            decoration: const InputDecoration(
              labelText: 'Who sees it',
              border: OutlineInputBorder(),
              isDense: true,
            ),
            items: const [
              DropdownMenuItem(value: 'diners', child: Text('Customers')),
              DropdownMenuItem(value: 'staff', child: Text('Staff only')),
              DropdownMenuItem(value: 'both', child: Text('Everyone')),
            ],
            onChanged: (v) => setState(() => _audience = v ?? 'diners'),
          ),

          // Off by default, and the wording says why. A banner is cheap; a
          // buzz is not, and people notified about everything stop reading
          // any of it.
          CheckboxListTile(
            value: _notify,
            onChanged: (v) => setState(() => _notify = v ?? false),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
            dense: true,
            title: const Text('Also send a notification',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
            subtitle: Text(
              'Buzzes the phone of everyone who allowed notifications, even '
                  'with the app closed. Worth it for closing early. Not for '
                  "today's ulam.",
              style: TextStyle(
                fontSize: 11.5,
                height: 1.35,
                color: Tokens.staffInk.withValues(alpha: 0.55),
              ),
            ),
          ),

          Row(
            children: [
            ],
          ),

          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(
              _error!,
              style: const TextStyle(
                fontSize: 12,
                color: Tokens.semanticAlert,
              ),
            ),
          ],
          if (_saved != null && _error == null) ...[
            const SizedBox(height: 10),
            Text(
              _saved!,
              style: const TextStyle(fontSize: 12, color: Tokens.semanticGood),
            ),
          ],

          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _busy || _message.text.trim().isEmpty ? null : _post,
              child: _busy
                  ? const SizedBox(
                      height: 16,
                      width: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Post announcement'),
            ),
          ),

          if (_rows.isNotEmpty) ...[
            const SizedBox(height: 16),
            for (final a in _rows) _Row(item: a, onRemove: () => _remove(a)),
          ],
        ],
      ),
    );
  }
}

/// One past or present announcement.
///
/// Finished ones stay listed. A screen that hid them would give no way to tell
/// a message that ran its course from one that was never saved at all.
class _Row extends StatelessWidget {
  const _Row({required this.item, required this.onRemove});

  final Announcement item;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final live = item.endsAt.isAfter(DateTime.now());

    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 2),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: live
                    ? Tokens.semanticGood.withValues(alpha: 0.5)
                    : Tokens.staffInk.withValues(alpha: 0.2),
              ),
            ),
            child: Text(
              live ? 'Showing now' : 'Finished',
              style: TextStyle(
                fontSize: 10,
                color: live
                    ? Tokens.semanticGood
                    : Tokens.staffInk.withValues(alpha: 0.5),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              item.message,
              style: TextStyle(
                fontSize: 13,
                height: 1.4,
                color: Tokens.staffInk.withValues(alpha: live ? 1 : 0.5),
              ),
            ),
          ),
          IconButton(
            onPressed: onRemove,
            icon: const Icon(Icons.delete_outline, size: 17),
            color: Tokens.staffInk.withValues(alpha: 0.45),
            tooltip: live ? 'Take it down' : 'Delete',
          ),
        ],
      ),
    );
  }
}
