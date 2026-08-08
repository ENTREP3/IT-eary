# The three mobile apps, built and served without Flutter installed on the host.
#
# `flutter run` ties the app to the development machine, which is what forced a
# phone onto the same Wi-Fi as the laptop. Building here instead produces plain
# static files that any device on the network can open, and that behave exactly
# as they will once deployed. The backend is the hosted Supabase project either
# way, so nothing in here needs a database.

# ---- build: one Flutter SDK, three targets ----
FROM ghcr.io/cirruslabs/flutter:stable AS build
WORKDIR /app

# build_pwas.mjs drives the three builds and rewrites each manifest, so Node has
# to be present alongside Flutter.
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# Dependencies first: pubspec rarely changes, so this layer is reused across
# code edits and keeps the slow resolve out of the common path.
COPY pubspec.yaml pubspec.lock ./
RUN flutter pub get

COPY . .
RUN node build_pwas.mjs

# ---- apk: the installable Android app for diners ----
#
# Only the customer app. A diner scanning a poster on the wall wants to order,
# not to reach the counter or the owner's dashboard, and shipping those to the
# public would put staff screens one tap from every customer's phone.
#
# An APK sidesteps the constraint that stops the PWA installing: a browser only
# installs a web app from a secure origin, so on a plain LAN address it offers a
# bookmark instead. An APK installs outright, and because it talks straight to
# hosted Supabase it then works on mobile data anywhere.
#
# Built FROM the web stage rather than from the SDK image, which is not about
# saving a `pub get`. Independent stages are what BuildKit runs in parallel, and
# dart2js compiling three web apps beside a Gradle release build exhausted
# Docker Desktop's memory and took the daemon down with it. Depending on the
# earlier stage forces them to run one after the other.
FROM build AS apk
RUN flutter build apk --release \
      -t lib/main_customer.dart \
      --dart-define=SUPABASE_URL=https://tgazemsmihvodammodfu.supabase.co \
      --dart-define=SUPABASE_ANON_KEY=sb_publishable_B3mvYfF2pMn2owzwGoHR8Q_Wx74GB7R \
 && mkdir -p /out \
 && cp build/app/outputs/flutter-apk/app-release.apk /out/bencris.apk

# ---- serve: static files, no SDK, no toolchain ----
FROM nginx:alpine AS serve
COPY --from=build /app/build/customer /usr/share/nginx/html/customer
COPY --from=build /app/build/cashier  /usr/share/nginx/html/cashier
COPY --from=build /app/build/admin    /usr/share/nginx/html/admin
COPY --from=apk   /out/bencris.apk    /usr/share/nginx/html/download/bencris.apk
COPY docker/index.html    /usr/share/nginx/html/index.html
COPY docker/download.html /usr/share/nginx/html/download/index.html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
