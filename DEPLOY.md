# Deploying Bencris

Three addresses, one build. The bundle is identical on all three; the address
it is served from decides which app opens, which is what `src/app/lib/surface.ts`
reads. Splitting them into three builds would mean three copies of the router,
the session and every store to keep in step, for a difference nobody can see.

| Address | Opens | Firebase target |
|---|---|---|
| `bencris.iteary.site` | the storefront | `customer` |
| `bencris-admin.iteary.site` | the owner dashboard | `admin` |
| `bencris-cashier.iteary.site` | the counter | `cashier` |

Nothing is served at the bare apex, `iteary.site`, on purpose: the shop sits
on its own name under the domain so the domain itself stays free for anything
else later. A browser sent to the apex gets no answer, which is why every
address written here carries a first label.

The staff addresses are presentation, not protection. `RequireRole` and the RLS
policies are unchanged, so a diner typing the admin address meets the same
sign-in wall they would at `/admin`. Hiding a door is not locking it, and the
lock is elsewhere.

Nothing here needs a server. Both apps talk to Supabase directly, so the
Laravel container is only ever used for migrations and one-off scripts — it is
not part of what gets deployed.

## First time

```bash
npm i -g firebase-tools
firebase login
```

This has been done once already, against project `iteary-92df6`. It is written
out here for a rebuild from nothing, or for a second environment.

The three sites are named after the shop rather than the project, so the
console reads the same way the addresses do. Site names are global across
Firebase — expect the obvious ones to be taken.

```bash
firebase hosting:sites:create bencris
firebase hosting:sites:create bencris-admin
firebase hosting:sites:create bencris-cashier
```

A project also arrives with a default site named after its project id
(`iteary-92df6`). Nothing is deployed to it and it cannot be deleted, only
disabled.

Then point the local target names at them, once:

```bash
firebase use --add iteary-92df6 --alias default
firebase target:apply hosting customer bencris
firebase target:apply hosting admin    bencris-admin
firebase target:apply hosting cashier  bencris-cashier
```

That writes `.firebaserc`, which is safe to commit — it holds no secrets.

The sites answer on their own addresses straight away, before any custom
domain exists:

| Site | Default address |
|---|---|
| `bencris` | https://bencris.web.app |
| `bencris-admin` | https://bencris-admin.web.app |
| `bencris-cashier` | https://bencris-cashier.web.app |

Those work for testing. `surfaceFor()` matches on the end of the first label —
`-admin`, `-cashier` — precisely so these addresses open the right app during
the hours a custom domain spends clearing DNS and being issued a certificate.

These addresses are public, and so are the custom ones. Every certificate
Firebase issues is published to Certificate Transparency logs, so anybody can
read every subdomain of iteary.site back out of crt.sh, and `bencris-admin`
resolves on .web.app for anyone who guesses it. The staff addresses are not a
secret and must not be treated as one — `RequireRole` and RLS are what stop a
stranger, and they are unchanged by any of this.

## Custom domains

In the console, per site: Hosting → Add custom domain.

- `bencris` → `bencris.iteary.site`
- `bencris-admin` → `bencris-admin.iteary.site`
- `bencris-cashier` → `bencris-cashier.iteary.site`

Firebase gives you DNS records to add at Cloudflare. Two things matter there:

- Set each record to **DNS only** (grey cloud, not orange). Firebase issues the
  certificate itself, and proxying through Cloudflare on top puts a second
  certificate in front of it that does not cover these names.
- Certificates take a little while to issue. The domain shows as pending until
  it is done, and the site answers on `*.web.app` in the meantime.

## Every deploy

```bash
npm run build          # -> dist/
firebase deploy --only hosting
```

Or one at a time:

```bash
firebase deploy --only hosting:admin
```

## After the first deploy

Supabase → Authentication → URL Configuration:

- **Site URL**: `https://bencris.iteary.site`
- **Redirect URLs**: add `https://bencris.iteary.site/reset-password`, and for local
  work `http://localhost:5173/reset-password` and `http://localhost:5180`.

Without those, confirmation and password-reset links bounce.

Until the sites exist, Site URL stays on `http://localhost:5180`, and that is
deliberate rather than something half-finished — it is what lets a
confirmation email be opened and tested before anything is deployed. The
mobile container forwards its root to the diner app with the query string
intact, so the `?code=` Supabase appends reaches an app that can spend it.
Change it when the Firebase sites are live, not before, or the links start
pointing at a laptop that is not serving anything.

## The Flutter apps

Not deployed here. They are the phone apps — the customer one ships as an APK
from GitHub Releases, and the staff ones are only used on the shop's own
devices. If they ever want a web address, add a fourth site rather than
crowding one of these.
