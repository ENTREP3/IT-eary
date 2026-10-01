/// Data models mirroring the Supabase schema (supabase/migrations).
library;

class Dish {
  final String id;
  final String name;
  final String tagalog;
  final double price;
  final String category;
  final String description;
  /// The photo shown wherever one image is wanted. Always equal to images[0].
  final String image;

  /// Every photo of this dish, in the order the owner arranged them.
  final List<String> images;

  final bool available;

  /// Marked a bestseller by the owner.
  ///
  /// Not calculated from sales. The shop used to award the badge to whichever
  /// dish led its category, which meant it made a claim about its own food that
  /// nobody had approved, and a new dish could never be promoted however good
  /// it was. The figures now only suggest it on the admin screen.
  final bool featured;

  /// How many portions are left, where the kitchen tracks it. Null means the
  /// dish is cooked to order and there is no count to show.
  final int? stockCount;

  final int soldToday;

  const Dish({
    required this.id,
    required this.name,
    required this.tagalog,
    required this.price,
    required this.category,
    required this.description,
    required this.image,
    this.images = const [],
    required this.available,
    this.featured = false,
    this.stockCount,
    this.soldToday = 0,
  });

  factory Dish.fromMap(Map<String, dynamic> m) => Dish(
    id: m['id'] as String,
    name: m['name'] as String? ?? '',
    tagalog: m['tagalog'] as String? ?? '',
    price: (m['price'] as num?)?.toDouble() ?? 0,
    category: m['category'] as String? ?? 'Ulam',
    description: m['description'] as String? ?? '',
    image: m['image'] as String? ?? '',
    images: () {
      final list = (m['images'] as List?)?.cast<String>() ?? const <String>[];
      // A dish photographed before the column existed still has its one picture.
      if (list.isNotEmpty) return list;
      final one = m['image'] as String? ?? '';
      return one.isEmpty ? const <String>[] : <String>[one];
    }(),
    available: m['available'] as bool? ?? true,
    featured: m['featured'] as bool? ?? false,
    stockCount: (m['stock_count'] as num?)?.toInt(),
    soldToday: (m['sold_today'] as num?)?.toInt() ?? 0,
  );

  /// Running low, and worth telling a diner about.
  bool get fewLeft =>
      available && stockCount != null && stockCount! > 0 && stockCount! <= 3;
}

class TicketItem {
  final String id;
  final String name;
  final int qty;
  final double price;

  const TicketItem({
    required this.id,
    required this.name,
    required this.qty,
    required this.price,
  });

  factory TicketItem.fromMap(Map<String, dynamic> m) => TicketItem(
    id: m['id'] as String? ?? '',
    name: m['name'] as String? ?? '',
    qty: (m['qty'] as num?)?.toInt() ?? 0,
    price: (m['price'] as num?)?.toDouble() ?? 0,
  );

  double get lineTotal => qty * price;
}

/// A stock line in the back room. Owner-only under RLS.
class InventoryItem {
  final String id;
  final String name;
  final double stock;
  final String unit;
  final double reorderAt;
  final String? lastDelivery;

  /// What one [unit] of this costs to buy. Every recipe costing, and so every
  /// profit figure the owner sees, is built out of these.
  final double costPerUnit;

  /// A full stock of this ingredient. The screen shows stock out of this, and
  /// this minus stock is what to buy.
  final double parLevel;

  /// Stamped by `receive_stock`, unlike the free-text [lastDelivery] that
  /// anything recorded before deliveries were tracked still carries.
  final DateTime? lastReceivedAt;

  const InventoryItem({
    required this.id,
    required this.name,
    required this.stock,
    required this.unit,
    required this.reorderAt,
    required this.lastDelivery,
    this.costPerUnit = 0,
    this.parLevel = 0,
    this.lastReceivedAt,
  });

  factory InventoryItem.fromMap(Map<String, dynamic> m) => InventoryItem(
    id: m['id'] as String,
    name: m['name'] as String? ?? '',
    stock: (m['stock'] as num?)?.toDouble() ?? 0,
    unit: m['unit'] as String? ?? '',
    reorderAt: (m['reorder_at'] as num?)?.toDouble() ?? 0,
    lastDelivery: m['last_delivery'] as String?,
    costPerUnit: (m['cost_per_unit'] as num?)?.toDouble() ?? 0,
    parLevel: (m['par_level'] as num?)?.toDouble() ?? 0,
    lastReceivedAt: m['last_received_at'] == null
        ? null
        : DateTime.tryParse(m['last_received_at'] as String),
  );

  /// How much to buy to get back to a full stock.
  double get shortfall =>
      parLevel <= 0 ? 0 : (parLevel - stock).clamp(0, double.infinity);

  bool get isLow => stock <= reorderAt;
  bool get isOut => stock <= 0;

  /// 0–1 fill for the level bar, measured against a full stock.
  ///
  /// Against [parLevel] where the owner has set one, which is the same scale
  /// the web admin uses and the same one the "x of y" caption reads from. The
  /// reorder point is the fallback for a row nobody has given a full stock yet.
  double get level => parLevel > 0
      ? (stock / parLevel).clamp(0, 1).toDouble()
      : reorderAt <= 0
          ? 1
          : (stock / (reorderAt * 2.5)).clamp(0, 1).toDouble();
}

/// A recorded cost. Owner-only; drives the net-profit figure.
class Expense {
  final String id;
  final String label;
  final double amount;
  final String category;
  final String spentOn;

  const Expense({
    required this.id,
    required this.label,
    required this.amount,
    required this.category,
    required this.spentOn,
  });

  factory Expense.fromMap(Map<String, dynamic> m) => Expense(
    id: m['id'] as String,
    label: m['label'] as String? ?? '',
    amount: (m['amount'] as num?)?.toDouble() ?? 0,
    category: m['category'] as String? ?? 'Supplies',
    spentOn: (m['spent_on'] as String?) ?? '',
  );
}

/// How the karinderya is currently accepting money. Read at checkout so a
/// method the owner has switched off is never offered.
class PaymentSettings {
  final bool cashEnabled;
  final bool gcashEnabled;
  final String gcashName;
  final String gcashNumber;
  final String? gcashQrUrl;

  const PaymentSettings({
    required this.cashEnabled,
    required this.gcashEnabled,
    required this.gcashName,
    required this.gcashNumber,
    required this.gcashQrUrl,
  });

  factory PaymentSettings.fromMap(Map<String, dynamic> m) => PaymentSettings(
    cashEnabled: m['cash_enabled'] as bool? ?? true,
    gcashEnabled: m['gcash_enabled'] as bool? ?? true,
    gcashName: m['gcash_name'] as String? ?? '',
    gcashNumber: m['gcash_number'] as String? ?? '',
    gcashQrUrl: m['gcash_qr_url'] as String?,
  );

  /// Sensible fallback if the settings row can't be read.
  static const fallback = PaymentSettings(
    cashEnabled: true,
    gcashEnabled: true,
    gcashName: '',
    gcashNumber: '',
    gcashQrUrl: null,
  );
}

/// A row from `public.orders`.
///
/// [paymentMethod] is the diner's choice at checkout; [paymentStatus] is what
/// the cashier concluded — the two are deliberately separate, so an intention
/// is never mistaken for a settled sale.
class Ticket {
  final String id;
  final String ticketCode;
  final String? customerName;
  final List<TicketItem> items;
  final double total;
  final String? paymentMethod;
  final String paymentStatus;
  final String status;
  final String? proofPath;
  /// Cashier eyeballed the diner's live GCash app rather than a screenshot.
  final bool verifiedInPerson;
  final DateTime? paidAt;
  final DateTime createdAt;

  /// Menu price before any discount. subtotal - discount = total.
  final double subtotal;
  final double discount;
  final String? promoCode;
  final DateTime? completedAt;

  const Ticket({
    required this.id,
    required this.ticketCode,
    required this.customerName,
    required this.items,
    required this.total,
    required this.paymentMethod,
    required this.paymentStatus,
    required this.status,
    required this.proofPath,
    this.verifiedInPerson = false,
    required this.paidAt,
    required this.createdAt,
    this.subtotal = 0,
    this.discount = 0,
    this.promoCode,
    this.completedAt,
  });

  factory Ticket.fromMap(Map<String, dynamic> m) => Ticket(
    id: m['id'] as String,
    ticketCode: m['ticket_code'] as String,
    customerName: m['customer_name'] as String?,
    items: ((m['items'] as List?) ?? [])
        .map((e) => TicketItem.fromMap(Map<String, dynamic>.from(e as Map)))
        .toList(),
    total: (m['total'] as num?)?.toDouble() ?? 0,
    paymentMethod: m['payment_method'] as String?,
    paymentStatus: m['payment_status'] as String? ?? 'unpaid',
    status: m['status'] as String? ?? 'pending',
    proofPath: m['proof_path'] as String?,
    verifiedInPerson: m['verified_in_person'] as bool? ?? false,
    paidAt: m['paid_at'] == null
        ? null
        : DateTime.parse(m['paid_at'] as String).toLocal(),
    createdAt: DateTime.parse(m['created_at'] as String).toLocal(),
    subtotal: (m['subtotal'] as num?)?.toDouble() ?? 0,
    discount: (m['discount'] as num?)?.toDouble() ?? 0,
    promoCode: m['promo_code'] as String?,
    completedAt: m['completed_at'] == null
        ? null
        : DateTime.parse(m['completed_at'] as String).toLocal(),
  );

  /// Local mirror of `clear_payment_proof()`, for when the diner clears a
  /// receipt and then backs out of the picker without choosing a replacement.
  Ticket copyWithProofCleared() => Ticket(
    id: id,
    ticketCode: ticketCode,
    customerName: customerName,
    items: items,
    total: total,
    paymentMethod: paymentMethod,
    paymentStatus: paymentStatus,
    status: status,
    proofPath: null,
    verifiedInPerson: verifiedInPerson,
    paidAt: paidAt,
    createdAt: createdAt,
  );

  bool get isPaid => paidAt != null;

  /// Whether this ticket is money the shop actually took.
  ///
  /// Every sales figure runs through this. A ticket used to count from the
  /// moment it was created, so a diner filling a cart moved the day's takings
  /// and a cancelled order stayed in them forever. A sale is a payment the
  /// counter confirmed, on an order that still exists.
  bool get countsAsSale =>
      paidAt != null &&
      status != 'cancelled' &&
      status != 'refunded' &&
      status != 'expired';

  /// Whether the shop can still hand money back on this ticket.
  ///
  /// The shop's rule: a refund is only possible while the food can still go
  /// back in the platter. Once the kitchen marks it ready the answer is no.
  bool get isRefundable =>
      paidAt != null && (status == 'paid' || status == 'preparing');

  bool get isGcash => paymentMethod == 'gcash';

  bool get hasProof => proofPath != null;

  /// A GCash ticket still owing the cashier a receipt screenshot.
  bool get needsProof => isGcash && !hasProof && !isPaid;

  /// How the diner is paying. Distinct from whether they *have* paid.
  String get paymentLabel => switch (paymentMethod) {
    'gcash' => 'GCash',
    'cash' => 'Cash',
    _ => '—',
  };

  /// What a receipt should print. The method alone would be misleading on an
  /// unsettled ticket — "GCash" reads as though the money already arrived.
  String get receiptPaymentLabel {
    if (!isPaid) return '$paymentLabel (UNPAID)';
    if (paymentStatus == 'needs_review') return '$paymentLabel (confirming)';
    return paymentLabel;
  }

  /// Human-facing progress line for the ticket screen.
  String get statusLabel {
    if (needsProof) return 'Send your GCash payment, then upload the receipt';
    return switch (status) {
      'pending' => 'Show this to the cashier',
      'paid' => 'Paid — waiting for the kitchen',
      'preparing' => 'Being prepared',
      'ready' => 'Ready for pickup!',
      'completed' => 'Completed',
      'cancelled' => 'Cancelled',
      'refunded' => 'Refunded — your money has been returned',
      'expired' =>
        'Expired — nobody collected it, so it went back on the menu',
      _ => status,
    };
  }

  /// Shown once settled, so the diner knows the counter is still reconciling.
  String? get reviewNotice => paymentStatus == 'needs_review'
      ? 'The counter is confirming your payment — your order is being prepared.'
      : null;
}

/// The shop's own details, owned by the owner and read by every client.
///
/// Kept here rather than hardcoded so the address, hours and tagline can be
/// corrected on the dashboard without anyone rebuilding an app. The website
/// reads the same row, which is what stops the two disagreeing.
/// What the storefront shows, decided by the owner on the dashboard.
///
/// The app used to ignore this row entirely, so every switch on the Shop screen
/// changed the website and left the phone showing whatever it liked. An owner
/// who turns ratings off has turned them off, not turned them off in one place.
///
/// A missing key means on, so a shop that has never opened that screen looks
/// exactly as it always did and nothing vanishes because a key was added.
class Storefront {
  final bool ratings;
  final bool comments;
  final bool bestseller;
  final bool lowStock;
  final bool soldOut;
  final bool recommended;

  /// Quote every review above the star threshold, or only the ones picked.
  final String reviewsSource;
  final int reviewsMinStars;
  final int reviewsPerBatch;

  /// Seconds a batch of quotes stays before the next. 0 means do not cycle.
  final int reviewsSeconds;

  /// Seconds a dish stays behind the headline. 0 means hold on the first.
  final int heroSeconds;

  /// How long each of a dish's photos is held before the next one.
  final int dishSeconds;

  const Storefront({
    this.ratings = true,
    this.comments = true,
    this.bestseller = true,
    this.lowStock = true,
    this.soldOut = true,
    this.recommended = true,
    this.reviewsSource = 'all',
    this.reviewsMinStars = 4,
    this.reviewsPerBatch = 2,
    this.reviewsSeconds = 8,
    this.heroSeconds = 7,
    this.dishSeconds = 4,
  });

  static const defaults = Storefront();

  factory Storefront.fromMap(Map<String, dynamic> m) => Storefront(
    ratings: m['ratings'] as bool? ?? true,
    comments: m['comments'] as bool? ?? true,
    bestseller: m['bestseller'] as bool? ?? true,
    lowStock: m['low_stock'] as bool? ?? true,
    soldOut: m['sold_out'] as bool? ?? true,
    recommended: m['recommended'] as bool? ?? true,
    reviewsSource: m['reviews_source'] as String? ?? 'all',
    reviewsMinStars: (m['reviews_min_stars'] as num?)?.toInt() ?? 4,
    reviewsPerBatch: (m['reviews_per_batch'] as num?)?.toInt() ?? 2,
    reviewsSeconds: (m['reviews_seconds'] as num?)?.toInt() ?? 8,
    heroSeconds: (m['hero_seconds'] as num?)?.toInt() ?? 7,
    dishSeconds: (m['dish_seconds'] as num?)?.toInt() ?? 4,
  );
}

/// One review, with the words, for the showcase and the per-dish sheet.
class Review {
  final String id;
  final String dishId;
  final int rating;
  final String comment;
  final String? authorName;

  const Review({
    required this.id,
    required this.dishId,
    required this.rating,
    required this.comment,
    required this.authorName,
  });

  factory Review.fromMap(Map<String, dynamic> m) => Review(
    id: m['id'] as String? ?? '',
    dishId: m['dish_id'] as String? ?? '',
    rating: (m['rating'] as num?)?.toInt() ?? 0,
    comment: m['comment'] as String? ?? '',
    authorName: m['author_name'] as String?,
  );
}

class Shop {
  final String name;
  final String tagline;
  final String blurb;
  final String addressLine;
  final String district;
  final String city;
  final String province;
  final String phone;
  final List<ShopHours> hours;
  final Storefront storefront;

  const Shop({
    required this.name,
    required this.tagline,
    required this.blurb,
    required this.addressLine,
    required this.district,
    required this.city,
    required this.province,
    required this.phone,
    required this.hours,
    this.storefront = Storefront.defaults,
  });

  factory Shop.fromMap(Map<String, dynamic> m) => Shop(
    name: m['name'] as String? ?? 'Bencris',
    tagline: m['tagline'] as String? ?? '',
    blurb: m['blurb'] as String? ?? '',
    addressLine: m['address_line'] as String? ?? '',
    district: m['district'] as String? ?? '',
    city: m['city'] as String? ?? '',
    province: m['province'] as String? ?? '',
    phone: m['phone'] as String? ?? '',
    hours: ((m['hours'] as List?) ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(ShopHours.fromMap)
        .toList(),
    storefront: m['storefront'] == null
        ? Storefront.defaults
        : Storefront.fromMap(Map<String, dynamic>.from(m['storefront'] as Map)),
  );

  /// "Stall 12, Dasmariñas Bayan, Dasmariñas, Cavite"
  String get address => [
    addressLine,
    district,
    [city, province].where((p) => p.isNotEmpty).join(', '),
  ].where((p) => p.isNotEmpty).join(', ');

  /// Whether the shop is open right now, against the owner's own hours.
  ///
  /// Sunday takes the second row where there is one, matching the website. A row
  /// that cannot be parsed counts as closed: telling someone the shop is open
  /// when it is not is the failure that wastes a trip, which is the whole thing
  /// this system exists to prevent.
  bool get isOpenNow {
    if (hours.isEmpty) return false;
    final now = DateTime.now();
    final row = now.weekday == DateTime.sunday && hours.length > 1
        ? hours[1]
        : hours.first;

    final open = row.minutesFrom(row.opens);
    final close = row.minutesFrom(row.closes);
    if (open == null || close == null) return false;

    final mins = now.hour * 60 + now.minute;
    return mins >= open && mins < close;
  }
}

class ShopHours {
  final String days;
  final String opens;
  final String closes;

  const ShopHours({required this.days, required this.opens, required this.closes});

  factory ShopHours.fromMap(Map<String, dynamic> m) => ShopHours(
    days: m['days'] as String? ?? '',
    opens: m['opens'] as String? ?? '',
    closes: m['closes'] as String? ?? '',
  );

  /// Parses "6:00 AM" into minutes past midnight, or null if it is not a time.
  int? minutesFrom(String value) {
    final match = RegExp(r'^(\d{1,2}):(\d{2})\s*(AM|PM)$', caseSensitive: false)
        .firstMatch(value.trim());
    if (match == null) return null;

    var hour = int.parse(match.group(1)!) % 12;
    if (match.group(3)!.toUpperCase() == 'PM') hour += 12;
    return hour * 60 + int.parse(match.group(2)!);
  }
}

/// Loyalty progress, counted from completed orders rather than a separate tally
/// so the number can never drift from what actually happened.
class Loyalty {
  final int completed;
  final int untilNext;

  /// Rewards already earned, newest first, each with the code to type at
  /// checkout. These were being fetched and dropped, so a claimed reward lived
  /// only in the screen's memory and was gone on the next load.
  final List<LoyaltyReward> rewards;

  const Loyalty({
    required this.completed,
    required this.untilNext,
    this.rewards = const [],
  });

  factory Loyalty.fromMap(Map<String, dynamic> m) => Loyalty(
    completed: (m['completed'] as num?)?.toInt() ?? 0,
    untilNext: (m['until_next'] as num?)?.toInt() ?? 5,
    rewards: ((m['rewards'] as List?) ?? const [])
        .map((r) => LoyaltyReward.fromMap(Map<String, dynamic>.from(r as Map)))
        .toList(),
  );

  /// Filled stamps on the current card, 0 to 4.
  int get stamps => completed % 5;

  /// Whether a reward has been earned and not yet taken.
  ///
  /// Measured against what has actually been claimed rather than a flag on the
  /// screen, so the button does not reappear after a reload.
  bool get canClaim => completed ~/ 5 > rewards.length;
}

/// One earned loyalty reward.
class LoyaltyReward {
  final String id;
  final String code;
  final String label;
  final DateTime? redeemedAt;

  const LoyaltyReward({
    required this.id,
    required this.code,
    required this.label,
    this.redeemedAt,
  });

  factory LoyaltyReward.fromMap(Map<String, dynamic> m) => LoyaltyReward(
    id: m['id'] as String? ?? '',
    code: m['code'] as String? ?? '',
    label: m['label'] as String? ?? 'Loyalty reward',
    redeemedAt: m['redeemed_at'] == null
        ? null
        : DateTime.tryParse(m['redeemed_at'] as String),
  );

  bool get used => redeemedAt != null;
}

/// A discount the owner is running now.
class Promo {
  final String code;
  final String label;

  const Promo({required this.code, required this.label});

  factory Promo.fromMap(Map<String, dynamic> m) => Promo(
    code: m['code'] as String? ?? '',
    label: m['label'] as String? ?? '',
  );
}

/// What a discount code is worth on a given order, and why not if it is not.
class PromoPreview {
  final bool valid;
  final double discount;
  final String label;

  /// Empty when valid. Otherwise something the diner can act on, such as
  /// "Spend at least 100 to use this", rather than a bare rejection.
  final String reason;

  const PromoPreview({
    required this.valid,
    required this.discount,
    required this.label,
    required this.reason,
  });

  factory PromoPreview.fromMap(Map<String, dynamic> m) => PromoPreview(
    valid: m['valid'] as bool? ?? false,
    discount: (m['discount'] as num?)?.toDouble() ?? 0,
    label: m['label'] as String? ?? '',
    reason: m['reason'] as String? ?? '',
  );
}

/// How a dish has been rated by people who actually bought it.
class DishRating {
  final double average;
  final int total;

  const DishRating({required this.average, required this.total});

  factory DishRating.fromMap(Map<String, dynamic> m) => DishRating(
    average: (m['average'] as num?)?.toDouble() ?? 0,
    total: (m['total'] as num?)?.toInt() ?? 0,
  );
}

/// One rating this diner left, read back from the database.
class DishReview {
  final int rating;
  final String comment;

  /// When the diner first rated this. Never overwritten by an edit, so
  /// the hour below is measured from the rating rather than the last
  /// change — otherwise editing repeatedly would hold the window open.
  final DateTime? ratedAt;

  const DishReview({
    required this.rating,
    required this.comment,
    this.ratedAt,
  });

  /// Whether it can still be changed.
  ///
  /// A transcription of the interval inside `leave_review`, which is what
  /// actually refuses a late edit. This exists so the app can stop offering
  /// a control that would only produce a refusal, and so a mistap months
  /// later cannot quietly rewrite a dish's average.
  bool get editable {
    final at = ratedAt;
    if (at == null) return true;
    return DateTime.now().difference(at) < const Duration(hours: 1);
  }

  factory DishReview.fromMap(Map<String, dynamic> m) => DishReview(
    rating: (m['rating'] as num?)?.toInt() ?? 0,
    comment: m['comment'] as String? ?? '',
    ratedAt: DateTime.tryParse(m['created_at'] as String? ?? '')?.toLocal(),
  );
}

/// Something the shop needs to tell every diner today.
///
/// Always has an end: the database refuses a row without one. An announcement
/// is news, and a sign still reading "closing early today" on Thursday teaches
/// people to stop believing the banner.
class Announcement {
  final String id;
  final String message;

  /// 'notice' is ordinary news; 'warning' is something that costs the diner a
  /// wasted trip if they miss it.
  final String tone;
  final DateTime endsAt;

  const Announcement({
    required this.id,
    required this.message,
    required this.tone,
    required this.endsAt,
  });

  bool get isWarning => tone == 'warning';

  factory Announcement.fromMap(Map<String, dynamic> m) => Announcement(
    id: m['id'] as String? ?? '',
    message: m['message'] as String? ?? '',
    tone: m['tone'] as String? ?? 'notice',
    endsAt:
        DateTime.tryParse(m['ends_at'] as String? ?? '')?.toLocal() ??
        DateTime.now(),
  );
}

/// What the signup form collects beyond an email and a password.
///
/// The same six fields the website asks for, because they end up in the same
/// columns through the same database function. A form that collected a
/// different set would produce accounts that look different depending on which
/// app made them.
class NewAccount {
  final String firstName;
  final String? middleName;
  final String lastName;

  /// What the shop greets them by. Unique without case, 3 to 20 characters.
  final String username;

  /// Preferred over the username in a greeting, when set.
  final String? nickname;
  final String? phone;

  const NewAccount({
    required this.firstName,
    required this.lastName,
    required this.username,
    this.middleName,
    this.nickname,
    this.phone,
  });
}

/// A diner's own details, as the shop holds them.
class MyProfile {
  final String? email;
  final String? firstName;
  final String? middleName;
  final String? lastName;
  final String? username;
  final String? nickname;
  final String? phone;
  final String? fullName;

  const MyProfile({
    this.email,
    this.firstName,
    this.middleName,
    this.lastName,
    this.username,
    this.nickname,
    this.phone,
    this.fullName,
  });

  /// What to call this person, mirroring `public.display_name()`.
  ///
  /// Four columns might be somebody's name, and a receipt, a greeting and a
  /// staff list each picking a different one is how the same customer appears
  /// to be three people. Falls back to "there", so the worst case is "Welcome
  /// back, there" rather than a greeting with a hole in it.
  String get displayName {
    for (final candidate in [nickname, username, firstName, fullName]) {
      final value = candidate?.trim();
      if (value != null && value.isNotEmpty) return value;
    }
    return 'there';
  }

  factory MyProfile.fromMap(Map<String, dynamic> m) => MyProfile(
    email: m['email'] as String?,
    firstName: m['first_name'] as String?,
    middleName: m['middle_name'] as String?,
    lastName: m['last_name'] as String?,
    username: m['username'] as String?,
    nickname: m['nickname'] as String?,
    phone: m['phone'] as String?,
    fullName: m['full_name'] as String?,
  );
}

/// Somebody with an account, as the owner's People screen sees them.
///
/// Anonymous guests are not here: the database leaves them out, because there
/// is nothing to manage about a row with no email, no password and no name,
/// and the next visit mints another one.
class Person {
  final String id;
  final String? email;
  final String? firstName;
  final String? middleName;
  final String? lastName;
  final String? username;
  final String? nickname;
  final String displayName;
  final String? fullName;
  final String? phone;

  /// 'admin' | 'cashier' | 'customer'.
  final String role;

  /// When a suspension runs out, or null when they are not suspended. A ban is
  /// simply a suspension a hundred years away.
  final DateTime? bannedUntil;

  /// Null for staff, not zero: create_ticket deliberately leaves staff orders
  /// unattributed, so the figure does not apply rather than being none.
  final int? orders;
  final double? spent;
  final DateTime? lastOrder;

  const Person({
    required this.id,
    required this.displayName,
    required this.role,
    this.email,
    this.firstName,
    this.middleName,
    this.lastName,
    this.username,
    this.nickname,
    this.fullName,
    this.phone,
    this.bannedUntil,
    this.orders,
    this.spent,
    this.lastOrder,
  });

  bool get isSuspended => bannedUntil != null;

  /// A ban is a suspension far enough away that nobody outlives it.
  bool get isBanned =>
      bannedUntil != null &&
      bannedUntil!.difference(DateTime.now()).inDays > 365 * 50;

  factory Person.fromMap(Map<String, dynamic> m) => Person(
    id: m['id'] as String,
    email: m['email'] as String?,
    firstName: m['first_name'] as String?,
    middleName: m['middle_name'] as String?,
    lastName: m['last_name'] as String?,
    username: m['username'] as String?,
    nickname: m['nickname'] as String?,
    displayName: (m['display_name'] as String?) ?? 'Somebody',
    fullName: m['full_name'] as String?,
    phone: m['phone'] as String?,
    role: (m['role'] as String?) ?? 'customer',
    bannedUntil: DateTime.tryParse(m['banned_until'] as String? ?? '')?.toLocal(),
    orders: (m['orders'] as num?)?.toInt(),
    spent: (m['spent'] as num?)?.toDouble(),
    lastOrder: DateTime.tryParse(m['last_order'] as String? ?? '')?.toLocal(),
  );
}
