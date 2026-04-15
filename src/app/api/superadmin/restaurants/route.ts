import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type AddRestaurantPayload = {
  name?: string;
  ownerName?: string;
  ownerEmail?: string;
  phone?: string;
  cuisineType?: string;
  gstin?: string;
  fssai?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  seatingCapacity?: string;
  plan?: string;
  onboardingStatus?: string;
  outletName?: string;
  outletAddress?: string;
  outletPhone?: string;
};

const ALLOWED_PLAN_NAMES = new Set(['starter', 'growth', 'enterprise']);

async function findUserByEmail(admin: any, email: string) {
  let page = 1;
  const perPage = 100;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    const match = users.find((user: any) => (user.email || '').toLowerCase() === email.toLowerCase());
    if (match) return match;

    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: superadminRow, error: superadminError } = await supabase
    .from('platform_superadmins')
    .select('id')
    .eq('user_id', authData.user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (superadminError || !superadminRow) {
    return NextResponse.json({ error: 'Access restricted to platform superadmins' }, { status: 403 });
  }

  const payload = (await req.json()) as AddRestaurantPayload;
  const name = payload.name?.trim();
  const ownerEmail = payload.ownerEmail?.trim().toLowerCase();
  const ownerName = payload.ownerName?.trim();
  const plan = (payload.plan || 'starter').trim().toLowerCase();

  if (!name) {
    return NextResponse.json({ error: 'Restaurant name is required' }, { status: 400 });
  }

  if (!ownerEmail) {
    return NextResponse.json({ error: 'Owner email is required' }, { status: 400 });
  }

  const admin = createAdminClient() as any;

  const { data: plans, error: plansError } = await admin
    .from('plans')
    .select('name, is_active');

  if (plansError) {
    return NextResponse.json({ error: plansError.message }, { status: 500 });
  }

  const activePlanNames = new Set((plans || []).filter((row: any) => row?.is_active).map((row: any) => row.name));
  if (!activePlanNames.has(plan) || !ALLOWED_PLAN_NAMES.has(plan)) {
    return NextResponse.json({ error: `Invalid plan: ${plan}` }, { status: 400 });
  }

  let ownerUser = await findUserByEmail(admin, ownerEmail);
  if (!ownerUser) {
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(ownerEmail, {
      data: {
        full_name: ownerName || name,
        role: 'owner',
      },
    });

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    ownerUser = inviteData?.user ?? (await findUserByEmail(admin, ownerEmail));
  } else if (ownerName) {
    await admin.auth.admin.updateUserById(ownerUser.id, {
      user_metadata: {
        ...(ownerUser.user_metadata || {}),
        full_name: ownerName,
        role: 'owner',
      },
    });
  }

  if (!ownerUser?.id) {
    return NextResponse.json({ error: 'Unable to resolve or create owner account' }, { status: 500 });
  }

  const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const restaurantSlug = `${slugBase}-${Date.now()}`;

  let restaurantId: string | null = null;
  let outletId: string | null = null;

  try {
    const { data: restaurant, error: restaurantError } = await admin
      .from('restaurants')
      .insert({
        name,
        slug: restaurantSlug,
        phone: payload.phone || null,
        cuisine_type: payload.cuisineType || null,
        gstin: payload.gstin || null,
        fssai: payload.fssai || null,
        website: payload.website || null,
        address: payload.address || null,
        city: payload.city || null,
        state: payload.state || null,
        pincode: payload.pincode || null,
        seating_capacity: payload.seatingCapacity ? parseInt(payload.seatingCapacity, 10) : null,
        plan,
        is_active: true,
        owner_user_id: ownerUser.id,
        created_by_user_id: authData.user.id,
        onboarding_status: payload.onboardingStatus || 'active',
      })
      .select()
      .single();

    if (restaurantError) throw restaurantError;
    restaurantId = restaurant.id;

    const outletSlugBase = (payload.outletName || 'main').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const { data: outlet, error: outletError } = await admin
      .from('outlets')
      .insert({
        restaurant_id: restaurant.id,
        name: payload.outletName || 'Main Branch',
        slug: outletSlugBase || 'main',
        address: payload.outletAddress || payload.address || payload.city || null,
        phone: payload.outletPhone || payload.phone || null,
        is_active: true,
      })
      .select()
      .single();

    if (outletError) throw outletError;
    outletId = outlet.id;

    const { error: accessError } = await admin
      .from('user_restaurant_access')
      .upsert({
        user_id: ownerUser.id,
        restaurant_id: restaurant.id,
        outlet_id: outlet.id,
        role: 'owner',
        is_active: true,
      }, {
        onConflict: 'user_id,restaurant_id',
      });

    if (accessError) throw accessError;

    await admin.from('audit_logs').insert({
      staff_name: authData.user.email || 'Superadmin',
      staff_role: 'superadmin',
      action: 'restaurant_created',
      entity: 'restaurant',
      details: `Restaurant "${name}" created for ${ownerEmail} on ${plan} plan`,
      severity: 'info',
      outlet: 'platform',
    });

    return NextResponse.json({
      restaurant,
      outlet,
      ownerUserId: ownerUser.id,
      plan,
    });
  } catch (err: any) {
    if (outletId) {
      await admin.from('outlets').delete().eq('id', outletId).catch(() => {});
    }

    if (restaurantId) {
      await admin.from('restaurants').delete().eq('id', restaurantId).catch(() => {});
    }

    return NextResponse.json({ error: err?.message || 'Failed to create restaurant' }, { status: 500 });
  }
}