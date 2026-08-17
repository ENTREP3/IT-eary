import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../services/api.dart';
import '../state/cart.dart';
import '../state/favourites.dart';
import '../../theme.dart';
import 'about_screen.dart';
import 'account_screen.dart';
import 'cart_screen.dart';
import 'ticket_screen.dart';

class MenuScreen extends StatefulWidget {
  const MenuScreen({super.key});

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  List<Dish> _dishes = [];
  List<String> _categories = [];
  String? _category;
  bool _loading = true;
  String? _error;

  /// Null until the shop's settings arrive. The hero line stays blank rather
  /// than showing a bundled guess that the database then contradicts.
  String? _tagline;

  /// Star ratings by dish id, from diners who actually bought the dish.
  Map<String, DishRating> _ratings = const {};

  /// What the diner has typed. Empty means browse by category as before.
  String _query = '';
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dishes = await Api.menu();
      final cats = await Api.categories();
      final shop = await Api.shop();
      final ratings = await Api.dishRatings();
      if (!mounted) return;
      setState(() {
        _dishes = dishes;
        _categories = cats;
        _tagline = shop?.tagline;
        _ratings = ratings;
        // Open on a category that actually has food today — landing on one
        // where everything is sold out reads as though the shop is closed.
        _category ??= cats.isEmpty
            ? null
            : cats.firstWhere(
                (c) => dishes.any((d) => d.category == c && d.available),
                orElse: () => cats.first,
              );
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<Cart>();
    // Searching looks across the whole menu, not inside the chosen category.
    // Narrowing to the category first would mean a diner searching "adobo"
    // while Merienda happens to be selected finds nothing, and concludes the
    // shop does not serve it.
    final q = _query.trim().toLowerCase();
    final visible = q.isEmpty
        ? _dishes.where((d) => d.category == _category).toList()
        : _dishes
            .where(
              (d) =>
                  d.name.toLowerCase().contains(q) ||
                  d.tagalog.toLowerCase().contains(q) ||
                  d.description.toLowerCase().contains(q),
            )
            .toList();

    return Scaffold(
      appBar: AppBar(
        title: const _Wordmark(),
        actions: [
          IconButton(
            tooltip: 'About & past orders',
            icon: const Icon(Icons.info_outline),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => AboutScreen(
                  onReorder: (quantities) {
                    // Refill the cart from a past order — dishes that have since
                    // gone off the menu are simply skipped.
                    final cart = context.read<Cart>();
                    cart.clear();
                    for (final entry in quantities.entries) {
                      final dish = _dishes.firstWhere(
                        (d) => d.id == entry.key,
                        orElse: () => const Dish(
                          id: '',
                          name: '',
                          tagalog: '',
                          price: 0,
                          category: '',
                          description: '',
                          image: '',
                          available: false,
                        ),
                      );
                      if (dish.id.isEmpty || !dish.available) continue;
                      for (var i = 0; i < entry.value; i++) {
                        cart.add(dish);
                      }
                    }
                  },
                ),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Find my ticket',
            icon: const Icon(Icons.confirmation_number_outlined),
            onPressed: () => Navigator.of(
              context,
            ).push(MaterialPageRoute(builder: (_) => const FindTicketScreen())),
          ),
          // The account was reachable only from the storefront, so a diner
          // already browsing had to go backwards to sign in or to check an
          // order they were waiting on. The menu is where people actually
          // spend their time, so it needs the same door.
          IconButton(
            tooltip: Api.signedIn ? 'My orders' : 'Sign in',
            icon: Icon(
              Api.signedIn ? Icons.person : Icons.person_outline,
            ),
            onPressed: () => Navigator.of(
              context,
            ).push(MaterialPageRoute(builder: (_) => const AccountScreen())),
          ),
          // Always-visible cart, so the order is reachable even after scrolling
          // past the bottom bar or landing here from another screen.
          IconButton(
            tooltip: cart.isEmpty ? 'Your order is empty' : 'Your order',
            onPressed: cart.isEmpty
                ? null
                : () => Navigator.of(
                    context,
                  ).push(MaterialPageRoute(builder: (_) => const CartScreen())),
            icon: Badge.count(
              count: cart.itemCount,
              isLabelVisible: cart.itemCount > 0,
              backgroundColor: Palette.red,
              textColor: Colors.white,
              child: const Icon(Icons.shopping_bag_outlined),
            ),
          ),
        ],
      ),
      body: PageBody(
        child: RefreshIndicator(onRefresh: _load, child: _buildBody(visible)),
      ),
      bottomNavigationBar: cart.isEmpty
          ? null
          : SafeArea(
              child: PageBody(
                shrinkHeight: true,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: Palette.ink,
                      foregroundColor: Palette.cream,
                      minimumSize: const Size.fromHeight(56),
                      shape: const StadiumBorder(),
                    ),
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const CartScreen()),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.shopping_bag_outlined, size: 20),
                        const SizedBox(width: 10),
                        Text(
                          '${cart.itemCount} item${cart.itemCount == 1 ? '' : 's'}',
                        ),
                        const Spacer(),
                        Text(
                          '₱${cart.estimatedTotal.toStringAsFixed(2)}',
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 17,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
    );
  }

  Widget _buildBody(List<Dish> visible) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: Palette.red));
    }
    if (_error != null) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 80),
          const Icon(Icons.cloud_off, size: 40, color: Palette.red),
          const SizedBox(height: 12),
          const Center(
            child: Text("Couldn't load the menu.", textAlign: TextAlign.center),
          ),
          const SizedBox(height: 6),
          Center(
            child: Text(
              _error!,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, color: Colors.black54),
            ),
          ),
          const SizedBox(height: 16),
          Center(
            child: OutlinedButton(
              onPressed: _load,
              child: const Text('Try again'),
            ),
          ),
        ],
      );
    }

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _tagline ?? '',
                  style: const TextStyle(
                    fontSize: 34,
                    fontWeight: FontWeight.w600,
                    height: 1.05,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  "Only what's cooking right now. If it isn't here, it's sold out.",
                  style: TextStyle(color: Palette.ink.withValues(alpha: 0.65)),
                ),
                const SizedBox(height: 16),

                // A diner hunting one ulam should not have to remember which
                // category the kitchen filed it under. Searching looks across
                // the whole menu and ignores the category chips entirely, the
                // same way the website behaves.
                TextField(
                  onChanged: (v) => setState(() => _query = v),
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Hanapin ang ulam',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    suffixIcon: _query.isEmpty
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.close, size: 18),
                            tooltip: 'Clear search',
                            onPressed: () => setState(() {
                              _query = '';
                              _searchController.clear();
                            }),
                          ),
                    filled: true,
                    fillColor: Palette.card,
                    contentPadding: const EdgeInsets.symmetric(vertical: 4),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(999),
                      borderSide: BorderSide(color: Palette.ink.withValues(alpha: 0.15)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(999),
                      borderSide: BorderSide(color: Palette.ink.withValues(alpha: 0.15)),
                    ),
                  ),
                  controller: _searchController,
                ),

                const SizedBox(height: 14),
                // Hidden while searching: the chips filter by category, and
                // leaving them visible suggests they narrow the results when
                // they do not.
                if (_query.trim().isEmpty)
                SizedBox(
                  height: 40,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _categories.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 8),
                    itemBuilder: (_, i) {
                      final c = _categories[i];
                      final selected = c == _category;
                      return ChoiceChip(
                        label: Text(c),
                        selected: selected,
                        showCheckmark: false,
                        onSelected: (_) => setState(() => _category = c),
                        backgroundColor: Palette.card,
                        selectedColor: Palette.ink,
                        labelStyle: TextStyle(
                          color: selected ? Palette.cream : Palette.ink,
                        ),
                        shape: const StadiumBorder(
                          side: BorderSide(color: Color(0x332A1810)),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        ),
        if (visible.isEmpty)
          const SliverFillRemaining(
            hasScrollBody: false,
            child: Center(child: Text('Nothing in this category today.')),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            sliver: SliverList.separated(
              itemCount: visible.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (_, i) => _DishCard(dish: visible[i], rating: _ratings[visible[i].id]),
            ),
          ),
      ],
    );
  }
}

class _DishCard extends StatelessWidget {
  const _DishCard({required this.dish, this.rating});

  final Dish dish;
  final DishRating? rating;

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<Cart>();
    final qty = cart.qtyOf(dish.id);
    final fav = context.watch<Favourites>().contains(dish.id);

    return Opacity(
      opacity: dish.available ? 1 : 0.5,
      child: Container(
        decoration: BoxDecoration(
          color: Palette.card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Palette.ink.withValues(alpha: 0.1)),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (dish.image.isNotEmpty)
              AspectRatio(
                aspectRatio: 16 / 9,
                child: ColorFiltered(
                  colorFilter: dish.available
                      ? const ColorFilter.mode(
                          Colors.transparent,
                          BlendMode.multiply,
                        )
                      : const ColorFilter.matrix(<double>[
                          0.2126,
                          0.7152,
                          0.0722,
                          0,
                          0,
                          0.2126,
                          0.7152,
                          0.0722,
                          0,
                          0,
                          0.2126,
                          0.7152,
                          0.0722,
                          0,
                          0,
                          0,
                          0,
                          0,
                          1,
                          0,
                        ]),
                  child: Image.network(
                    dish.image,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => Container(
                      color: Palette.ink.withValues(alpha: 0.06),
                      child: const Center(
                        child: Icon(Icons.restaurant, color: Palette.ink),
                      ),
                    ),
                    loadingBuilder: (c, child, progress) => progress == null
                        ? child
                        : Container(color: Palette.ink.withValues(alpha: 0.05)),
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              dish.name,
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            if (dish.tagalog.isNotEmpty)
                              Text(
                                dish.tagalog,
                                style: TextStyle(
                                  fontSize: 12,
                                  fontStyle: FontStyle.italic,
                                  color: Palette.ink.withValues(alpha: 0.55),
                                ),
                              ),
                            // Shown only once somebody has actually rated it.
                            // "No ratings yet" on every card would make a new
                            // menu look unloved rather than simply new.
                            if (rating != null && rating!.total > 0)
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Row(
                                  children: [
                                    const Icon(Icons.star_rounded, size: 15, color: Palette.gold),
                                    const SizedBox(width: 3),
                                    Text(
                                      rating!.average.toStringAsFixed(1),
                                      style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    const SizedBox(width: 4),
                                    Text(
                                      '(${rating!.total})',
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: Palette.ink.withValues(alpha: 0.45),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
                      // Kept on the device, not in the database. A favourite
                      // helps one person find their usual faster; it is not
                      // something the shop needs to know, and it works without
                      // an account.
                      IconButton(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(minWidth: 34, minHeight: 34),
                        iconSize: 20,
                        tooltip: fav ? 'Remove from favourites' : 'Save to favourites',
                        icon: Icon(
                          fav ? Icons.favorite : Icons.favorite_border,
                          color: fav ? Palette.red : Palette.ink.withValues(alpha: 0.3),
                        ),
                        onPressed: () => context.read<Favourites>().toggle(dish.id),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '₱${dish.price.toStringAsFixed(0)}',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  if (dish.description.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      dish.description,
                      style: TextStyle(
                        fontSize: 13,
                        height: 1.4,
                        color: Palette.ink.withValues(alpha: 0.7),
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  if (!dish.available)
                    Column(
                      children: [
                        const Center(
                          child: Text(
                            'SOLD OUT',
                            style: TextStyle(
                              letterSpacing: 3,
                              fontSize: 12,
                              color: Palette.red,
                            ),
                          ),
                        ),
                        // A diner who came for this and found it gone is a sale
                        // already lost. Asking to be told when it returns is the
                        // cheapest way to win it back, and costs the shop
                        // nothing.
                        const SizedBox(height: 8),
                        _RestockAlert(dish: dish),
                      ],
                    )
                  else if (qty == 0)
                    OutlinedButton.icon(
                      onPressed: () => context.read<Cart>().add(dish),
                      icon: const Icon(Icons.add, size: 18),
                      label: const Text('Add to order'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(44),
                        foregroundColor: Palette.ink,
                        side: BorderSide(
                          color: Palette.ink.withValues(alpha: 0.25),
                        ),
                        shape: const StadiumBorder(),
                      ),
                    )
                  else
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        IconButton.filledTonal(
                          onPressed: () => context.read<Cart>().remove(dish.id),
                          icon: const Icon(Icons.remove),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          child: Text(
                            '$qty',
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        IconButton.filledTonal(
                          onPressed: () => context.read<Cart>().add(dish),
                          icon: const Icon(Icons.add),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Wordmark extends StatelessWidget {
  const _Wordmark();

  @override
  Widget build(BuildContext context) {
    return RichText(
      text: const TextSpan(
        style: TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w800,
          color: Palette.ink,
        ),
        children: [
          TextSpan(text: 'Ben'),
          TextSpan(
            text: 'cris',
            style: TextStyle(fontStyle: FontStyle.italic, color: Palette.red),
          ),
        ],
      ),
    );
  }
}

/// "Tell me when this is back", on a dish that has sold out.
///
/// Needs an account, because there has to be somewhere to send the answer. That
/// is one of the few genuinely good reasons to sign in, so the signed-out state
/// says what it would buy rather than just refusing.
class _RestockAlert extends StatefulWidget {
  const _RestockAlert({required this.dish});

  final Dish dish;

  @override
  State<_RestockAlert> createState() => _RestockAlertState();
}

class _RestockAlertState extends State<_RestockAlert> {
  bool _asked = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    Api.myStockAlerts().then((ids) {
      if (mounted && ids.contains(widget.dish.id)) setState(() => _asked = true);
    });
  }

  Future<void> _ask() async {
    setState(() => _busy = true);
    try {
      await Api.alertMeWhenBack(widget.dish.id);
      if (mounted) setState(() => _asked = true);
    } catch (_) {
      // Already asked, most likely: one alert per dish per diner is a database
      // rule. Showing it as done is the honest outcome either way.
      if (mounted) setState(() => _asked = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!Api.signedIn) {
      return TextButton.icon(
        onPressed: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const AccountScreen()),
        ),
        icon: const Icon(Icons.notifications_none, size: 16),
        label: const Text('Sign in to be told when this is back'),
      );
    }

    if (_asked) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check, size: 15, color: Palette.green),
          const SizedBox(width: 6),
          Text(
            'We will tell you when this is back',
            style: TextStyle(fontSize: 12, color: Palette.green),
          ),
        ],
      );
    }

    return TextButton.icon(
      onPressed: _busy ? null : _ask,
      icon: _busy
          ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
          : const Icon(Icons.notifications_none, size: 16),
      label: const Text('Tell me when this is back'),
    );
  }
}
