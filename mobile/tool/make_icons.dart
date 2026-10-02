// Draws the launcher icon for each of the three apps.
//
//   dart run tool/make_icons.dart
//
// Run when the mark or the colours change; the PNGs it writes are committed, so
// a normal build does not need this.
//
// ---------------------------------------------------------------------------
// Why this exists at all
//
// Every build was still shipping `ic_launcher.png` exactly as `flutter create`
// left it — the Flutter logo. It went unnoticed because it looks deliberate:
// a blue mark on a home screen reads as *an* icon, and nobody opening the app
// they just installed stops to ask whether the tile belongs to the shop.
//
// It stopped being survivable once the counter and owner apps got their own
// builds. Three tiles with the same borrowed logo, differing only by the name
// underneath, on a phone passed between people at a counter, is a tap away from
// the wrong app at the wrong moment.
//
// ---------------------------------------------------------------------------
// Drawn rather than designed
//
// A bowl and steam, in flat colour, built from circles and rectangles. It is
// not art, and a designer should replace it. It is legible at 48px, it is the
// same mark in three colourways so the three apps read as one family, and it is
// unmistakably not the Flutter logo — which is the whole job.
import 'dart:io';

import 'package:image/image.dart';

/// The densities Android expects, and the pixel size of each.
const densities = <String, int>{
  'mdpi': 48,
  'hdpi': 72,
  'xhdpi': 96,
  'xxhdpi': 144,
  'xxxhdpi': 192,
};

class Flavour {
  const Flavour(this.dir, this.ground, this.mark);

  /// The source set the icons are written into, which is the flavor's name.
  final String dir;

  /// Background, and the colour of the bowl drawn on it.
  final (int, int, int) ground;
  final (int, int, int) mark;
}

const flavours = [
  // The shop's red, which is the storefront's accent.
  Flavour('customer', (200, 68, 42), (244, 234, 213)),
  // A cold blue, as far from the customer's red as the palette goes.
  Flavour('counter', (30, 111, 142), (244, 234, 213)),
  // The dashboard's amber, with a dark mark so it does not glare.
  Flavour('owner', (232, 168, 74), (26, 20, 16)),
];

/// Where the web app's copies go, relative to this project.
///
/// The same mark serves the website, which had the same problem twice over: it
/// had no installable icon at all, and the one notifications were showing was
/// the Flutter logo.
const webOut = '../public';

/// What the web calls each surface's icon. The three sites are one build served
/// at three addresses, so all three sets ship together and each picks its own.
const webNames = {
  'customer': 'icon',
  'counter': 'icon-counter',
  'owner': 'icon-owner',
};

void main() {
  for (final f in flavours) {
    for (final entry in densities.entries) {
      final img = _icon(entry.value, f);
      final path =
          'android/app/src/${f.dir}/res/mipmap-${entry.key}/ic_launcher.png';
      File(path).parent.createSync(recursive: true);
      File(path).writeAsBytesSync(encodePng(img));
    }
    stdout.writeln('wrote ${densities.length} icons for ${f.dir}');

    // 192 is what a notification and a home-screen tile use; 512 is what an
    // install prompt wants, and refusing to offer one for the want of it is
    // exactly the failure this is fixing.
    for (final size in [192, 512]) {
      final path = '$webOut/${webNames[f.dir]}-$size.png';
      File(path).writeAsBytesSync(encodePng(_icon(size, f)));
    }
    stdout.writeln('  + web ${webNames[f.dir]}-192/512.png');
  }
}

Image _icon(int size, Flavour f) {
  final img = Image(width: size, height: size, numChannels: 4);
  final ground = ColorRgb8(f.ground.$1, f.ground.$2, f.ground.$3);
  final mark = ColorRgb8(f.mark.$1, f.mark.$2, f.mark.$3);

  fill(img, color: ground);

  // Everything below is expressed as a fraction of the canvas, so the same
  // drawing holds at 48px and at 192px.
  double u(double fraction) => size * fraction;

  final cx = size / 2;

  // The bowl: a disc with its top half painted back out, leaving a half-round.
  final bowlY = u(0.56);
  final r = u(0.27);
  fillCircle(img, x: cx.round(), y: bowlY.round(), radius: r.round(), color: mark);
  fillRect(
    img,
    x1: 0,
    y1: 0,
    x2: size,
    y2: bowlY.round() - 1,
    color: ground,
  );

  // The rim, a touch wider than the bowl so it reads as a lip.
  fillRect(
    img,
    x1: (cx - r - u(0.045)).round(),
    y1: (bowlY - u(0.055)).round(),
    x2: (cx + r + u(0.045)).round(),
    y2: (bowlY - u(0.005)).round(),
    color: mark,
  );

  // Steam: three strokes, the middle one taller, above the rim.
  final steamW = u(0.055);
  final steamTopShort = u(0.17);
  final steamTopTall = u(0.12);
  final steamBottom = bowlY - u(0.12);

  for (final (dx, top) in [
    (-u(0.145), steamTopShort),
    (0.0, steamTopTall),
    (u(0.145), steamTopShort),
  ]) {
    fillRect(
      img,
      x1: (cx + dx - steamW / 2).round(),
      y1: top.round(),
      x2: (cx + dx + steamW / 2).round(),
      y2: steamBottom.round(),
      color: mark,
    );
  }

  return img;
}
