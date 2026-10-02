import 'package:flutter/material.dart';

import '../../errors.dart';
import '../../services/api.dart';
import '../../services/push.dart';
import '../../theme.dart';

/// Confirming a new account with the code from the email.
class ConfirmSignupScreen extends StatefulWidget {
  const ConfirmSignupScreen({super.key, required this.email});

  final String email;

  @override
  State<ConfirmSignupScreen> createState() => _ConfirmSignupScreenState();
}

class _ConfirmSignupScreenState extends State<ConfirmSignupScreen> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;
  String? _notice;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      await Api.verifySignupCode(widget.email, _code.text);

      // The code signs them in, so they arrive at the menu as themselves. The
      // device that agreed to notifications was recorded against the guest
      // they used to be, so it is moved across now.
      await Push.reregister();

      if (!mounted) return;
      // Everything between the storefront and here is finished with: the
      // signup form, and this. Back to the food.
      Navigator.of(context).popUntil((route) => route.isFirst);
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      await Api.resendSignupCode(widget.email);
      if (mounted) setState(() => _notice = 'Another code is on its way.');
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Palette.cream,
      appBar: AppBar(
        backgroundColor: Palette.cream,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
          children: [
            const Text(
              'Check your email',
              style: TextStyle(fontSize: 26, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              'We sent a six-digit code to ${widget.email}. Type it here and '
              'your account is ready.',
              style: TextStyle(
                height: 1.45,
                color: Palette.ink.withValues(alpha: 0.65),
              ),
            ),
            const SizedBox(height: 22),

            TextField(
              controller: _code,
              autofocus: true,
              keyboardType: TextInputType.number,
              maxLength: 6,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 26, letterSpacing: 10),
              decoration: const InputDecoration(
                hintText: '000000',
                counterText: '',
                border: OutlineInputBorder(),
              ),
            ),

            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: Palette.red)),
            ],
            if (_notice != null && _error == null) ...[
              const SizedBox(height: 10),
              Text(_notice!, style: const TextStyle(color: Palette.green)),
            ],

            const SizedBox(height: 14),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: Palette.ink,
                foregroundColor: Palette.cream,
                minimumSize: const Size.fromHeight(52),
                shape: const StadiumBorder(),
              ),
              onPressed: _busy ? null : _verify,
              child: Text(_busy ? 'Checking…' : 'Confirm my account'),
            ),
            TextButton(
              onPressed: _busy ? null : _resend,
              child: const Text('Send another code'),
            ),

            const SizedBox(height: 6),
            Text(
              'You can order without an account in the meantime — nothing here '
              'stops you buying lunch.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                height: 1.45,
                color: Palette.ink.withValues(alpha: 0.5),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
