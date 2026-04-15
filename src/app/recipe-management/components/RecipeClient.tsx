'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { FlaskConical, Plus, Trash2, Save, ChevronDown, ChevronUp, AlertTriangle, Package } from 'lucide-react';
import { captureException } from '@/lib/errorTracking';
import { useAuth } from '@/contexts/AuthContext';

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  reorderLevel: number;
  costPerUnit: number;
}

interface RecipeLine {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantityUsed: number;
}

interface MenuItem {
  id: string;
  name: string;
  category: string;
}

interface RecipeMap {
  [menuItemId: string]: RecipeLine[];
}

export default function RecipeClient() {
  const supabase = createClient();
  const { activeRestaurant, activeOutlet } = useAuth();
  const restaurantId = activeRestaurant?.id;
  const outletSlug = activeOutlet?.slug || 'koramangala';
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [recipes, setRecipes] = useState<RecipeMap>({});
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  // New ingredient form
  const [showAddIngredient, setShowAddIngredient] = useState(false);
  const [ingForm, setIngForm] = useState({ name: '', unit: 'kg', currentStock: '', reorderLevel: '', costPerUnit: '' });
  const [savingIng, setSavingIng] = useState(false);

  const loadData = useCallback(async () => {
    if (!restaurantId) {
      setIngredients([]);
      setMenuItems([]);
      setRecipes({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [ingRes, menuRes, recipeRes] = await Promise.all([
        supabase.from('ingredients').select('*').eq('restaurant_id', restaurantId).eq('outlet', outletSlug).order('name'),
        supabase.from('menu_items').select('id,name,category').eq('restaurant_id', restaurantId).eq('outlet', outletSlug).order('category').order('name'),
        supabase.from('recipes').select('*, ingredients(name,unit), menu_items!inner(id, restaurant_id, outlet)').eq('menu_items.restaurant_id', restaurantId).eq('menu_items.outlet', outletSlug),
      ]);

      setIngredients((ingRes.data || []).map((r: any) => ({
        id: r.id, name: r.name, unit: r.unit,
        currentStock: Number(r.current_stock), reorderLevel: Number(r.reorder_level), costPerUnit: Number(r.cost_per_unit),
      })));

      setMenuItems((menuRes.data || []).map((r: any) => ({ id: r.id, name: r.name, category: r.category })));

      const map: RecipeMap = {};
      (recipeRes.data || []).forEach((r: any) => {
        if (!map[r.menu_item_id]) map[r.menu_item_id] = [];
        map[r.menu_item_id].push({
          ingredientId: r.ingredient_id,
          ingredientName: r.ingredients?.name || '',
          unit: r.ingredients?.unit || '',
          quantityUsed: Number(r.quantity_used),
        });
      });
      setRecipes(map);
    } catch (e: any) {
      setLoadError(e.message || 'Failed to load recipe data');
      captureException(e, { component: 'RecipeClient', action: 'loadData' });
      toast.error('Failed to load data: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, outletSlug]);

  useEffect(() => { loadData(); }, [loadData]);

  const addIngredient = async () => {
    if (!restaurantId) {
      toast.error('No active restaurant selected');
      return;
    }
    if (!ingForm.name.trim()) return;
    setSavingIng(true);
    try {
      const { error } = await supabase.from('ingredients').insert({
        restaurant_id: restaurantId,
        outlet: outletSlug,
        name: ingForm.name.trim(),
        unit: ingForm.unit,
        current_stock: Number(ingForm.currentStock) || 0,
        reorder_level: Number(ingForm.reorderLevel) || 1,
        cost_per_unit: Number(ingForm.costPerUnit) || 0,
      });
      if (error) throw error;
      toast.success('Ingredient added');
      setIngForm({ name: '', unit: 'kg', currentStock: '', reorderLevel: '', costPerUnit: '' });
      setShowAddIngredient(false);
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingIng(false);
    }
  };

  const addRecipeLine = (menuItemId: string) => {
    setRecipes(prev => ({
      ...prev,
      [menuItemId]: [...(prev[menuItemId] || []), { ingredientId: '', ingredientName: '', unit: '', quantityUsed: 0 }],
    }));
  };

  const updateRecipeLine = (menuItemId: string, idx: number, field: string, value: string | number) => {
    setRecipes(prev => {
      const lines = [...(prev[menuItemId] || [])];
      if (field === 'ingredientId') {
        const ing = ingredients.find(i => i.id === value);
        lines[idx] = { ...lines[idx], ingredientId: value as string, ingredientName: ing?.name || '', unit: ing?.unit || '' };
      } else {
        lines[idx] = { ...lines[idx], [field]: value };
      }
      return { ...prev, [menuItemId]: lines };
    });
  };

  const removeRecipeLine = (menuItemId: string, idx: number) => {
    setRecipes(prev => {
      const lines = [...(prev[menuItemId] || [])];
      lines.splice(idx, 1);
      return { ...prev, [menuItemId]: lines };
    });
  };

  const saveRecipe = async (menuItemId: string) => {
    setSaving(menuItemId);
    try {
      // Delete existing
      await supabase.from('recipes').delete().eq('menu_item_id', menuItemId);
      const lines = (recipes[menuItemId] || []).filter(l => l.ingredientId && l.quantityUsed > 0);
      if (lines.length > 0) {
        const { error } = await supabase.from('recipes').insert(
          lines.map(l => ({ menu_item_id: menuItemId, ingredient_id: l.ingredientId, quantity_used: l.quantityUsed }))
        );
        if (error) throw error;
      }
      toast.success('Recipe saved');
    } catch (e: any) {
      captureException(e, { component: 'RecipeClient', action: 'saveRecipe' });
      toast.error(e.message);
    } finally {
      setSaving(null);
    }
  };

  const lowStockCount = ingredients.filter(i => i.currentStock <= i.reorderLevel).length;

  if (loading) return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 bg-card animate-pulse rounded w-64" />
          <div className="h-4 bg-card animate-pulse rounded w-48" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="h-3 bg-secondary animate-pulse rounded w-24" />
            <div className="h-7 bg-secondary animate-pulse rounded w-12" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center h-48">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );

  if (loadError) return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
      <AlertTriangle size={32} className="text-red-400 mb-3" />
      <p className="text-sm font-medium text-foreground mb-1">Failed to load recipe data</p>
      <p className="text-xs text-muted-foreground mb-4">{loadError}</p>
      <button onClick={loadData} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
        Retry
      </button>
    </div>
  );

  const grouped = menuItems.reduce<Record<string, MenuItem[]>>((acc, m) => {
    if (!acc[m.category]) acc[m.category] = [];
    acc[m.category].push(m);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FlaskConical size={22} className="text-primary" /> Recipe Consumption Mapping
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Map ingredients to menu items for automatic stock deduction on sale</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-sm font-medium text-foreground">How this works</p>
        <p className="text-xs text-muted-foreground mt-1">
          Ingredients are your stock master (paneer, tomato, oil). Recipes are consumption rules per menu item (for 1 dish, how much stock to deduct).
        </p>
        <p className="text-xs text-muted-foreground mt-2">Menu items are managed from Admin Panel > Menu & Pricing. Recipe mapping is edited per menu item below.</p>
        <button onClick={() => setShowAddIngredient(true)} className="mt-3 px-3 py-1.5 bg-secondary border border-border rounded-lg text-xs text-foreground hover:bg-secondary/80">
          Manage Ingredients
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total Ingredients</p>
          <p className="text-2xl font-bold text-foreground mt-1">{ingredients.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Menu Items Mapped</p>
          <p className="text-2xl font-bold text-foreground mt-1">{Object.keys(recipes).filter(k => recipes[k]?.length > 0).length}</p>
        </div>
        <div className={`bg-card border rounded-xl p-4 ${lowStockCount > 0 ? 'border-red-500/40' : 'border-border'}`}>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            {lowStockCount > 0 && <AlertTriangle size={12} className="text-red-400" />} Low Stock Alerts
          </p>
          <p className={`text-2xl font-bold mt-1 ${lowStockCount > 0 ? 'text-red-400' : 'text-foreground'}`}>{lowStockCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Ingredients Panel */}
        <div className="col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Package size={15} className="text-primary" /> Ingredients Stock</h2>
            <button onClick={() => setShowAddIngredient(true)} className="text-xs text-primary hover:underline">Add Ingredient</button>
          </div>
          <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
            {ingredients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Package size={24} className="text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">No ingredients added yet</p>
                <button onClick={() => setShowAddIngredient(true)} className="mt-3 text-xs text-primary hover:underline">Add first ingredient</button>
              </div>
            ) : (
              ingredients.map(ing => (
                <div key={ing.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{ing.name}</p>
                    <p className="text-xs text-muted-foreground">{ing.currentStock} {ing.unit} · ₹{ing.costPerUnit}/{ing.unit}</p>
                  </div>
                  {ing.currentStock <= ing.reorderLevel && (
                    <span className="text-[10px] bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">Low</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recipe Mapping Panel */}
        <div className="col-span-3 space-y-3">
          {Object.keys(grouped).length === 0 ? (
            <div className="bg-card border border-border rounded-xl flex flex-col items-center justify-center py-16 text-center">
              <FlaskConical size={28} className="text-muted-foreground mb-2" />
              <p className="text-sm font-medium text-foreground mb-1">No menu items found</p>
              <p className="text-xs text-muted-foreground">Add menu items from Admin Panel > Menu & Pricing, then map ingredients here.</p>
            </div>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-secondary/50 border-b border-border">
                  <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">{category}</p>
                </div>
                {items.map(item => {
                  const lines = recipes[item.id] || [];
                  const isExpanded = expandedItem === item.id;
                  return (
                    <div key={item.id} className="border-b border-border last:border-0">
                      <button
                        onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-foreground">{item.name}</span>
                          {lines.length > 0 && (
                            <span className="text-[10px] bg-accent/15 text-accent border border-accent/30 px-2 py-0.5 rounded-full">{lines.length} ingredients</span>
                          )}
                        </div>
                        {isExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-2">
                          {lines.map((line, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <select
                                value={line.ingredientId}
                                onChange={e => updateRecipeLine(item.id, idx, 'ingredientId', e.target.value)}
                                className="flex-1 bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm text-foreground"
                              >
                                <option value="">Select ingredient</option>
                                {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                              </select>
                              <input
                                type="number"
                                value={line.quantityUsed || ''}
                                onChange={e => updateRecipeLine(item.id, idx, 'quantityUsed', Number(e.target.value))}
                                placeholder="Qty"
                                className="w-20 bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm text-foreground"
                              />
                              <span className="text-xs text-muted-foreground w-8">{line.unit}</span>
                              <button onClick={() => removeRecipeLine(item.id, idx)} className="text-muted-foreground hover:text-destructive">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => addRecipeLine(item.id)} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                              <Plus size={12} /> Add ingredient
                            </button>
                            <button
                              onClick={() => saveRecipe(item.id)}
                              disabled={saving === item.id}
                              className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                            >
                              {saving === item.id ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Save size={12} />}
                              Save Recipe
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Ingredient Modal */}
      {showAddIngredient && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-base font-semibold text-foreground mb-4">Add Ingredient</h3>
            <div className="space-y-3">
              <input value={ingForm.name} onChange={e => setIngForm(p => ({ ...p, name: e.target.value }))} placeholder="Ingredient name" className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
              <div className="grid grid-cols-2 gap-3">
                <select value={ingForm.unit} onChange={e => setIngForm(p => ({ ...p, unit: e.target.value }))} className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground">
                  {['kg', 'g', 'litre', 'ml', 'piece', 'dozen', 'packet'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <input value={ingForm.currentStock} onChange={e => setIngForm(p => ({ ...p, currentStock: e.target.value }))} placeholder="Current stock" type="number" className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input value={ingForm.reorderLevel} onChange={e => setIngForm(p => ({ ...p, reorderLevel: e.target.value }))} placeholder="Reorder level" type="number" className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
                <input value={ingForm.costPerUnit} onChange={e => setIngForm(p => ({ ...p, costPerUnit: e.target.value }))} placeholder="Cost per unit (₹)" type="number" className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddIngredient(false)} className="flex-1 px-4 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground hover:bg-secondary/80">Cancel</button>
              <button onClick={addIngredient} disabled={savingIng} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {savingIng ? 'Saving...' : 'Add Ingredient'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
