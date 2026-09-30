import 'package:flutter/material.dart';

import '../../../errors.dart';
import '../../../models/models.dart';
import '../../../tokens.dart';
import '../../confirm.dart';
import '../admin_api.dart';
import 'widgets.dart';

/// Everyone with an account, and what the owner can do about them.
///
/// The same screen the website has, reading the same functions. Not a second
/// set of rules: suspending, banning, promoting and deleting are all refused
/// in the database for anybody who is not the owner, and refused again for the
/// three things nobody may do — act on your own account, remove the last
/// owner, or leave the shop with nobody who can administer it.
///
/// Buttons that would be refused are hidden, but hiding a button is a courtesy
/// rather than a rule, and the rule lives where it cannot be tapped around.
///
/// ---------------------------------------------------------------------------
/// Guests are not here, and staff have no figures
///
/// Anonymous diners are left out by the database. An account is something you
/// manage, and an anonymous row has no email, no password and no name; banning
/// it achieves nothing because the next visit mints another. Their orders are
/// still in the takings.
///
/// Orders and spend are null for staff rather than zero, because create_ticket
/// deliberately leaves a signed-in staff member's orders unattributed. Zero
/// would read as a fact about that person rather than a column that does not
/// apply to them.
class PeopleTab extends StatefulWidget {
  const PeopleTab({super.key});

  @override
  State<PeopleTab> createState() => _PeopleTabState();
}

const _groups = <String, String>{
  'all': 'Everyone',
  'admin': 'Owners',
  'cashier': 'Cashiers',
  'customer': 'Customers',
};

class _PeopleTabState extends State<PeopleTab> {
  List<Person> _people = const [];
  Map<String, int> _counts = const {};
  String _group = 'all';
  String _query = '';
  bool _loading = true;
  String? _busy;
  String? _error;
  String? _me;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final people = await AdminApi.people();
      final counts = await AdminApi.peopleCounts();
      if (!mounted) return;
      setState(() {
        _people = people;
        _counts = counts;
        _me = AdminApi.currentUserId;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = humanError(e);
          _loading = false;
        });
      }
    }
  }

  /// Runs one management call and reloads, saying whatever the database said.
  Future<void> _act(String id, Future<void> Function() run, String said) async {
    setState(() {
      _busy = id;
      _error = null;
    });
    try {
      await run();
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(said)));
      }
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  List<Person> get _shown {
    final q = _query.trim().toLowerCase();
    return _people.where((p) {
      if (_group != 'all' && p.role != _group) return false;
      if (q.isEmpty) return true;
      return [
        p.displayName,
        p.username,
        p.fullName,
        p.email,
        p.phone,
      ].any((v) => (v ?? '').toLowerCase().contains(q));
    }).toList();
  }

  int _total(String key) => key == 'all'
      ? _counts.values.fold(0, (a, b) => a + b)
      : (_counts[key] ?? 0);

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(_error!, style: const TextStyle(color: Tokens.semanticAlert)),
          ),

        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: _groups.entries.map((g) {
              final on = _group == g.key;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  selected: on,
                  onSelected: (_) => setState(() => _group = g.key),
                  label: Text('${g.value}  ${_total(g.key)}'),
                ),
              );
            }).toList(),
          ),
        ),

        const SizedBox(height: 10),
        TextField(
          onChanged: (v) => setState(() => _query = v),
          decoration: const InputDecoration(
            isDense: true,
            prefixIcon: Icon(Icons.search, size: 18),
            hintText: 'Name, username, email',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),

        if (_shown.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 40),
            child: Text(
              _query.isEmpty ? 'Nobody here yet.' : 'Nobody matches that.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.5)),
            ),
          )
        else
          for (final p in _shown)
            _PersonCard(
              person: p,
              isMe: p.id == _me,
              busy: _busy == p.id,
              owners: _counts['admin'] ?? 0,
              act: _act,
              onEdited: _load,
            ),

        const SizedBox(height: 12),
        Text(
          'Only accounts appear here. Diners who ordered without signing up are '
          'counted in your sales but are not listed, because there is nothing '
          'to manage about them. Deleting an account keeps its past orders in '
          'your takings as guest orders.',
          style: TextStyle(
            fontSize: 11.5,
            height: 1.45,
            color: Tokens.staffInk.withValues(alpha: 0.45),
          ),
        ),
      ],
    );
  }
}

class _PersonCard extends StatefulWidget {
  const _PersonCard({
    required this.person,
    required this.isMe,
    required this.busy,
    required this.owners,
    required this.act,
    required this.onEdited,
  });

  final Person person;
  final bool isMe;
  final bool busy;
  final int owners;
  final Future<void> Function(String id, Future<void> Function() run, String said) act;
  final Future<void> Function() onEdited;

  @override
  State<_PersonCard> createState() => _PersonCardState();
}

class _PersonCardState extends State<_PersonCard> {
  bool _open = false;
  bool _editing = false;

  late final _firstName = TextEditingController(text: widget.person.firstName ?? '');
  late final _middleName = TextEditingController(text: widget.person.middleName ?? '');
  late final _lastName = TextEditingController(text: widget.person.lastName ?? '');
  late final _username = TextEditingController(text: widget.person.username ?? '');
  late final _nickname = TextEditingController(text: widget.person.nickname ?? '');
  late final _phone = TextEditingController(text: widget.person.phone ?? '');

  @override
  void dispose() {
    _firstName.dispose();
    _middleName.dispose();
    _lastName.dispose();
    _username.dispose();
    _nickname.dispose();
    _phone.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.person;

    // Hidden for what the database would refuse anyway, so nobody is offered a
    // button that only produces an error.
    final lastOwner = p.role == 'admin' && widget.owners <= 1;
    final canManage = !widget.isMe && !lastOwner;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AdminCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 6,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            p.displayName,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          if (p.role != 'customer') _Tag(role: p.role),
                          if (p.isSuspended)
                            _Chip(
                              text: p.isBanned
                                  ? 'banned'
                                  : 'until ${p.bannedUntil!.day}/${p.bannedUntil!.month}',
                              colour: p.isBanned
                                  ? Tokens.semanticAlert
                                  : Tokens.staffAccent,
                            ),
                          if (widget.isMe)
                            Text(
                              'you',
                              style: TextStyle(
                                fontSize: 10,
                                color: Tokens.staffInk.withValues(alpha: 0.45),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        p.email ?? '—',
                        style: TextStyle(
                          fontSize: 12,
                          color: Tokens.staffInk.withValues(alpha: 0.55),
                        ),
                      ),
                      // Null for staff, and a dash says "does not apply" where
                      // a zero would claim they have never ordered.
                      if (p.orders != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            '${p.orders} orders · '
                            '₱${(p.spent ?? 0).toStringAsFixed(2)}',
                            style: TextStyle(
                              fontSize: 12,
                              color: Tokens.staffInk.withValues(alpha: 0.55),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                if (widget.busy)
                  const SizedBox(
                    height: 16,
                    width: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else ...[
                  IconButton(
                    onPressed: () => setState(() {
                      _editing = !_editing;
                      _open = false;
                    }),
                    icon: const Icon(Icons.edit_outlined, size: 17),
                    tooltip: 'Edit details',
                  ),
                  if (canManage)
                    IconButton(
                      onPressed: () => setState(() {
                        _open = !_open;
                        _editing = false;
                      }),
                      icon: const Icon(Icons.more_horiz, size: 19),
                      tooltip: 'Manage',
                    ),
                ],
              ],
            ),

            if (_editing) _editor(p),
            if (_open && canManage) _actions(p),
          ],
        ),
      ),
    );
  }

  Widget _editor(Person p) => Padding(
    padding: const EdgeInsets.only(top: 10),
    child: Column(
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _firstName,
                decoration: const InputDecoration(
                  labelText: 'First name',
                  isDense: true,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _lastName,
                decoration: const InputDecoration(
                  labelText: 'Last name',
                  isDense: true,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _middleName,
          decoration: const InputDecoration(
            labelText: 'Middle name',
            isDense: true,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _username,
          decoration: const InputDecoration(
            labelText: 'Username',
            isDense: true,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _nickname,
          decoration: const InputDecoration(
            labelText: 'Nickname',
            isDense: true,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(
            labelText: 'Mobile number',
            isDense: true,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            FilledButton(
              onPressed: () async {
                await widget.act(
                  p.id,
                  () => AdminApi.savePersonProfile(
                    p.id,
                    NewAccount(
                      firstName: _firstName.text,
                      middleName: _middleName.text,
                      lastName: _lastName.text,
                      username: _username.text,
                      nickname: _nickname.text,
                      phone: _phone.text,
                    ),
                  ),
                  'Details saved.',
                );
                if (mounted) setState(() => _editing = false);
              },
              child: const Text('Save details'),
            ),
            TextButton(
              onPressed: () => setState(() => _editing = false),
              child: const Text('Cancel'),
            ),
          ],
        ),
        // Changing an email means proving the new address belongs to somebody,
        // which is a confirmation flow rather than a text box.
        Text(
          'Email is changed by the person themselves, not here.',
          style: TextStyle(
            fontSize: 11,
            color: Tokens.staffInk.withValues(alpha: 0.45),
          ),
        ),
      ],
    ),
  );

  Widget _actions(Person p) => Padding(
    padding: const EdgeInsets.only(top: 10),
    child: Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        if (p.isSuspended)
          OutlinedButton(
            onPressed: () {
              setState(() => _open = false);
              widget.act(
                p.id,
                () => AdminApi.restorePerson(p.id),
                '${p.displayName} can sign in again.',
              );
            },
            child: const Text('Let them back in'),
          )
        else ...[
          OutlinedButton(
            onPressed: () {
              setState(() => _open = false);
              widget.act(
                p.id,
                () => AdminApi.suspendPerson(p.id, 7),
                '${p.displayName} is suspended for a week.',
              );
            },
            child: const Text('Suspend 7 days'),
          ),
          OutlinedButton(
            onPressed: () {
              setState(() => _open = false);
              widget.act(
                p.id,
                () => AdminApi.suspendPerson(p.id, 30),
                '${p.displayName} is suspended for a month.',
              );
            },
            child: const Text('Suspend 30 days'),
          ),
          OutlinedButton(
            style: OutlinedButton.styleFrom(
              foregroundColor: Tokens.semanticAlert,
            ),
            onPressed: () async {
              setState(() => _open = false);
              final sure = await confirmAction(
                context,
                title: 'Ban ${p.displayName}?',
                body: 'They cannot sign in again until you let them back in. '
                    'Their orders and history stay.',
                action: 'Ban',
              );
              if (!sure) return;
              widget.act(
                p.id,
                () => AdminApi.banPerson(p.id),
                '${p.displayName} is banned.',
              );
            },
            child: const Text('Ban'),
          ),
        ],

        if (p.role != 'admin')
          OutlinedButton(
            onPressed: () async {
              setState(() => _open = false);
              final sure = await confirmAction(
                context,
                title: 'Make ${p.displayName} an owner?',
                body: 'They will be able to see every figure, change prices, '
                    'and manage people — including you.',
                action: 'Make owner',
                danger: false,
              );
              if (!sure) return;
              widget.act(
                p.id,
                () => AdminApi.setPersonRole(p.id, 'admin'),
                '${p.displayName} is an owner.',
              );
            },
            child: const Text('Make owner'),
          ),
        if (p.role != 'cashier')
          OutlinedButton(
            onPressed: () {
              setState(() => _open = false);
              widget.act(
                p.id,
                () => AdminApi.setPersonRole(p.id, 'cashier'),
                '${p.displayName} is a cashier.',
              );
            },
            child: const Text('Make cashier'),
          ),
        if (p.role != 'customer')
          OutlinedButton(
            onPressed: () async {
              setState(() => _open = false);
              final sure = await confirmAction(
                context,
                title: "Remove ${p.displayName}'s staff access?",
                body: 'They keep their account and can still order as a '
                    'customer.',
                action: 'Remove access',
              );
              if (!sure) return;
              widget.act(
                p.id,
                () => AdminApi.setPersonRole(p.id, 'customer'),
                '${p.displayName} is a customer now.',
              );
            },
            child: const Text('Remove staff access'),
          ),

        OutlinedButton(
          style: OutlinedButton.styleFrom(
            foregroundColor: Tokens.semanticAlert,
          ),
          onPressed: () async {
            setState(() => _open = false);
            final sure = await confirmAction(
              context,
              title: "Delete ${p.displayName}'s account?",
              body: 'This cannot be undone. Their favourites, loyalty and '
                  'saved devices go for good. Their past orders stay in your '
                  'sales as guest orders, so your takings do not change.',
              action: 'Delete account',
            );
            if (!sure) return;
            widget.act(
              p.id,
              () => AdminApi.deletePerson(p.id),
              "${p.displayName}'s account is deleted.",
            );
          },
          child: const Text('Delete account'),
        ),
      ],
    ),
  );
}

class _Tag extends StatelessWidget {
  const _Tag({required this.role});
  final String role;

  @override
  Widget build(BuildContext context) => _Chip(
    text: role == 'admin' ? 'owner' : 'cashier',
    colour: role == 'admin' ? Tokens.staffAccent : Tokens.semanticGood,
  );
}

class _Chip extends StatelessWidget {
  const _Chip({required this.text, required this.colour});
  final String text;
  final Color colour;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: colour.withValues(alpha: 0.5)),
    ),
    child: Text(text, style: TextStyle(fontSize: 10, color: colour)),
  );
}
