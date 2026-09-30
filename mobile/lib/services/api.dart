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
  ///
  /// Called before the menu is read, because that is the moment a stale hold
  /// does its damage: a serving sitting in the platter while the app says sold
  /// out. There is no pg_cron on this project, so nothing does it on a timer.
  ///
  /// Failure is ignored on purpose. A menu that loads with one plate still
  /// wrongly held is worth far more than no menu at all.
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
  // hundred pesos a signup wall is the surest way to lose the sale, and the
  // ticket-code flow is what keeps the counter fast. What an account adds is
  // everything that needs memory across visits: history that survives a new
  // phone, a live view of the order, and loyalty.

  static User? get currentUser => _db.auth.currentUser;

  /// Whether this device has an identity at all — real account or anonymous.
  ///
  /// What owns the orders. Realtime checks a row against this, which is why a
  /// guest gets live updates again.
  static bool get identified => currentUser != null;

  /// Whether there is a real account behind the session.
  ///
  /// Deliberately false for an anonymous one. Every diner now has a session —
  /// that is how a guest ticket becomes provably theirs — so "is there a user"
  /// stopped being a usable test for "has an account", and every screen that
  /// asks this one is really asking whether to show the account screen, the
  /// loyalty card and the promotions.
  static bool get signedIn =>
      currentUser != null && currentUser!.isAnonymous != true;

  /// Gives this device an identity if it has none.
  ///
  /// Called once at startup. The diner is never asked and never told: the only
  /// thing it changes is that the orders they place belong to somebody the
  /// database can name, so they are theirs and nobody else's.
  ///
  /// A failure is survivable — the order is simply placed unattached, which is
  /// how the system worked for its whole life until now — so it never blocks
  /// the app from opening.
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
  ///
  /// A guest signing up is upgraded in place, not replaced.
  ///
  /// The app gives every diner an anonymous session the moment it opens, so by
  /// the time anybody reaches this form there is always one. Calling signUp()
  /// on top of it asks Supabase to mint a second user while the first is still
  /// signed in — which is why nothing was created and no email ever went out.
  /// Attaching the address to the user they already are keeps every order that
  /// user placed as a guest, rather than stranding it against an identity
  /// nobody can sign into.
  ///
  /// The website has always done this. The phone never did.
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
      'username': details.username.trim(),
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
    // it returns instead is a user with no identities attached, and that is
    // the tell.
    //
    // Left alone it reads as success: the diner is told to check an inbox
    // that never receives anything, and blames the app rather than
    // remembering they already signed up. Saying so costs the shop nothing —
    // anyone can learn the same thing from the sign-in form.
    if (res.session == null && (res.user?.identities?.isEmpty ?? false)) {
      throw const AuthException('User already registered');
    }

    return res.session != null;
  }

  static Future<void> signIn(String email, String password) =>
      _db.auth.signInWithPassword(email: email.trim(), password: password);

  static Future<void> signOut() => _db.auth.signOut();

  /// Sends a six-digit code to somebody locked out of their account.
  ///
  /// A code rather than the link the website uses. A link has to come back
  /// into the app, which means App Links or a custom scheme — a deployed
  /// domain, a verification file it has to serve, and a per-platform dance
  /// that breaks quietly whenever any of it drifts. A code the diner reads
  /// from their inbox and types needs none of that and works the same on a
  /// phone with no default browser set.
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
  ///
  /// Filtered by customer here on purpose. The access rules would return rows
  /// without it, because anybody may read orders from the last 24 hours so a
  /// guest ticket can follow itself, and the screen would quietly list other
  /// people's orders. Access rules decide what you MAY read, not what a screen
  /// means. The web app had exactly this bug.
  ///
  /// That window is now closed, and this goes through my_orders() instead: it
  /// returns the orders raised by THIS device, plus the ones on the account if
  /// there is one, and nothing else. A guest gets their own list without ever
  /// making an account, which is the point.
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
  ///
  /// The card could be read but never spent, so a diner who had earned a reward
  /// on their phone had to find a laptop to claim it. The database decides
  /// whether they have actually earned one; this only asks.
  ///
  /// Returns the code, or null if there was nothing to claim.
  static Future<String?> claimLoyaltyReward() async {
    if (!signedIn) return null;
    final code = await _db.rpc('claim_loyalty_reward');
    return code as String?;
  }

  /// Discount codes the owner is running now, so a diner with an account learns
  /// about them without the shop paying to advertise anywhere.
  /// The codes still worth something to this diner.
  ///
  /// A code is good once per account, so listing one they have already claimed
  /// would be an advert for a dead end — they would type it in and be told no.
  /// The redemptions they can read are their own; access rules see to that, so
  /// filtering here shows nobody anything new.
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
  ///
  /// Priced by the same database rule that will charge it, so the cart can never
  /// quote a discount the checkout then refuses. On failure it returns the
  /// reason, so the diner is told "spend 20 pesos more" instead of a flat
  /// "invalid", which is the difference between an abandoned cart and a bigger
  /// one.
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
  ///
  /// The same query the website runs, so the two cannot end up quoting
  /// different diners.
  ///
  /// Every rating above the bar comes back, whatever the two switches say. The
  /// comments switch used to filter this query — with it on, a review with no
  /// words was dropped entirely, so a shop whose diners rated without writing
  /// anything had a band that showed nothing at all. It now decides only
  /// whether the words are printed; the stars are the owner's other switch,
  /// and neither hides a rating the other would have shown.
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

  /// Whether a username is free and allowed.
  ///
  /// Answered for anybody, signed in or not, because the signup form needs it
  /// before an account exists. It does reveal that a name is taken — but so
  /// does the form the moment it is submitted, and a name people are greeted
  /// by is public by its nature.
  static Future<bool> usernameAvailable(String username) async {
    try {
      final ok = await _db.rpc(
        'username_available',
        params: {'p_username': username.trim()},
      );
      return ok == true;
    } catch (_) {
      // Offline, or the check failed. Let them submit: the database enforces
      // this properly on the way in, so the worst case is being told then.
      return true;
    }
  }

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

  /// Saves the diner's own name, username and number.
  ///
  /// Goes through `save_my_profile` rather than updating the row, because
  /// `profiles` also holds `role`. A policy wide enough to let somebody fix
  /// their surname would be wide enough to let them make themselves an owner.
  static Future<void> saveMyProfile(NewAccount details) => _db.rpc(
    'save_my_profile',
    params: {
      'p_first_name': details.firstName.trim(),
      'p_last_name': details.lastName.trim(),
      'p_username': details.username.trim(),
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
          .select('id, message, tone, ends_at')
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
        .select('id, message, tone, ends_at')
        .order('created_at', ascending: false)
        .limit(20);
    return rows.map<Announcement>((r) => Announcement.fromMap(r)).toList();
  }

  /// Posts one. [endsAt] is required by the table, not just by this call.
  static Future<void> postAnnouncement({
    required String message,
    required String tone,
    required DateTime endsAt,
  }) =>
      _db.from('announcements').insert({
        'message': message.trim(),
        'tone': tone,
        'ends_at': endsAt.toUtc().toIso8601String(),
      });

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
          .select('dish_id, rating, comment')
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
        'p_device_token': await DeviceToken.get(),
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
  ///
  /// image_picker caps the image at 1200px / 70% quality itself, which works on
  /// both mobile and web. That matters: Supabase's server-side image transform
  /// is a paid feature, and a raw phone screenshot is 1–2 MB, so shrinking here
  /// is what keeps the project inside the free 1 GB storage allowance.
  ///
  /// Returns null if the diner backs out of the picker.
  static Future<Ticket?> pickAndUploadProof(String ticketCode) async {
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
      params: {'p_ticket_code': code, 'p_path': path},
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
