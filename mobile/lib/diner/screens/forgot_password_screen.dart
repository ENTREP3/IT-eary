import 'package:flutter/material.dart';

import '../../errors.dart';
import '../../services/api.dart';
import '../../theme.dart';

/// Getting back into an account, by code rather than by link.
enum _Step { askEmail, askCode, askPassword, done }

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key, this.email});

  /// Carried over from the sign-in form, so nobody types it twice.
  final String? email;

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  late final _email = TextEditingController(text: widget.email ?? '');
  final _code = TextEditingController();
  final _password = TextEditingController();

  _Step _step = _Step.askEmail;
  bool _busy = false;
  String? _error;
  String? _problem;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final address = _email.text.trim();
    if (address.isEmpty) {
      setState(() => _error = 'Type your email address first.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await Api.sendPasswordCode(address);
    } catch (_) {
      // Swallowed on purpose. Saying "no such account" would turn this form
      // into a way of finding out who has one, which is worth more to somebody
      // guessing than it is to the person who mistyped.
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _step = _Step.askCode;
    });
  }

  Future<void> _verify() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await Api.verifyPasswordCode(_email.text, _code.text);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _step = _Step.askPassword;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = humanError(e, 'That code did not work. Check it and try again.');
      });
    }
  }

  Future<void> _save() async {
    final problem = await Api.passwordProblem(_password.text);
    if (problem != null) {
      if (mounted) setState(() => _problem = problem);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await Api.setNewPassword(_password.text);

      /*
       * Signed out again, deliberately.
       */
      await Api.signOut();

      if (!mounted) return;
      setState(() {
        _busy = false;
        _step = _Step.done;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = humanError(e, 'That password could not be saved.');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Forgot password')),
      body: PageBody(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            switch (_step) {
              _Step.askEmail => _askEmail(),
              _Step.askCode => _askCode(),
              _Step.askPassword => _askPassword(),
              _Step.done => _done(),
            },
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: Palette.red)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _askEmail() => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'What is your email?',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          Text(
            'We will send you a six-digit code.',
            style: TextStyle(color: Palette.ink.withValues(alpha: 0.65)),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _email,
            autofocus: true,
            keyboardType: TextInputType.emailAddress,
            decoration: _dec('Email'),
          ),
          const SizedBox(height: 16),
          _primary(_busy ? 'Sending…' : 'Send me a code', _busy ? null : _send),
        ],
      );

  Widget _askCode() => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Check your email',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          Text(
            'If there is an account for ${_email.text.trim()}, a six-digit code '
            'is on its way. It is good for a short while only.',
            style: TextStyle(
              height: 1.45,
              color: Palette.ink.withValues(alpha: 0.65),
            ),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _code,
            autofocus: true,
            keyboardType: TextInputType.number,
            maxLength: 6,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 26, letterSpacing: 10),
            decoration: _dec('000000').copyWith(counterText: ''),
          ),
          const SizedBox(height: 8),
          _primary(_busy ? 'Checking…' : 'Continue', _busy ? null : _verify),
          TextButton(
            onPressed: _busy ? null : _send,
            child: const Text('Send another code'),
          ),
        ],
      );

  Widget _askPassword() => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Choose a new password',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          Text(
            'The code signed you in, so there is no old password to type.',
            style: TextStyle(color: Palette.ink.withValues(alpha: 0.65)),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _password,
            autofocus: true,
            obscureText: true,
            onChanged: (_) {
              if (_problem != null) setState(() => _problem = null);
            },
            decoration: _dec('New password'),
          ),
          if (_problem != null) ...[
            const SizedBox(height: 8),
            // Phrased as the next thing to do. "Add a capital letter" gets
            // somebody to a working password; "too weak" leaves them guessing.
            Text(_problem!, style: const TextStyle(color: Palette.red)),
          ],
          const SizedBox(height: 16),
          _primary(_busy ? 'Saving…' : 'Save my new password',
              _busy ? null : _save),
        ],
      );

  Widget _done() => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.check_circle, size: 48, color: Palette.red),
          const SizedBox(height: 12),
          const Text(
            'Password changed',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          Text(
            'Sign in with it now, so you know it is the one you meant.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Palette.ink.withValues(alpha: 0.65)),
          ),
          const SizedBox(height: 20),
          _primary('Sign in', () => Navigator.of(context).pop(true)),
        ],
      );

  Widget _primary(String label, VoidCallback? onTap) => FilledButton(
        onPressed: onTap,
        style: FilledButton.styleFrom(
          backgroundColor: Palette.ink,
          foregroundColor: Palette.cream,
          minimumSize: const Size.fromHeight(52),
          shape: const StadiumBorder(),
        ),
        child: Text(label),
      );

  InputDecoration _dec(String label) => InputDecoration(
        labelText: label,
        filled: true,
        fillColor: Palette.card,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: Palette.ink.withValues(alpha: 0.15)),
        ),
      );
}
