import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  Undo2,
  User,
  Users,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { humanError } from '../../lib/errors';
import { useConfirm } from '../shared/useConfirm';

/**
 * Everyone with an account, and what the owner can do about them.
 *
 * ---------------------------------------------------------------------------
 * Only real accounts
 *
 * Anonymous diners are left out, in the database rather than here. An account
 * is something you manage — suspend, ban, promote, delete — and an anonymous
 * row is none of those: no email to write to, no password to reset, and
 * banning it achieves nothing because the next visit mints another one. Their
 * orders are still in the takings; they are simply not people the owner can
 * act on.
 *
 * ---------------------------------------------------------------------------
 * Staff show no order figures
 *
 * `create_ticket` deliberately leaves `customer_id` empty when a signed-in
 * member of staff checks out, so a cashier testing the storefront does not
 * bank orders against themselves. Their figures were therefore always zero,
 * and "0 orders, ₱0.00" beside the owner's name reads as a fact about the
 * owner rather than a column that does not apply. The database sends null and
 * this shows a dash.
 *
 * ---------------------------------------------------------------------------
 * Every dangerous action is refused by the database, not just hidden here
 *
 * Acting on yourself, and removing the last owner, are both refused in
 * `assert_may_manage`. The buttons are hidden as a courtesy; hiding a button
 * is not a rule, and the rule lives where it cannot be clicked around.
 */

type Person = {
  id: string;
  email: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  nickname: string | null;
  display_name: string;
  full_name: string | null;
  phone: string | null;
  role: 'admin' | 'cashier' | 'customer';
  banned_until: string | null;
  orders: number | null;
  spent: number | null;
  last_order: string | null;
  created_at: string;
};

type Group = 'all' | 'admin' | 'cashier' | 'customer';

const GROUPS: { key: Group; label: string; icon: typeof Users }[] = [
  { key: 'all', label: 'Everyone', icon: Users },
  { key: 'admin', label: 'Owners', icon: ShieldCheck },
  { key: 'cashier', label: 'Cashiers', icon: Store },
  { key: 'customer', label: 'Customers', icon: User },
];

const peso = (n: number) =>
  '₱' + Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function when(iso: string | null): string {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400e3);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

/** A hundred-year ban and a week's suspension are the same column. */
function suspension(iso: string | null): { text: string; forever: boolean } | null {
  if (!iso) return null;
  const until = new Date(iso);
  const years = (until.getTime() - Date.now()) / (365 * 86400e3);
  if (years > 50) return { text: 'banned', forever: true };
  return { text: `until ${until.toLocaleDateString()}`, forever: false };
}

export function PeoplePanel() {
  const confirm = useConfirm();

  const [rows, setRows] = useState<Person[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [group, setGroup] = useState<Group>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);

  const load = async () => {
    const [people, tally, auth] = await Promise.all([
      supabase.rpc('list_people', { p_role: null }),
      supabase.rpc('people_counts'),
      supabase.auth.getUser(),
    ]);

    if (people.error) setError(humanError(people.error, 'Could not load the people list.'));
    else setError(null);

    setRows((people.data ?? []) as Person[]);
    setCounts(
      Object.fromEntries(
        ((tally.data ?? []) as { role: string; n: number }[]).map((r) => [r.role, Number(r.n)]),
      ),
    );
    setMe(auth.data.user?.id ?? null);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  /** Runs one management call and reloads, reporting whatever the database says. */
  const act = async (id: string, fn: string, params: Record<string, unknown>, said: string) => {
    setBusy(id);
    setError(null);
    setNote(null);
    const { error: e } = await supabase.rpc(fn, params);
    if (e) setError(humanError(e, 'That did not work.'));
    else {
      setNote(said);
      setTimeout(() => setNote(null), 4000);
      await load();
    }
    setBusy(null);
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (group !== 'all' && r.role !== group) return false;
      if (!q) return true;
      return [r.display_name, r.full_name, r.email, r.phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, group, query]);

  const total = (g: Group) =>
    g === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : (counts[g] ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {GROUPS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setGroup(key)}
            className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-full border text-sm transition-colors ${
              group === key
                ? 'bg-[#e8a84a] text-[#0a0d0a] border-[#e8a84a]'
                : 'border-[#e8dfc8]/15 hover:border-[#e8dfc8]/35'
            }`}
          >
            <Icon size={14} />
            {label}
            <span className={group === key ? 'opacity-70' : 'opacity-45'}>{total(key)}</span>
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2 bg-[#0a0d0a] border border-[#e8dfc8]/10 rounded-full px-3 h-9 text-sm">
          <Search size={14} className="opacity-50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or email"
            className="bg-transparent outline-none w-48 placeholder:opacity-40"
          />
        </div>
      </div>

      {error && <p className="text-sm text-[#e87a5c]">{error}</p>}
      {note && <p className="text-sm text-[#8cc07a]">{note}</p>}

      {loading ? (
        <div className="py-16 grid place-items-center opacity-50">
          <Loader2 className="animate-spin" size={18} />
        </div>
      ) : shown.length === 0 ? (
        <p className="py-16 text-center text-sm opacity-50">
          {query ? `Nobody matches “${query}”.` : 'Nobody here yet.'}
        </p>
      ) : (
        <div className="rounded-2xl border border-[#e8dfc8]/12 bg-[#0a0d0a] overflow-hidden">
          <div className="hidden lg:grid grid-cols-[1.4fr_1.4fr_auto_auto_auto_auto] gap-4 px-5 py-3 text-[11px] uppercase tracking-wider opacity-45 border-b border-[#e8dfc8]/10">
            <span>Name</span>
            <span>Email</span>
            <span className="text-right">Orders</span>
            <span className="text-right">Spent</span>
            <span className="text-right">Last order</span>
            <span className="text-right">Manage</span>
          </div>

          <ul>
            {shown.map((p) => (
              <Row
                key={p.id}
                person={p}
                isMe={p.id === me}
                busy={busy === p.id}
                owners={counts.admin ?? 0}
                confirm={confirm}
                act={act}
              />
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs opacity-45 max-w-prose leading-relaxed">
        Only accounts appear here. Diners who ordered without signing up are counted in your
        sales but are not listed, because there is nothing to manage about them — no email, no
        password, and a new one is created the next time they open the menu. Deleting an account
        keeps its past orders in your takings as guest orders.
      </p>
    </div>
  );
}

function Row({
  person: p,
  isMe,
  busy,
  owners,
  confirm,
  act,
}: {
  person: Person;
  isMe: boolean;
  busy: boolean;
  owners: number;
  confirm: ReturnType<typeof useConfirm>;
  act: (id: string, fn: string, params: Record<string, unknown>, said: string) => Promise<void>;
  }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const held = suspension(p.banned_until);

  // Hidden for the cases the database would refuse anyway, so nobody is
  // offered a button that only produces an error.
  const lastOwner = p.role === 'admin' && owners <= 1;
  const canManage = !isMe && !lastOwner;

  const name = p.display_name;

  return (
    <li className="border-b border-[#e8dfc8]/8 last:border-0">
      <div className="grid lg:grid-cols-[1.4fr_1.4fr_auto_auto_auto_auto] gap-1 lg:gap-4 px-5 py-3 items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="truncate">{name}</span>
            <Badge role={p.role} />
            {held && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                  held.forever
                    ? 'border-[#e87a5c]/50 text-[#e87a5c]'
                    : 'border-[#e8a84a]/50 text-[#e8a84a]'
                }`}
              >
                {held.text}
              </span>
            )}
            {isMe && <span className="text-[10px] opacity-45">you</span>}
          </div>
          {p.full_name && p.full_name !== name && (
            <span className="block text-xs opacity-45 truncate">{p.full_name}</span>
          )}
        </div>

        <span className="text-sm opacity-60 truncate">{p.email ?? '—'}</span>

        {/* Null means the column does not apply to this person, not zero. */}
        <span className="text-sm lg:text-right tabular-nums opacity-80">
          {p.orders ?? <span className="opacity-40">—</span>}
        </span>
        <span className="text-sm lg:text-right tabular-nums opacity-80">
          {p.spent === null ? <span className="opacity-40">—</span> : peso(p.spent)}
        </span>
        <span className="text-sm lg:text-right opacity-60">
          {p.orders === null ? <span className="opacity-40">—</span> : when(p.last_order)}
        </span>

        <span className="lg:text-right">
          {busy ? (
            <Loader2 size={15} className="animate-spin opacity-60 inline" />
          ) : (
            <span className="inline-flex items-center gap-1">
              {/* Editing details is offered for everybody, including the
                  owner and the last owner: nothing about a name can lock
                  the shop, and the role is not writable from here. */}
              <button
                onClick={() => {
                  setEditing((v) => !v);
                  setOpen(false);
                }}
                className="p-1.5 rounded-lg hover:bg-[#e8dfc8]/10 opacity-60 hover:opacity-100"
                aria-label={`Edit ${name}`}
              >
                <Pencil size={14} />
              </button>
              {canManage ? (
                <button
                  onClick={() => {
                    setOpen((v) => !v);
                    setEditing(false);
                  }}
                  className="p-1.5 rounded-lg hover:bg-[#e8dfc8]/10 opacity-60 hover:opacity-100"
                  aria-label={`Manage ${name}`}
                >
                  <MoreHorizontal size={16} />
                </button>
              ) : (
                <span className="text-[11px] opacity-35 pl-1">
                  {isMe ? 'you' : 'only owner'}
                </span>
              )}
            </span>
          )}
        </span>
      </div>

      {editing && <EditDetails person={p} onDone={() => setEditing(false)} act={act} />}

      {open && canManage && (
        <div className="px-5 pb-4 flex flex-wrap gap-2">
          {held ? (
            <Action
              icon={Undo2}
              label="Let them back in"
              onClick={() => {
                setOpen(false);
                void act(p.id, 'restore_person', { p_id: p.id }, `${name} can sign in again.`);
              }}
            />
          ) : (
            <>
              <Action
                label="Suspend 7 days"
                onClick={() => {
                  setOpen(false);
                  void act(p.id, 'suspend_person', { p_id: p.id, p_days: 7 }, `${name} is suspended for a week.`);
                }}
              />
              <Action
                label="Suspend 30 days"
                onClick={() => {
                  setOpen(false);
                  void act(p.id, 'suspend_person', { p_id: p.id, p_days: 30 }, `${name} is suspended for a month.`);
                }}
              />
              <Action
                icon={Ban}
                danger
                label="Ban"
                onClick={() => {
                  setOpen(false);
                  confirm({
                    title: `Ban ${name}?`,
                    body: 'They cannot sign in again until you let them back in. Their orders and history stay.',
                    action: 'Ban',
                    danger: true,
                    onConfirm: () => void act(p.id, 'ban_person', { p_id: p.id }, `${name} is banned.`),
                  });
                }}
              />
            </>
          )}

          <span className="w-px self-stretch bg-[#e8dfc8]/10 mx-1" />

          {p.role !== 'admin' && (
            <Action
              label="Make owner"
              onClick={() => {
                setOpen(false);
                confirm({
                  title: `Make ${name} an owner?`,
                  body: 'They will be able to see every figure, change prices, and manage people — including you.',
                  action: 'Make owner',
                  onConfirm: () =>
                    void act(p.id, 'set_person_role', { p_id: p.id, p_role: 'admin' }, `${name} is an owner.`),
                });
              }}
            />
          )}
          {p.role !== 'cashier' && (
            <Action
              label="Make cashier"
              onClick={() => {
                setOpen(false);
                void act(p.id, 'set_person_role', { p_id: p.id, p_role: 'cashier' }, `${name} is a cashier.`);
              }}
            />
          )}
          {p.role !== 'customer' && (
            <Action
              label="Remove staff access"
              onClick={() => {
                setOpen(false);
                confirm({
                  title: `Remove ${name}'s staff access?`,
                  body: 'They keep their account and can still order as a customer.',
                  action: 'Remove access',
                  onConfirm: () =>
                    void act(p.id, 'set_person_role', { p_id: p.id, p_role: 'customer' }, `${name} is a customer now.`),
                });
              }}
            />
          )}

          <span className="w-px self-stretch bg-[#e8dfc8]/10 mx-1" />

          <Action
            icon={Trash2}
            danger
            label="Delete account"
            onClick={() => {
              setOpen(false);
              confirm({
                title: `Delete ${name}'s account?`,
                body:
                  'This cannot be undone. Their favourites, loyalty and saved devices go for good. ' +
                  'Their past orders stay in your sales as guest orders, so your takings do not change.',
                action: 'Delete account',
                danger: true,
                onConfirm: () => void act(p.id, 'delete_person', { p_id: p.id }, `${name}'s account is deleted.`),
              });
            }}
          />
        </div>
      )}
    </li>
  );
}

function Action({
  label,
  onClick,
  icon: Icon,
  danger,
}: {
  label: string;
  onClick: () => void;
  icon?: typeof Ban;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs transition-colors ${
        danger
          ? 'border-[#e87a5c]/35 text-[#e87a5c] hover:bg-[#e87a5c]/10'
          : 'border-[#e8dfc8]/15 hover:border-[#e8dfc8]/40'
      }`}
    >
      {Icon && <Icon size={13} />}
      {label}
    </button>
  );
}

function Badge({ role }: { role: Person['role'] }) {
  if (role === 'admin') {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-[#e8a84a]/50 text-[#e8a84a]">
        owner
      </span>
    );
  }
  if (role === 'cashier') {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-[#8cc07a]/45 text-[#8cc07a]">
        cashier
      </span>
    );
  }
  return null;
}

/**
 * Correcting somebody's registration details.
 *
 * The same six fields the signup form collects, and the same rules — they are
 * enforced in one place in the database, which both this and the diner's own
 * "Your details" call. A refusal comes back as a
 * sentence rather than a constraint name.
 *
 * Email is absent on purpose. Changing it means proving the new address
 * belongs to somebody, which is a confirmation flow rather than a text box,
 * and an owner quietly reassigning a login to another address is precisely the
 * shape of a thing that should not be one click away.
 */
function EditDetails({
  person,
  onDone,
  act,
}: {
  person: Person;
  onDone: () => void;
  act: (id: string, fn: string, params: Record<string, unknown>, said: string) => Promise<void>;
}) {
  const [form, setForm] = useState({
    firstName: person.first_name ?? '',
    middleName: person.middle_name ?? '',
    lastName: person.last_name ?? '',
    nickname: person.nickname ?? '',
    phone: person.phone ?? '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const box =
    'h-9 rounded-lg border px-3 text-sm outline-none bg-[#0f1410] border-[#e8dfc8]/15 text-[#e8dfc8] placeholder:text-[#e8dfc8]/35 focus:border-[#e8a84a]/60';

  return (
    <div className="px-5 pb-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <input className={box} placeholder="First name" value={form.firstName} onChange={set('firstName')} />
        <input className={box} placeholder="Middle name" value={form.middleName} onChange={set('middleName')} />
        <input className={box} placeholder="Last name" value={form.lastName} onChange={set('lastName')} />
        <input className={box} placeholder="Nickname" value={form.nickname} onChange={set('nickname')} />
        <input className={box} placeholder="Mobile number" value={form.phone} onChange={set('phone')} inputMode="tel" />
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <button
          onClick={() => {
            void act(
              person.id,
              'save_person_profile',
              {
                p_id: person.id,
                p_first_name: form.firstName,
                p_last_name: form.lastName,
                p_middle_name: form.middleName || null,
                p_nickname: form.nickname || null,
                p_phone: form.phone || null,
              },
              'Details saved.',
            ).then(onDone);
          }}
          className="h-8 px-3.5 rounded-lg bg-[#e8a84a] text-[#0a0d0a] text-xs font-medium"
        >
          Save details
        </button>
        <button onClick={onDone} className="h-8 px-3 text-xs opacity-60 hover:opacity-100">
          Cancel
        </button>
        <span className="text-[11px] opacity-40 ml-1">
          Email is changed by the person themselves, not here.
        </span>
      </div>
    </div>
  );
}
