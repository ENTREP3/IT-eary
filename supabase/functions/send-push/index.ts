/**
 * Sends a notification to whoever the shop needs to reach.
 *
 * ---------------------------------------------------------------------------
 * Why this exists at all
 *
 * Calling FCM requires signing a request with a service account's private key.
 * That key can send a notification to every device this project knows about,
 * so it cannot go anywhere a customer's browser could reach it. It lives in
 * this function's secrets and nowhere else — not in the bundle, not in the
 * database, not in the repository.
 *
 * Firebase Cloud Functions would be the obvious home, but those require the
 * Blaze plan and the shop is on Spark. This runs on Supabase instead, beside
 * the data it reads.
 *
 * ---------------------------------------------------------------------------
 * Who may call it
 *
 * Two callers, and no third.
 *
 * A member of staff, proved by their own session — the same login they use at
 * the till. An endpoint that makes phones buzz and trusts whoever calls it is
 * a way to push a message to a shop's entire customer list.
 *
 * Or the database itself, proved by the service role key, for the things no
 * person presses a button for: a dish selling out, stock falling below par, a
 * rating arriving. Those happen while the owner is nowhere near the shop,
 * which is exactly when they most need saying.
 *
 * ---------------------------------------------------------------------------
 * Who gets told is never simply taken from the request
 *
 * `to` names an audience, not a list of devices. A ticket resolves to the
 * diner who placed it; `staff` resolves to the people whose profile says so;
 * `dish_waiters` resolves to whoever actually asked about that dish. The
 * caller says who it means, and this decides who that is.
 *
 * The one exception is `users`, which does take ids — and it is why the staff
 * check matters, because it is the shape a stranger would reach for.
 */

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

function serviceAccount(): ServiceAccount {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) throw new Error('FCM_SERVICE_ACCOUNT is not set');
  return JSON.parse(raw) as ServiceAccount;
}

const b64url = (input: ArrayBuffer | string) => {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Turns the PEM in the service account file into a key Web Crypto can sign with. */
function signingKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * An OAuth access token for FCM, cached until shortly before it expires.
 *
 * Google issues these for an hour. Minting a fresh one per notification would
 * add a second round trip to every send and, on a busy lunchtime, invite rate
 * limiting on the token endpoint rather than on the thing we actually want to
 * do.
 */
let cached: { token: string; expires: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cached && Date.now() < cached.expires) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: FCM_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );

  const key = await signingKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  const assertion = `${header}.${claims}.${b64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) throw new Error(`token endpoint refused: ${res.status} ${await res.text()}`);

  const json = await res.json();
  // Expire the cache a minute early rather than on the second, so a token is
  // never spent at the moment it turns invalid.
  cached = { token: json.access_token, expires: Date.now() + (json.expires_in - 60) * 1000 };
  return cached.token;
}

/** A Supabase REST call using the service role, for rows no one user owns. */
function db(path: string, init: RequestInit = {}): Promise<Response> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

/** Whether the caller's own session belongs to staff. */
async function callerIsStaff(authorization: string): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const res = await fetch(`${url}/rest/v1/rpc/is_staff`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: authorization, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) return false;
  return (await res.json()) === true;
}

/**
 * Whether the caller is the database rather than a person.
 *
 * Compared in constant time. A plain `===` on a secret leaks its length and,
 * byte by byte over enough attempts, its contents — the comparison returns
 * fractionally sooner on the first wrong character.
 */
function callerIsTheDatabase(authorization: string): boolean {
  const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`;
  if (authorization.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= authorization.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

type Audience =
  | { kind: 'everyone' }
  | { kind: 'ticket'; ticket_code: string }
  | { kind: 'users'; user_ids: string[] }
  | { kind: 'staff' }
  | { kind: 'admins' }
  | { kind: 'dish_waiters'; dish_id: string };

/** Turns an audience into the set of people to notify. */
async function resolve(to: Audience): Promise<{ userIds: string[]; note?: string }> {
  switch (to?.kind) {
    case 'ticket': {
      const code = encodeURIComponent(String(to.ticket_code ?? '').toUpperCase());
      const res = await db(`orders?ticket_code=eq.${code}&select=customer_id`);
      const rows = await res.json();
      const id = rows?.[0]?.customer_id;
      // A guest who ordered without ever opening an account has nobody to
      // notify. Ordinary, not a failure.
      return id ? { userIds: [id] } : { userIds: [], note: 'no account on this ticket' };
    }

    case 'users':
      return { userIds: (to.user_ids ?? []).filter(Boolean) };

    case 'staff': {
      const res = await db(`profiles?role=in.(admin,cashier)&select=id`);
      return { userIds: ((await res.json()) ?? []).map((r: { id: string }) => r.id) };
    }

    case 'admins': {
      const res = await db(`profiles?role=eq.admin&select=id`);
      return { userIds: ((await res.json()) ?? []).map((r: { id: string }) => r.id) };
    }

    case 'dish_waiters': {
      /*
       * Everyone still waiting on this dish.
       *
       * The trigger that stamps notified_at runs when the dish comes back, so
       * by the time this is called the rows are already marked. Filtering on
       * an unnotified flag here would therefore match nobody — the waiting
       * list is read by dish, and the flag is what the diner's own account
       * page uses to show them the news.
       */
      const dish = encodeURIComponent(String(to.dish_id ?? ''));
      const res = await db(`stock_alerts?dish_id=eq.${dish}&select=customer_id`);
      const rows = await res.json();
      return { userIds: ((rows ?? []) as Array<{ customer_id: string }>).map((r) => r.customer_id) };
    }

    default:
      return { userIds: [], note: 'unknown audience' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  try {
    const authorization = req.headers.get('Authorization') ?? '';
    const allowed =
      callerIsTheDatabase(authorization) || (await callerIsStaff(authorization));
    if (!allowed) return json({ error: 'staff only' }, 403);

    const { to, title, body, url, tag } = await req.json();
    if (!to || !title) return json({ error: 'to and title are required' }, 400);

    /*
     * Everyone is its own path rather than a list of every user id.
     *
     * Resolving it the other way would mean fetching every account in the
     * shop to build a filter naming them all, when the only thing actually
     * needed is the devices — and most accounts have none. It is also the
     * one audience where the number of ids grows without limit, which is
     * how a URL ends up too long to send.
     */
    let tokensRes: Response;
    if ((to as Audience)?.kind === 'everyone') {
      tokensRes = await db('push_tokens?failed_at=is.null&select=token');
    } else {
      const { userIds, note } = await resolve(to as Audience);
      // Duplicates would send the same person the same thing twice — a diner
      // who is also on the waiting list, say.
      const unique = [...new Set(userIds)];
      if (!unique.length) return json({ sent: 0, reason: note ?? 'nobody to tell' });

      const list = unique.map((id) => `"${id}"`).join(',');
      tokensRes = await db(`push_tokens?user_id=in.(${list})&failed_at=is.null&select=token`);
    }
    const rows: Array<{ token: string }> = await tokensRes.json();
    if (!rows.length) return json({ sent: 0, reason: 'no devices registered' });

    const sa = serviceAccount();
    const auth = await accessToken(sa);

    let sent = 0;
    const dead: string[] = [];

    for (const row of rows) {
      /*
       * Data-only, deliberately.
       *
       * A message carrying a `notification` block is displayed by the browser
       * or the OS itself, *and* handed to our service worker, which then shows
       * its own — two identical banners for one event. Sending data only makes
       * our handler the single place that decides what a notification looks
       * like, on both platforms.
       */
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: row.token,
              data: {
                title: String(title),
                body: String(body ?? ''),
                url: String(url ?? '/'),
                // Same subject replaces rather than stacks: a ticket going
                // paid → preparing → ready should leave one notification, not
                // three, and only the last is worth reading.
                tag: String(tag ?? 'bencris'),
              },
              android: { priority: 'high' },
              webpush: { headers: { Urgency: 'high' } },
            },
          }),
        },
      );

      if (res.ok) {
        sent++;
        continue;
      }

      /*
       * 404 and 403 mean this token is gone for good — the app was uninstalled,
       * or the browser's permission was revoked. Anything else may well be
       * temporary, so it is left alone rather than quietly unsubscribing
       * somebody because Firebase had a bad minute.
       */
      if (res.status === 404 || res.status === 403) dead.push(row.token);
    }

    if (dead.length) {
      await db(`push_tokens?token=in.(${dead.map((t) => `"${t}"`).join(',')})`, {
        method: 'PATCH',
        body: JSON.stringify({ failed_at: new Date().toISOString() }),
      });
    }

    return json({ sent, retired: dead.length });
  } catch (e) {
    // A caught value is `unknown`, not an Error: `throw 'nope'` is legal and
    // anything reaching here may have come from a library that does it.
    const reason = e instanceof Error ? e.message : String(e);

    // Never fails the caller's real work. The till marking an order ready must
    // not break because a notification could not be sent.
    return json({ error: reason, sent: 0 });
  }
});
