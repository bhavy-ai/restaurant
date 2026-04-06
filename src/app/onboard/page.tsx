'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AppLogo from '@/components/ui/AppLogo';
import { Building2, MapPin, ChevronRight, ChevronLeft, Check, Utensils, Phone, Globe, Users, Loader2, AlertCircle } from 'lucide-react';

interface OnboardingData {
  // Step 1 – Restaurant basics
  restaurantName: string;
  cuisineType: string;
  gstin: string;
  fssai: string;
  phone: string;
  website: string;
  // Step 2 – Location
  address: string;
  city: string;
  state: string;
  pincode: string;
  seatingCapacity: string;
  // Step 3 – First outlet
  outletName: string;
  outletAddress: string;
  outletPhone: string;
}

const CUISINE_TYPES = [
  'North Indian', 'South Indian', 'Chinese', 'Italian', 'Continental',
  'Fast Food', 'Cafe / Bakery', 'Seafood', 'Mughlai', 'Multi-Cuisine', 'Other'
];

const STEPS = [
  { id: 1, label: 'Restaurant Info', icon: <Building2 size={16} /> },
  { id: 2, label: 'Location', icon: <MapPin size={16} /> },
  { id: 3, label: 'First Outlet', icon: <Utensils size={16} /> },
];

export default function OnboardPage() {
  const router = useRouter();
  const { user, signUp, signIn } = useAuth();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Auth state (for new users who aren't logged in)
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authed, setAuthed] = useState(!!user);

  const [data, setData] = useState<OnboardingData>({
    restaurantName: '',
    cuisineType: '',
    gstin: '',
    fssai: '',
    phone: '',
    website: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    seatingCapacity: '',
    outletName: '',
    outletAddress: '',
    outletPhone: '',
  });

  const set = (field: keyof OnboardingData, value: string) =>
    setData((prev) => ({ ...prev, [field]: value }));

  // ── Auth handlers ──────────────────────────────────────────────
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      if (authMode === 'signup') {
        await signUp(authEmail, authPassword, { fullName: authName });
        // After signup, sign in immediately
        await signIn(authEmail, authPassword);
      } else {
        await signIn(authEmail, authPassword);
      }
      setAuthed(true);
    } catch (err: any) {
      setAuthError(err?.message || 'Authentication failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // ── Step validation ────────────────────────────────────────────
  const canProceed = () => {
    if (step === 1) return data.restaurantName.trim().length > 0 && data.cuisineType.length > 0;
    if (step === 2) return data.address.trim().length > 0 && data.city.trim().length > 0;
    if (step === 3) return data.outletName.trim().length > 0;
    return false;
  };

  // ── Final submit ───────────────────────────────────────────────
  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('Not authenticated');

      // 1. Create restaurant — self-serve is always 'starter' plan
      const slug = data.restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const { data: restaurant, error: restError } = await supabase
        .from('restaurants')
        .insert({
          name: data.restaurantName,
          slug: `${slug}-${Date.now()}`,
          gstin: data.gstin || null,
          fssai: data.fssai || null,
          phone: data.phone || null,
          website: data.website || null,
          address: data.address,
          city: data.city,
          state: data.state,
          pincode: data.pincode || null,
          cuisine_type: data.cuisineType,
          seating_capacity: data.seatingCapacity ? parseInt(data.seatingCapacity) : null,
          plan: 'starter',
          is_active: true,
          owner_user_id: currentUser.id,
          created_by_user_id: currentUser.id,
          onboarding_status: 'completed',
          onboarding_completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (restError) throw restError;

      // 2. Create first outlet
      const outletSlug = data.outletName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const { data: outlet, error: outletError } = await supabase
        .from('outlets')
        .insert({
          restaurant_id: restaurant.id,
          name: data.outletName,
          slug: outletSlug || 'main',
          address: data.outletAddress || data.address,
          phone: data.outletPhone || data.phone || null,
          is_active: true,
        })
        .select()
        .single();

      if (outletError) throw outletError;

      // 3. Grant owner access
      await supabase.from('user_restaurant_access').insert({
        user_id: currentUser.id,
        restaurant_id: restaurant.id,
        outlet_id: outlet.id,
        role: 'owner',
        is_active: true,
      });

      // 4. Redirect to POS
      router.push('/pos-billing');
    } catch (err: any) {
      setError(err?.message || 'Failed to create restaurant. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Auth gate ──────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8">
            <AppLogo size={40} />
          </div>
          <div className="bg-card border border-border rounded-2xl p-8 shadow-lg">
            <h1 className="text-xl font-bold text-foreground mb-1">
              {authMode === 'signup' ? 'Create your account' : 'Welcome back'}
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              {authMode === 'signup' ?'Sign up to start onboarding your restaurant' :'Sign in to continue onboarding'}
            </p>

            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Your name"
                    required
                    className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="you@restaurant.com"
                  required
                  className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Password</label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                />
              </div>

              {authError && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {authLoading ? <Loader2 size={15} className="animate-spin" /> : null}
                {authLoading ? 'Please wait…' : authMode === 'signup' ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            <p className="text-center text-xs text-muted-foreground mt-5">
              {authMode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setAuthError(''); }}
                className="text-primary hover:text-primary/80 font-medium transition-colors"
              >
                {authMode === 'signup' ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Onboarding wizard ──────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="flex justify-center mb-8">
          <AppLogo size={36} />
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, idx) => (
            <React.Fragment key={s.id}>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                step === s.id
                  ? 'bg-primary text-primary-foreground'
                  : step > s.id
                  ? 'bg-primary/20 text-primary' :'bg-secondary text-muted-foreground'
              }`}>
                {step > s.id ? <Check size={12} /> : s.icon}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`h-px w-8 transition-colors ${step > s.id ? 'bg-primary/40' : 'bg-border'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-lg">
          {/* ── Step 1: Restaurant Info ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-foreground">Tell us about your restaurant</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Basic information to set up your account</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Restaurant Name *</label>
                <input
                  type="text"
                  value={data.restaurantName}
                  onChange={(e) => set('restaurantName', e.target.value)}
                  placeholder="e.g. Spice Garden"
                  className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Cuisine Type *</label>
                <select
                  value={data.cuisineType}
                  onChange={(e) => set('cuisineType', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                >
                  <option value="">Select cuisine type</option>
                  {CUISINE_TYPES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">GSTIN</label>
                  <input
                    type="text"
                    value={data.gstin}
                    onChange={(e) => set('gstin', e.target.value)}
                    placeholder="22AAAAA0000A1Z5"
                    className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">FSSAI License</label>
                  <input
                    type="text"
                    value={data.fssai}
                    onChange={(e) => set('fssai', e.target.value)}
                    placeholder="FSSAI number"
                    className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Phone</label>
                  <div className="relative">
                    <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="tel"
                      value={data.phone}
                      onChange={(e) => set('phone', e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full pl-8 pr-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Website</label>
                  <div className="relative">
                    <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="url"
                      value={data.website}
                      onChange={(e) => set('website', e.target.value)}
                      placeholder="https://yourrestaurant.com"
                      className="w-full pl-8 pr-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Location ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-foreground">Where is your restaurant?</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Address details for your restaurant</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Street Address *</label>
                <input
                  type="text"
                  value={data.address}
                  onChange={(e) => set('address', e.target.value)}
                  placeholder="123, MG Road, Near Metro Station"
                  className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">City *</label>
                  <input
                    type="text"
                    value={data.city}
                    onChange={(e) => set('city', e.target.value)}
                    placeholder="Bengaluru"
                    className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">State</label>
                  <input
                    type="text"
                    value={data.state}
                    onChange={(e) => set('state', e.target.value)}
                    placeholder="Karnataka"
                    className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Pincode</label>
                  <input
                    type="text"
                    value={data.pincode}
                    onChange={(e) => set('pincode', e.target.value)}
                    placeholder="560001"
                    className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Seating Capacity</label>
                  <div className="relative">
                    <Users size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="number"
                      value={data.seatingCapacity}
                      onChange={(e) => set('seatingCapacity', e.target.value)}
                      placeholder="50"
                      min="1"
                      className="w-full pl-8 pr-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: First Outlet ── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-foreground">Set up your first outlet</h2>
                <p className="text-sm text-muted-foreground mt-0.5">You can add more outlets later from the dashboard</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Outlet Name *</label>
                <input
                  type="text"
                  value={data.outletName}
                  onChange={(e) => set('outletName', e.target.value)}
                  placeholder="e.g. Main Branch, Koramangala"
                  className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Outlet Address</label>
                <input
                  type="text"
                  value={data.outletAddress}
                  onChange={(e) => set('outletAddress', e.target.value)}
                  placeholder="Leave blank to use restaurant address"
                  className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Outlet Phone</label>
                <div className="relative">
                  <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="tel"
                    value={data.outletPhone}
                    onChange={(e) => set('outletPhone', e.target.value)}
                    placeholder="Leave blank to use restaurant phone"
                    className="w-full pl-8 pr-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  />
                </div>
              </div>

              {/* Summary card */}
              <div className="bg-secondary/60 border border-border rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Summary</p>
                <div className="flex items-center gap-2">
                  <Building2 size={13} className="text-primary flex-shrink-0" />
                  <span className="text-sm text-foreground font-medium">{data.restaurantName}</span>
                  <span className="text-xs text-muted-foreground">· {data.cuisineType}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={13} className="text-accent flex-shrink-0" />
                  <span className="text-xs text-muted-foreground">{data.city}{data.state ? `, ${data.state}` : ''}</span>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
            <button
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 1}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-0 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft size={15} />
              Back
            </button>

            {step < 3 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canProceed()}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Continue
                <ChevronRight size={15} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canProceed() || submitting}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {submitting ? 'Setting up…' : 'Launch Restaurant'}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Already have an account?{' '}
          <a href="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
