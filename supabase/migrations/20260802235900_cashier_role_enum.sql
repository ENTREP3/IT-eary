-- ============================================================================
-- IT-eary · Add the `cashier` value to public.user_role
-- ----------------------------------------------------------------------------
-- This lives in its own migration on purpose: PostgreSQL will not let a newly
-- added enum value be *used* in the same transaction that adds it, and the
-- next migration (ticket ordering) references 'cashier' in function bodies and
-- policies. Keeping the ALTER TYPE alone guarantees it is committed first.
--
-- `customer` stays in the enum so pre-existing profile rows remain valid, but
-- customers no longer have accounts — ordering is ticket-based and anonymous.
-- ============================================================================

alter type public.user_role add value if not exists 'cashier';
