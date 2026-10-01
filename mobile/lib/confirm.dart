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

/// Says one thing and waits to be acknowledged.
///
/// The counterpart to [confirmAction], for when there is nothing to decide:
/// the action has already not happened, and the only question is whether it
/// was read. A snackbar was doing this job and is the wrong shape for it — it
/// slides away on its own, and the kitchen board is glanced at between orders
/// rather than watched.
///
/// One button, and it does not offer a way out, because there is nothing to
/// back out of. A dialog with "Cancel" beside "OK" on a message invites the
/// reader to wonder which of them undoes the thing.
Future<void> showNotice(
  BuildContext context, {
  required String title,
  required String body,
}) async {
  await showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(body, style: const TextStyle(height: 1.5)),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          style: TextButton.styleFrom(foregroundColor: Tokens.staffAccent),
          child: const Text('Got it'),
        ),
      ],
    ),
  );
}
