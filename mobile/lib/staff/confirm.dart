import 'package:flutter/material.dart';

import '../tokens.dart';

/// Asks before something that cannot be taken back.
///
/// The website has had one of these since the beginning; the phone did not, so
/// every screen that needed to ask wrote its own dialog and the ones that
/// forgot simply did not ask. Cancelling an order on the kitchen board was a
/// single tap — and cancelling returns the stock to the shelf and reverses the
/// sale, on a screen used at arm's length with wet hands over a hot counter.
///
/// Two things it deliberately does.
///
/// The button says what will happen — "Cancel order", "Delete dish" — rather
/// than "OK". A dialog whose buttons are "Cancel" and "OK" is genuinely
/// ambiguous when the action itself is called cancelling, and that is exactly
/// the case that matters most here.
///
/// Dismissing it counts as no. Tapping outside, the back gesture, and the
/// second button all mean the same thing, because the safe answer should be
/// the easy one to give by accident.
Future<bool> confirmAction(
  BuildContext context, {
  required String title,
  required String body,
  /// What the confirming button says. An imperative, not "OK".
  required String action,
  /// Red for anything that destroys or reverses; plain for the rest.
  bool danger = true,
}) async {
  final said = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(body, style: const TextStyle(height: 1.5)),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Not now'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          style: TextButton.styleFrom(
            foregroundColor: danger ? Tokens.semanticAlert : Tokens.staffAccent,
          ),
          child: Text(action),
        ),
      ],
    ),
  );

  // Null is the dismiss — tapped outside, or backed out. Treated as no.
  return said ?? false;
}
