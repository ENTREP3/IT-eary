import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../services/api.dart';
import '../../theme.dart';
import 'ticket_screen.dart';

/// An optional account, and everything it makes possible.
///
/// Ordering without one still works exactly as before, and always will. What
/// signing in adds is memory across visits: orders that survive a new phone, a
/// live view of whether the food is preparing or ready, and loyalty.
///
/// The live view is the point. Without it a diner has to stand at the counter
/// watching, which is precisely the crowding this system exists to reduce.
class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My orders')),
      body: PageBody(
        // Rebuilds the moment the diner signs in or out, so neither branch has
        // to remember to tell the other.
        child: StreamBuilder(
          stream: Api.authChanges,
          builder: (context, _) =>
              Api.signedIn ? const _SignedIn() : const _SignedOut(),
        ),
      ),
    );
  }
}

/* -------------------------------------------------------------- signed out */

class _SignedOut extends StatefulWidget {
  const _SignedOut();

  @override
  State<_SignedOut> createState() => _SignedOutState();
}

class _SignedOutState extends State<_SignedOut> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _creating = false;
  bool _busy = false;
  String? _error;
  String? _notice;

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
      _notice = null;
    });
    try {
      if (_creating) {
        final ready = await Api.signUp(_email.text, _password.text);
        if (!ready && mounted) {
          setState(() => _notice = 'Check your email to confirm the account, then sign in.');
        }
      } else {
        await Api.signIn(_email.text, _password.text);
      }
    } catch (e) {
      // Supabase messages are already diner-readable ("Invalid login
      // credentials"), and rewriting them tends to lose the useful ones.
      if (mounted) setState(() => _error = '$e'.replaceFirst('AuthApiException: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
      children: [
        Text(
          _creating ? 'Make an account' : 'Sign in',
          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        Text(
          'Keep your order history, watch your food go from preparing to ready, '
          'and collect a reward every fifth order.',
          style: TextStyle(height: 1.5, color: Palette.ink.withValues(alpha: 0.7)),
        ),
        const SizedBox(height: 22),

        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          decoration: const InputDecoration(labelText: 'Email'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _password,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Password'),
        ),

        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: const TextStyle(color: Palette.red)),
        ],
        if (_notice != null) ...[
          const SizedBox(height: 12),
          Text(_notice!, style: const TextStyle(color: Palette.green)),
        ],

        const SizedBox(height: 18),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: Palette.ink,
            foregroundColor: Palette.cream,
            minimumSize: const Size.fromHeight(52),
            shape: const StadiumBorder(),
          ),
          onPressed: _busy ? null : _submit,
          child: _busy
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Palette.cream),
                )
              : Text(_creating ? 'Create account' : 'Sign in'),
        ),
        TextButton(
          onPressed: _busy ? null : () => setState(() => _creating = !_creating),
          child: Text(
            _creating ? 'I already have an account' : 'I am new here',
          ),
        ),

        const SizedBox(height: 8),
        Text(
          'You never have to. Ordering as a guest works exactly the same at the '
          'counter, and always will.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: Palette.ink.withValues(alpha: 0.5)),
        ),
      ],
    );
  }
}

/* --------------------------------------------------------------- signed in */

class _SignedIn extends StatefulWidget {
  const _SignedIn();

  @override
  State<_SignedIn> createState() => _SignedInState();
}

class _SignedInState extends State<_SignedIn> {
  Loyalty? _loyalty;
  List<Promo> _promos = const [];

  @override
  void initState() {
    super.initState();
    Api.loyalty().then((l) {
      if (mounted) setState(() => _loyalty = l);
    });
    Api.activePromos().then((p) {
      if (mounted) setState(() => _promos = p);
    });
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<Ticket>>(
      stream: Api.watchMyOrders(),
      builder: (context, snap) {
        final orders = (snap.data ?? const <Ticket>[]).reversed.toList();

        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    Api.currentUser?.email ?? '',
                    style: TextStyle(color: Palette.ink.withValues(alpha: 0.6)),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                TextButton.icon(
                  onPressed: () => Api.signOut(),
                  icon: const Icon(Icons.logout, size: 16),
                  label: const Text('Sign out'),
                ),
              ],
            ),

            if (_loyalty != null) ...[
              const SizedBox(height: 8),
              _LoyaltyCard(loyalty: _loyalty!),
            ],

            if (_promos.isNotEmpty) ...[
              const SizedBox(height: 12),
              _PromoCard(promos: _promos),
            ],

            const SizedBox(height: 22),
            const Text(
              'Your orders',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 10),

            if (snap.connectionState == ConnectionState.waiting)
              const Center(child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(color: Palette.red),
              ))
            else if (orders.isEmpty)
              Text(
                'Nothing yet. Your orders will appear here, and you can watch '
                'them go from preparing to ready.',
                style: TextStyle(height: 1.5, color: Palette.ink.withValues(alpha: 0.6)),
              )
            else
              ...orders.map((t) => _OrderCard(ticket: t)),
          ],
        );
      },
    );
  }
}

class _LoyaltyCard extends StatelessWidget {
  const _LoyaltyCard({required this.loyalty});

  final Loyalty loyalty;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Palette.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Palette.ink.withValues(alpha: 0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.card_giftcard, size: 16, color: Palette.red),
              const SizedBox(width: 8),
              const Text('Loyalty', style: TextStyle(fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: List.generate(5, (i) {
              final filled = i < loyalty.stamps;
              return Container(
                margin: const EdgeInsets.only(right: 8),
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: filled ? Palette.red : Colors.transparent,
                  border: Border.all(
                    color: filled ? Palette.red : Palette.ink.withValues(alpha: 0.2),
                  ),
                ),
                child: Icon(
                  Icons.check,
                  size: 16,
                  color: filled ? Colors.white : Palette.ink.withValues(alpha: 0.25),
                ),
              );
            }),
          ),
          const SizedBox(height: 10),
          Text(
            loyalty.completed == 0
                ? 'No completed orders yet. Five earns 20 pesos off.'
                : '${loyalty.completed} completed. ${loyalty.untilNext} more and you earn 20 pesos off.',
            style: TextStyle(fontSize: 12, color: Palette.ink.withValues(alpha: 0.65)),
          ),
        ],
      ),
    );
  }
}

class _PromoCard extends StatelessWidget {
  const _PromoCard({required this.promos});

  final List<Promo> promos;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Palette.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Palette.ink.withValues(alpha: 0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: const [
              Icon(Icons.local_offer_outlined, size: 16, color: Palette.red),
              SizedBox(width: 8),
              Text('Running now', style: TextStyle(fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 10),
          ...promos.map(
            (p) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: Palette.ink,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      p.code,
                      style: const TextStyle(
                        color: Palette.cream,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      p.label,
                      style: TextStyle(
                        fontSize: 12,
                        color: Palette.ink.withValues(alpha: 0.7),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One past or current order, with where it has got to.
class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.ticket});

  final Ticket ticket;

  /// The kitchen flow as the diner experiences it. Cancelled is deliberately
  /// absent: it is an end state, not a step along the way.
  static const _flow = ['pending', 'preparing', 'ready', 'completed'];

  static const _labels = {
    'pending': 'Waiting',
    'preparing': 'Preparing',
    'ready': 'Ready for pickup',
    'completed': 'Collected',
    'cancelled': 'Cancelled',
  };

  @override
  Widget build(BuildContext context) {
    final step = _flow.indexOf(ticket.status);
    final cancelled = ticket.status == 'cancelled';

    return InkWell(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => TicketScreen(ticket: ticket)),
      ),
      borderRadius: BorderRadius.circular(18),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Palette.card,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Palette.ink.withValues(alpha: 0.1)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  ticket.ticketCode,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    letterSpacing: 2,
                  ),
                ),
                const Spacer(),
                Text(
                  '₱${ticket.total.toStringAsFixed(2)}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              ticket.items.map((i) => '${i.qty}x ${i.name}').join(', '),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: Palette.ink.withValues(alpha: 0.6)),
            ),
            const SizedBox(height: 12),

            if (cancelled)
              Text(
                _labels['cancelled']!,
                style: const TextStyle(color: Palette.red, fontWeight: FontWeight.w600),
              )
            else ...[
              // A bar rather than words alone, so progress is readable at a
              // glance from across the room while waiting.
              Row(
                children: List.generate(_flow.length, (i) {
                  final done = i <= step;
                  return Expanded(
                    child: Container(
                      height: 4,
                      margin: EdgeInsets.only(right: i == _flow.length - 1 ? 0 : 4),
                      decoration: BoxDecoration(
                        color: done ? Palette.green : Palette.ink.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(
                    ticket.status == 'ready' ? Icons.notifications_active : Icons.schedule,
                    size: 14,
                    color: ticket.status == 'ready' ? Palette.green : Palette.ink.withValues(alpha: 0.5),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _labels[ticket.status] ?? ticket.status,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: ticket.status == 'ready' ? FontWeight.w700 : FontWeight.w500,
                      color: ticket.status == 'ready'
                          ? Palette.green
                          : Palette.ink.withValues(alpha: 0.7),
                    ),
                  ),
                ],
              ),

              // Asked once the food has actually been collected, which is the
              // only moment the diner can honestly answer. Prompting earlier
              // asks somebody to rate a meal they have not eaten, and prompting
              // never is why a menu shows no ratings at all.
              if (ticket.status == 'completed')
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Row(
                    children: [
                      const Icon(Icons.star_outline_rounded, size: 15, color: Palette.gold),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'How was it? Tap to rate.',
                          style: TextStyle(
                            fontSize: 12,
                            color: Palette.ink.withValues(alpha: 0.7),
                          ),
                        ),
                      ),
                      const Icon(Icons.chevron_right, size: 16),
                    ],
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}
