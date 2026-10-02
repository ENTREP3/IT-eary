/**
 * Sends a notification to whoever the shop needs to reach.
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

/**
 * Whether the caller holds the service role, asked of PostgREST.
 *
 * The constant-time comparison above only recognises the exact string in this
 * function's own environment. This project issues new-style keys while the key
 * in Vault is the legacy service_role JWT — both valid, both working, simply
 * different text — so every call from a database trigger was turned away.
 * PostgREST validates whatever token arrives and reports its claim, which
 * settles it without either side holding the other's secret.
 */
async function callerIsServiceRole(authorization: string): Promise<boolean> {
  if (!authorization) return false;
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/is_service_role`, {
      method: 'POST',
      headers: {
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    return res.ok && (await res.json()) === true;
  } catch {
    return false;
  }
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

/** Everyone with a real account. Guests have nowhere to keep a notification. */
async function accountHolders(): Promise<string[]> {
  const res = await db('rpc/account_holder_ids', { method: 'POST', body: '{}' });
  if (!res.ok) return [];
  const rows = await res.json();
  return Array.isArray(rows) ? rows.filter((r) => typeof r === 'string') : [];
}

/** Writes the notification so it can be read later, and says how many got one. */
async function record(
  userIds: string[],
  n: { title: unknown; body?: unknown; url?: unknown; tag?: unknown },
): Promise<number> {
  if (!userIds.length) return 0;
  try {
    const res = await db('notifications', {
      method: 'POST',
      body: JSON.stringify(
        userIds.map((user_id) => ({
          user_id,
          title: String(n.title),
          body: n.body == null ? null : String(n.body),
          url: n.url == null ? null : String(n.url),
          tag: n.tag == null ? null : String(n.tag),
        })),
      ),
    });
    return res.ok ? userIds.length : 0;
  } catch {
    // Never fails the send. A notification that reaches a phone but not the
    // bell is worse than one that reaches both, and better than neither.
    return 0;
  }
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
      callerIsTheDatabase(authorization) ||
      (await callerIsServiceRole(authorization)) ||
      (await callerIsStaff(authorization));
    if (!allowed) return json({ error: 'staff only' }, 403);

    const { to, title, body, url, tag } = await req.json();
    if (!to || !title) return json({ error: 'to and title are required' }, 400);

    const audience = to as Audience;
    const everyone = audience?.kind === 'everyone';

    // Duplicates would tell the same person twice — a diner who is also on a
    // waiting list, say.
    const { userIds, note } = everyone
      ? { userIds: await accountHolders(), note: undefined }
      : await resolve(audience);
    const unique = [...new Set(userIds)].filter(Boolean);

    // Recorded before anything is sent, and whatever happens next. A bell
    // entry is the copy that survives a phone being face down, so it must not
    // depend on a push succeeding — or on one being wanted at all.
    const recorded = await record(unique, { title, body, url, tag });

    let tokensRes: Response;
    if (everyone) {
      // Every registered device, guests included. A shout reaches phones that
      // have nowhere to keep the message afterwards, which is the difference
      // between this and the list recorded above.
      tokensRes = await db('push_tokens?failed_at=is.null&select=token');
    } else {
      if (!unique.length) {
        return json({ sent: 0, recorded, reason: note ?? 'nobody to tell' });
      }
      const list = unique.map((id) => `"${id}"`).join(',');
      tokensRes = await db(`push_tokens?user_id=in.(${list})&failed_at=is.null&select=token`);
    }
    const rows: Array<{ token: string }> = await tokensRes.json();
    if (!rows.length) return json({ sent: 0, recorded, reason: 'no devices registered' });

    const sa = serviceAccount();
    const auth = await accessToken(sa);

    let sent = 0;
    const dead: string[] = [];

    for (const row of rows) {
      /*
       * Data-only, deliberately.
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

    return json({ sent, recorded, retired: dead.length });
  } catch (e) {
    // A caught value is `unknown`, not an Error: `throw 'nope'` is legal and
    // anything reaching here may have come from a library that does it.
    const reason = e instanceof Error ? e.message : String(e);

    // Never fails the caller's real work. The till marking an order ready must
    // not break because a notification could not be sent.
    return json({ error: reason, sent: 0 });
  }
});
