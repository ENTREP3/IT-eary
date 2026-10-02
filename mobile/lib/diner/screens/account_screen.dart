import 'dart:async';
import '../../errors.dart';

import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../services/api.dart';
import '../../theme.dart';
import '../../tokens.dart';
import 'ticket_screen.dart';
import '../../services/push.dart';
import '../widgets/my_details.dart';
import '../../notify_toggle.dart';
import 'confirm_signup_screen.dart';
import 'forgot_password_screen.dart';

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

  // Only used while making an account. The same six the website collects,
  // because both end up in the same columns through the same function.
  final _firstName = TextEditingController();
  final _middleName = TextEditingController();
  final _lastName = TextEditingController();
  final _nickname = TextEditingController();
  final _phone = TextEditingController();

  bool _creating = false;
  bool _busy = false;
  String? _error;
  String? _notice;
  /// Checked when the field loses focus rather than at submit: filling in six
  /// boxes and then being told the one at the top is wrong is a form that
  /// wasted somebody's time on purpose.

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _firstName.dispose();
    _middleName.dispose();
    _lastName.dispose();
    _nickname.dispose();
    _phone.dispose();
    super.dispose();
  }

  NewAccount get _details => NewAccount(
    firstName: _firstName.text,
    middleName: _middleName.text,
    lastName: _lastName.text,
    nickname: _nickname.text,
    phone: _phone.text,
  );

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      if (_creating) {
        /*
         * The shop's own rule, asked for before Supabase is.
         *
         * signUp() goes straight to Supabase Auth, which applies whatever
         * policy the project has rather than ours — so an account could be
         * made with a password the reset screen would later refuse, leaving
         * somebody unable to choose the password they already had.
         *
         * Asked of the database rather than copied, so there is one rule.
         */
        final problem = await Api.passwordProblem(_password.text);
        if (problem != null) {
          if (mounted) {
            setState(() {
              _error = problem;
              _busy = false;
            });
          }
          return;
        }

        final ready = await Api.signUp(
          _email.text,
          _password.text,
          details: _details,
        );
        if (!ready && mounted) {
          /*
           * Straight to the code, not to a dialog saying "check your
           * email".
           *
           * The confirmation link in that email opens a browser, which
           * on a phone means leaving the app they just signed up in. The
           * same email carries a six-digit code; typing it here finishes
           * the account without going anywhere.
           */
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => ConfirmSignupScreen(email: _email.text.trim()),
            ),
          );
          if (!mounted) return;

          // Reached only when the code screen was backed out of without
          // confirming. The account exists but cannot be signed into yet,
          // so the sign-in form is the honest place to leave them — with
          // the password cleared, because the one they chose does not work
          // until the code is typed and a filled field invites trying it.
          setState(() {
            _creating = false;
            _password.clear();
            _notice = 'Type the code from your email to finish the account.';
          });
        }
      } else {
        await Api.signIn(_email.text, _password.text);

        // The device that agreed to be notified was recorded against whoever
        // was signed in at the time — for most diners, the guest they were
        // before making an account. Left alone, somebody who opted in as a
        // guest is silently unreachable afterwards. Raises no prompt.
        unawaited(Push.reregister());

        /*
         * Back to where they came from, which is the menu.
         *
         * Somebody signing in is not here to look at their own account —
         * they came to order, and signing in was the obstacle. Leaving them
         * on this screen makes them find their own way back to the food.
         *
         * Popping rather than pushing the menu, so the history does not grow
         * a second copy of a screen that is already underneath this one.
         */
        if (mounted && Navigator.of(context).canPop()) {
          Navigator.of(context).pop();
        }
      }
    } catch (e) {
      // Supabase messages are already diner-readable ("Invalid login
      // credentials"), and rewriting them tends to lose the useful ones.
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
      children: [
        // Above the sign-in, not below it.
        //
        // A guest opening this screen is usually not here to make an account —
        // they are here because they ordered, closed the app, and want to know
        // whether the food is ready. Making them scroll past a signup form to
        // find that out would be answering a question nobody asked.
        const _GuestOrders(),

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

        // Making an account asks for more than signing in does, which is the
        // point: a form identical to the sign-in form gives no sign it is
        // creating anything.
        if (_creating) ...[
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
          const SizedBox(height: 12),
          TextField(
            controller: _middleName,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Middle name (optional)',
            ),
          ),
          const SizedBox(height: 12),
          const SizedBox(height: 12),
          TextField(
            controller: _nickname,
            decoration: const InputDecoration(
              labelText: 'Nickname (optional)',
              helperText: 'Used to greet you, if you would rather we did.',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Mobile number (optional)',
            ),
          ),
          const SizedBox(height: 12),
        ],

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
          onPressed: _busy
              ? null
              : () => setState(() {
                    _creating = !_creating;
                    // A notice about the form they just left does not apply
                    // to the one they just opened.
                    _error = null;
                    _notice = null;
                  }),
          child: Text(
            _creating ? 'I already have an account' : 'I am new here',
          ),
        ),

        // Only while signing in. Offering it on the signup form would be
        // asking somebody to recover an account they are in the middle of
        // creating.
        if (!_creating)
          TextButton(
            onPressed: _busy
                ? null
                : () async {
                    final changed = await Navigator.of(context).push<bool>(
                      MaterialPageRoute(
                        builder: (_) => ForgotPasswordScreen(
                          // Carried over so nobody types it twice.
                          email: _email.text.trim(),
                        ),
                      ),
                    );
                    if (changed == true && mounted) {
                      setState(() => _notice =
                          'Password changed. You are signed in.');
                    }
                  },
            child: const Text('Forgot my password'),
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

  /// Who this is, for the greeting. Null until it arrives, which is why the
  /// heading falls back to a plain "Welcome back" rather than a blank.
  MyProfile? _me;

  @override
  void initState() {
    super.initState();
    Api.loyalty().then((l) {
      if (mounted) setState(() => _loyalty = l);
    });
    Api.activePromos().then((p) {
      if (mounted) setState(() => _promos = p);
    });
    Api.myProfile().then((p) {
      if (mounted) setState(() => _me = p);
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
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Greeted by name, the same rule the database and the
                      // website use: nickname, then first name.
                      Text(
                        _me == null
                            ? 'Welcome back'
                            : 'Welcome back, ${_me!.displayName}',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        Api.currentUser?.email ?? '',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: Palette.ink.withValues(alpha: 0.6),
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                TextButton.icon(
                  onPressed: () => Api.signOut(),
                  icon: const Icon(Icons.logout, size: 16),
                  label: const Text('Sign out'),
                ),
              ],
            ),

            const MyDetails(),

            if (_loyalty != null) ...[
              const SizedBox(height: 8),
              _LoyaltyCard(loyalty: _loyalty!),
            ],

            if (_promos.isNotEmpty) ...[
              const SizedBox(height: 12),
              _PromoCard(promos: _promos),
            ],

            // Above the order list, where somebody is already thinking about
            // a ticket they are waiting on. Offered here rather than raised on
            // arrival: Android will not ask twice, so a refusal by reflex
            // costs the shop that customer for good.
            const NotifyToggle.diner(),

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

/// The loyalty card, and the one button that spends it.
///
/// It used to be read-only here: a diner could watch the stamps fill on their
/// phone and then had to find a laptop to actually claim the reward, which is
/// the wrong way round for the device they ordered on.
class _LoyaltyCard extends StatefulWidget {
  const _LoyaltyCard({required this.loyalty});

  final Loyalty loyalty;

  @override
  State<_LoyaltyCard> createState() => _LoyaltyCardState();
}

class _LoyaltyCardState extends State<_LoyaltyCard> {
  bool _claiming = false;
  String? _error;

  Loyalty get loyalty => widget.loyalty;

  /// Rewards earned so far, refreshed after a claim so a new code joins the
  /// list rather than living only in this widget.
  late List<LoyaltyReward> _rewards = loyalty.rewards;

  bool get _earned => loyalty.completed ~/ 5 > _rewards.length;

  Future<void> _claim() async {
    setState(() {
      _claiming = true;
      _error = null;
    });
    try {
      final code = await Api.claimLoyaltyReward();
      final fresh = await Api.loyalty();
      if (!mounted) return;
      setState(() {
        if (fresh != null) _rewards = fresh.rewards;
        _claiming = false;
        if (code == null) _error = 'There is nothing to claim yet.';
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = humanError(e);
          _claiming = false;
        });
      }
    }
  }

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

          if (_earned) ...[
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _claiming ? null : _claim,
              style: FilledButton.styleFrom(
                backgroundColor: Palette.red,
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(46),
                shape: const StadiumBorder(),
              ),
              child: Text(_claiming ? 'Claiming…' : 'Claim 20 pesos off'),
            ),
          ],

          // Every reward earned, not just the one claimed a moment ago. The
          // code is the whole point: it is what gets typed at checkout.
          if (_rewards.isNotEmpty) ...[
            const SizedBox(height: 14),
            Divider(color: Palette.ink.withValues(alpha: 0.1)),
            const SizedBox(height: 8),
            Text('YOUR REWARDS',
                style: TextStyle(
                    fontSize: 10,
                    letterSpacing: 2,
                    color: Palette.ink.withValues(alpha: 0.55))),
            const SizedBox(height: 8),
            for (final r in _rewards)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(children: [
                  Expanded(
                    child: SelectableText(
                      r.code,
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 15,
                        letterSpacing: 2,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Text(
                    r.used ? 'Used' : 'Type it in at checkout',
                    style: TextStyle(
                      fontSize: 11,
                      color: r.used
                          ? Palette.ink.withValues(alpha: 0.4)
                          : Tokens.semanticGood,
                    ),
                  ),
                ]),
              ),
          ],

          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!,
                style: const TextStyle(fontSize: 12, color: Palette.red)),
          ],
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
          // Wraps rather than sharing one line.
          //
          // The owner types these codes, and some are a sentence — "TEST
          // PER ACCOUNT ONCE ONLY CLAIM". In a Row the chip took the whole
          // width and the Expanded label was squeezed to one character per
          // line. A Wrap puts the label underneath when it will not fit,
          // which costs a little height on the rare long code and nothing
          // at all on a short one.
          ...promos.map(
            (p) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Wrap(
                spacing: 10,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
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
                  Text(
                    p.label,
                    style: TextStyle(
                      fontSize: 12,
                      color: Palette.ink.withValues(alpha: 0.7),
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
    'refunded': 'Refunded',
    'expired': 'Expired',
  };

  @override
  Widget build(BuildContext context) {
    final step = _flow.indexOf(ticket.status);
    final cancelled =
        ticket.status == 'cancelled' ||
        ticket.status == 'refunded' ||
        ticket.status == 'expired';

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
                _labels[ticket.status] ?? 'Cancelled',
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

/// The tickets this device raised, for somebody who never made an account.
///
/// Before this, a guest who closed the app without copying the code had nothing
/// at all. The counter could look the ticket up, but had no way to tell whether
/// the person asking was the person who ordered it — the code was the only
/// proof, and it was gone. The device holds a token now, so it can ask the
/// database for its own tickets and get an answer nobody else could get.
///
/// Refreshed on a timer rather than pushed: Realtime authorises with the token
/// in the connection and a guest has none, so there is nothing for it to check
/// the row against. One request every ten seconds while this screen is open is
/// a fair price for tickets that are nobody else's business.
class _GuestOrders extends StatefulWidget {
  const _GuestOrders();

  @override
  State<_GuestOrders> createState() => _GuestOrdersState();
}

class _GuestOrdersState extends State<_GuestOrders> {
  List<Ticket> _orders = const [];
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(const Duration(seconds: 10), (_) => _load());
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final orders = await Api.myOrders();
      if (mounted) setState(() => _orders = orders);
    } catch (_) {
      // A list that cannot be fetched is not worth an error on a sign-in
      // screen; the sign-in below still works.
    }
  }

  @override
  Widget build(BuildContext context) {
    // Nothing yet, or nothing ever: either way there is no reason to take up
    // the top of the screen with an empty box.
    if (_orders.isEmpty) return const SizedBox.shrink();

    final live = _orders
        .where((o) =>
            o.status != 'completed' &&
            o.status != 'cancelled' &&
            o.status != 'refunded' &&
            o.status != 'expired')
        .toList();
    final past = _orders
        .where((o) =>
            o.status == 'completed' ||
            o.status == 'cancelled' ||
            o.status == 'refunded' ||
            o.status == 'expired')
        .toList();
    final shown = live.isNotEmpty ? live : past.take(5).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          live.isNotEmpty ? 'Your order' : 'What you ordered here',
          style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 6),
        Text(
          'Kept on this device, so you did not have to write the code down. '
          'Only this phone can see them.',
          style: TextStyle(height: 1.5, color: Palette.ink.withValues(alpha: 0.65)),
        ),
        const SizedBox(height: 16),

        for (final o in shown)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => TicketScreen(ticket: o)),
              ),
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Palette.card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Palette.ink.withValues(alpha: 0.1)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          o.ticketCode,
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            letterSpacing: 2,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const Spacer(),
                        Text(
                          _stageOf(o),
                          style: TextStyle(fontSize: 12, color: _toneOf(o)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      o.items.map((i) => '${i.qty} × ${i.name}').join(', '),
                      style: TextStyle(
                        fontSize: 13,
                        height: 1.4,
                        color: Palette.ink.withValues(alpha: 0.7),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '₱${o.total.toStringAsFixed(2)}',
                      style: TextStyle(
                        fontSize: 12,
                        color: Palette.ink.withValues(alpha: 0.55),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

        const SizedBox(height: 24),
        Divider(color: Palette.ink.withValues(alpha: 0.12)),
        const SizedBox(height: 16),
      ],
    );
  }

  /// Where the ticket has got to, in the words a diner would use.
  static String _stageOf(Ticket o) {
    if (o.status == 'expired') return 'Expired';
    if (o.status == 'refunded') return 'Refunded';
    if (o.status == 'cancelled') return 'Cancelled';
    if (o.status == 'completed') return 'Collected';
    if (o.status == 'ready') return 'Ready to collect';
    if (o.status == 'preparing') return 'Being cooked';
    if (o.isPaid) return 'Paid, waiting for the kitchen';
    return 'Pay at the counter';
  }

  static Color _toneOf(Ticket o) {
    if (o.status == 'cancelled' ||
        o.status == 'completed' ||
        o.status == 'refunded' ||
        o.status == 'expired') {
      return Palette.ink.withValues(alpha: 0.45);
    }
    if (o.status == 'ready' || o.isPaid) return Tokens.semanticGood;
    return Palette.red;
  }
}
