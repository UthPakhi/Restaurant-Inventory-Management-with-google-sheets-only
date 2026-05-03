import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Download, ArrowRightLeft, Utensils, Calendar, Package, Loader2 } from 'lucide-react';
import { sheetsService } from '../services/sheetsService';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

export const IssuesView: React.FC = () => {
    const [issues, setIssues] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [depts, setDepts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isAdding, setIsAdding] = useState(false);

    const [form, setForm] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        deptId: '',
        lines: [{ itemId: '', qty: '' }]
    });

    const [stockLevels, setStockLevels] = useState<{ [key: string]: number }>({});

    const fetchData = async () => {
        setLoading(true);
        try {
            const [iRows, itemRows, dRows, bRows] = await Promise.all([
                sheetsService.read('Issues!A2:G'),
                sheetsService.read('Masters_Items!A2:H'),
                sheetsService.read('Masters_Depts!A2:B'),
                sheetsService.read('Batches!A2:G')
            ]);
            setIssues(iRows);
            setItems(itemRows);
            setDepts(dRows);
            
            // Calculate stock for all items
            const stocks: { [key: string]: number } = {};
            bRows.forEach((b: any) => {
                const id = String(b[1]).trim();
                const qty = parseFloat(String(b[4]).replace(/,/g, '')) || 0;
                stocks[id] = (stocks[id] || 0) + qty;
            });
            setStockLevels(stocks);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const getItemName = (id: string) => items.find(i => i[0] === id)?.[1] || id;
    const getDeptName = (id: string) => depts.find(d => d[0] === id)?.[1] || id;

    const filteredItems = items.filter(i => {
        if (!form.deptId) return true;
        const itemDeptIds = String(i[2] || '').split(',').map(s => s.trim()).filter(Boolean);
        return itemDeptIds.length === 0 || itemDeptIds.includes(form.deptId) || itemDeptIds.includes('all');
    });

    const addLine = () => {
        if (form.lines.length < 10) {
            setForm({ ...form, lines: [...form.lines, { itemId: '', qty: '' }] });
        }
    };

    const removeLine = (index: number) => {
        if (form.lines.length > 1) {
            const newLines = [...form.lines];
            newLines.splice(index, 1);
            setForm({ ...form, lines: newLines });
        }
    };

    const updateLine = (index: number, field: string, value: string) => {
        const newLines = [...form.lines];
        (newLines[index] as any)[field] = value;
        setForm({ ...form, lines: newLines });
    };

    const handleSubmit = async () => {
        const validLines = form.lines.filter(l => l.itemId && l.qty);
        if (validLines.length === 0 || !form.deptId) return;
        
        setLoading(true);
        try {
            for (const line of validLines) {
                const qty = Number(line.qty);
                await sheetsService.issueFIFO(line.itemId, qty, form.date, form.deptId);
            }
            
            setIsAdding(false);
            setForm({
                date: format(new Date(), 'yyyy-MM-dd'),
                deptId: '',
                lines: [{ itemId: '', qty: '' }]
            });
            fetchData();
        } catch (e: any) {
            console.error(e);
            alert(e.message || "Failed to record issue. Check stock availability.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Consumption Log</h2>
                  <p className="text-sm text-slate-500">Record and track inventory usage by department.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium shadow-sm hover:bg-slate-50 transition-all">
                    <Download size={14} className="text-slate-500" />
                    Export
                  </button>
                  <button 
                    onClick={() => setIsAdding(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium shadow-md hover:bg-emerald-700 transition-all"
                  >
                    <Plus size={16} /> Log Consumption
                  </button>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Section / Dept</th>
                                <th className="px-6 py-3">Item Details</th>
                                <th className="px-6 py-3 text-right">Quantity Issued</th>
                                <th className="px-6 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs divide-y divide-slate-100">
                            {issues.length === 0 && !loading ? (
                              <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">No consumption logs found.</td>
                              </tr>
                            ) : (
                              issues.map((row, i) => (
                                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="px-6 py-4">
                                         <div className="flex items-center gap-2 text-slate-500 font-medium">
                                            <Calendar size={14} />
                                            {row[1]}
                                         </div>
                                      </td>
                                      <td className="px-6 py-4">
                                         <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold uppercase tracking-tight">
                                           {getDeptName(row[2])}
                                         </span>
                                      </td>
                                      <td className="px-6 py-4 font-bold text-slate-900">{getItemName(row[3])}</td>
                                      <td className="px-6 py-4 text-right font-bold text-slate-900 font-mono tracking-tighter">
                                        {row[4]}
                                      </td>
                                      <td className="px-6 py-4">
                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-tight">
                                          Synced
                                        </span>
                                      </td>
                                  </tr>
                              ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <AnimatePresence>
                {isAdding && (
                    <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200"
                        >
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <div>
                                  <h3 className="font-bold text-slate-900">Bulk Store Issue</h3>
                                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Kitchen & Section Consumption</p>
                                </div>
                                <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 p-1">
                                  <Plus className="rotate-45" size={24} />
                                </button>
                            </div>
                            <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Date</label>
                                        <div className="relative">
                                          <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                          <input type="date" className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all" 
                                              value={form.date} onChange={e => setForm({...form, date: e.target.value})}
                                          />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Department / Section</label>
                                        <div className="relative">
                                          <Utensils size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                          <select className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none appearance-none bg-no-repeat transition-all"
                                              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%23a1a1aa\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\' /%3E%3C/svg%3E")', backgroundPosition: 'right 0.75rem center', backgroundSize: '1rem' }}
                                              value={form.deptId} onChange={e => setForm({...form, deptId: e.target.value})}
                                          >
                                              <option value="">-- Select Section --</option>
                                              {depts.map(d => <option key={d[0]} value={d[0]}>{d[1]}</option>)}
                                          </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider text-emerald-600">Line Items</label>
                                        <button onClick={addLine} disabled={form.lines.length >= 10} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded">
                                            <Plus size={12} /> Add Item
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        {form.lines.map((line, idx) => (
                                            <div key={idx} className="flex gap-3 items-start animate-in slide-in-from-left-2 duration-200">
                                                <div className="flex-1 space-y-1">
                                                    <select className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
                                                        value={line.itemId} onChange={e => updateLine(idx, 'itemId', e.target.value)}
                                                    >
                                                        <option value="">-- Choose Item --</option>
                                                        {filteredItems.map(i => <option key={i[0]} value={i[0]}>{i[1]}</option>)}
                                                    </select>
                                                    {line.itemId && (
                                                        <div className="flex justify-between px-1">
                                                            <span className="text-[8px] font-bold text-slate-400 italic">
                                                                Stock: {(stockLevels[line.itemId] || 0).toFixed(2)}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="w-24">
                                                    <input type="number" 
                                                        className={cn(
                                                            "w-full px-3 py-2 bg-slate-50 border rounded-lg text-sm focus:ring-2 focus:outline-none transition-all",
                                                            line.qty && stockLevels[line.itemId] !== undefined && Number(line.qty) > stockLevels[line.itemId]
                                                                ? "border-red-500 focus:ring-red-500/20"
                                                                : "border-slate-200 focus:ring-emerald-500/20"
                                                        )}
                                                        placeholder="Qty"
                                                        value={line.qty} onChange={e => updateLine(idx, 'qty', e.target.value)}
                                                    />
                                                </div>
                                                <button onClick={() => removeLine(idx)} className="p-2 text-slate-300 hover:text-red-500 mt-0.5">
                                                    <Plus className="rotate-45" size={18} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100">
                                <button
                                    onClick={handleSubmit} 
                                    disabled={loading || !form.deptId || form.lines.some(l => !l.itemId || !l.qty || (stockLevels[l.itemId] !== undefined && Number(l.qty) > stockLevels[l.itemId]))}
                                    className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold shadow-lg shadow-emerald-600/20 flex items-center justify-center transition-all hover:bg-emerald-700 disabled:bg-slate-400"
                                >
                                    {loading ? <Loader2 size={20} className="animate-spin" /> : `Post ${form.lines.filter(l => l.itemId && l.qty).length} Items`}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
