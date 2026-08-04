import 'package:flutter/material.dart';

import '../tokens.dart';
import 'staff_api.dart';

/// Which door the person came through. The web has separate `/cashier` and
/// `/admin` URLs; this is the mobile equivalent, so a cashier never lands on
/// a screen that even hints at the owner's side.
enum StaffArea {
  cashier(
    label: 'Counter',
    title: 'Cashier sign in',
    blurb: 'For taking payments at the counter.',
    icon: Icons.point_of_sale_outlined,
    allowed: {'cashier', 'admin'},
  ),
  admin(
    label: 'Owner',
    title: 'Owner sign in',
    blurb: 'Owner access only. Cashier accounts cannot sign in here.',
    icon: Icons.shield_outlined,
    allowed: {'admin'},
  );

  const StaffArea({
    required this.label,
    required this.title,
    required this.blurb,
    required this.icon,
    required this.allowed,
  });

  final String label;
  final String title;
  final String blurb;
  final IconData icon;

  /// Roles permitted through this door. The owner may work the counter — the
  /// same allowance the web `/cashier` route makes — but never the reverse.
  final Set<String> allowed;
}

/// Staff gate for the mobile app — the counterpart of the web `RequireRole`.
///
/// A non-staff account is signed straight back out, and so is a staff account
/// that picked the wrong door. Both are belt-and-braces: the database refuses
/// the same operations regardless of which screen asked.
class SignInScreen extends StatefulWidget {
  const SignInScreen({
    super.key,
    required this.area,
    required this.onSignedIn,
    this.onBack,
  });

  final StaffArea area;
  final void Function(String role) onSignedIn;
  final VoidCallback? onBack;

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final role = await StaffApi.signIn(_email.text, _password.text);
      if (!widget.area.allowed.contains(role)) {
        // Right credentials, wrong door. Don't leave them half signed-in.
        await StaffApi.signOut();
        throw Exception(
          'That is a $role account. Use the ${role == 'cashier' ? 'Counter' : 'Owner'} sign-in instead.',
        );
      }
      if (mounted) widget.onSignedIn(role);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e'.replaceFirst('Exception: ', '');
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final field = InputDecoration(
      filled: true,
      fillColor: Tokens.staffGround,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Tokens.staffInk.withValues(alpha: 0.15)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Tokens.staffInk.withValues(alpha: 0.15)),
      ),
      labelStyle: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.6)),
    );

    return Scaffold(
      backgroundColor: Tokens.staffGround,
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (widget.onBack != null)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: widget.onBack,
                      icon: const Icon(Icons.arrow_back, size: 15),
                      label: const Text('Back'),
                      style: TextButton.styleFrom(
                        foregroundColor: Tokens.staffInk.withValues(alpha: 0.6),
                        padding: EdgeInsets.zero,
                      ),
                    ),
                  ),
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: widget.area == StaffArea.admin
                        ? Tokens.staffAccent
                        : Tokens.semanticGcash,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(widget.area.icon,
                      color: Tokens.staffCard, size: 22),
                ),
                const SizedBox(height: 18),
                const Text(
                  'IT-eary',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: Tokens.staffInk,
                  ),
                ),
                Text(
                  widget.area.title,
                  style: const TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w600,
                    color: Tokens.staffInk,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  widget.area.blurb,
                  style: TextStyle(color: Tokens.staffInk.withValues(alpha: 0.6)),
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.username],
                  style: const TextStyle(color: Tokens.staffInk),
                  decoration: field.copyWith(labelText: 'Email'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _password,
                  obscureText: true,
                  autofillHints: const [AutofillHints.password],
                  style: const TextStyle(color: Tokens.staffInk),
                  decoration: field.copyWith(labelText: 'Password'),
                  onSubmitted: (_) => _submit(),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Tokens.semanticCritical.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      _error!,
                      style: const TextStyle(
                          color: Tokens.semanticAlert, fontSize: 13),
                    ),
                  ),
                ],
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  style: FilledButton.styleFrom(
                    backgroundColor: Tokens.staffAccent,
                    foregroundColor: Tokens.staffCard,
                    minimumSize: const Size.fromHeight(50),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Tokens.staffCard),
                        )
                      : const Text('Sign in',
                          style: TextStyle(fontWeight: FontWeight.w600)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
