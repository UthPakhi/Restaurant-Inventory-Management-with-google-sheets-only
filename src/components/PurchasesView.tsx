import React, { useState, useEffect } from 'react';
import { Plus, Loader2, Package, User, Calendar, Receipt, Download } from 'lucide-react';
import { sheetsService } from '../services/sheetsService';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

export const PurchasesView: React.FC = () => {
    const [purchases, setPurchases] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [stockLevels, setStockLevels] = useState<{ [key: string]: number }>({});

    const [form, setForm] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        supplierId: '',
        invoice: `INV-${format(new Date(), 'yyyyMMdd-HHms')}`,
        lines: [{ itemId: '', qty: '', rate: '' }]
    });

    const handleOpenAdd = () => {
        setForm({
            date: format(new Date(), 'yyyy-MM-dd'),
            supplierId: '',
            invoice: `INV-${format(new Date(), 'yyyyMMdd-HHms')}`,
            lines: [{ itemId: '', qty: '', rate: '' }]
        });
        setIsAdding(true);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [pRows, iRows, sRows, bRows] = await Promise.all([
                sheetsService.read('Purchases!A2:H'),
                sheetsService.read('Masters_Items!A2:J'),
                sheetsService.read('Masters_Suppliers!A2:B'),
                sheetsService.read('Batches!A2:H')
            ]);
            setPurchases(pRows);
            setItems(iRows);
            setSuppliers(sRows);

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

    const getItemName = (id: string) => {
        const strId = String(id).trim();
        const found = items.find(i => String(i[0]).trim() === strId)?.[1];
        if (found) return found;
        return strId.startsWith('ITM_') ? 'Deleted Item' : strId;
    };
    const getSupplierName = (id: string) => {
        const strId = String(id).trim();
        const found = suppliers.find(s => String(s[0]).trim() === strId)?.[1];
        if (found) return found;
        return strId.startsWith('SUP_') ? 'Deleted Supplier' : strId;
    };
    const getLastPrice = (itemId: string) => {
        if (!itemId) return null;
        // Try purchases first
        const itemPurchases = purchases.filter(p => p[2] === itemId);
        if (itemPurchases.length > 0) {
            return itemPurchases[itemPurchases.length - 1][4];
        }
        // Fallback to master buy price (Initial Stock price)
        const masterItem = items.find(i => i[0] === itemId);
        return masterItem ? masterItem[4] : null;
    };

    const addLine = () => {
        if (form.lines.length < 10) {
            setForm({ ...form, lines: [...form.lines, { itemId: '', qty: '', rate: '' }] });
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
        const validLines = form.lines.filter(l => l.itemId && l.qty && l.rate);
        if (validLines.length === 0) return;
        
        setLoading(true);
        try {
            const pValues: any[][] = [];
            const bValues: any[][] = [];
            const baseTs = Date.now();

            validLines.forEach((line, idx) => {
                const qty = Number(line.qty);
                const rate = Number(line.rate);
                const total = qty * rate;
                const purchaseId = `PUR_${baseTs}_${idx}`;
                const batchId = `B_PUR_${baseTs}_${idx}`;
                
                pValues.push([purchaseId, form.date, line.itemId, qty, rate, total, form.supplierId, form.invoice]);
                bValues.push([batchId, line.itemId, form.date, qty, qty, rate, 'Purchase']);
            });
            
            // 1. Record purchases
            await sheetsService.append('Purchases!A1', pValues);
            
            // 2. Create batches for FIFO
            await sheetsService.append('Batches!A1', bValues);
            
            await sheetsService.logAudit(sheetsService.currentUserEmail, 'CREATE_PURCHASES', 'Purchases', `Added ${validLines.length} item(s) to stock.`);

            setIsAdding(false);
            setForm({
                date: format(new Date(), 'yyyy-MM-dd'),
                supplierId: '',
                invoice: `INV-${format(new Date(), 'yyyyMMdd-HHms')}`,
                lines: [{ itemId: '', qty: '', rate: '' }]
            });
            fetchData();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Purchase Ledger</h2>
                  <p className="text-sm text-slate-500">Track incoming stock and procurement costs.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium shadow-sm hover:bg-slate-50 transition-all">
                    <Download size={14} className="text-slate-500" />
                    Export
                  </button>
                  <button 
                    onClick={handleOpenAdd}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium shadow-md hover:bg-emerald-700 transition-all"
                  >
                    <Plus size={16} /> New Purchase
                  </button>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Item Details</th>
                                <th className="px-6 py-3">Qty</th>
                                <th className="px-6 py-3">Unit Rate</th>
                                <th className="px-6 py-3 text-right">Total Amount</th>
                                <th className="px-6 py-3">Supplier</th>
                                <th className="px-6 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs divide-y divide-slate-100">
                            {purchases.length === 0 && !loading ? (
                              <tr>
                                <td colSpan={7} className="px-6 py-12 text-center text-slate-500 italic">No purchase logs found.</td>
                              </tr>
                            ) : (
                              purchases.map((row, i) => (
                                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="px-6 py-4">
                                         <div className="flex items-center gap-2 text-slate-500 font-medium whitespace-nowrap">
                                            <Calendar size={14} />
                                            {row[1]}
                                         </div>
                                      </td>
                                      <td className="px-6 py-4 font-bold text-slate-900">{getItemName(row[2])}</td>
                                      <td className="px-6 py-4 font-mono font-medium text-slate-600">{row[3]}</td>
                                      <td className="px-6 py-4 font-mono text-slate-500">Rs. {Number(row[4]).toLocaleString()}</td>
                                      <td className="px-6 py-4 text-right font-bold text-slate-900 font-mono tracking-tighter">
                                        Rs. {Number(row[5]).toLocaleString()}
                                      </td>
                                      <td className="px-6 py-4 text-slate-600 font-medium">{getSupplierName(row[6])}</td>
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
                            className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl border border-slate-200"
                        >
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <div>
                                  <h3 className="font-bold text-slate-900">Bulk Purchase Entry</h3>
                                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Log up to 10 items per voucher</p>
                                </div>
                                <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 p-1">
                                  <Plus className="rotate-45" size={24} />
                                </button>
                            </div>
                            <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Purchase Date</label>
                                        <div className="relative">
                                          <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                          <input type="date" className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all" 
                                              value={form.date} onChange={e => setForm({...form, date: e.target.value})}
                                          />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Supplier</label>
                                        <div className="relative">
                                          <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                          <select className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none appearance-none bg-no-repeat transition-all"
                                              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%23a1a1aa\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\' /%3E%3C/svg%3E")', backgroundPosition: 'right 0.75rem center', backgroundSize: '1rem' }}
                                              value={form.supplierId} onChange={e => setForm({...form, supplierId: e.target.value})}
                                          >
                                              <option value="">-- Choose Supplier --</option>
                                              {suppliers.map(s => <option key={s[0]} value={s[0]}>{s[1]}</option>)}
                                          </select>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Invoice / GRN #</label>
                                        <div className="relative">
                                          <Receipt size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                          <input type="text" className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all" placeholder="ID-001"
                                              value={form.invoice} onChange={e => setForm({...form, invoice: e.target.value})}
                                          />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center bg-slate-100 p-2 rounded-lg">
                                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Purchase Items</label>
                                        <button onClick={addLine} disabled={form.lines.length >= 10} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-white px-3 py-1 rounded-md shadow-sm">
                                            <Plus size={14} /> Add Line
                                        </button>
                                    </div>
                                    
                                    <div className="space-y-3">
                                        {form.lines.map((line, idx) => (
                                            <div key={idx} className="grid grid-cols-12 gap-3 items-center animate-in slide-in-from-right-2 duration-200 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                                                <div className="col-span-5 space-y-1">
                                                    <label className="text-[8px] uppercase font-bold text-slate-400 ml-1">Item</label>
                                                    <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
                                                        value={line.itemId} onChange={e => updateLine(idx, 'itemId', e.target.value)}
                                                    >
                                                        <option value="">-- Select Item --</option>
                                                        {items.map(i => <option key={i[0]} value={i[0]}>{i[1]}</option>)}
                                                    </select>
                                                </div>
                                                <div className="col-span-2 space-y-1">
                                                    <label className="text-[8px] uppercase font-bold text-slate-400 ml-1">Quantity</label>
                                                    <input type="number" 
                                                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
                                                        placeholder="0.0"
                                                        value={line.qty} onChange={e => updateLine(idx, 'qty', e.target.value)}
                                                    />
                                                    {line.itemId && (
                                                        <p className="text-[8px] text-slate-400 italic ml-1">
                                                            Current Stock: {(stockLevels[line.itemId] || 0).toFixed(2)}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="col-span-2 space-y-1">
                                                    <label className="text-[8px] uppercase font-bold text-slate-400 ml-1">Rate (Rs.)</label>
                                                    <input type="number" 
                                                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
                                                        placeholder="0"
                                                        value={line.rate} onChange={e => updateLine(idx, 'rate', e.target.value)}
                                                    />
                                                    {line.itemId && getLastPrice(line.itemId) && (
                                                        <div className="flex flex-col ml-1">
                                                            <p className="text-[8px] text-slate-400 italic">
                                                                Last: Rs. {Number(getLastPrice(line.itemId)).toLocaleString()}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="col-span-2 space-y-1">
                                                    <label className="text-[8px] uppercase font-bold text-slate-400 ml-1 text-emerald-600">Total (Rs.)</label>
                                                    <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 min-h-[38px] flex items-center">
                                                        {line.qty && line.rate ? (Number(line.qty) * Number(line.rate)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00'}
                                                    </div>
                                                </div>
                                                <div className="col-span-1 flex justify-center pt-4">
                                                    <button onClick={() => removeLine(idx)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                                                        <Plus className="rotate-45" size={20} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 bg-white border-t border-slate-100 flex justify-between items-center">
                                <div className="text-sm font-bold text-slate-500 uppercase tracking-tight">
                                    Total Value: <span className="text-emerald-600 font-mono tracking-tighter ml-2">
                                        Rs. {form.lines.reduce((sum, l) => sum + (Number(l.qty) * Number(l.rate) || 0), 0).toLocaleString()}
                                    </span>
                                </div>
                                <button
                                    onClick={handleSubmit} disabled={loading || form.lines.some(l => !l.itemId || !l.qty || !l.rate)}
                                    className="px-8 py-3 bg-emerald-600 text-white rounded-lg font-bold shadow-lg shadow-emerald-600/20 flex items-center justify-center transition-all hover:bg-emerald-700 disabled:bg-slate-400"
                                >
                                    {loading ? <Loader2 size={20} className="animate-spin" /> : `Post ${form.lines.filter(l => l.itemId && l.qty).length} Purchases`}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
