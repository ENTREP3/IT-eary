import 'dart:convert';

import 'package:flutter/material.dart';

/// Shows a dish's photo, however it happens to be stored.
///
/// The web admin encodes an uploaded photo as a `data:` URI directly in the
/// column rather than uploading it to storage. `Image.network` fetches a URL
/// through the platform's HTTP stack, which does not understand that scheme
/// outside a browser tab — so a photo added on the web rendered fine on the
/// website and quietly failed everywhere else the app runs natively. This
/// decodes it locally instead, which is what makes a photo look the same
/// wherever it is opened.
class DishImage extends StatelessWidget {
  const DishImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
    this.errorBuilder,
    this.loadingBuilder,
  });

  final String url;
  final BoxFit fit;
  final double? width;
  final double? height;
  final Widget Function(BuildContext, Object, StackTrace?)? errorBuilder;
  final Widget Function(BuildContext, Widget, ImageChunkEvent?)?
  loadingBuilder;

  @override
  Widget build(BuildContext context) {
    if (url.startsWith('data:')) {
      final comma = url.indexOf(',');
      try {
        final bytes = base64Decode(comma < 0 ? url : url.substring(comma + 1));
        return Image.memory(
          bytes,
          fit: fit,
          width: width,
          height: height,
          errorBuilder: errorBuilder,
        );
      } catch (e, st) {
        return errorBuilder?.call(context, e, st) ?? const SizedBox.shrink();
      }
    }

    return Image.network(
      url,
      fit: fit,
      width: width,
      height: height,
      errorBuilder: errorBuilder,
      loadingBuilder: loadingBuilder,
    );
  }
}
