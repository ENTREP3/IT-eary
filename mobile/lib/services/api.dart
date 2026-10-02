import 'dart:math';

import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../diner/state/device_token.dart';
import '../models/models.dart';

/// Every call the diner app makes.
///
/// Signing in is optional and adds history, live order tracking and loyalty.
/// Ordering without an account works exactly as it always has, and every write
/// still goes through a guarded function rather than touching a table directly.
class Api {
  static SupabaseClient get _db => Supabase.instance.client;

  static const proofBucket = 'payment-proofs';

  static Future<List<String>> categories() async {
    final rows = await _db.from('categories').select('name').order('name');
    return rows.map<String>((r) => r['name'] as String).toList();
  }

  /// Frees any plate still held by a ticket nobody came for.
  static Future<void> releaseStaleTickets() async {
    try {
      await _db.rpc('release_stale_tickets');
    } catch (_) {
      /* the menu matters more */
    }
  }

  static Future<List<Dish>> menu() async {
    await releaseStaleTickets();
    final rows = await _db.from('dishes').select().order('name');
    return rows.map<Dish>((r) => Dish.fromMap(r)).toList();
  }

  /// The shop's own details, as the owner set them on the dashboard.
  ///
  /// Read rather than hardcoded so the apps cannot disagree with the website
  /// about the address, the hours, or what the karinderya calls itself. Returns
  /// null when the row cannot be read, and callers show nothing rather than a
  /// stale guess.
  static Future<Shop?> shop() async {
    try {
      final row = await _db
          .from('business_settings')
          .select()
          .eq('id', 1)
          .maybeSingle();
      return row == null ? null : Shop.fromMap(row);
    } catch (_) {
      return null;
    }
  }

  // --------------------------------------------------------------- accounts
  //
  // An account is optional and always will be. On a meal costing under a

  static User? get currentUser => _db.auth.currentUser;

  /// Whether this device has an identity at all — real account or anonymous.
  ///
  /// What owns the orders. Realtime checks a row against this, which is why a
  /// guest gets live updates again.
  static bool get identified => currentUser != null;

  /// Whether there is a real account behind the session.
  static bool get signedIn =>
      currentUser != null && currentUser!.isAnonymous != true;

  /// Gives this device an identity if it has none.
  static Future<void> ensureIdentity() async {
    if (currentUser != null) return;
    try {
      await _db.auth.signInAnonymously();
    } catch (_) {
      /* Ordering still works; the ticket code is still printed. */
    }
  }

  /// Fires whenever the diner signs in or out, so screens can follow along
  /// instead of each one polling for a session.
  static Stream<AuthState> get authChanges => _db.auth.onAuthStateChange;

  /// Returns true when the account is ready to use, false when the project
  /// requires the address to be confirmed by email first.
  static Future<bool> signUp(
    String email,
    String password, {
    required NewAccount details,
  }) async {
    /*
     * Carried on the auth user so the database trigger can put them on the
     * profile the moment it creates it. Sending them afterwards would be a
     * second call that can fail on its own, leaving an account with no name.
     *
     * The same keys the website sends, because one trigger reads both.
     */
    final data = {
      'first_name': details.firstName.trim(),
      'middle_name': details.middleName?.trim(),
      'last_name': details.lastName.trim(),

      'nickname': details.nickname?.trim(),
      'phone': details.phone?.trim(),
    }..removeWhere((_, v) => v == null || v.isEmpty);

    final existing = currentUser;
    if (existing != null && existing.isAnonymous) {
      await _db.auth.updateUser(
        UserAttributes(email: email.trim(), password: password, data: data),
      );

      // A guest already has a profile row, made when their anonymous account
      // was, so the trigger that reads this metadata has long since run and
      // will not run again. Written directly instead.
      await saveMyProfile(details);

      // Still anonymous until the address is confirmed, which is right: the
      // perks belong to a confirmed account.
      return false;
    }

    final res = await _db.auth.signUp(
      email: email.trim(),
      password: password,
      data: data,
    );

    // Signing up with an address that already has an account does not fail.
    // Supabase answers as though it worked, because telling a stranger which
    // emails are registered hands them a list of this shop's customers. What
    if (res.session == null && (res.user?.identities?.isEmpty ?? false)) {
      throw const AuthException('User already registered');
    }

    return res.session != null;
  }

  static Future<void> signIn(String email, String password) =>
      _db.auth.signInWithPassword(email: email.trim(), password: password);

  static Future<void> signOut() => _db.auth.signOut();

  /// Sends a six-digit code to somebody locked out of their account.
  static Future<void> sendPasswordCode(String email) =>
      _db.auth.resetPasswordForEmail(email.trim());

  /// Exchanges the code for a session, so the password can then be set.
  ///
  /// The recovery type is what a reset email carries; it signs them in for
  /// long enough to choose a new password and no longer.
  static Future<void> verifyPasswordCode(String email, String code) =>
      _db.auth.verifyOTP(
        email: email.trim(),
        token: code.trim(),
        type: OtpType.recovery,
      );

  /// Confirms a new account with the six-digit code from the email.
  static Future<void> verifySignupCode(String email, String code) =>
      _db.auth.verifyOTP(
        email: email.trim(),
        token: code.trim(),
        type: OtpType.signup,
      );

  /// Sends the signup code again, for somebody who waited too long.
  static Future<void> resendSignupCode(String email) =>
      _db.auth.resend(type: OtpType.signup, email: email.trim());

  /// Sets the new password for whoever the code just signed in.
  static Future<void> setNewPassword(String password) =>
      _db.auth.updateUser(UserAttributes(password: password));

  /// The shop's own password rule, asked for rather than copied.
  ///
  /// Returns what to do next, or null when the password is acceptable. Asking
  /// the database means this cannot drift out of step with what the server
  /// will actually accept, and one round trip on a screen somebody is already
  /// typing into costs nothing worth saving.
  static Future<String?> passwordProblem(String password) async {
    try {
      final r = await _db.rpc('password_problem', params: {'p_password': password});
      return r as String?;
    } catch (_) {
      // Unreachable rule is not a reason to block somebody: the server checks
      // again on the way in, and it is the one that decides.
      return null;
    }
  }

  /// This diner's own orders, newest first.
  static Future<List<Ticket>> myOrders() async {
    final rows = await _db.rpc(
      'my_orders',
      params: {'p_device_token': await DeviceToken.get()},
    );
    return (rows as List)
        .map<Ticket>((r) => Ticket.fromMap(Map<String, dynamic>.from(r as Map)))
        .toList();
  }

  /// Every change to this diner's orders, so the card moves through Preparing
  /// and Ready without them standing at the counter watching for it.
  static Stream<List<Ticket>> watchMyOrders() {
    final uid = currentUser?.id;
    if (uid == null) return const Stream.empty();

    return _db
        .from('orders')
        .stream(primaryKey: ['id'])
        .eq('customer_id', uid)
        .order('created_at')
        .map((rows) => rows.map<Ticket>((r) => Ticket.fromMap(r)).toList());
  }

  /// Completed orders, and how many more until the next reward.
  static Future<Loyalty?> loyalty() async {
    if (!signedIn) return null;
    try {
      final rows = await _db.rpc('my_loyalty');
      final row = (rows is List && rows.isNotEmpty) ? rows.first : rows;
      return row == null ? null : Loyalty.fromMap(Map<String, dynamic>.from(row as Map));
    } catch (_) {
      return null;
    }
  }

  /// Turns a filled loyalty card into a discount code.
  static Future<String?> claimLoyaltyReward() async {
    if (!signedIn) return null;
    final code = await _db.rpc('claim_loyalty_reward');
    return code as String?;
  }

  /// Discount codes the owner is running now, so a diner with an account learns
  /// about them without the shop paying to advertise anywhere.
  /// The codes still worth something to this diner.
  static Future<List<Promo>> activePromos() async {
    try {
      final running = await _db
          .from('promo_codes')
          .select('code, label')
          .eq('active', true);
      final claimed = await _db.from('promo_redemptions').select('code');
      final used = claimed.map<String>((r) => r['code'] as String).toSet();

      return running
          .where((r) => !used.contains(r['code'] as String))
          .map<Promo>((r) => Promo.fromMap(r))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// What a discount code is worth on this order, before committing to it.
  static Future<PromoPreview> previewPromo(String code, double subtotal) async {
    try {
      final rows = await _db.rpc(
        'preview_promo',
        params: {'p_code': code.trim(), 'p_subtotal': subtotal},
      );
      final row = (rows is List && rows.isNotEmpty) ? rows.first : rows;
      if (row == null) {
        return const PromoPreview(valid: false, discount: 0, label: '', reason: 'That code does not exist.');
      }
      return PromoPreview.fromMap(Map<String, dynamic>.from(row as Map));
    } catch (e) {
      return const PromoPreview(
        valid: false,
        discount: 0,
        label: '',
        reason: 'Could not check that code right now.',
      );
    }
  }

  /// Average star rating per dish, keyed by dish id.
  ///
  /// Food is bought on trust, and a first-time diner has nothing else to go on.
  /// Ratings used to live in one browser, which made them social proof that
  /// proved nothing to anybody else.
  static Future<Map<String, DishRating>> dishRatings() async {
    try {
      final rows = await _db.from('dish_ratings').select();
      return {
        for (final r in rows) r['dish_id'] as String: DishRating.fromMap(r),
      };
    } catch (_) {
      return const {};
    }
  }

  /// The quotes for the showcase band, chosen by the owner's own rules.
  static Future<List<Review>> showcaseReviews(Storefront show) async {
    try {
      var q = _db
          .from('reviews')
          .select('id, dish_id, rating, comment, author_name, featured')
          .gte('rating', show.reviewsMinStars);

      if (show.reviewsSource == 'picked') q = q.eq('featured', true);

      final rows = await q.order('created_at', ascending: false).limit(40);
      final reviews = rows.map<Review>((r) => Review.fromMap(r)).toList();

      // With the words on, the ones that have words lead — a band that opens
      // on three bare scores wastes the best thing the shop has. Nothing is
      // dropped, so a wordless five stars still gets its turn further along.
      if (show.comments) {
        reviews.sort((a, b) {
          final ac = a.comment.isNotEmpty ? 0 : 1;
          final bc = b.comment.isNotEmpty ? 0 : 1;
          return ac - bc;
        });
      }
      return reviews;
    } catch (_) {
      return const [];
    }
  }

  // ---------------------------------------------------------------- profile

  /// This diner's own details, including the email.
  ///
  /// Read through a function rather than off the table, because the address
  /// lives on `auth.users` where no client may look. It returns the caller's
  /// own row and nobody else's — the function reads `auth.uid()` rather than
  /// taking an id.
  static Future<MyProfile?> myProfile() async {
    try {
      final rows = await _db.rpc('my_profile');
      if (rows is! List || rows.isEmpty) return null;
      return MyProfile.fromMap(Map<String, dynamic>.from(rows.first as Map));
    } catch (_) {
      return null;
    }
  }

  /// The notifications the shop has recorded for whoever is signed in.
  static Future<List<AppNotification>> notifications() async {
    try {
      final rows = await _db.rpc('my_notifications', params: {'p_limit': 30});
      if (rows is! List) return const [];
      return rows
          .map((r) => AppNotification.fromMap(Map<String, dynamic>.from(r as Map)))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// How many are waiting, for the badge on the bell.
  static Future<int> unreadCount() async {
    try {
      return (await _db.rpc('my_unread_count') as num?)?.toInt() ?? 0;
    } catch (_) {
      return 0;
    }
  }

  /// Clears the bell without losing the record.
  ///
  /// The rows stay; only this person's view of them is hidden. What the shop
  /// told somebody is the shop's record, and tidying a list should not erase
  /// it. Null clears everything; an id clears one.
  static Future<void> dismissNotifications({String? id}) async {
    try {
      await _db.rpc('dismiss_notifications', params: {'p_id': id});
    } catch (_) {
      // The next load reads the truth back.
    }
  }

  /// Whether the bell shows anything, as the diner decides.
  static Future<void> setNotifyInApp(bool on) async {
    try {
      await _db.rpc('set_my_notify_in_app', params: {'p_on': on});
    } catch (_) {
      /* the switch reads its state back on the next load */
    }
  }

  /// Marks them all read, which is what opening the bell means.
  static Future<void> markNotificationsRead() async {
    try {
      await _db.rpc('mark_notifications_read');
    } catch (_) {
      // The next load reads the truth back; nothing is lost by failing here.
    }
  }

  /// Saves the diner's own name, nickname and number.
  ///
  /// Goes through `save_my_profile` rather than updating the row, because
  /// `profiles` also holds `role`. A policy wide enough to let somebody fix
  /// their surname would be wide enough to let them make themselves an owner.
  static Future<void> saveMyProfile(NewAccount details) => _db.rpc(
    'save_my_profile',
    params: {
      'p_first_name': details.firstName.trim(),
      'p_last_name': details.lastName.trim(),

      'p_middle_name': details.middleName?.trim(),
      'p_nickname': details.nickname?.trim(),
      'p_phone': details.phone?.trim(),
    },
  );

  // ------------------------------------------------------------------- push

  /// Records this device as somewhere the shop may send a notification.
  ///
  /// The token is supplied by Firebase; who it belongs to is read from the
  /// session by the database, never sent from here. A token arriving for a
  /// second user is reassigned rather than refused, which is the ordinary
  /// case: one phone, a guest identity first, a real account after signing up.
  static Future<void> registerPushToken(String token, String platform) =>
      _db.rpc(
        'register_push_token',
        params: {
          'p_token': token,
          'p_platform': platform,
          // Enough to tell one handset from another on a list of devices, and
          // nothing that identifies a person.
          'p_label': 'Android',
        },
      );

  /// Stops notifications to one device, leaving the diner's others alone.
  static Future<void> forgetPushToken(String token) =>
      _db.rpc('forget_push_token', params: {'p_token': token});

  // ------------------------------------------------------------- favourites

  /// Records or removes one favourite on the account.
  ///
  /// The device has already been updated and the menu already redrawn by the
  /// time this runs, so a failure costs nothing the diner can see: the heart
  /// simply does not follow them to their next phone, which is where they
  /// were before favourites were kept at all.
  static Future<void> setFavourite(String dishId, bool wanted) async {
    try {
      final uid = currentUser?.id;
      if (uid == null) return;

      if (wanted) {
        await _db.from('favourites').insert({
          'user_id': uid,
          'dish_id': dishId,
        });
      } else {
        await _db
            .from('favourites')
            .delete()
            .eq('user_id', uid)
            .eq('dish_id', dishId);
      }
    } catch (_) {
      // Already on the device; the account catching up is a bonus.
    }
  }

  /// Merges the device list into the account and returns the union.
  ///
  /// Null means the merge did not happen — signed out, or offline — and the
  /// caller should leave the device list exactly as it found it. An empty
  /// list is a real answer and means something different: this diner has no
  /// favourites anywhere.
  static Future<List<String>?> mergeFavourites(List<String> dishIds) async {
    try {
      if (currentUser == null) return null;

      final rows = await _db.rpc('merge_favourites', params: {
        'p_dish_ids': dishIds,
      });
      if (rows is! List) return null;
      return rows.map<String>((r) => r.toString()).toList();
    } catch (_) {
      return null;
    }
  }

  // ----------------------------------------------------------- announcements

  /// Counts this device as having opened the menu today.
  ///
  /// The denominator for the conversion figure on the dashboard. One row
  /// per device per day — a date and a device id, not a record of what was
  /// looked at. Failure is ignored: a statistic is never worth standing
  /// between somebody and their lunch.
  static Future<void> recordStorefrontEvent(String event) async {
    try {
      await _db.rpc('record_storefront_event', params: {
        'p_event': event,
        'p_device_token': await DeviceToken.get(),
      });
    } catch (_) {
      /* nothing to do, and nothing worth saying */
    }
  }

  /// What the shop is telling everybody right now, or null.
  ///
  /// The schedule lives in the row and is enforced by RLS, so this asks for
  /// the newest one and the database decides whether there is anything to
  /// hand back. Nothing written for later can leak out early, even to a
  /// client that asks for it directly.
  static Future<Announcement?> liveAnnouncement() async {
    try {
      final rows = await _db
          .from('announcements')
          .select('id, message, tone, audience, ends_at')
          .order('created_at', ascending: false)
          .limit(1);
      if (rows.isEmpty) return null;
      return Announcement.fromMap(rows.first);
    } catch (_) {
      // A banner is never worth standing between somebody and their lunch.
      return null;
    }
  }

  /// Every announcement, for the owner: live, scheduled and finished alike.
  ///
  /// Hiding the finished ones would leave no way to tell a message that ran
  /// its course from one that was never saved.
  static Future<List<Announcement>> allAnnouncements() async {
    final rows = await _db
        .from('announcements')
        .select('id, message, tone, audience, ends_at')
        .order('created_at', ascending: false)
        .limit(20);
    return rows.map<Announcement>((r) => Announcement.fromMap(r)).toList();
  }

  /// Posts one. [endsAt] is required by the table, not just by this call.
  static Future<void> postAnnouncement({
    required String message,
    required String tone,
    required DateTime endsAt,
    String audience = 'diners',
    bool notify = false,
  }) =>
      _db.from('announcements').insert({
        'message': message.trim(),
        'tone': tone,
        'audience': audience,
        'notify': notify,
        'ends_at': endsAt.toUtc().toIso8601String(),
      });

  /// Sends one notification. Never throws.
  ///
  /// The edge function records it for the bell and sends it to any device
  /// that has been registered, so a failure here costs a message and nothing
  /// else — never the work that prompted it.
  static Future<void> _notify({
    required Map<String, dynamic> to,
    required String title,
    required String body,
    String url = '/',
    String tag = 'bencris',
  }) async {
    try {
      await _db.functions.invoke('send-push', body: {
        'to': to,
        'title': title,
        'body': body,
        'url': url,
        'tag': tag,
      });
    } catch (_) {
      // Said nowhere, because there is nothing the person at the till can do
      // about it and the order itself is unaffected.
    }
  }

  /// Tells the diner their ticket moved, for the two moves worth saying.
  ///
  /// The website has done this since tickets existed; the phone did not, so a
  /// cashier working from the counter app marked an order ready and nobody was
  /// ever told. Only ready and cancelled: a diner does not need buzzing when
  /// the kitchen starts cooking.
  static Future<void> notifyTicketStatus(String ticketCode, String status) async {
    const news = {
      'ready': ('Your order is ready', 'Come to the counter whenever you are ready.'),
      'cancelled': (
        'Your order was cancelled',
        'Ask at the counter if you were not expecting this.',
      ),
    };
    final item = news[status];
    if (item == null) return;

    await _notify(
      to: {'kind': 'ticket', 'ticket_code': ticketCode},
      title: item.$1,
      body: item.$2,
      url: '/account',
      tag: 'ticket-$ticketCode',
    );
  }

  /// Money going back is always worth saying, and saying precisely.
  static Future<void> notifyRefund(String ticketCode, double amount) =>
      _notify(
        to: {'kind': 'ticket', 'ticket_code': ticketCode},
        title: 'You have been refunded',
        body: '₱${amount.toStringAsFixed(2)} for ticket $ticketCode.',
        url: '/account',
        tag: 'ticket-$ticketCode',
      );

  /// Tells the people who asked that a dish is back on the menu.
  static Future<void> notifyDishBack(String dishId, String dishName) => _notify(
    to: {'kind': 'dish_waiters', 'dish_id': dishId},
    title: '$dishName is back',
    body: 'You asked to be told. It is on the menu again now.',
    url: '/menu',
    tag: 'dish-$dishId',
  );

  /// Pushes an announcement to whoever it was written for.
  ///
  /// Separate from posting it, and called only when the owner ticks the
  /// box. A banner is cheap; a notification is not, and a shop that buzzes
  /// people about everything trains them to turn notifications off — so the
  /// one that mattered arrives to nobody.
  static Future<void> notifyAnnouncement(String message, String audience) async {
    Future<void> send(Map<String, dynamic> to, String title) => _db.functions
        .invoke('send-push', body: {
          'to': to,
          'title': title,
          'body': message,
          'url': '/',
          'tag': 'announcement',
        })
        .then((_) {});

    try {
      if (audience != 'staff') {
        await send({'kind': 'everyone'}, 'Bencris');
      }
      if (audience != 'diners') {
        await send({'kind': 'staff'}, 'Message from the owner');
      }
    } catch (_) {
      // The announcement is saved either way. A failed push is not worth
      // an error over something the banner already says.
    }
  }

  static Future<void> removeAnnouncement(String id) =>
      _db.from('announcements').delete().eq('id', id);

  /// What diners wrote about one dish, read when somebody opens it.
  static Future<List<Review>> dishReviews(String dishId) async {
    try {
      final rows = await _db
          .from('reviews')
          .select('id, dish_id, rating, comment, author_name')
          .eq('dish_id', dishId)
          .neq('comment', '')
          .order('created_at', ascending: false)
          .limit(20);
      return rows.map<Review>((r) => Review.fromMap(r)).toList();
    } catch (_) {
      return const [];
    }
  }

  /// Ratings already left against a ticket, keyed by dish id.
  ///
  /// Read from the database rather than remembered in the screen, so reopening
  /// a past order shows the stars you actually gave, on any device. Keeping it
  /// only in memory is why a revisited order used to look unrated.
  static Future<Map<String, DishReview>> reviewsForTicket(String ticketCode) async {
    try {
      final rows = await _db
          .from('reviews')
          .select('dish_id, rating, comment, created_at')
          .eq('ticket_code', ticketCode.trim().toUpperCase());
      return {
        for (final r in rows) r['dish_id'] as String: DishReview.fromMap(r),
      };
    } catch (_) {
      return const {};
    }
  }
  /// Rates a dish the diner actually bought.
  ///
  /// The ticket code is the proof of purchase. The database refuses a rating
  /// unless that ticket was settled AND contained the dish, so ratings cannot
  /// be manufactured by anyone holding the public key.
  static Future<void> leaveReview({
    required String ticketCode,
    required String dishId,
    required int rating,
    String comment = '',
  }) async {
    await _db.rpc(
      'leave_review',
      params: {
        'p_ticket_code': ticketCode,
        'p_dish_id': dishId,
        'p_rating': rating,
        'p_comment': comment,
      },
    );
  }
  /// Asks to be told when a sold-out dish comes back.
  ///
  /// A diner who wanted sinigang and found it gone is a sale already lost. This
  /// is the cheapest way to win it back, and it costs the shop nothing: the
  /// flag is set by a trigger when the owner marks the dish available again.
  static Future<void> alertMeWhenBack(String dishId) async {
    final uid = currentUser?.id;
    if (uid == null) return;
    await _db.from('stock_alerts').insert({'customer_id': uid, 'dish_id': dishId});
  }

  /// Dish ids this diner is already waiting on, so the button does not offer
  /// to do something they have already done.
  static Future<Set<String>> myStockAlerts() async {
    if (!signedIn) return const {};
    try {
      final rows = await _db.from('stock_alerts').select('dish_id');
      return rows.map<String>((r) => r['dish_id'] as String).toSet();
    } catch (_) {
      return const {};
    }
  }
  /// How the karinderya is accepting money right now, so a method the owner has
  /// switched off is never offered at checkout.
  static Future<PaymentSettings> paymentSettings() async {
    try {
      final row =
          await _db.from('payment_settings').select().eq('id', 1).maybeSingle();
      return row == null
          ? PaymentSettings.fallback
          : PaymentSettings.fromMap(row);
    } catch (_) {
      return PaymentSettings.fallback;
    }
  }

  /// Raises a ticket. Only dish ids + quantities are sent — the server prices
  /// the order from `public.dishes`, so the total cannot be tampered with.
  static Future<Ticket> createTicket({
    required Map<String, int> quantitiesByDishId,
    String? customerName,
    String paymentMethod = 'cash',
    String? promoCode,
    /// A walk-in taken at the counter. No device token, because there is no
    /// phone to prove the ticket belongs to later, and no promo, because
    /// there is no account for "once each" to be counted against.
    bool atCounter = false,
  }) async {
    final items = quantitiesByDishId.entries
        .map((e) => {'id': e.key, 'qty': e.value})
        .toList();

    final row = await _db.rpc(
      'create_ticket',
      params: {
        'p_items': items,
        'p_customer_name': (customerName ?? '').trim().isEmpty
            ? null
            : customerName!.trim(),
        'p_payment_method': paymentMethod,
        // The code only, never a discount amount. What it is worth is decided
        // by the database, so a tampered app cannot invent its own reduction.
        'p_promo_code': (promoCode ?? '').trim().isEmpty ? null : promoCode!.trim(),
        // How this device proves the ticket is its own, later, without an
        // account and without having written the code down.
        'p_device_token': atCounter ? null : await DeviceToken.get(),
      },
    );
    return Ticket.fromMap(Map<String, dynamic>.from(row as Map));
  }

  /// Calls off an order the diner has not paid for.
  ///
  /// The database decides whether it may go: unpaid, and the kitchen not yet
  /// started. Past either point this is a conversation with a person rather
  /// than a button, and the function says so in the error it raises.
  static Future<Ticket> cancelMyOrder(String ticketCode) async {
    final row = await _db.rpc(
      'cancel_my_order',
      params: {
        'p_ticket_code': ticketCode.trim().toUpperCase(),
        'p_device_token': await DeviceToken.get(),
      },
    );
    return Ticket.fromMap(Map<String, dynamic>.from(row as Map));
  }

  /// Pulls a ticket back up, if it belongs to this device.
  ///
  /// Through the function rather than the table: a plain select used to work
  /// for anybody, because the read policy allowed any recent order, and it no
  /// longer does. This is where the device says which tickets are its own.
  static Future<Ticket?> findTicket(String code) async {
    final rows = await _db.rpc(
      'find_my_ticket',
      params: {
        'p_ticket_code': code.trim().toUpperCase(),
        'p_device_token': await DeviceToken.get(),
      },
    );
    final list = rows as List;
    return list.isEmpty
        ? null
        : Ticket.fromMap(Map<String, dynamic>.from(list.first as Map));
  }

  /// Picks a GCash receipt from the gallery and uploads it against [ticketCode].
  static Future<Ticket?> pickAndUploadProof(
    String ticketCode, {
    /// The number they paid from, so a GCash refund has somewhere to go.
    String? sender,
  }) async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1200,
      imageQuality: 70,
    );
    if (picked == null) return null;

    final code = ticketCode.trim().toUpperCase();
    final bytes = await picked.readAsBytes();

    // A fresh random name each time: replacing a blurry shot uploads a new
    // object rather than overwriting one, which keeps the storage policy simple.
    final isPng = picked.name.toLowerCase().endsWith('.png');
    final suffix = Random().nextInt(1 << 32).toRadixString(36);
    final path = '$code/$suffix.${isPng ? 'png' : 'jpg'}';

    await _db.storage.from(proofBucket).uploadBinary(
          path,
          bytes,
          fileOptions: FileOptions(
            contentType: isPng ? 'image/png' : 'image/jpeg',
          ),
        );

    final row = await _db.rpc(
      'attach_payment_proof',
      params: {'p_ticket_code': code, 'p_path': path, 'p_sender': sender},
    );
    return Ticket.fromMap(Map<String, dynamic>.from(row as Map));
  }

  /// Clears a recorded receipt so a replacement can be uploaded.
  static Future<Ticket> clearProof(String ticketCode) async {
    final row = await _db.rpc(
      'clear_payment_proof',
      params: {'p_ticket_code': ticketCode.trim().toUpperCase()},
    );
    return Ticket.fromMap(Map<String, dynamic>.from(row as Map));
  }

  /// Live updates for one ticket, so the diner sees it flip to Paid / Ready
  /// without refreshing. Falls back to nothing if Realtime is unavailable.
  static Stream<Ticket> watchTicket(String ticketId) {
    return _db
        .from('orders')
        .stream(primaryKey: ['id'])
        .eq('id', ticketId)
        .map((rows) => rows.isEmpty ? null : Ticket.fromMap(rows.first))
        .where((t) => t != null)
        .cast<Ticket>();
  }
}
