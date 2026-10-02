import 'package:flutter/material.dart';

import '../../../errors.dart';
import '../../../tokens.dart';
import '../admin_api.dart';
import 'widgets.dart';

/// Creating and managing the logins staff sign in with.
///
/// Lived under Shop beside the address and the opening hours, which put the
/// one place accounts are made nowhere near the one place they are managed.
/// This is People's business.

/// Who can sign in to the counter and the dashboard.
///
/// The account is created through a guarded database function rather than by
/// writing to a table, so this screen never handles anybody's password beyond
/// passing it straight through, and cannot promote somebody by accident.
class StaffLogins extends StatefulWidget {
  const StaffLogins({super.key});

  @override
  State<StaffLogins> createState() => StaffLoginsState();
}

class StaffLoginsState extends State<StaffLogins> {
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
          _error = humanError(e);
          _rows = const [];
        });
      }
    }
  }

  Future<void> _create() async {
    // Required because the receipt prints it. "Served by" with a blank
    // after it is worse than not saying it at all, and the database refuses
    // this anyway — catching it here just saves a round trip.
    if (_name.text.trim().isEmpty) {
      setState(() => _error = 'A staff member needs a full name — it is printed on the receipt.');
      return;
    }

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
          const SectionTitle(
            icon: Icons.group_outlined,
            title: 'Staff logins',
            subtitle:
                'Who can open the counter and this dashboard. A cashier sees '
                'the queue and takes payment; an owner sees everything.',
          ),
          const SizedBox(height: 14),

          _StaffField(controller: _name, label: 'Full name (printed on receipts)'),
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
              child: AdminNote(text: _error!, tone: Tokens.semanticAlert),
            ),
          if (_message != null && _error == null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: AdminNote(text: _message!, tone: Tokens.semanticGood),
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
