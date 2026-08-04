import 'package:flutter/material.dart';

import '../../../tokens.dart';

/// Panel surface shared by every admin tab.
class AdminCard extends StatelessWidget {
  const AdminCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.borderColor,
    this.background,
  });

  final Widget child;
  final EdgeInsets padding;
  final Color? borderColor;
  final Color? background;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: background ?? Tokens.staffCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: borderColor ?? Tokens.staffInk.withValues(alpha: 0.1),
        ),
      ),
      child: child,
    );
  }
}

/// Uppercase micro-label used above every figure and section.
class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) => Text(
        text.toUpperCase(),
        style: TextStyle(
          fontSize: 10,
          letterSpacing: 2.5,
          fontWeight: FontWeight.w600,
          color: color ?? Tokens.staffInk.withValues(alpha: 0.45),
        ),
      );
}

/// One headline number.
class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.label, required this.value, this.delta, this.good});

  final String label;
  final String value;
  final String? delta;
  final bool? good;

  @override
  Widget build(BuildContext context) {
    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Eyebrow(label),
          const SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w700,
                color: Tokens.staffInk,
              ),
            ),
          ),
          if (delta != null) ...[
            const SizedBox(height: 2),
            Text(
              delta!,
              style: TextStyle(
                fontSize: 11,
                color: (good ?? true) ? Tokens.semanticGood : Tokens.semanticAlert,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Section heading with an optional trailing action.
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.eyebrow,
    required this.title,
    this.trailing,
  });

  final String eyebrow;
  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Eyebrow(eyebrow),
              const SizedBox(height: 2),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: Tokens.staffInk,
                ),
              ),
            ],
          ),
        ),
        ?trailing,
      ],
    );
  }
}

/// Small coloured pill for statuses and payment methods.
class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, required this.color, this.icon});

  final String text;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 11, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            text,
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color),
          ),
        ],
      ),
    );
  }
}

String peso(num v) => '₱${v.toStringAsFixed(2)}';

String shortTime(DateTime d) {
  final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
  return '$h:${d.minute.toString().padLeft(2, '0')} ${d.hour < 12 ? 'AM' : 'PM'}';
}
