import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function resolveOutletAccess(supabase: any, userId: string, restaurantId: string) {
  const { data: superadminRow } = await supabase
    .from('platform_superadmins')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (superadminRow) {
    return {
      allowed: true,
      isSuperadmin: true,
      ownerRole: 'superadmin' as const,
      restaurantRow: null,
    };
  }

  const { data: restaurantRow } = await supabase
    .from('restaurants')
    .select('owner_user_id, created_by_user_id, plan')
    .eq('id', restaurantId)
    .maybeSingle();

  if (!restaurantRow) {
    return {
      allowed: false,
      isSuperadmin: false,
      ownerRole: null,
      restaurantRow: null,
    };
  }

  let allowed = (restaurantRow as any).owner_user_id === userId || (restaurantRow as any).created_by_user_id === userId;
  let ownerRole: string | null = allowed ? 'owner' : null;

  if (!allowed) {
    const { data: accessRow } = await supabase
      .from('user_restaurant_access')
      .select('role')
      .eq('user_id', userId)
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .maybeSingle();

    allowed = (accessRow as any)?.role === 'owner';
    ownerRole = (accessRow as any)?.role || null;
  }

  return {
    allowed,
    isSuperadmin: false,
    ownerRole,
    restaurantRow,
  };
}

async function createAuditLog(admin: any, authEmail: string | undefined, staffRole: string, action: string, entityName: string, outletSlug: string) {
  await admin.from('audit_logs').insert({
    staff_name: authEmail || 'Admin',
    staff_role: staffRole,
    action,
    entity: 'outlet',
    details: entityName,
    severity: action === 'outlet_deactivated' ? 'warning' : 'info',
    outlet: outletSlug || 'platform',
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json();
  const restaurantId = String(body.restaurantId || '').trim();
  const name = String(body.name || '').trim();

  if (!restaurantId) {
    return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: 'Outlet name is required' }, { status: 400 });
  }

  const access = await resolveOutletAccess(supabase, authData.user.id, restaurantId);
  if (!access.allowed) {
    return NextResponse.json({ error: 'Access restricted to owners and superadmins' }, { status: 403 });
  }

  if (!access.isSuperadmin) {
    const planName = String((access.restaurantRow as any)?.plan || 'starter').toLowerCase();
    const { data: planRow } = await supabase
      .from('plans')
      .select('max_outlets, display_name')
      .eq('name', planName)
      .maybeSingle();

    const maxOutlets = Number((planRow as any)?.max_outlets ?? 1);
    if (maxOutlets > 0) {
      const { count, error: countError } = await supabase
        .from('outlets')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true);

      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 });
      }

      if ((count || 0) >= maxOutlets) {
        return NextResponse.json({
          error: `Plan limit reached. ${String((planRow as any)?.display_name || planName).toUpperCase()} allows only ${maxOutlets} active outlet(s).`,
          plan: planName,
          maxOutlets,
          activeOutlets: count || 0,
        }, { status: 409 });
      }
    }
  }

  const admin = createAdminClient() as any;
  const slug = slugify(String(body.slug || name)) || `outlet-${Date.now()}`;

  const { data: outlet, error } = await admin
    .from('outlets')
    .insert({
      restaurant_id: restaurantId,
      name,
      slug: `${slug}-${Date.now()}`,
      address: body.address || null,
      phone: body.phone || null,
      gstin: body.gstin || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await createAuditLog(
    admin,
    authData.user.email || undefined,
    access.isSuperadmin ? 'superadmin' : access.ownerRole || 'owner',
    'outlet_created',
    `Outlet "${name}" created for restaurant ${restaurantId}`,
    outlet?.slug || 'platform'
  );

  return NextResponse.json({ outlet });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json();
  const restaurantId = String(body.restaurantId || '').trim();
  const outletId = String(body.outletId || '').trim();

  if (!restaurantId || !outletId) {
    return NextResponse.json({ error: 'restaurantId and outletId are required' }, { status: 400 });
  }

  const access = await resolveOutletAccess(supabase, authData.user.id, restaurantId);
  if (!access.allowed) {
    return NextResponse.json({ error: 'Access restricted to owners and superadmins' }, { status: 403 });
  }

  const updates: Record<string, any> = {};
  if (body.name !== undefined) updates.name = String(body.name || '').trim();
  if (body.slug !== undefined) updates.slug = slugify(String(body.slug || '')) || slugify(String(body.name || ''));
  if (body.address !== undefined) updates.address = body.address || null;
  if (body.phone !== undefined) updates.phone = body.phone || null;
  if (body.gstin !== undefined) updates.gstin = body.gstin || null;
  if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);

  if (updates.name === '') {
    return NextResponse.json({ error: 'Outlet name cannot be empty' }, { status: 400 });
  }

  const admin = createAdminClient() as any;
  const { data: outlet, error } = await admin
    .from('outlets')
    .update(updates)
    .eq('id', outletId)
    .eq('restaurant_id', restaurantId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await createAuditLog(
    admin,
    authData.user.email || undefined,
    access.isSuperadmin ? 'superadmin' : access.ownerRole || 'owner',
    updates.is_active === false ? 'outlet_deactivated' : 'outlet_updated',
    `Outlet "${outlet?.name || outletId}" updated for restaurant ${restaurantId}`,
    outlet?.slug || 'platform'
  );

  return NextResponse.json({ outlet });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json();
  const restaurantId = String(body.restaurantId || '').trim();
  const outletId = String(body.outletId || '').trim();

  if (!restaurantId || !outletId) {
    return NextResponse.json({ error: 'restaurantId and outletId are required' }, { status: 400 });
  }

  const access = await resolveOutletAccess(supabase, authData.user.id, restaurantId);
  if (!access.allowed) {
    return NextResponse.json({ error: 'Access restricted to owners and superadmins' }, { status: 403 });
  }

  const admin = createAdminClient() as any;
  const { data: outletRow, error: fetchError } = await admin
    .from('outlets')
    .select('id, name, slug, is_active')
    .eq('id', outletId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (fetchError || !outletRow) {
    return NextResponse.json({ error: 'Outlet not found' }, { status: 404 });
  }

  if (!(outletRow as any).is_active) {
    return NextResponse.json({ outlet: outletRow }, { status: 200 });
  }

  const { data: outlet, error } = await admin
    .from('outlets')
    .update({ is_active: false })
    .eq('id', outletId)
    .eq('restaurant_id', restaurantId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await createAuditLog(
    admin,
    authData.user.email || undefined,
    access.isSuperadmin ? 'superadmin' : access.ownerRole || 'owner',
    'outlet_deactivated',
    `Outlet "${(outletRow as any).name}" soft-deleted for restaurant ${restaurantId}`,
    (outletRow as any).slug || 'platform'
  );

  return NextResponse.json({ outlet });
}