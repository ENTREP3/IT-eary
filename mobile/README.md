# IT-eary Mobile — the diner app

The customer half of IT-eary, in Flutter. Diners **never sign in**: they browse
the menu, build an order, and get a **ticket code** to show at the counter.

```
menu  →  cart  →  ticket (K7M2Q9)  →  show the cashier  →  Paid + receipt
```

The staff web app (`/admin`, `/cashier`) lives in the repository root and talks
to the same Supabase project.

## Running it

**Three apps from one codebase**, one per audience, so a customer's phone never
carries the counter UI and a cashier's never carries the owner's:

```bash
flutter run -t lib/main_customer.dart -d edge   # ordering, no login
flutter run -t lib/main_cashier.dart  -d edge   # counter only
flutter run -t lib/main_admin.dart    -d edge   # owner dashboard
```

`-t` is required — there is deliberately no `lib/main.dart`, so no build is
ambiguous about which app it is.

### Building all three as installable PWAs

```bash
node build_pwas.mjs            # hosted Supabase
node build_pwas.mjs --local    # local Docker stack
```

Flutter shares one `web/` folder across every target, so all three builds would
otherwise ship an identical `manifest.json` and install as three
indistinguishable tiles. The script rewrites each output's manifest and title
afterwards, giving them separate names, short names and theme colours.

Product flavors were considered and skipped: they need native Gradle and Xcode
config, and separate entrypoints already give separate builds. Add them when the
Android apps need distinct `applicationId`s to sit on one device.

### On a phone or emulator

```bash
flutter devices          # list what's connected
flutter run -t lib/main_diner.dart -d <device>
```

### Choosing the backend

```bash
# hosted project
flutter run -d edge \
  --dart-define=SUPABASE_URL=https://<ref>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<publishable key>
```

> **Android emulator note:** `127.0.0.1` inside the emulator is the emulator
> itself. Use `--dart-define=SUPABASE_URL=http://10.0.2.2:55321` to reach a
> Supabase running on your machine.

Web build (handy for quick verification without an emulator):

```bash
flutter build web --release
```

## Tests

```bash
flutter test      # cart maths + receipt formatting
flutter analyze
```

## Known environment trap: spaces in the project path

If a build ever dies with

```
'C:\Users\robin' is not recognized as an internal or external command
Building native assets failed.
```

that is **not** your Flutter install. `path_provider_foundation` 2.6.0 depends on
`objective_c`, whose native-assets build hook shells out without quoting the
project path — so any directory containing a space breaks it, even for a web or
Windows build that never touches Apple frameworks.

`pubspec.yaml` pins `path_provider_foundation: 2.4.1` in `dependency_overrides`
to keep `objective_c` out of the graph entirely. Two things to know:

- **Don't "fix" it by running `flutter config --no-enable-native-assets`.**
  `objective_c` *requires* that feature, so disabling it just trades one failure
  for `Package(s) objective_c require the dart assets feature to be enabled`.
- Drop the override once upstream quotes its paths, or if the project ever moves
  to a path without spaces.

## Layout

| Path | Role |
| --- | --- |
| `lib/main_customer.dart` | Entrypoint — customer ordering app |
| `lib/main_cashier.dart` | Entrypoint — counter app |
| `lib/main_admin.dart` | Entrypoint — owner app |
| `lib/bootstrap.dart` | Supabase init + backend selection, shared by all three |
| `lib/tokens.dart` | **Generated** from `design/tokens.json` — do not edit |
| `lib/models/models.dart` | Mirrors the Postgres schema |
| `lib/services/api.dart` | Anonymous customer calls |
| `lib/diner/` | Menu, cart, ticket, onboarding, about + history |
| `lib/staff/staff_entry.dart` | Session restore + role gate, shared by both staff apps |
| `lib/staff/staff_api.dart` | Signed-in staff calls |
| `lib/staff/cashier/` | The counter — lookup, proof review, settle |
| `lib/staff/admin/` | Owner dashboard; `tabs/` holds the six sections |

## Two things worth knowing

**The app never sends prices.** `create_ticket` receives only dish ids and
quantities; Postgres prices the order from the live menu. The total on the cart
screen is display-only — a tampered client cannot underpay. This is covered by
a test (`sends only ids and quantities — never prices`).

**The ticket screen is live.** It subscribes to Supabase Realtime, so when the
cashier taps *Paid* the diner's screen flips to "Paid — waiting for the kitchen"
on its own, with no refresh. If Realtime is unavailable the screen still shows
correct data from the initial fetch; it just won't self-update.

## Layout on wide screens

Flutter runs anywhere, but responsiveness is something you build — it isn't
automatic. This is a phone-shaped app, so every screen body is wrapped in
`PageBody` (see `lib/theme.dart`), which centres the content and caps it at
`kMaxContentWidth`. Without it a single dish photo stretches across a 1400px
desktop browser. If you add a screen, wrap its body the same way.

> **Pass `shrinkHeight: true` inside a `bottomNavigationBar`.** `PageBody` uses
> a `Center`, which expands to fill its parent. A `bottomNavigationBar` is
> measured with *unbounded* height, so a plain `Center` there reports infinite
> height and the Scaffold gives the body zero — the page renders blank apart
> from the app bar. This actually shipped once: the menu vanished the moment
> the cart bar appeared, so you could never add a second dish.
