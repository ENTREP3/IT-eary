import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../services/api.dart';
import '../state/cart.dart';
import '../../theme.dart';
import 'about_screen.dart';
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
      if (!mounted) return;
      setState(() {
        _dishes = dishes;
        _categories = cats;
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
    final visible = _dishes.where((d) => d.category == _category).toList();

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
                const Text(
                  'Kain na, tayo na.',
                  style: TextStyle(
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
              itemBuilder: (_, i) => _DishCard(dish: visible[i]),
            ),
          ),
      ],
    );
  }
}

class _DishCard extends StatelessWidget {
  const _DishCard({required this.dish});

  final Dish dish;

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<Cart>();
    final qty = cart.qtyOf(dish.id);

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
                          ],
                        ),
                      ),
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
                    const Center(
                      child: Text(
                        'SOLD OUT',
                        style: TextStyle(
                          letterSpacing: 3,
                          fontSize: 12,
                          color: Palette.red,
                        ),
                      ),
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
          TextSpan(text: 'IT'),
          TextSpan(
            text: '-eary',
            style: TextStyle(fontStyle: FontStyle.italic, color: Palette.red),
          ),
        ],
      ),
    );
  }
}
