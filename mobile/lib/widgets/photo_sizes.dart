/// Two copies of every dish photo, and which one to ask for.
library;

import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// Longest edge of the display copy. Comfortably fills a full-width hero.
const displayWidth = 2000;

/// Quality of the display copy. Visually lossless at this size.
const displayQuality = 88;

/// The stored path of the display copy that belongs to an original.
String displayPath(String originalPath) {
  final dot = originalPath.lastIndexOf('.');
  final slash = originalPath.lastIndexOf('/');
  final stem = dot > slash && dot > 0
      ? originalPath.substring(0, dot)
      : originalPath;
  return '$stem-lg.jpg';
}

/// The URL a card, hero or thumbnail should load.
///
/// Anything that is not one of our uploads — a data URI from before photos had
/// a bucket, or a link typed in by hand — is handed back untouched, because no
/// smaller copy of it exists.
String displayPhoto(String url) {
  if (url.isEmpty ||
      url.startsWith('data:') ||
      !url.contains('/dish-photos/')) {
    return url;
  }
  final q = url.indexOf('?');
  if (q < 0) return displayPath(url);
  return '${displayPath(url.substring(0, q))}${url.substring(q)}';
}

/// Shrinks picked bytes to the display size, as a JPEG.
///
/// Returns null when the format cannot be decoded, which is the honest outcome
/// for something this package does not understand — an iPhone HEIC, say. The
/// original still uploads and the card falls back to it.
Uint8List? makeDisplayCopy(Uint8List bytes) {
  final decoded = img.decodeImage(bytes);
  if (decoded == null) return null;

  final longest = decoded.width > decoded.height
      ? decoded.width
      : decoded.height;
  // Already small enough. Re-encoding would only lose detail for nothing.
  if (longest <= displayWidth) return null;

  final resized = decoded.width >= decoded.height
      ? img.copyResize(decoded, width: displayWidth)
      : img.copyResize(decoded, height: displayWidth);
  return img.encodeJpg(resized, quality: displayQuality);
}
