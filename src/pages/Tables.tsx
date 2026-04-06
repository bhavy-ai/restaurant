import { useEffect, useState, FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Table } from '../types';
import toast from 'react-hot-toast';
import { Plus, X } from 'lucide-react';

const statusConfig = {
  available: { label: 'Available', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500' },
  occupied: { label: 'Occupied', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
  reserved: { label: 'Reserved', bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200', dot: 'bg-yellow-500' },
};

const nextStatus: Record<Table['status'], Table['status']> = {
  available: 'occupied',
  occupied: 'reserved',
  reserved: 'available',
};

export default function Tables() {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [tableNumber, setTableNumber] = useState('');
  const [capacity, setCapacity] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchTables = async () => {
    try {
      const { data } = await supabase.from('tables').select('*').order('table_number');
      setTables((data as Table[]) ?? []);
    } catch {
      toast.error('Failed to load tables');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTables(); }, []);

  const cycleStatus = async (table: Table) => {
    const next = nextStatus[table.status];
    const { error } = await supabase.from('tables').update({ status: next }).eq('id', table.id);
    if (error) { toast.error('Failed to update table status'); return; }
    fetchTables();
  };

  const handleAddTable = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from('tables').insert({
        table_number: parseInt(tableNumber),
        capacity: parseInt(capacity),
        status: 'available',
      });
      if (error) throw error;
      toast.success('Table added');
      setShowModal(false);
      setTableNumber('');
      setCapacity('');
      fetchTables();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add table');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Table Management</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors"
        >
          <Plus size={18} /> Add Table
        </button>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-6">
        {Object.entries(statusConfig).map(([status, cfg]) => (
          <div key={status} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${cfg.dot}`} />
            <span className="text-sm text-gray-600">{cfg.label}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : tables.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No tables found. Add one to get started.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {tables.map(table => {
            const cfg = statusConfig[table.status];
            return (
              <button
                key={table.id}
                onClick={() => cycleStatus(table)}
                className={`${cfg.bg} ${cfg.border} border-2 rounded-xl p-6 text-center hover:shadow-md transition-all cursor-pointer`}
              >
                <div className="text-3xl font-bold text-gray-800 mb-1">{table.table_number}</div>
                <div className="text-xs text-gray-500 mb-3">{table.capacity} seats</div>
                <div className={`flex items-center justify-center gap-1.5 text-xs font-medium ${cfg.text}`}>
                  <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">Click a table to cycle its status: Available → Occupied → Reserved → Available</p>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">Add New Table</h2>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleAddTable} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Table Number *</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={tableNumber}
                  onChange={e => setTableNumber(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacity *</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={capacity}
                  onChange={e => setCapacity(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 bg-orange-500 text-white py-2 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Add Table'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
