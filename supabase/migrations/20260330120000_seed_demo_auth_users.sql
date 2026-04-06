-- ============================================================
-- Seed Demo Auth Users
-- Migration: 20260330120000_seed_demo_auth_users.sql
-- Creates Supabase Auth accounts for all demo staff members
-- Password for all accounts: Demo@1234
-- ============================================================

DO $$
DECLARE
  vikram_id   UUID := gen_random_uuid();
  meera_id    UUID := gen_random_uuid();
  rahul_id    UUID := gen_random_uuid();
  priya_id    UUID := gen_random_uuid();
  suresh_id   UUID := gen_random_uuid();
  anand_id    UUID := gen_random_uuid();
BEGIN

  -- ── Insert into auth.users ────────────────────────────────────
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_user_meta_data, raw_app_meta_data,
    is_sso_user, is_anonymous,
    confirmation_token, confirmation_sent_at,
    recovery_token, recovery_sent_at,
    email_change_token_new, email_change, email_change_sent_at,
    email_change_token_current, email_change_confirm_status,
    reauthentication_token, reauthentication_sent_at,
    phone, phone_change, phone_change_token, phone_change_sent_at
  ) VALUES
    -- Owner: Vikram Nair
    (vikram_id,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'vikram@spicegarden.in',
     crypt('Demo@1234', gen_salt('bf', 10)),
     now(), now(), now(),
     jsonb_build_object('full_name', 'Vikram Nair', 'role', 'owner'),
     jsonb_build_object('provider', 'email', 'providers', ARRAY['email']::TEXT[]),
     false, false, '', null, '', null, '', '', null, '', 0, '', null,
     null, '', '', null),

    -- Manager: Meera Pillai
    (meera_id,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'meera.p@spicegarden.in',
     crypt('Demo@1234', gen_salt('bf', 10)),
     now(), now(), now(),
     jsonb_build_object('full_name', 'Meera Pillai', 'role', 'manager'),
     jsonb_build_object('provider', 'email', 'providers', ARRAY['email']::TEXT[]),
     false, false, '', null, '', null, '', '', null, '', 0, '', null,
     null, '', '', null),

    -- Cashier: Rahul Sharma
    (rahul_id,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rahul.sharma@spicegarden.in',
     crypt('Demo@1234', gen_salt('bf', 10)),
     now(), now(), now(),
     jsonb_build_object('full_name', 'Rahul Sharma', 'role', 'cashier'),
     jsonb_build_object('provider', 'email', 'providers', ARRAY['email']::TEXT[]),
     false, false, '', null, '', null, '', '', null, '', 0, '', null,
     null, '', '', null),

    -- Captain: Priya Menon
    (priya_id,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'priya.m@spicegarden.in',
     crypt('Demo@1234', gen_salt('bf', 10)),
     now(), now(), now(),
     jsonb_build_object('full_name', 'Priya Menon', 'role', 'captain'),
     jsonb_build_object('provider', 'email', 'providers', ARRAY['email']::TEXT[]),
     false, false, '', null, '', null, '', '', null, '', 0, '', null,
     null, '', '', null),

    -- Kitchen: Suresh Kumar
    (suresh_id,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'suresh.k@spicegarden.in',
     crypt('Demo@1234', gen_salt('bf', 10)),
     now(), now(), now(),
     jsonb_build_object('full_name', 'Suresh Kumar', 'role', 'kitchen'),
     jsonb_build_object('provider', 'email', 'providers', ARRAY['email']::TEXT[]),
     false, false, '', null, '', null, '', '', null, '', 0, '', null,
     null, '', '', null),

    -- Accountant: Anand Krishnan
    (anand_id,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'anand.k@spicegarden.in',
     crypt('Demo@1234', gen_salt('bf', 10)),
     now(), now(), now(),
     jsonb_build_object('full_name', 'Anand Krishnan', 'role', 'accountant'),
     jsonb_build_object('provider', 'email', 'providers', ARRAY['email']::TEXT[]),
     false, false, '', null, '', null, '', '', null, '', 0, '', null,
     null, '', '', null)

  ON CONFLICT (id) DO NOTHING;

  -- ── Insert into auth.identities (required for email provider login) ──
  INSERT INTO auth.identities (
    id, user_id, provider_id, provider,
    identity_data, last_sign_in_at, created_at, updated_at
  ) VALUES
    (gen_random_uuid(), vikram_id, 'vikram@spicegarden.in', 'email',
     jsonb_build_object('sub', vikram_id::TEXT, 'email', 'vikram@spicegarden.in', 'email_verified', true, 'provider', 'email'),
     now(), now(), now()),

    (gen_random_uuid(), meera_id, 'meera.p@spicegarden.in', 'email',
     jsonb_build_object('sub', meera_id::TEXT, 'email', 'meera.p@spicegarden.in', 'email_verified', true, 'provider', 'email'),
     now(), now(), now()),

    (gen_random_uuid(), rahul_id, 'rahul.sharma@spicegarden.in', 'email',
     jsonb_build_object('sub', rahul_id::TEXT, 'email', 'rahul.sharma@spicegarden.in', 'email_verified', true, 'provider', 'email'),
     now(), now(), now()),

    (gen_random_uuid(), priya_id, 'priya.m@spicegarden.in', 'email',
     jsonb_build_object('sub', priya_id::TEXT, 'email', 'priya.m@spicegarden.in', 'email_verified', true, 'provider', 'email'),
     now(), now(), now()),

    (gen_random_uuid(), suresh_id, 'suresh.k@spicegarden.in', 'email',
     jsonb_build_object('sub', suresh_id::TEXT, 'email', 'suresh.k@spicegarden.in', 'email_verified', true, 'provider', 'email'),
     now(), now(), now()),

    (gen_random_uuid(), anand_id, 'anand.k@spicegarden.in', 'email',
     jsonb_build_object('sub', anand_id::TEXT, 'email', 'anand.k@spicegarden.in', 'email_verified', true, 'provider', 'email'),
     now(), now(), now())

  ON CONFLICT (provider, provider_id) DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Demo auth user seeding failed: %', SQLERRM;
END $$;
