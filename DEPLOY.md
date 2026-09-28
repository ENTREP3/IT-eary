# Deploying Bencris

Three addresses, one build. The bundle is identical on all three; the address
it is served from decides which app opens, which is what `src/app/lib/surface.ts`
reads. Splitting them into three builds would mean three copies of the router,
the session and every store to keep in step, for a difference nobody can see.

| Address | Opens | Firebase target |
|---|---|---|
| `iteary.site` | the storefront | `customer` |
| `bencris-admin.iteary.site` | the owner dashboard | `admin` |
| `bencris-cashier.iteary.site` | the counter | `cashier` |

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

Create three Hosting sites in the Firebase console (Hosting → Add another
site). The names are global across Firebase, so pick something unlikely to be
taken:

```
iteary-customer
iteary-admin
iteary-cashier
```

Then point the local target names at them, once:

```bash
firebase use --add                       # pick your project, alias it "default"
firebase target:apply hosting customer iteary-customer
firebase target:apply hosting admin     iteary-admin
firebase target:apply hosting cashier   iteary-cashier
```

That writes `.firebaserc`, which is safe to commit — it holds no secrets.

## Custom domains

In the console, per site: Hosting → Add custom domain.

- `iteary-customer` → `iteary.site`
- `iteary-admin` → `bencris-admin.iteary.site`
- `iteary-cashier` → `bencris-cashier.iteary.site`

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

- **Site URL**: `https://iteary.site`
- **Redirect URLs**: add `https://iteary.site/reset-password` and
  `http://localhost:5173/reset-password` for local work.

Without those, confirmation and password-reset links bounce.

## The Flutter apps

Not deployed here. They are the phone apps — the customer one ships as an APK
from GitHub Releases, and the staff ones are only used on the shop's own
devices. If they ever want a web address, add a fourth site rather than
crowding one of these.
