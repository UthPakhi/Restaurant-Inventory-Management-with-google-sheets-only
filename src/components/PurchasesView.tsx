import React, { useState, useEffect } from 'react';
import { Plus, Loader2, Package, User, Calendar, Receipt, Download, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { sheetsService } from '../services/sheetsService';
import { mapRowToItem, mapRowToSupplier, mapRowToPurchase, mapRowToBatch } from '../services/dataMappers';
import { Item, Supplier, Purchase, Batch } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn, parseFinancialNumber } from '../lib/utils';
import { useAppLookup } from '../context/AppContext';
import { DataTable, Column } from './DataTable';

import { toast } from 'sonner';
export const PurchasesView: React.FC = () => {
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const { items, suppliers, loadingStaticData } = useAppLookup();
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [activeTab, setActiveTab] = useState<'form' | 'bulk'>('form');
    const [bulkText, setBulkText] = useState('');
    const [bulkPreview, setBulkPreview] = useState<any[] | null>(null);
    const [bulkSummary, setBulkSummary] = useState<any | null>(null);
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
        setActiveTab('form');
        setBulkText('');
    };

    const fetchData = async () => {
        if (loadingStaticData) return;
        setLoading(true);
        try {
            const [pRows, bRows] = await Promise.all([
                sheetsService.getAllPurchases(),
                sheetsService.getAllBatches()
            ]);
            setPurchases((pRows || []).map(mapRowToPurchase));

            // Calculate stock for all items
            const stocks: { [key: string]: number } = {};
            (bRows || []).map(mapRowToBatch).forEach((b: Batch) => {
                const id = String(b.itemId).trim();
                const qty = b.remainingQty;
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
        if (!loadingStaticData) {
            fetchData();
        }
    }, [loadingStaticData]);

    const getItemName = (id: string) => {
        const strId = String(id).trim();
        const found = items.find(i => String(i.id).trim() === strId)?.name;
        if (found) return found;
        return strId.startsWith('ITM_') ? 'Deleted Item' : strId;
    };
    const getSupplierName = (id: string) => {
        const strId = String(id).trim();
        const found = suppliers.find(s => String(s.id).trim() === strId)?.name;
        if (found) return found;
        return strId.startsWith('SUP_') ? 'Deleted Supplier' : strId;
    };
    const getLastPrice = (itemId: string) => {
        if (!itemId) return null;
        // Try purchases first
        const itemPurchases = purchases.filter(p => p.itemId === itemId);
        if (itemPurchases.length > 0) {
            return itemPurchases[itemPurchases.length - 1].rate;
        }
        // Fallback to master buy price (Initial Stock price)
        const masterItem = items.find(i => i.id === itemId);
        return masterItem ? masterItem.buyPrice : null;
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

    const handleBulkParse = () => {
        if (!bulkText.trim()) return;
        
        const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
        const parsed: any[] = [];
        
        lines.forEach((line, idx) => {
            const parts = line.split('\t').map(p => p.trim());
            if (parts.length < 5) return;
            
            const dateStr = parts[0];
            const itemName = parts[1];
            const qty = parts[2];
            const rate = parts[3];
            let supplierName = '';
            
            if (parts.length >= 6) {
                supplierName = parts[5];
            } else {
                supplierName = parts[4]; // if total is omitted
            }
            
            let formattedDate = format(new Date(), 'yyyy-MM-dd');
            try {
                const d = new Date(dateStr);
                if (!isNaN(d.getTime())) {
                    formattedDate = format(d, 'yyyy-MM-dd');
                }
            } catch (e) {}

            const foundItem = items.find(i => String(i.name).toLowerCase() === itemName.toLowerCase());
            const foundSupplier = suppliers.find(s => String(s.name).toLowerCase() === supplierName.toLowerCase());
            
            const supplierId = foundSupplier ? foundSupplier.id : '';
            const itemId = foundItem ? foundItem.id : '';

            // Check for potential duplicate in existing purchases
            const isDuplicate = purchases.some(p => 
                p.date === formattedDate && 
                p.itemId === itemId && 
                Number(p.qty).toFixed(2) === Number(qty).toFixed(2) && 
                p.supplierId === supplierId
            );

            parsed.push({
                id: `tmp_${idx}_${Date.now()}`,
                date: formattedDate,
                itemName,
                itemId,
                qty: qty,
                rate: rate,
                supplierName,
                supplierId,
                isDuplicate
            });
        });
        
        setBulkPreview(parsed);
    };

    const submitBulkPreview = async () => {
        if (!bulkPreview || bulkPreview.length === 0) return;
        setLoading(true);
        try {
            const pValues: any[][] = [];
            const bValues: any[][] = [];
            let lastTs = Date.now();

            // filter out lines that don't have item or supplier or qty/rate
            const toImport = bulkPreview.filter(l => l.itemId && l.supplierId && parseFloat(l.qty) > 0 && parseFloat(l.rate) >= 0);

            let successCount = 0;
            let totalCost = 0;
            const bySupplier: Record<string, number> = {};

            toImport.forEach((line, idx) => {
                const qty = Number(line.qty);
                const rate = Number(line.rate);
                const total = qty * rate;
                lastTs++;
                const purchaseId = `PUR_${lastTs}`;
                const batchId = `B_PUR_${lastTs}`;
                
                const invoice = line.invoice || `INV-${format(new Date(line.date), 'yyyyMMdd')}`;

                pValues.push([purchaseId, line.date, line.itemId, qty, rate, total, line.supplierId, invoice]);
                bValues.push([batchId, line.itemId, line.date, qty, qty, rate, 'Purchase']);
                
                successCount++;
                totalCost += total;
                const sName = getSupplierName(line.supplierId);
                bySupplier[sName] = (bySupplier[sName] || 0) + total;
            });

            if (pValues.length > 0) {
                await sheetsService.append('Purchases!A1', pValues);
                await sheetsService.append('Batches!A1', bValues);
                await sheetsService.logAudit(sheetsService.currentUserEmail, 'CREATE_PURCHASES_BULK', 'Purchases', `Bulk added ${successCount} item(s) to stock.`);
            }

            setBulkSummary({
                successCount,
                totalCost,
                bySupplier
            });
            setBulkPreview(null);
            setBulkText('');
            fetchData();
        } catch (e: any) {
            console.error('Bulk error', e);
            toast.error('Failed to import bulk purchases: ' + e.message);
        } finally {
            setLoading(false);
        }
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

    const columns: Column<Purchase>[] = [
        { key: 'date', header: 'Date', cell: row => <span className="text-slate-500 font-mono text-xs">{row.date}</span>, sortable: true },
        { key: 'invoice', header: 'Invoice', cell: row => <span className="text-slate-700 font-mono text-xs">{row.invoice}</span>, sortable: true },
        { key: 'supplierId', header: 'Supplier', cell: row => <span className="font-semibold text-slate-700">{getSupplierName(row.supplierId)}</span>, sortable: true },
        { key: 'itemId', header: 'Item', cell: row => <span className="font-bold text-slate-900">{getItemName(row.itemId)}</span>, sortable: true },
        { key: 'qty', header: 'Qty', align: 'right', cell: row => <span className="font-mono text-slate-700">{row.qty}</span>, sortable: true },
        { key: 'rate', header: 'Rate (Rs)', align: 'right', cell: row => <span className="font-mono text-slate-500">{Number(row.rate).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>, sortable: true },
        { key: 'total', header: 'Total (Rs)', align: 'right', cell: row => <span className="font-mono font-bold text-emerald-700">{Number(row.total).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>, sortable: true }
    ];

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

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <DataTable 
                    data={purchases} 
                    columns={columns} 
                    loading={loading}
                    emptyMessage="No purchase logs found."
                    customSearch={(row, q) => {
                        return row.date.toLowerCase().includes(q) ||
                               getItemName(row.itemId).toLowerCase().includes(q) ||
                               getSupplierName(row.supplierId).toLowerCase().includes(q) ||
                               String(row.invoice).toLowerCase().includes(q);
                    }}
                />
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
                            <div className="px-6 pt-4 border-b border-slate-100 flex gap-4">
                                <button 
                                    onClick={() => setActiveTab('form')}
                                    className={cn("pb-3 text-sm font-bold border-b-2 transition-all", activeTab === 'form' ? "border-emerald-500 text-emerald-600" : "border-transparent text-slate-400 hover:text-slate-600")}
                                >
                                    Manual Entry
                                </button>
                                <button 
                                    onClick={() => setActiveTab('bulk')}
                                    className={cn("pb-3 text-sm font-bold border-b-2 transition-all", activeTab === 'bulk' ? "border-emerald-500 text-emerald-600" : "border-transparent text-slate-400 hover:text-slate-600")}
                                >
                                    Bulk Import from Text
                                </button>
                            </div>
                            {activeTab === 'form' ? (
                                <>
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
                                                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                                                                {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
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
                                </>
                            ) : bulkPreview ? (
                                <>
                                    <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left border-collapse text-sm">
                                                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                                                    <tr>
                                                        <th className="px-4 py-3 rounded-tl-lg">Date</th>
                                                        <th className="px-4 py-3 border-x">Supplier</th>
                                                        <th className="px-4 py-3">Item</th>
                                                        <th className="px-4 py-3 text-right">Qty</th>
                                                        <th className="px-4 py-3 text-right">Rate</th>
                                                        <th className="px-4 py-3 text-right">Total</th>
                                                        <th className="px-4 py-3 text-center">Warnings</th>
                                                        <th className="px-4 py-3 w-10 border-l rounded-tr-lg"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 bg-white">
                                                    {bulkPreview.map((line, idx) => {
                                                        const missingItem = !line.itemId;
                                                        const missingSupplier = !line.supplierId;
                                                        const isZeroQty = parseFloat(line.qty) <= 0;
                                                        const hasError = missingItem || missingSupplier || isZeroQty || line.isDuplicate;
                                                        return (
                                                            <tr key={line.id} className={cn(hasError && "bg-red-50/50")}>
                                                                <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">{line.date}</td>
                                                                <td className="px-4 py-3 font-semibold text-indigo-600 border-x">
                                                                    {!missingSupplier ? line.supplierName : <span className="text-red-500 text-xs flex items-center gap-1"><AlertTriangle size={12}/> Match Not Found ({line.supplierName})</span>}
                                                                </td>
                                                                <td className="px-4 py-3 text-slate-900 font-medium">
                                                                    {!missingItem ? line.itemName : <span className="text-red-500 text-xs flex items-center gap-1"><AlertTriangle size={12}/> Match Not Found ({line.itemName})</span>}
                                                                </td>
                                                                <td className="px-4 py-3 text-right text-slate-700 font-mono">
                                                                    <input 
                                                                        type="number" 
                                                                        className={cn("w-20 px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-inset font-mono", isZeroQty ? "text-red-600 focus:ring-red-500 bg-red-50/30" : "focus:ring-emerald-500")}
                                                                        value={line.qty} 
                                                                        onChange={e => {
                                                                            const newPreview = [...bulkPreview];
                                                                            newPreview[idx].qty = e.target.value;
                                                                            setBulkPreview(newPreview);
                                                                        }}
                                                                    />
                                                                </td>
                                                                <td className="px-4 py-3 text-right text-slate-700 font-mono whitespace-nowrap">
                                                                    <input 
                                                                        type="number" 
                                                                        className={cn("w-24 px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-inset font-mono", isZeroQty ? "text-red-600 focus:ring-red-500 bg-red-50/30" : "focus:ring-emerald-500")}
                                                                        value={line.rate} 
                                                                        onChange={e => {
                                                                            const newPreview = [...bulkPreview];
                                                                            newPreview[idx].rate = e.target.value;
                                                                            setBulkPreview(newPreview);
                                                                        }}
                                                                    />
                                                                </td>
                                                                <td className="px-4 py-3 text-right font-bold text-slate-900 font-mono whitespace-nowrap">
                                                                    {(parseFloat(line.qty) * parseFloat(line.rate) || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2})}
                                                                </td>
                                                                <td className="px-2 py-3 text-center">
                                                                    {line.isDuplicate && (
                                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-200">
                                                                            <AlertTriangle size={12} />
                                                                            Duplicate Exists
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-2 text-center border-l">
                                                                    <button 
                                                                        onClick={() => setBulkPreview(bulkPreview.filter(l => l.id !== line.id))}
                                                                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                                                        title="Remove Item"
                                                                    >
                                                                        <X size={16} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-between items-center flex-wrap gap-4 rounded-b-xl">
                                        <div className="flex gap-3">
                                            <button onClick={() => setBulkPreview(null)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                                                Cancel
                                            </button>
                                            <button 
                                                onClick={submitBulkPreview}
                                                disabled={loading || bulkPreview.length === 0 || bulkPreview.some(l => !l.itemId || !l.supplierId || parseFloat(l.qty) <= 0)}
                                                className="px-6 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center gap-2"
                                            >
                                                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Confirm & Log Purchases'}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            ) : bulkSummary ? (
                                <div className="p-12 flex flex-col items-center justify-center text-center space-y-6">
                                    <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-2">
                                        <CheckCircle2 size={40} />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-slate-900 mb-2">Import Complete</h3>
                                        <p className="text-slate-500">Successfully logged {bulkSummary.successCount} purchases.</p>
                                    </div>
                                    <button onClick={() => setIsAdding(false)} className="px-8 py-3 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition-colors shadow-lg">
                                        Done
                                    </button>
                                </div>
                            ) : (
                                <div className="p-6 space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">Paste Data from Excel/Sheets</label>
                                        <p className="text-xs text-slate-500">Format: Date (tab) Item (tab) Qty (tab) Rate (tab) Total (tab) Supplier</p>
                                        <textarea
                                            className="w-full h-64 p-4 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:outline-none resize-none whitespace-pre"
                                            placeholder="5/2/2026&#9;Tandoori Masala 1kg Shaan&#9;5&#9;1550&#9;7750&#9;A. Rehman KHI"
                                            value={bulkText}
                                            onChange={e => setBulkText(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex justify-end pt-4 border-t border-slate-100">
                                        <button 
                                            onClick={handleBulkParse}
                                            disabled={!bulkText.trim()}
                                            className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                        >
                                            Preview Data
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
