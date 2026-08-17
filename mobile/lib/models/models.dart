/// Data models mirroring the Supabase schema (supabase/migrations).
library;

class Dish {
  final String id;
  final String name;
  final String tagalog;
  final double price;
  final String category;
  final String description;
  final String image;
  final bool available;

  const Dish({
    required this.id,
    required this.name,
    required this.tagalog,
    required this.price,
    required this.category,
    required this.description,
    required this.image,
    required this.available,
  });

  factory Dish.fromMap(Map<String, dynamic> m) => Dish(
    id: m['id'] as String,
    name: m['name'] as String? ?? '',
    tagalog: m['tagalog'] as String? ?? '',
    price: (m['price'] as num?)?.toDouble() ?? 0,
    category: m['category'] as String? ?? 'Ulam',
    description: m['description'] as String? ?? '',
    image: m['image'] as String? ?? '',
    available: m['available'] as bool? ?? true,
  );
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

  const InventoryItem({
    required this.id,
    required this.name,
    required this.stock,
    required this.unit,
    required this.reorderAt,
    required this.lastDelivery,
  });

  factory InventoryItem.fromMap(Map<String, dynamic> m) => InventoryItem(
    id: m['id'] as String,
    name: m['name'] as String? ?? '',
    stock: (m['stock'] as num?)?.toDouble() ?? 0,
    unit: m['unit'] as String? ?? '',
    reorderAt: (m['reorder_at'] as num?)?.toDouble() ?? 0,
    lastDelivery: m['last_delivery'] as String?,
  );

  bool get isLow => stock <= reorderAt;
  bool get isOut => stock <= 0;

  /// 0–1 fill for the level bar, matching the web admin's scale.
  double get level =>
      reorderAt <= 0 ? 1 : (stock / (reorderAt * 2.5)).clamp(0, 1).toDouble();
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

  const Loyalty({required this.completed, required this.untilNext});

  factory Loyalty.fromMap(Map<String, dynamic> m) => Loyalty(
    completed: (m['completed'] as num?)?.toInt() ?? 0,
    untilNext: (m['until_next'] as num?)?.toInt() ?? 5,
  );

  /// Filled stamps on the current card, 0 to 4.
  int get stamps => completed % 5;
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
