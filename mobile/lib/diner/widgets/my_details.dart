import 'package:flutter/material.dart';

import '../../errors.dart';
import '../../models/models.dart';
import '../../services/api.dart';
import '../../theme.dart';

/// A diner's own details, and a way to fix them.
///
/// The same six fields signup collects, read and written through the same
/// database functions the website uses. Not a second implementation of the
/// rules: `save_my_profile` decides what a username may be and whether one is
/// taken, so the phone and the site cannot come to different conclusions.
///
/// Read through `my_profile()` rather than off the table, because the email
/// lives on `auth.users` where no client may look. It returns the caller's own
/// row and nobody else's — the function reads `auth.uid()` rather than taking
/// an id.
///
/// Saving goes through a function for a sharper reason: `profiles` also holds
/// `role`. Any policy wide enough to let somebody fix their own surname would
/// be wide enough to let them make themselves an owner, and no amount of care
/// in this file closes that.
class MyDetails extends StatefulWidget {
  const MyDetails({super.key});

  @override
  State<MyDetails> createState() => _MyDetailsState();
}

class _MyDetailsState extends State<MyDetails> {
  MyProfile? _profile;
  bool _editing = false;
  bool _busy = false;
  bool _saved = false;
  String? _error;

  final _firstName = TextEditingController();
  final _middleName = TextEditingController();
  final _lastName = TextEditingController();
  final _username = TextEditingController();
  final _nickname = TextEditingController();
  final _phone = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

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

  Future<void> _load() async {
    final p = await Api.myProfile();
    if (!mounted) return;
    setState(() {
      _profile = p;
      _firstName.text = p?.firstName ?? '';
      _middleName.text = p?.middleName ?? '';
      _lastName.text = p?.lastName ?? '';
      _username.text = p?.username ?? '';
      _nickname.text = p?.nickname ?? '';
      _phone.text = p?.phone ?? '';
    });
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await Api.saveMyProfile(
        NewAccount(
          firstName: _firstName.text,
          middleName: _middleName.text,
          lastName: _lastName.text,
          username: _username.text,
          nickname: _nickname.text,
          phone: _phone.text,
        ),
      );
      await _load();
      if (!mounted) return;
      setState(() {
        _editing = false;
        _saved = true;
      });
    } catch (e) {
      // The messages here are written for the diner — "That username is
      // taken", "A first name is needed" — so they pass through unchanged.
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _profile;
    if (p == null) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(top: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Palette.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Palette.ink.withValues(alpha: 0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Your details',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                ),
              ),
              if (!_editing)
                TextButton.icon(
                  onPressed: () => setState(() {
                    _editing = true;
                    _saved = false;
                  }),
                  icon: const Icon(Icons.edit_outlined, size: 15),
                  label: const Text('Edit'),
                ),
              if (_saved && !_editing)
                const Padding(
                  padding: EdgeInsets.only(left: 4),
                  child: Text(
                    'Saved',
                    style: TextStyle(color: Palette.green, fontSize: 12),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),

          if (!_editing) ...[
            _Line(
              label: 'Name',
              value: [
                p.firstName,
                p.middleName,
                p.lastName,
              ].where((v) => v != null && v.trim().isNotEmpty).join(' '),
            ),
            _Line(label: 'Username', value: p.username),
            _Line(label: 'Nickname', value: p.nickname),
            _Line(label: 'Email', value: p.email),
            _Line(label: 'Mobile', value: p.phone),
          ] else ...[
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _firstName,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(labelText: 'First name'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _lastName,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(labelText: 'Last name'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _middleName,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Middle name (optional)',
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _username,
              autocorrect: false,
              decoration: const InputDecoration(labelText: 'Username'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _nickname,
              decoration: const InputDecoration(
                labelText: 'Nickname (optional)',
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Mobile number (optional)',
              ),
            ),
            const SizedBox(height: 10),

            /* The email is deliberately not editable. Changing it means
               proving the new address is yours, which is a confirmation email
               and a different flow — a box that silently does not work would
               be worse than no box. */
            Text(
              'Your email stays ${p.email ?? ''}. Ask at the counter if you '
              'need it changed.',
              style: TextStyle(
                fontSize: 11.5,
                height: 1.4,
                color: Palette.ink.withValues(alpha: 0.55),
              ),
            ),

            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: Palette.red)),
            ],

            const SizedBox(height: 12),
            Row(
              children: [
                FilledButton(
                  onPressed: _busy ? null : _save,
                  child: _busy
                      ? const SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Save'),
                ),
                TextButton(
                  onPressed: _busy
                      ? null
                      : () {
                          setState(() {
                            _editing = false;
                            _error = null;
                          });
                          _load();
                        },
                  child: const Text('Cancel'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.label, required this.value});

  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    final shown = value?.trim();
    final missing = shown == null || shown.isEmpty;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 86,
            child: Text(
              label.toUpperCase(),
              style: TextStyle(
                fontSize: 10,
                letterSpacing: 1.1,
                color: Palette.ink.withValues(alpha: 0.5),
              ),
            ),
          ),
          Expanded(
            child: Text(
              missing ? 'Not set' : shown,
              style: TextStyle(
                fontSize: 13.5,
                color: Palette.ink.withValues(alpha: missing ? 0.4 : 1),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
