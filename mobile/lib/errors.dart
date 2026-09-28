/// What a person should be told when something fails.
///
/// Diners and cashiers were being shown whatever came back off the wire:
/// `PostgrestException(message: ..., code: 23505)`, `SocketException`,
/// `AuthApiException`. Those sentences are written for whoever is going to fix
/// the problem, and the person reading them is standing at a counter with a
/// queue behind them. They cannot act on any of it, and it reads as though the
/// shop is broken.
///
/// The one thing worth passing through untouched is the shop's own rules.
/// Every `raise exception` in the database — "ticket K7M2Q9 has been paid for,
/// refund it rather than cancelling it" — comes back as SQLSTATE **P0001**, and
/// those were written for exactly this moment. Anything with a real SQLSTATE,
/// or no code at all, is machinery and gets translated.
///
/// The rule of thumb for the wording: say what happened, and say what to do
/// next. "Try again" is only useful where trying again might actually work.
library;

import 'dart:async';
import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';


/// Our own rules speak for themselves; everything else is translated.
const _ours = 'P0001';

String humanError(
  Object? e, [
  String fallback = 'Something went wrong. Please try again.',
]) {
  if (e == null) return fallback;

  // ---- the connection ------------------------------------------------------
  if (e is SocketException || e is HttpException) {
    return 'Cannot reach the shop right now. Check your connection and try again.';
  }
  if (e is TimeoutException) {
    return 'That took too long to answer. Please try again.';
  }

  if (e is PostgrestException) {
    // Written by us, for this exact situation.
    if (e.code == _ours) return e.message;

    switch (e.code) {
      case '23505':
        return 'That already exists.';
      case '23503':
        return 'Something this depends on is missing, so it cannot be saved.';
      case '23514':
      case '22P02':
        return 'One of those values is not allowed.';
      case '23502':
        return 'Something required was left blank.';
      case '42501':
        return 'You do not have permission to do that.';
      case 'PGRST116':
        return 'Nothing was found.';
    }
    final low = e.message.toLowerCase();
    if (low.contains('row-level security') || low.contains('permission denied')) {
      return 'You do not have permission to do that.';
    }
    if (low.contains('jwt')) {
      return 'You have been signed out. Please sign in again.';
    }
    // Machinery. The real text still reaches the log for whoever fixes it.
    assert(() {
      // ignore: avoid_print
      print('[error] ${e.code}: ${e.message}');
      return true;
    }());
    return fallback;
  }

  if (e is AuthException) {
    final low = e.message.toLowerCase();
    if (low.contains('invalid login credentials')) {
      return 'That email and password do not match.';
    }
    if (low.contains('already registered')) {
      return 'There is already an account with that email. Try signing in instead.';
    }
    if (low.contains('email not confirmed')) {
      return 'Check your email and confirm the address before signing in.';
    }
    if (low.contains('password should be') || low.contains('weak password')) {
      return 'That password is too weak. Use a longer one.';
    }
    if (low.contains('too many')) {
      return 'Too many tries in a row. Wait a moment and try again.';
    }
    if (low.contains('expired') || low.contains('jwt')) {
      return 'You have been signed out. Please sign in again.';
    }
    return fallback;
  }

  if (e is StorageException) {
    final low = e.message.toLowerCase();
    if (low.contains('exceeded') || low.contains('too large')) {
      return 'That file is too large.';
    }
    return 'That file could not be sent. Please try again.';
  }

  final raw = e.toString().toLowerCase();
  if (raw.contains('failed host lookup') ||
      raw.contains('connection') ||
      raw.contains('network')) {
    return 'Cannot reach the shop right now. Check your connection and try again.';
  }
  if (raw.contains('timeout')) {
    return 'That took too long to answer. Please try again.';
  }

  assert(() {
    // ignore: avoid_print
    print('[error] $e');
    return true;
  }());
  return fallback;
}
