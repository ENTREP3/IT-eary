import 'package:flutter/material.dart';

import '../tokens.dart';

/// Asks before something that cannot be taken back.
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
