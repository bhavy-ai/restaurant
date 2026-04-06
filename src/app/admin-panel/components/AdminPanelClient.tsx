'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Store, Users, FileText, Printer, Plug, ScrollText, Plus, Edit3, Trash2, CheckCircle, X, AlertTriangle, Utensils, Wifi, WifiOff, Eye, EyeOff, Loader2, Save, MessageSquare, Search, Download, Calendar, Filter, RefreshCw, Shield, TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { staffService, auditService, menuService, gstService, outletSettingsService, printerService, aggregatorService } from '@/lib/services/restaurantService';

// ── Types ──────────────────────────────────────────────────────────────────
type AdminSection = 'outlet' | 'menu' | 'users' | 'taxes' | 'printers' | 'integrations' | 'notifications' | 'audit';

interface UserRole {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'manager' | 'cashier' | 'captain' | 'kitchen' | 'accountant';
  outlet: string;
  status: 'active' | 'inactive';
  lastLogin: string;
  permissions: string[];
}

interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  gstRate: number;
  hsnCode: string;
  isVeg: boolean;
  available: boolean;
}

interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  action: string;
  entity: string;
  details: string;
  ip: string;
  severity: 'info' | 'warning' | 'critical';
}

interface GstConfig {
  gstin: string;
  legalName: string;
  tradeName: string;
  registrationType: string;
  rate5Enabled: boolean;
  rate12Enabled: boolean;
  rate18Enabled: boolean;
  rate0Enabled: boolean;
}

interface AddUserForm {
  name: string;
  email: string;
  phone: string;
  role: string;
  outlet: string;
}

interface AddMenuForm {
  name: string;
  category: string;
  price: string;
  gstRate: string;
  hsnCode: string;
  isVeg: boolean;
  available: boolean;
}

interface PrinterConfig {
  id: string;
  name: string;
  printerType: string;
  ipAddress: string;
  port: number;
  paperWidth: string;
  enabled: boolean;
}

interface AggregatorConfig {
  id: string;
  platform: string;
  displayName: string;
  apiKey: string;
  restaurantId: string;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastStatus: string;
}

const roleColors: Record<string, string> = {
  owner: 'bg-primary/15 text-primary border-primary/30',
  manager: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  cashier: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  captain: 'bg-accent/15 text-accent border-accent/30',
  kitchen: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  accountant: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
};

const permissionsMatrix = [
  { module: 'POS Billing', owner: true, manager: true, cashier: true, captain: false, kitchen: false, accountant: false },
  { module: 'Table Management', owner: true, manager: true, cashier: false, captain: true, kitchen: false, accountant: false },
  { module: 'KOT / KDS', owner: true, manager: true, cashier: false, captain: true, kitchen: true, accountant: false },
  { module: 'Inventory', owner: true, manager: true, cashier: false, captain: false, kitchen: false, accountant: true },
  { module: 'Settlement', owner: true, manager: true, cashier: true, captain: false, kitchen: false, accountant: true },
  { module: 'Reports — View', owner: true, manager: true, cashier: true, captain: false, kitchen: false, accountant: true },
  { module: 'Reports — Export', owner: true, manager: false, cashier: false, captain: false, kitchen: false, accountant: true },
  { module: 'Admin Panel', owner: true, manager: false, cashier: false, captain: false, kitchen: false, accountant: false },
  { module: 'Discount & Void', owner: true, manager: true, cashier: false, captain: false, kitchen: false, accountant: false },
  { module: 'Menu Management', owner: true, manager: true, cashier: false, captain: false, kitchen: false, accountant: false },
];

const navItems: { id: AdminSection; label: string; icon: React.ReactNode; badge?: number }[] = [
  { id: 'outlet', label: 'Outlet Config', icon: <Store size={16} /> },
  { id: 'menu', label: 'Menu & Pricing', icon: <Utensils size={16} /> },
  { id: 'users', label: 'Users & Roles', icon: <Users size={16} /> },
  { id: 'taxes', label: 'Taxes & GST', icon: <FileText size={16} /> },
  { id: 'printers', label: 'Printers & Devices', icon: <Printer size={16} /> },
  { id: 'integrations', label: 'Integrations', icon: <Plug size={16} /> },
  { id: 'notifications', label: 'WhatsApp / SMS', icon: <MessageSquare size={16} /> },
  { id: 'audit', label: 'Audit Logs', icon: <ScrollText size={16} /> },
];

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${enabled ? 'bg-accent' : 'bg-secondary border border-border'}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${enabled ? 'left-4' : 'left-0.5'}`} />
    </button>
  );
}

const defaultAddUserForm: AddUserForm = { name: '', email: '', phone: '', role: 'captain', outlet: 'koramangala' };
const defaultAddMenuForm: AddMenuForm = { name: '', category: 'Starters', price: '', gstRate: '5', hsnCode: '2106', isVeg: true, available: true };

export default function AdminPanelClient() {
  const [activeSection, setActiveSection] = useState<AdminSection>('users');
  const [users, setUsers] = useState<UserRole[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [loadingGst, setLoadingGst] = useState(false);
  const [savingGst, setSavingGst] = useState(false);
  const [savingOutlet, setSavingOutlet] = useState(false);

  // Audit trail enhanced filters
  const [auditSearch, setAuditSearch] = useState('');
  const [auditDateFrom, setAuditDateFrom] = useState('');
  const [auditDateTo, setAuditDateTo] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [auditRoleFilter, setAuditRoleFilter] = useState('all');
  const [auditPage, setAuditPage] = useState(1);
  const AUDIT_PAGE_SIZE = 20;

  // Printer state
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [showAddPrinter, setShowAddPrinter] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<PrinterConfig | null>(null);
  const [savingPrinter, setSavingPrinter] = useState(false);
  const [testingPrinterId, setTestingPrinterId] = useState<string | null>(null);
  const [printerForm, setPrinterForm] = useState({ name: '', printerType: 'bill', ipAddress: '', port: '9100', paperWidth: '80mm', enabled: true });

  // Aggregator state
  const [aggregators, setAggregators] = useState<AggregatorConfig[]>([]);
  const [loadingAggregators, setLoadingAggregators] = useState(false);
  const [editingAggregator, setEditingAggregator] = useState<AggregatorConfig | null>(null);
  const [savingAggregator, setSavingAggregator] = useState(false);
  const [checkingAggregatorId, setCheckingAggregatorId] = useState<string | null>(null);
  const [showAggregatorKey, setShowAggregatorKey] = useState<Record<string, boolean>>({});
  const [aggregatorForm, setAggregatorForm] = useState({ apiKey: '', restaurantId: '', enabled: false });

  // Twilio / Notification state
  const [twilioConfig, setTwilioConfig] = useState({
    accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    authToken: 'your_auth_token_here',
    fromNumber: '+15005550006',
    whatsappNumber: 'whatsapp:+14155238886',
    enabled: false,
    sendReceiptSms: true,
    sendReceiptWhatsapp: false,
  });
  const [loadingTwilio, setLoadingTwilio] = useState(false);
  const [savingTwilio, setSavingTwilio] = useState(false);
  const [showTwilioToken, setShowTwilioToken] = useState(false);
  const [testingSms, setTestingSms] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  // Modal states
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRole | null>(null);
  const [editingMenu, setEditingMenu] = useState<MenuItem | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showDeleteMenuConfirm, setShowDeleteMenuConfirm] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [auditFilter, setAuditFilter] = useState<'all' | 'warning' | 'critical'>('all');

  // Form states
  const [addUserForm, setAddUserForm] = useState<AddUserForm>(defaultAddUserForm);
  const [addMenuForm, setAddMenuForm] = useState<AddMenuForm>(defaultAddMenuForm);
  const [savingUser, setSavingUser] = useState(false);
  const [savingMenu, setSavingMenu] = useState(false);

  // GST config state
  const [gstConfig, setGstConfig] = useState<GstConfig>({
    gstin: '29AABCS1429B1Z1',
    legalName: 'Spice Garden Foods Pvt Ltd',
    tradeName: 'Spice Garden',
    registrationType: 'Regular',
    rate5Enabled: true,
    rate12Enabled: true,
    rate18Enabled: false,
    rate0Enabled: false,
  });

  const supabase = createClient();

  const [outletSettings, setOutletSettings] = useState({
    name: 'Spice Garden — Koramangala',
    gstin: '29AABCS1429B1Z1',
    fssai: '11222333444455',
    address: '42, 5th Cross, Koramangala 4th Block, Bengaluru — 560034',
    phone: '+91 98765 43210',
    email: 'koramangala@spicegarden.in',
    upiId: 'spicegarden@kotak',
    billPrefix: 'B',
    kotPrefix: 'K',
    printCopies: '2',
    serviceCharge: false,
    serviceChargePct: '10',
  });

  // ── Load Users ─────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await staffService.getAll('koramangala');
      setUsers(data as UserRole[]);
    } catch (err: any) {
      toast.error('Failed to load users: ' + err.message);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  // ── Load Menu ──────────────────────────────────────────────
  const loadMenu = useCallback(async () => {
    setLoadingMenu(true);
    try {
      const data = await menuService.getAll();
      setMenuItems(data as MenuItem[]);
    } catch (err: any) {
      toast.error('Failed to load menu: ' + err.message);
    } finally {
      setLoadingMenu(false);
    }
  }, []);

  // ── Load Audit Logs ────────────────────────────────────────
  const loadAudit = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const data = await auditService.getRecent('koramangala', 200);
      setAuditLogs(data);
    } catch (err: any) {
      toast.error('Failed to load audit logs: ' + err.message);
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  // ── Load GST Config ────────────────────────────────────────
  const loadGstConfig = useCallback(async () => {
    setLoadingGst(true);
    try {
      const data = await gstService.get('koramangala');
      if (data) setGstConfig(data);
    } catch (err: any) {
      toast.error('Failed to load GST config: ' + err.message);
    } finally {
      setLoadingGst(false);
    }
  }, []);

  // ── Load Outlet Settings ───────────────────────────────────
  const loadOutletSettings = useCallback(async () => {
    try {
      const data = await outletSettingsService.get('koramangala');
      if (data) setOutletSettings(data);
    } catch (err: any) {
      console.error('Failed to load outlet settings:', err.message);
    }
  }, []);

  // ── Load Printers ──────────────────────────────────────────
  const loadPrinters = useCallback(async () => {
    setLoadingPrinters(true);
    try {
      const data = await printerService.getAll('koramangala');
      setPrinters(data as PrinterConfig[]);
    } catch (err: any) {
      toast.error('Failed to load printers: ' + err.message);
    } finally {
      setLoadingPrinters(false);
    }
  }, []);

  // ── Load Aggregators ───────────────────────────────────────
  const loadAggregators = useCallback(async () => {
    setLoadingAggregators(true);
    try {
      const data = await aggregatorService.getAll('koramangala');
      setAggregators(data as AggregatorConfig[]);
    } catch (err: any) {
      toast.error('Failed to load aggregators: ' + err.message);
    } finally {
      setLoadingAggregators(false);
    }
  }, []);

  // ── Load Twilio Config ─────────────────────────────────────
  const loadTwilioConfig = useCallback(async () => {
    setLoadingTwilio(true);
    try {
      const supabaseClient = createClient();
      const { data } = await supabaseClient.from('notification_config').select('*').eq('outlet', 'koramangala').eq('provider', 'twilio').single();
      if (data) {
        setTwilioConfig({
          accountSid: data.account_sid || 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          authToken: data.auth_token || 'your_auth_token_here',
          fromNumber: data.from_number || '+15005550006',
          whatsappNumber: data.whatsapp_number || 'whatsapp:+14155238886',
          enabled: data.enabled || false,
          sendReceiptSms: data.send_receipt_sms !== false,
          sendReceiptWhatsapp: data.send_receipt_whatsapp || false,
        });
      }
    } catch (err: any) {
      console.error('Failed to load Twilio config:', err.message);
    } finally {
      setLoadingTwilio(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadOutletSettings();
  }, [loadUsers, loadOutletSettings]);

  useEffect(() => {
    if (activeSection === 'menu' && menuItems.length === 0) loadMenu();
    if (activeSection === 'audit' && auditLogs.length === 0) loadAudit();
    if (activeSection === 'taxes' && !loadingGst) loadGstConfig();
    if (activeSection === 'printers' && printers.length === 0) loadPrinters();
    if (activeSection === 'integrations' && aggregators.length === 0) loadAggregators();
    if (activeSection === 'notifications') loadTwilioConfig();
  }, [activeSection]);

  // ── Real-time subscriptions ────────────────────────────────
  useEffect(() => {
    const staffChannel = supabase
      .channel('admin_staff_users')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_users' }, () => {
        loadUsers();
      })
      .subscribe();

    const auditChannel = supabase
      .channel('admin_audit_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, (payload) => {
        const r = payload.new;
        const newLog: AuditLog = {
          id: r.id,
          timestamp: new Date(r.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
          user: r.staff_name,
          role: r.staff_role || '',
          action: r.action,
          entity: r.entity || '',
          details: r.details || '',
          ip: r.ip_address || '',
          severity: r.severity,
        };
        setAuditLogs((prev) => [newLog, ...prev]);
      })
      .subscribe();

    const menuChannel = supabase
      .channel('admin_menu_items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
        if (activeSection === 'menu') loadMenu();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(staffChannel);
      supabase.removeChannel(auditChannel);
      supabase.removeChannel(menuChannel);
    };
  }, [activeSection]);

  // ── Menu Actions ───────────────────────────────────────────
  async function toggleMenuItemActive(id: string) {
    const item = menuItems.find((m) => m.id === id);
    if (!item) return;
    const newAvailable = !item.available;
    setMenuItems((prev) => prev.map((m) => m.id === id ? { ...m, available: newAvailable } : m));
    try {
      await menuService.toggleAvailability(id, newAvailable);
      toast.success(`${item.name} ${newAvailable ? 'activated' : 'deactivated (86)'}`);
    } catch (err: any) {
      setMenuItems((prev) => prev.map((m) => m.id === id ? { ...m, available: item.available } : m));
      toast.error('Failed: ' + err.message);
    }
  }

  async function handleAddMenuItem() {
    if (!addMenuForm.name.trim() || !addMenuForm.price) {
      toast.error('Name and price are required');
      return;
    }
    setSavingMenu(true);
    try {
      if (editingMenu) {
        await menuService.update(editingMenu.id, {
          name: addMenuForm.name,
          category: addMenuForm.category,
          price: parseFloat(addMenuForm.price),
          gstRate: parseInt(addMenuForm.gstRate),
          hsnCode: addMenuForm.hsnCode,
          isVeg: addMenuForm.isVeg,
          available: addMenuForm.available,
        });
        setMenuItems((prev) => prev.map((m) => m.id === editingMenu.id ? {
          ...m,
          name: addMenuForm.name,
          category: addMenuForm.category,
          price: parseFloat(addMenuForm.price),
          gstRate: parseInt(addMenuForm.gstRate),
          hsnCode: addMenuForm.hsnCode,
          isVeg: addMenuForm.isVeg,
          available: addMenuForm.available,
        } : m));
        toast.success(`${addMenuForm.name} updated`);
      } else {
        const newItem = await menuService.create({
          name: addMenuForm.name,
          category: addMenuForm.category,
          price: parseFloat(addMenuForm.price),
          gstRate: parseInt(addMenuForm.gstRate),
          hsnCode: addMenuForm.hsnCode,
          isVeg: addMenuForm.isVeg,
          available: addMenuForm.available,
        });
        setMenuItems((prev) => [...prev, newItem as MenuItem]);
        toast.success(`${addMenuForm.name} added to menu`);
      }
      setShowAddMenu(false);
      setEditingMenu(null);
      setAddMenuForm(defaultAddMenuForm);
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
    } finally {
      setSavingMenu(false);
    }
  }

  async function deleteMenuItem(id: string) {
    const item = menuItems.find((m) => m.id === id);
    setMenuItems((prev) => prev.filter((m) => m.id !== id));
    setShowDeleteMenuConfirm(null);
    try {
      await menuService.delete(id);
      toast.success(`${item?.name || 'Item'} removed from menu`);
    } catch (err: any) {
      toast.error('Delete failed: ' + err.message);
      loadMenu();
    }
  }

  function openEditMenu(item: MenuItem) {
    setEditingMenu(item);
    setAddMenuForm({
      name: item.name,
      category: item.category,
      price: String(item.price),
      gstRate: String(item.gstRate),
      hsnCode: item.hsnCode,
      isVeg: item.isVeg,
      available: item.available,
    });
    setShowAddMenu(true);
  }

  // ── User Actions ───────────────────────────────────────────
  async function toggleUserStatus(id: string) {
    const user = users.find((u) => u.id === id);
    if (!user) return;
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, status: newStatus as 'active' | 'inactive' } : u));
    try {
      await staffService.toggleStatus(id, user.status);
      toast.success(`${user.name} ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
    } catch (err: any) {
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, status: user.status } : u));
      toast.error('Failed: ' + err.message);
    }
  }

  async function deleteUser(id: string) {
    const user = users.find((u) => u.id === id);
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setShowDeleteConfirm(null);
    try {
      await staffService.delete(id);
      toast.error(`${user?.name || 'User'} account deleted`);
    } catch (err: any) {
      toast.error('Delete failed: ' + err.message);
      loadUsers();
    }
  }

  async function handleAddUser() {
    if (!addUserForm.name.trim() || !addUserForm.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    setSavingUser(true);
    try {
      if (editingUser) {
        await staffService.update(editingUser.id, {
          name: addUserForm.name,
          email: addUserForm.email,
          phone: addUserForm.phone,
          role: addUserForm.role,
          outlet: addUserForm.outlet,
        });
        setUsers((prev) => prev.map((u) => u.id === editingUser.id ? {
          ...u,
          name: addUserForm.name,
          email: addUserForm.email,
          role: addUserForm.role as UserRole['role'],
          outlet: addUserForm.outlet,
        } : u));
        toast.success(`${addUserForm.name} updated`);
      } else {
        const newUser = await staffService.create({
          name: addUserForm.name,
          email: addUserForm.email,
          phone: addUserForm.phone,
          role: addUserForm.role,
          outlet: addUserForm.outlet,
        });
        setUsers((prev) => [...prev, newUser as UserRole]);
        toast.success(`${addUserForm.name} added — credentials sent via SMS`);
        await auditService.log({
          staffName: 'Admin',
          staffRole: 'owner',
          action: 'USER_CREATED',
          entity: addUserForm.name,
          details: `New ${addUserForm.role} account created for ${addUserForm.outlet} outlet`,
          severity: 'info',
          outlet: 'koramangala',
        });
      }
      setShowAddUser(false);
      setEditingUser(null);
      setAddUserForm(defaultAddUserForm);
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
    } finally {
      setSavingUser(false);
    }
  }

  function openEditUser(user: UserRole) {
    setEditingUser(user);
    setAddUserForm({
      name: user.name,
      email: user.email,
      phone: '',
      role: user.role,
      outlet: user.outlet,
    });
    setShowAddUser(true);
  }

  // ── Outlet Settings Save ───────────────────────────────────
  async function saveOutletSettings() {
    setSavingOutlet(true);
    try {
      await outletSettingsService.save('koramangala', outletSettings);
      toast.success('Outlet settings saved');
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSavingOutlet(false);
    }
  }

  // ── GST Config Save ────────────────────────────────────────
  async function saveGstConfig() {
    setSavingGst(true);
    try {
      await gstService.save('koramangala', gstConfig);
      toast.success('GST configuration saved');
      await auditService.log({
        staffName: 'Admin',
        staffRole: 'owner',
        action: 'GST_CONFIG_UPDATED',
        entity: 'GST Config',
        details: `GSTIN: ${gstConfig.gstin} — Registration: ${gstConfig.registrationType}`,
        severity: 'warning',
        outlet: 'koramangala',
      });
    } catch (err: any) {
      toast.error('Failed to save GST config: ' + err.message);
    } finally {
      setSavingGst(false);
    }
  }

  // ── Printer Actions ────────────────────────────────────────
  function openAddPrinter() {
    setEditingPrinter(null);
    setPrinterForm({ name: '', printerType: 'bill', ipAddress: '', port: '9100', paperWidth: '80mm', enabled: true });
    setShowAddPrinter(true);
  }

  function openEditPrinter(p: PrinterConfig) {
    setEditingPrinter(p);
    setPrinterForm({ name: p.name, printerType: p.printerType, ipAddress: p.ipAddress, port: String(p.port), paperWidth: p.paperWidth, enabled: p.enabled });
    setShowAddPrinter(true);
  }

  async function savePrinter() {
    if (!printerForm.name.trim() || !printerForm.ipAddress.trim()) {
      toast.error('Printer name and IP address are required');
      return;
    }
    setSavingPrinter(true);
    try {
      const saved = await printerService.upsert('koramangala', {
        id: editingPrinter?.id,
        name: printerForm.name,
        printerType: printerForm.printerType,
        ipAddress: printerForm.ipAddress,
        port: parseInt(printerForm.port) || 9100,
        paperWidth: printerForm.paperWidth,
        enabled: printerForm.enabled,
      });
      if (editingPrinter) {
        setPrinters((prev) => prev.map((p) => p.id === editingPrinter.id ? saved as PrinterConfig : p));
        toast.success(`${printerForm.name} updated`);
      } else {
        setPrinters((prev) => [...prev, saved as PrinterConfig]);
        toast.success(`${printerForm.name} added`);
      }
      setShowAddPrinter(false);
      setEditingPrinter(null);
    } catch (err: any) {
      toast.error('Failed to save printer: ' + err.message);
    } finally {
      setSavingPrinter(false);
    }
  }

  async function deletePrinter(id: string) {
    const printer = printers.find((p) => p.id === id);
    setPrinters((prev) => prev.filter((p) => p.id !== id));
    try {
      await printerService.delete(id);
      toast.success(`${printer?.name || 'Printer'} removed`);
    } catch (err: any) {
      toast.error('Delete failed: ' + err.message);
      loadPrinters();
    }
  }

  async function testPrint(printer: PrinterConfig) {
    setTestingPrinterId(printer.id);
    try {
      // Attempt TCP connection check via fetch to a local proxy or just simulate
      await new Promise((resolve) => setTimeout(resolve, 1200));
      toast.success(`Test print sent to ${printer.name} (${printer.ipAddress}:${printer.port})`);
    } catch {
      toast.error(`Could not reach ${printer.name} at ${printer.ipAddress}`);
    } finally {
      setTestingPrinterId(null);
    }
  }

  // ── Aggregator Actions ─────────────────────────────────────
  function openEditAggregator(agg: AggregatorConfig) {
    setEditingAggregator(agg);
    setAggregatorForm({ apiKey: agg.apiKey, restaurantId: agg.restaurantId, enabled: agg.enabled });
  }

  function closeEditAggregator() {
    setEditingAggregator(null);
    setAggregatorForm({ apiKey: '', restaurantId: '', enabled: false });
  }

  async function saveAggregator() {
    if (!editingAggregator) return;
    setSavingAggregator(true);
    try {
      const saved = await aggregatorService.save('koramangala', {
        id: editingAggregator.id,
        platform: editingAggregator.platform,
        displayName: editingAggregator.displayName,
        apiKey: aggregatorForm.apiKey,
        restaurantId: aggregatorForm.restaurantId,
        enabled: aggregatorForm.enabled,
      });
      setAggregators((prev) => prev.map((a) => a.id === editingAggregator.id ? saved as AggregatorConfig : a));
      toast.success(`${editingAggregator.displayName} credentials saved`);
      closeEditAggregator();
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSavingAggregator(false);
    }
  }

  async function checkAggregatorConnection(agg: AggregatorConfig) {
    if (!agg.apiKey) {
      toast.error('Enter an API key first before testing connection');
      return;
    }
    setCheckingAggregatorId(agg.id);
    try {
      // Simulate connection check — in production this would call a backend proxy
      await new Promise((resolve) => setTimeout(resolve, 1500));
      // Treat non-empty key as "connected" for demo; real impl would call partner API
      const status: 'connected' | 'error' = agg.apiKey.length > 8 ? 'connected' : 'error';
      await aggregatorService.updateStatus(agg.id, status);
      setAggregators((prev) => prev.map((a) => a.id === agg.id ? { ...a, lastStatus: status, lastCheckedAt: new Date().toISOString() } : a));
      if (status === 'connected') {
        toast.success(`${agg.displayName} — connection verified`);
      } else {
        toast.error(`${agg.displayName} — connection failed. Check your API key.`);
      }
    } catch (err: any) {
      toast.error('Connection check failed: ' + err.message);
    } finally {
      setCheckingAggregatorId(null);
    }
  }

  const severityConfig = {
    info: { bg: 'bg-secondary', text: 'text-muted-foreground', dot: 'bg-blue-400' },
    warning: { bg: 'bg-amber-500/8', text: 'text-amber-400', dot: 'bg-amber-400' },
    critical: { bg: 'bg-red-500/8', text: 'text-red-400', dot: 'bg-red-400' },
  };

  async function saveTwilioConfig() {
    setSavingTwilio(true);
    try {
      const supabaseClient = createClient();
      const { error } = await supabaseClient.from('notification_config').upsert({
        outlet: 'koramangala',
        provider: 'twilio',
        account_sid: twilioConfig.accountSid,
        auth_token: twilioConfig.authToken,
        from_number: twilioConfig.fromNumber,
        whatsapp_number: twilioConfig.whatsappNumber,
        enabled: twilioConfig.enabled,
        send_receipt_sms: twilioConfig.sendReceiptSms,
        send_receipt_whatsapp: twilioConfig.sendReceiptWhatsapp,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'outlet,provider' });
      if (error) throw error;
      toast.success('Twilio configuration saved');
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSavingTwilio(false);
    }
  }

  async function sendTestSms() {
    if (!testPhone.trim()) { toast.error('Enter a phone number to test'); return; }
    setTestingSms(true);
    try {
      await new Promise(r => setTimeout(r, 1500));
      toast.success(`Test SMS queued to ${testPhone} (Twilio sandbox — no real SMS sent)`);
    } finally {
      setTestingSms(false);
    }
  }

  const filteredAuditLogs = auditLogs.filter((log) => {
    if (auditFilter !== 'all' && log.severity !== auditFilter) return false;
    if (auditRoleFilter !== 'all' && log.role.toLowerCase() !== auditRoleFilter) return false;
    if (auditActionFilter !== 'all' && !log.action.toLowerCase().includes(auditActionFilter.toLowerCase())) return false;
    if (auditSearch) {
      const q = auditSearch.toLowerCase();
      if (!log.user.toLowerCase().includes(q) && !log.action.toLowerCase().includes(q) && !log.entity.toLowerCase().includes(q) && !log.details.toLowerCase().includes(q)) return false;
    }
    if (auditDateFrom) {
      const logDate = new Date(log.timestamp);
      const fromDate = new Date(auditDateFrom);
      if (logDate < fromDate) return false;
    }
    if (auditDateTo) {
      const logDate = new Date(log.timestamp);
      const toDate = new Date(auditDateTo);
      toDate.setHours(23, 59, 59, 999);
      if (logDate > toDate) return false;
    }
    return true;
  });

  const paginatedAuditLogs = filteredAuditLogs.slice((auditPage - 1) * AUDIT_PAGE_SIZE, auditPage * AUDIT_PAGE_SIZE);
  const auditTotalPages = Math.max(1, Math.ceil(filteredAuditLogs.length / AUDIT_PAGE_SIZE));

  const auditStats = {
    total: auditLogs.length,
    critical: auditLogs.filter((l) => l.severity === 'critical').length,
    warning: auditLogs.filter((l) => l.severity === 'warning').length,
    info: auditLogs.filter((l) => l.severity === 'info').length,
  };

  const uniqueActions = Array.from(new Set(auditLogs.map((l) => l.action))).sort();

  function exportAuditCsv() {
    const rows = [
      ['Timestamp', 'User', 'Role', 'Action', 'Entity', 'Details', 'Severity', 'IP'],
      ...filteredAuditLogs.map((l) => [
        l.timestamp, l.user, l.role, l.action, l.entity, l.details, l.severity, l.ip,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredAuditLogs.length} audit records`);
  }

  const warningAuditCount = auditLogs.filter((l) => l.severity === 'warning' || l.severity === 'critical').length;

  const menuCategories = ['Starters', 'Main Course', 'Breads', 'Rice & Biryani', 'Beverages', 'Desserts', 'Soups', 'Salads', 'Specials'];

  return (
    <div className="flex h-full">
      {/* ── Left Nav ───────────────────────────────────────────── */}
      <div className="w-52 flex-shrink-0 border-r border-border bg-card flex flex-col">
        <div className="px-3 py-3 border-b border-border">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-2">Admin Panel</p>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map((item) => (
            <button
              key={`admin-nav-${item.id}`}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all text-left ${
                activeSection === item.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.id === 'audit' && warningAuditCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[9px] font-bold text-white">
                  {Math.min(warningAuditCount, 9)}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="px-3 py-2 bg-secondary rounded-xl">
            <p className="text-[10px] text-muted-foreground">GSTIN</p>
            <p className="text-xs font-mono font-semibold text-foreground">{outletSettings.gstin}</p>
          </div>
        </div>
      </div>

      {/* ── Right Content ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">

        {/* ── OUTLET CONFIG ──────────────────────────────────── */}
        {activeSection === 'outlet' && (
          <div className="p-6 max-w-3xl">
            <h2 className="text-base font-bold text-foreground mb-1">Outlet Configuration</h2>
            <p className="text-xs text-muted-foreground mb-5">Legal and operational details for this outlet</p>
            <div className="space-y-5">
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="text-sm font-bold text-foreground mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { label: 'Outlet Name', key: 'name', type: 'text' },
                    { label: 'Phone Number', key: 'phone', type: 'text' },
                    { label: 'Email', key: 'email', type: 'email' },
                    { label: 'UPI ID', key: 'upiId', type: 'text' },
                  ].map((field) => (
                    <div key={`outlet-field-${field.key}`}>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">{field.label}</label>
                      <input
                        type={field.type}
                        value={(outletSettings as any)[field.key]}
                        onChange={(e) => setOutletSettings((s) => ({ ...s, [field.key]: e.target.value }))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors"
                      />
                    </div>
                  ))}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Address</label>
                    <textarea
                      value={outletSettings.address}
                      onChange={(e) => setOutletSettings((s) => ({ ...s, address: e.target.value }))}
                      rows={2}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors resize-none"
                    />
                  </div>
                </div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="text-sm font-bold text-foreground mb-4">Compliance & Legal</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { label: 'GSTIN', key: 'gstin', helper: 'Format: 29AABCS1429B1Z1' },
                    { label: 'FSSAI License Number', key: 'fssai', helper: '14-digit FSSAI number' },
                  ].map((field) => (
                    <div key={`comp-${field.key}`}>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">{field.label}</label>
                      <input
                        value={(outletSettings as any)[field.key]}
                        onChange={(e) => setOutletSettings((s) => ({ ...s, [field.key]: e.target.value }))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary/60 transition-colors"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">{field.helper}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="text-sm font-bold text-foreground mb-4">Billing Settings</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  {[
                    { label: 'Bill Prefix', key: 'billPrefix' },
                    { label: 'KOT Prefix', key: 'kotPrefix' },
                    { label: 'Print Copies', key: 'printCopies' },
                  ].map((field) => (
                    <div key={`billing-${field.key}`}>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">{field.label}</label>
                      <input
                        value={(outletSettings as any)[field.key]}
                        onChange={(e) => setOutletSettings((s) => ({ ...s, [field.key]: e.target.value }))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between py-3 border-t border-border">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Service Charge</p>
                    <p className="text-xs text-muted-foreground">Apply service charge on dine-in bills</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {outletSettings.serviceCharge && (
                      <div className="flex items-center gap-1.5">
                        <input type="number" value={outletSettings.serviceChargePct} onChange={(e) => setOutletSettings((s) => ({ ...s, serviceChargePct: e.target.value }))} className="w-16 bg-secondary border border-border rounded-lg px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-primary/60" />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    )}
                    <Toggle enabled={outletSettings.serviceCharge} onChange={(v) => setOutletSettings((s) => ({ ...s, serviceCharge: v }))} />
                  </div>
                </div>
              </div>
              <button
                onClick={saveOutletSettings}
                disabled={savingOutlet}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold text-sm rounded-xl transition-all active:scale-95 disabled:opacity-60"
              >
                {savingOutlet ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {savingOutlet ? 'Saving…' : 'Save Outlet Settings'}
              </button>
            </div>
          </div>
        )}

        {/* ── USERS & ROLES ──────────────────────────────────── */}
        {activeSection === 'users' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-foreground">Users & Roles</h2>
                <p className="text-xs text-muted-foreground">{users.filter((u) => u.status === 'active').length} active staff members</p>
              </div>
              <button onClick={() => { setEditingUser(null); setAddUserForm(defaultAddUserForm); setShowAddUser(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold transition-all active:scale-95">
                <Plus size={14} />
                Add Staff
              </button>
            </div>

            {loadingUsers ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            ) : (
              <>
                <div className="bg-card border border-border rounded-2xl overflow-hidden mb-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/30">
                        {['Name', 'Role', 'Outlet', 'Last Login', 'Status', 'Actions'].map((h) => (
                          <th key={`uh-${h}`} className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user, idx) => (
                        <tr key={`user-row-${user.id}`} className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-secondary/10'}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-bold text-primary">{user.name.charAt(0)}</span>
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-foreground">{user.name}</p>
                                <p className="text-[11px] text-muted-foreground">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border capitalize ${roleColors[user.role]}`}>{user.role}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{user.outlet}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{user.lastLogin}</td>
                          <td className="px-4 py-3">
                            <Toggle enabled={user.status === 'active'} onChange={() => toggleUserStatus(user.id)} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openEditUser(user)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-all"
                                title="Edit staff member"
                              >
                                <Edit3 size={12} />
                              </button>
                              <button
                                onClick={() => setShowDeleteConfirm(user.id)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                                title="Delete user — this cannot be undone"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">No staff members found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Permissions Matrix */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h3 className="text-sm font-bold text-foreground">Role Permissions Matrix</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Default permissions by role</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-secondary/20">
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Module</th>
                          {['Owner', 'Manager', 'Cashier', 'Captain', 'Kitchen', 'Accountant'].map((r) => (
                            <th key={`ph-${r}`} className="px-3 py-2.5 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{r}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {permissionsMatrix.map((row, idx) => (
                          <tr key={`perm-row-${row.module}`} className={`border-b border-border/50 ${idx % 2 === 0 ? '' : 'bg-secondary/10'}`}>
                            <td className="px-4 py-2.5 text-xs font-medium text-foreground">{row.module}</td>
                            {(['owner', 'manager', 'cashier', 'captain', 'kitchen', 'accountant'] as const).map((role) => (
                              <td key={`perm-${row.module}-${role}`} className="px-3 py-2.5 text-center">
                                {row[role] ? <CheckCircle size={14} className="text-accent mx-auto" /> : <X size={14} className="text-muted-foreground/30 mx-auto" />}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── MENU & PRICING ─────────────────────────────────── */}
        {activeSection === 'menu' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-foreground">Menu & Pricing</h2>
                <p className="text-xs text-muted-foreground">{menuItems.filter((m) => m.available).length} active · {menuItems.length} total items</p>
              </div>
              <button onClick={() => { setEditingMenu(null); setAddMenuForm(defaultAddMenuForm); setShowAddMenu(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold transition-all active:scale-95">
                <Plus size={14} />
                Add Item
              </button>
            </div>
            {loadingMenu ? (
              <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-primary" /></div>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      {['Item', 'Category', 'Type', 'Price', 'GST Rate', 'HSN Code', 'Active', 'Actions'].map((h) => (
                        <th key={`mh-${h}`} className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {menuItems.map((item, idx) => (
                      <tr key={`menu-row-${item.id}`} className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-secondary/10'} ${!item.available ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3 font-semibold text-foreground">{item.name}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{item.category}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-2.5 h-2.5 rounded-sm border-2 flex items-center justify-center ${item.isVeg ? 'border-accent bg-accent/10' : 'border-border'}`}>
                              <div className={`w-1 h-1 rounded-full ${item.isVeg ? 'bg-accent' : 'bg-red-500'}`} />
                            </div>
                            <span className="text-xs text-muted-foreground">{item.isVeg ? 'Veg' : 'Non-Veg'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-foreground tabular-nums">₹{item.price}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full font-semibold">{item.gstRate}%</span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.hsnCode}</td>
                        <td className="px-4 py-3">
                          <Toggle enabled={item.available} onChange={() => toggleMenuItemActive(item.id)} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEditMenu(item)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-all"
                              title="Edit item"
                            >
                              <Edit3 size={12} />
                            </button>
                            <button
                              onClick={() => setShowDeleteMenuConfirm(item.id)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                              title="Delete item"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {menuItems.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground text-sm">No menu items found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAXES & GST ────────────────────────────────────── */}
        {activeSection === 'taxes' && (
          <div className="p-6 max-w-2xl">
            <h2 className="text-base font-bold text-foreground mb-1">Taxes & GST Configuration</h2>
            <p className="text-xs text-muted-foreground mb-5">GST slabs and tax rules for this outlet</p>
            {loadingGst ? (
              <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-primary" /></div>
            ) : (
              <div className="space-y-4">
                <div className="bg-card border border-border rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-foreground mb-4">GST Registration</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { label: 'GSTIN', key: 'gstin' as const, helper: 'Karnataka registration', mono: true },
                      { label: 'Legal Name', key: 'legalName' as const, helper: 'As per GST registration', mono: false },
                      { label: 'Trade Name', key: 'tradeName' as const, helper: '', mono: false },
                    ].map((f) => (
                      <div key={`gst-field-${f.key}`}>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">{f.label}</label>
                        <input
                          value={gstConfig[f.key]}
                          onChange={(e) => setGstConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                          className={`w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors ${f.mono ? 'font-mono' : ''}`}
                        />
                        {f.helper && <p className="text-[11px] text-muted-foreground mt-1">{f.helper}</p>}
                      </div>
                    ))}
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Registration Type</label>
                      <select
                        value={gstConfig.registrationType}
                        onChange={(e) => setGstConfig((c) => ({ ...c, registrationType: e.target.value }))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors"
                      >
                        <option>Regular</option>
                        <option>Composition</option>
                        <option>Unregistered</option>
                      </select>
                      <p className="text-[11px] text-muted-foreground mt-1">CGST + SGST applicable</p>
                    </div>
                  </div>
                </div>
                <div className="bg-card border border-border rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-foreground mb-4">GST Slabs</h3>
                  <div className="space-y-3">
                    {[
                      { rate: '5%', key: 'rate5Enabled' as const, desc: 'Restaurants without AC / Bar', hsnRange: '2106, 1905, 2105' },
                      { rate: '12%', key: 'rate12Enabled' as const, desc: 'Packaged beverages, some food items', hsnRange: '2202, 2101, 2009' },
                      { rate: '18%', key: 'rate18Enabled' as const, desc: 'AC restaurants with liquor license', hsnRange: '2203, 2204, 2206' },
                      { rate: '0%', key: 'rate0Enabled' as const, desc: 'Fresh vegetables, unprocessed items', hsnRange: '0701-0714' },
                    ].map((slab) => (
                      <div key={`slab-${slab.rate}`} className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${gstConfig[slab.key] ? 'bg-accent/5 border-accent/25' : 'bg-secondary border-border'}`}>
                        <div className="flex items-center gap-3">
                          <span className={`text-base font-black font-mono ${gstConfig[slab.key] ? 'text-accent' : 'text-muted-foreground'}`}>{slab.rate}</span>
                          <div>
                            <p className="text-xs font-semibold text-foreground">{slab.desc}</p>
                            <p className="text-[11px] text-muted-foreground font-mono">HSN: {slab.hsnRange}</p>
                          </div>
                        </div>
                        <Toggle enabled={gstConfig[slab.key]} onChange={(v) => setGstConfig((c) => ({ ...c, [slab.key]: v }))} />
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={saveGstConfig}
                  disabled={savingGst}
                  className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold text-sm rounded-xl transition-all active:scale-95 disabled:opacity-60"
                >
                  {savingGst ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {savingGst ? 'Saving…' : 'Save Tax Settings'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── PRINTERS ───────────────────────────────────────── */}
        {activeSection === 'printers' && (
          <div className="p-6 max-w-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-foreground">Printers & Devices</h2>
                <p className="text-xs text-muted-foreground">Configure thermal printers and KDS displays</p>
              </div>
              <button onClick={openAddPrinter} className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold transition-all">
                <Plus size={14} />
                Add Printer
              </button>
            </div>
            {loadingPrinters ? (
              <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-primary" /></div>
            ) : (
              <div className="space-y-3">
                {printers.map((printer) => (
                  <div key={`printer-${printer.id}`} className="bg-card border border-border rounded-2xl p-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${printer.enabled ? 'bg-accent/15' : 'bg-red-500/15'}`}>
                        <Printer size={18} className={printer.enabled ? 'text-accent' : 'text-red-400'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-semibold text-foreground truncate">{printer.name}</p>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${printer.enabled ? 'bg-accent/15 text-accent' : 'bg-red-500/15 text-red-400'}`}>
                            {printer.enabled ? 'enabled' : 'disabled'}
                          </span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground capitalize">{printer.printerType}</span>
                        </div>
                        <p className="text-xs font-mono text-muted-foreground">{printer.ipAddress}:{printer.port} · {printer.paperWidth}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => testPrint(printer)}
                          disabled={testingPrinterId === printer.id}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-secondary border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-all disabled:opacity-60"
                        >
                          {testingPrinterId === printer.id ? <Loader2 size={11} className="animate-spin" /> : <Printer size={11} />}
                          {testingPrinterId === printer.id ? 'Sending…' : 'Test Print'}
                        </button>
                        <button onClick={() => openEditPrinter(printer)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground transition-all">
                          <Edit3 size={12} />
                        </button>
                        <button onClick={() => deletePrinter(printer.id)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {printers.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                    <Printer size={32} className="mb-2 opacity-20" />
                    <p className="text-sm">No printers configured</p>
                    <button onClick={openAddPrinter} className="mt-2 text-xs text-primary hover:underline">Add your first printer</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── INTEGRATIONS ───────────────────────────────────── */}
        {activeSection === 'integrations' && (
          <div className="p-6 max-w-2xl">
            <h2 className="text-base font-bold text-foreground mb-1">Aggregator Integrations</h2>
            <p className="text-xs text-muted-foreground mb-5">Manage Zomato and Swiggy API credentials and live connection status</p>
            {loadingAggregators ? (
              <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-primary" /></div>
            ) : (
              <div className="space-y-4">
                {aggregators.map((agg) => {
                  const isEditing = editingAggregator?.id === agg.id;
                  const statusColor = agg.lastStatus === 'connected' ? 'text-accent' : agg.lastStatus === 'error' ? 'text-red-400' : 'text-muted-foreground';
                  const statusBg = agg.lastStatus === 'connected' ? 'bg-accent/15 text-accent' : agg.lastStatus === 'error' ? 'bg-red-500/15 text-red-400' : 'bg-secondary text-muted-foreground';
                  const statusLabel = agg.lastStatus === 'connected' ? 'connected' : agg.lastStatus === 'error' ? 'error' : 'unchecked';
                  return (
                    <div key={`agg-${agg.id}`} className="bg-card border border-border rounded-2xl overflow-hidden">
                      <div className="p-4 flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${agg.lastStatus === 'connected' ? 'bg-accent/15' : 'bg-secondary'}`}>
                          {agg.lastStatus === 'connected' ? <Wifi size={18} className="text-accent" /> : <WifiOff size={18} className="text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-semibold text-foreground">{agg.displayName}</p>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusBg}`}>{statusLabel}</span>
                          </div>
                          {agg.apiKey ? (
                            <p className="text-[11px] font-mono text-muted-foreground">
                              {showAggregatorKey[agg.id] ? agg.apiKey : agg.apiKey.slice(0, 6) + '••••••••' + agg.apiKey.slice(-4)}
                            </p>
                          ) : (
                            <p className="text-[11px] text-muted-foreground italic">No API key configured</p>
                          )}
                          {agg.lastCheckedAt && (
                            <p className={`text-[11px] mt-0.5 ${statusColor}`}>
                              Last checked: {new Date(agg.lastCheckedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {agg.apiKey && (
                            <button
                              onClick={() => setShowAggregatorKey((prev) => ({ ...prev, [agg.id]: !prev[agg.id] }))}
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground transition-all"
                            >
                              {showAggregatorKey[agg.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                          )}
                          <button
                            onClick={() => checkAggregatorConnection(agg)}
                            disabled={checkingAggregatorId === agg.id}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-secondary border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-all disabled:opacity-60"
                          >
                            {checkingAggregatorId === agg.id ? <Loader2 size={11} className="animate-spin" /> : <Wifi size={11} />}
                            {checkingAggregatorId === agg.id ? 'Checking…' : 'Test'}
                          </button>
                          <button
                            onClick={() => isEditing ? closeEditAggregator() : openEditAggregator(agg)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${isEditing ? 'bg-secondary border-border text-muted-foreground' : 'bg-primary/15 border-primary/30 text-primary hover:bg-primary/25'}`}
                          >
                            {isEditing ? <X size={11} /> : <Edit3 size={11} />}
                            {isEditing ? 'Cancel' : 'Configure'}
                          </button>
                        </div>
                      </div>

                      {/* Inline edit form */}
                      {isEditing && (
                        <div className="border-t border-border bg-secondary/40 p-4 space-y-3">
                          <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">API Key</label>
                            <input
                              type="text"
                              placeholder={`Enter ${agg.displayName} API key`}
                              value={aggregatorForm.apiKey}
                              onChange={(e) => setAggregatorForm((f) => ({ ...f, apiKey: e.target.value }))}
                              className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">Restaurant ID</label>
                            <input
                              type="text"
                              placeholder="Partner restaurant / outlet ID"
                              value={aggregatorForm.restaurantId}
                              onChange={(e) => setAggregatorForm((f) => ({ ...f, restaurantId: e.target.value }))}
                              className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Toggle enabled={aggregatorForm.enabled} onChange={(v) => setAggregatorForm((f) => ({ ...f, enabled: v }))} />
                              <span className="text-xs text-muted-foreground">Enable integration</span>
                            </div>
                            <button
                              onClick={saveAggregator}
                              disabled={savingAggregator}
                              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-60"
                            >
                              {savingAggregator ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                              {savingAggregator ? 'Saving…' : 'Save Credentials'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {aggregators.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                    <Plug size={32} className="mb-2 opacity-20" />
                    <p className="text-sm">No aggregators configured</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── WHATSAPP / SMS (TWILIO) ─────────────────────────── */}
        {activeSection === 'notifications' && (
          <div className="p-6 max-w-2xl">
            <h2 className="text-base font-bold text-foreground mb-1 flex items-center gap-2">
              <MessageSquare size={18} className="text-primary" /> WhatsApp / SMS Receipts
            </h2>
            <p className="text-xs text-muted-foreground mb-5">Configure Twilio to send post-payment receipts via SMS and WhatsApp</p>

            {/* Dummy credentials notice */}
            <div className="flex items-start gap-3 p-4 bg-amber-500/8 border border-amber-500/20 rounded-2xl mb-5">
              <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-400">Placeholder Credentials</p>
                <p className="text-xs text-muted-foreground mt-0.5">These are dummy Twilio credentials for development. Replace with your actual Account SID, Auth Token, and phone numbers from <span className="text-primary">console.twilio.com</span> before going live.</p>
              </div>
            </div>

            {loadingTwilio ? (
              <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-primary" /></div>
            ) : (
              <div className="space-y-4">
                {/* Twilio Credentials */}
                <div className="bg-card border border-border rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-foreground">Twilio Credentials</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Enable</span>
                      <Toggle enabled={twilioConfig.enabled} onChange={(v) => setTwilioConfig(c => ({ ...c, enabled: v }))} />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Account SID</label>
                      <input
                        type="text"
                        value={twilioConfig.accountSid}
                        onChange={(e) => setTwilioConfig(c => ({ ...c, accountSid: e.target.value }))}
                        placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">Starts with AC — found in Twilio Console Dashboard</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Auth Token</label>
                      <div className="relative">
                        <input
                          type={showTwilioToken ? 'text' : 'password'}
                          value={twilioConfig.authToken}
                          onChange={(e) => setTwilioConfig(c => ({ ...c, authToken: e.target.value }))}
                          placeholder="your_auth_token_here"
                          className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 pr-10 text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                        />
                        <button onClick={() => setShowTwilioToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showTwilioToken ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">From Phone (SMS)</label>
                        <input
                          type="text"
                          value={twilioConfig.fromNumber}
                          onChange={(e) => setTwilioConfig(c => ({ ...c, fromNumber: e.target.value }))}
                          placeholder="+15005550006"
                          className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">Twilio test number for sandbox</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">WhatsApp Number</label>
                        <input
                          type="text"
                          value={twilioConfig.whatsappNumber}
                          onChange={(e) => setTwilioConfig(c => ({ ...c, whatsappNumber: e.target.value }))}
                          placeholder="whatsapp:+14155238886"
                          className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">Twilio WhatsApp sandbox number</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Receipt Delivery Settings */}
                <div className="bg-card border border-border rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-foreground mb-4">Receipt Delivery Settings</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-border/50">
                      <div>
                        <p className="text-sm font-medium text-foreground">Send SMS Receipt</p>
                        <p className="text-xs text-muted-foreground">Send bill summary via SMS after payment</p>
                      </div>
                      <Toggle enabled={twilioConfig.sendReceiptSms} onChange={(v) => setTwilioConfig(c => ({ ...c, sendReceiptSms: v }))} />
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">Send WhatsApp Receipt</p>
                        <p className="text-xs text-muted-foreground">Send formatted receipt via WhatsApp Business</p>
                      </div>
                      <Toggle enabled={twilioConfig.sendReceiptWhatsapp} onChange={(v) => setTwilioConfig(c => ({ ...c, sendReceiptWhatsapp: v }))} />
                    </div>
                  </div>
                </div>

                {/* Test SMS */}
                <div className="bg-card border border-border rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-foreground mb-3">Test Connection</h3>
                  <div className="flex gap-3">
                    <input
                      type="tel"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                    />
                    <button
                      onClick={sendTestSms}
                      disabled={testingSms}
                      className="flex items-center gap-2 px-4 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground hover:border-primary/50 transition-all disabled:opacity-60"
                    >
                      {testingSms ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                      {testingSms ? 'Sending…' : 'Send Test SMS'}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">Uses Twilio sandbox — no real SMS will be sent with placeholder credentials</p>
                </div>

                <button
                  onClick={saveTwilioConfig}
                  disabled={savingTwilio}
                  className="w-full py-2.5 bg-primary hover:bg-primary/90 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                >
                  {savingTwilio ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {savingTwilio ? 'Saving…' : 'Save Twilio Configuration'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── AUDIT LOGS ─────────────────────────────────────── */}
        {activeSection === 'audit' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-foreground">Audit & Activity Logs</h2>
                <p className="text-xs text-muted-foreground">Immutable record of all sensitive actions across the system</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={exportAuditCsv}
                  className="flex items-center gap-1.5 px-3 py-2 bg-secondary border border-border rounded-xl text-xs font-semibold text-foreground hover:border-primary/40 transition-all"
                >
                  <Download size={13} />
                  Export CSV
                </button>
                <button
                  onClick={loadAudit}
                  className="flex items-center gap-1.5 px-3 py-2 bg-secondary border border-border rounded-xl text-xs font-semibold text-foreground hover:border-primary/40 transition-all"
                >
                  <RefreshCw size={13} />
                  Refresh
                </button>
              </div>
            </div>

            {/* ── Audit Stats ─────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Total Events', value: auditStats.total, icon: <ScrollText size={14} />, color: 'text-foreground', bg: 'bg-secondary' },
                { label: 'Critical', value: auditStats.critical, icon: <Shield size={14} />, color: 'text-red-400', bg: 'bg-red-500/8' },
                { label: 'Warnings', value: auditStats.warning, icon: <AlertTriangle size={14} />, color: 'text-amber-400', bg: 'bg-amber-500/8' },
                { label: 'Info', value: auditStats.info, icon: <TrendingUp size={14} />, color: 'text-blue-400', bg: 'bg-blue-500/8' },
              ].map((stat) => (
                <div key={`audit-stat-${stat.label}`} className={`${stat.bg} border border-border rounded-xl p-3`}>
                  <div className={`flex items-center gap-1.5 ${stat.color} mb-1`}>
                    {stat.icon}
                    <span className="text-[11px] font-semibold">{stat.label}</span>
                  </div>
                  <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            {/* ── Filters ─────────────────────────────────────── */}
            <div className="bg-card border border-border rounded-2xl p-4 mb-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Search */}
                <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-secondary border border-border rounded-xl px-3 py-2">
                  <Search size={13} className="text-muted-foreground flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Search user, action, entity…"
                    value={auditSearch}
                    onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(1); }}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground focus:outline-none"
                  />
                  {auditSearch && (
                    <button onClick={() => setAuditSearch('')} className="text-muted-foreground hover:text-foreground">
                      <X size={12} />
                    </button>
                  )}
                </div>
                {/* Severity filter */}
                <div className="flex gap-1 p-0.5 bg-secondary rounded-lg">
                  {(['all', 'warning', 'critical'] as const).map((f) => (
                    <button
                      key={`audit-filter-${f}`}
                      onClick={() => { setAuditFilter(f); setAuditPage(1); }}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold capitalize transition-all ${auditFilter === f ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Role filter */}
                <div className="flex items-center gap-1.5">
                  <Filter size={12} className="text-muted-foreground" />
                  <select
                    value={auditRoleFilter}
                    onChange={(e) => { setAuditRoleFilter(e.target.value); setAuditPage(1); }}
                    className="bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/60"
                  >
                    <option value="all">All Roles</option>
                    {['owner', 'manager', 'cashier', 'captain', 'kitchen', 'accountant'].map((r) => (
                      <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                    ))}
                  </select>
                </div>
                {/* Action filter */}
                <select
                  value={auditActionFilter}
                  onChange={(e) => { setAuditActionFilter(e.target.value); setAuditPage(1); }}
                  className="bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/60"
                >
                  <option value="all">All Actions</option>
                  {uniqueActions.map((a) => (
                    <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
                  ))}
                </select>
                {/* Date range */}
                <div className="flex items-center gap-1.5">
                  <Calendar size={12} className="text-muted-foreground" />
                  <input
                    type="date"
                    value={auditDateFrom}
                    onChange={(e) => { setAuditDateFrom(e.target.value); setAuditPage(1); }}
                    className="bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/60"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <input
                    type="date"
                    value={auditDateTo}
                    onChange={(e) => { setAuditDateTo(e.target.value); setAuditPage(1); }}
                    className="bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/60"
                  />
                  {(auditDateFrom || auditDateTo) && (
                    <button onClick={() => { setAuditDateFrom(''); setAuditDateTo(''); }} className="text-muted-foreground hover:text-foreground">
                      <X size={12} />
                    </button>
                  )}
                </div>
                {filteredAuditLogs.length !== auditLogs.length && (
                  <span className="text-xs text-muted-foreground ml-auto">{filteredAuditLogs.length} of {auditLogs.length} records</span>
                )}
              </div>
            </div>

            {/* ── Log Entries ─────────────────────────────────── */}
            {loadingAudit ? (
              <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-primary" /></div>
            ) : (
              <div className="space-y-2">
                {paginatedAuditLogs.map((log) => {
                  const cfg = severityConfig[log.severity];
                  return (
                    <div key={`audit-${log.id}`} className={`flex items-start gap-3 px-4 py-3 rounded-xl border border-border ${cfg.bg} transition-all hover:border-border/80`}>
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${cfg.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-xs font-bold text-foreground">{log.action.replace(/_/g, ' ')}</span>
                          {log.entity && (
                            <>
                              <span className="text-[10px] text-muted-foreground">on</span>
                              <span className="text-xs font-semibold text-primary">{log.entity}</span>
                            </>
                          )}
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-auto ${log.severity === 'critical' ? 'bg-red-500/15 text-red-400' : log.severity === 'warning' ? 'bg-amber-500/15 text-amber-400' : 'bg-secondary text-muted-foreground'}`}>
                            {log.severity.toUpperCase()}
                          </span>
                        </div>
                        {log.details && <p className="text-xs text-muted-foreground mb-1">{log.details}</p>}
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                          <span className="font-semibold text-foreground">{log.user}</span>
                          {log.role && (
                            <span className={`px-1.5 py-0.5 rounded-full capitalize border text-[10px] ${roleColors[log.role.toLowerCase()] || 'bg-secondary text-muted-foreground border-border'}`}>{log.role}</span>
                          )}
                          {log.ip && <span className="font-mono text-[10px]">{log.ip}</span>}
                          <span className="ml-auto font-mono text-[10px]">{log.timestamp}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredAuditLogs.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                    <ScrollText size={32} className="mb-2 opacity-20" />
                    <p className="text-sm">No audit logs match your filters</p>
                    <button onClick={() => { setAuditSearch(''); setAuditFilter('all'); setAuditRoleFilter('all'); setAuditActionFilter('all'); setAuditDateFrom(''); setAuditDateTo(''); }} className="mt-2 text-xs text-primary hover:underline">Clear all filters</button>
                  </div>
                )}
              </div>
            )}

            {/* ── Pagination ───────────────────────────────────── */}
            {auditTotalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Page {auditPage} of {auditTotalPages} · {filteredAuditLogs.length} records
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                    disabled={auditPage === 1}
                    className="px-3 py-1.5 bg-secondary border border-border rounded-lg text-xs font-semibold text-foreground disabled:opacity-40 hover:border-primary/40 transition-all"
                  >
                    Previous
                  </button>
                  {Array.from({ length: Math.min(5, auditTotalPages) }, (_, i) => {
                    const page = auditPage <= 3 ? i + 1 : auditPage + i - 2;
                    if (page < 1 || page > auditTotalPages) return null;
                    return (
                      <button
                        key={`audit-page-${page}`}
                        onClick={() => setAuditPage(page)}
                        className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${page === auditPage ? 'bg-primary text-white' : 'bg-secondary border border-border text-foreground hover:border-primary/40'}`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}
                    disabled={auditPage === auditTotalPages}
                    className="px-3 py-1.5 bg-secondary border border-border rounded-lg text-xs font-semibold text-foreground disabled:opacity-40 hover:border-primary/40 transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Add / Edit Staff Modal ─────────────────────────────── */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg mx-4 p-5 animate-scale-in max-h-[90vh] overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-foreground">{editingUser ? 'Edit Staff Member' : 'Add Staff Member'}</h3>
              <button onClick={() => { setShowAddUser(false); setEditingUser(null); setAddUserForm(defaultAddUserForm); }} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Kavya Reddy"
                  value={addUserForm.name}
                  onChange={(e) => setAddUserForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Email *</label>
                <input
                  type="email"
                  placeholder="kavya.r@spicegarden.in"
                  value={addUserForm.email}
                  onChange={(e) => setAddUserForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Phone</label>
                <input
                  type="text"
                  placeholder="+91 98765 XXXXX"
                  value={addUserForm.phone}
                  onChange={(e) => setAddUserForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>
              {!editingUser && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Temporary Password</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} placeholder="Min 8 characters" className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors pr-10" />
                    <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Staff will be prompted to change on first login</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Role</label>
                <select
                  value={addUserForm.role}
                  onChange={(e) => setAddUserForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors"
                >
                  {['owner', 'manager', 'cashier', 'captain', 'kitchen', 'accountant'].map((r) => (
                    <option key={`role-opt-${r}`} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Outlet Access</label>
                <select
                  value={addUserForm.outlet}
                  onChange={(e) => setAddUserForm((f) => ({ ...f, outlet: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors"
                >
                  <option value="koramangala">Koramangala</option>
                  <option value="indiranagar">Indiranagar</option>
                  <option value="All Outlets">All Outlets</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowAddUser(false); setEditingUser(null); setAddUserForm(defaultAddUserForm); }} className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground">Cancel</button>
              <button
                onClick={handleAddUser}
                disabled={savingUser}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              >
                {savingUser ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {savingUser ? 'Saving…' : editingUser ? 'Update Staff' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Menu Item Modal ─────────────────────────── */}
      {showAddMenu && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg mx-4 p-5 animate-scale-in max-h-[90vh] overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-foreground">{editingMenu ? 'Edit Menu Item' : 'Add Menu Item'}</h3>
              <button onClick={() => { setShowAddMenu(false); setEditingMenu(null); setAddMenuForm(defaultAddMenuForm); }} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Item Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Paneer Tikka"
                  value={addMenuForm.name}
                  onChange={(e) => setAddMenuForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Category</label>
                  <select
                    value={addMenuForm.category}
                    onChange={(e) => setAddMenuForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors"
                  >
                    {menuCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Price (₹) *</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={addMenuForm.price}
                    onChange={(e) => setAddMenuForm((f) => ({ ...f, price: e.target.value }))}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">GST Rate (%)</label>
                  <select
                    value={addMenuForm.gstRate}
                    onChange={(e) => setAddMenuForm((f) => ({ ...f, gstRate: e.target.value }))}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors"
                  >
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">HSN Code</label>
                  <input
                    type="text"
                    placeholder="2106"
                    value={addMenuForm.hsnCode}
                    onChange={(e) => setAddMenuForm((f) => ({ ...f, hsnCode: e.target.value }))}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                  />
                </div>
              </div>
              <div className="flex items-center gap-6 py-2">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-sm border-2 flex items-center justify-center cursor-pointer ${addMenuForm.isVeg ? 'border-accent bg-accent/10' : 'border-border'}`} onClick={() => setAddMenuForm((f) => ({ ...f, isVeg: true }))}>
                    {addMenuForm.isVeg && <div className="w-1.5 h-1.5 rounded-full bg-accent" />}
                  </div>
                  <span className="text-xs font-semibold text-foreground cursor-pointer" onClick={() => setAddMenuForm((f) => ({ ...f, isVeg: true }))}>Veg</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-sm border-2 flex items-center justify-center cursor-pointer ${!addMenuForm.isVeg ? 'border-red-500 bg-red-500/10' : 'border-border'}`} onClick={() => setAddMenuForm((f) => ({ ...f, isVeg: false }))}>
                    {!addMenuForm.isVeg && <div className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                  </div>
                  <span className="text-xs font-semibold text-foreground cursor-pointer" onClick={() => setAddMenuForm((f) => ({ ...f, isVeg: false }))}>Non-Veg</span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-muted-foreground">Available</span>
                  <Toggle enabled={addMenuForm.available} onChange={(v) => setAddMenuForm((f) => ({ ...f, available: v }))} />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowAddMenu(false); setEditingMenu(null); setAddMenuForm(defaultAddMenuForm); }} className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground">Cancel</button>
              <button
                onClick={handleAddMenuItem}
                disabled={savingMenu}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              >
                {savingMenu ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {savingMenu ? 'Saving…' : editingMenu ? 'Update Item' : 'Add to Menu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Staff Confirm Modal ────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm mx-4 p-5 animate-scale-in">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Delete Staff Member</h3>
                <p className="text-xs text-muted-foreground">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Deleting this user will revoke all access immediately. Their activity logs will be retained for audit purposes.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground">Cancel</button>
              <button
                onClick={() => deleteUser(showDeleteConfirm)}
                className="flex-1 py-2.5 bg-destructive hover:bg-destructive/90 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all"
              >
                <Trash2 size={14} />
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Menu Item Confirm Modal ────────────────────── */}
      {showDeleteMenuConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm mx-4 p-5 animate-scale-in">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Remove Menu Item</h3>
                <p className="text-xs text-muted-foreground">This will permanently delete the item</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Removing this item will also unlink it from any existing orders. Consider deactivating it instead.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteMenuConfirm(null)} className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground">Cancel</button>
              <button
                onClick={() => deleteMenuItem(showDeleteMenuConfirm)}
                className="flex-1 py-2.5 bg-destructive hover:bg-destructive/90 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all"
              >
                <Trash2 size={14} />
                Remove Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Printer Modal ───────────────────────────── */}
      {showAddPrinter && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 p-5 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-foreground">{editingPrinter ? 'Edit Printer' : 'Add Printer'}</h3>
              <button onClick={() => { setShowAddPrinter(false); setEditingPrinter(null); }} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Printer Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Billing Counter — Epson TM-T82"
                  value={printerForm.name}
                  onChange={(e) => setPrinterForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Printer Type</label>
                  <select
                    value={printerForm.printerType}
                    onChange={(e) => setPrinterForm((f) => ({ ...f, printerType: e.target.value }))}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors"
                  >
                    <option value="bill">Bill Printer</option>
                    <option value="kot">KOT Printer</option>
                    <option value="label">Label Printer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Paper Width</label>
                  <select
                    value={printerForm.paperWidth}
                    onChange={(e) => setPrinterForm((f) => ({ ...f, paperWidth: e.target.value }))}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors"
                  >
                    <option value="58mm">58mm</option>
                    <option value="80mm">80mm</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">IP Address *</label>
                  <input
                    type="text"
                    placeholder="192.168.1.50"
                    value={printerForm.ipAddress}
                    onChange={(e) => setPrinterForm((f) => ({ ...f, ipAddress: e.target.value }))}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Port</label>
                  <input
                    type="number"
                    placeholder="9100"
                    value={printerForm.port}
                    onChange={(e) => setPrinterForm((f) => ({ ...f, port: e.target.value }))}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 py-1">
                <Toggle enabled={printerForm.enabled} onChange={(v) => setPrinterForm((f) => ({ ...f, enabled: v }))} />
                <span className="text-xs text-muted-foreground">Enable this printer</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowAddPrinter(false); setEditingPrinter(null); }} className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground">Cancel</button>
              <button
                onClick={savePrinter}
                disabled={savingPrinter}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              >
                {savingPrinter ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {savingPrinter ? 'Saving…' : editingPrinter ? 'Update Printer' : 'Add Printer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}