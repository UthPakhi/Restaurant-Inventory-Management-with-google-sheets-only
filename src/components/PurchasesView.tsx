import React, { useState, useEffect } from 'react';
import { Plus, Loader2, Package, User, Calendar, Receipt, Download, FileText, X, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { sheetsService } from '../services/sheetsService';
import { mapRowToItem, mapRowToSupplier, mapRowToPurchase, mapRowToBatch } from '../services/dataMappers';
import { Item, Supplier, Purchase, Batch } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn, parseFinancialNumber } from '../lib/utils';
import { useAppLookup } from '../context/AppContext';
import { DataTable, Column } from './DataTable';
import { fuzzyMatch } from '../lib/stringUtils';
import { exportTableToPDF, exportTableToExcel } from '../lib/exportUtils';
import { toast } from 'sonner';
import Select from 'react-select';

const selectStyles = {
    control: (base: any) => ({
        ...base,
        border: '1px solid var(--select-border)',
        borderRadius: '0.5rem',
        padding: '0.1rem',
        boxShadow: 'none',
        fontSize: '0.875rem',
        backgroundColor: 'var(--select-bg)',
        color: 'var(--select-text)',
        '&:hover': {
            borderColor: 'var(--select-border-hover)'
        }
    }),
    singleValue: (base: any) => ({
      ...base,
      color: 'var(--select-text)'
    }),
    input: (base: any) => ({
      ...base,
      color: 'var(--select-text)'
    }),
    placeholder: (base: any) => ({
      ...base,
      color: 'var(--select-placeholder)'
    }),
    valueContainer: (base: any) => ({
        ...base,
        padding: '2px 8px',
    }),
    menu: (base: any) => ({
        ...base,
        zIndex: 100,
        fontSize: '0.875rem',
        backgroundColor: 'var(--select-bg)',
        border: '1px solid var(--select-border)',
    }),
    option: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isFocused 
          ? 'var(--select-option-hover)' 
          : 'var(--select-bg)',
        color: 'var(--select-text)',
        cursor: 'pointer'
    }),
    menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
};
export const PurchasesView: React.FC = () => {
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const { items, suppliers, activeItems, activeSuppliers, loadingStaticData } = useAppLookup();
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

    const getRateIndicator = (itemId: string, currentRateStr: string | number) => {
        if (!itemId || !currentRateStr) return null;
        const currentRate = Number(currentRateStr);
        const lastPriceStr = getLastPrice(itemId);
        if (lastPriceStr === null || lastPriceStr === undefined) return null;
        
        const lastPrice = Number(lastPriceStr);
        if (currentRate > lastPrice) {
            return <span className="text-[10px] text-red-500 font-bold flex items-center gap-0.5"><TrendingUp size={12} /> Rate increased (was {lastPrice})</span>;
        } else if (currentRate < lastPrice) {
            return <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-0.5"><TrendingDown size={12} /> Rate decreased (was {lastPrice})</span>;
        } else {
            return <span className="text-[10px] text-slate-400 font-bold flex items-center gap-0.5"><Minus size={12} /> Same as last</span>;
        }
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
            const qty = parts[2] ? parts[2].replace(/,/g, '') : '0';
            const rate = parts[3] ? parts[3].replace(/,/g, '') : '0';
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
            } catch (e) {
                console.error("Invalid date parsed", e);
            }

            const foundItem = items.find(i => fuzzyMatch(i.name, itemName));
            const foundSupplier = suppliers.find(s => fuzzyMatch(s.name, supplierName));
            
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
            const optimisticPurchases: Purchase[] = [];

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
                
                optimisticPurchases.push({
                    id: purchaseId,
                    date: line.date,
                    itemId: line.itemId,
                    qty,
                    rate,
                    total,
                    supplierId: line.supplierId,
                    invoice
                });

                successCount++;
                totalCost += total;
                const sName = getSupplierName(line.supplierId);
                bySupplier[sName] = (bySupplier[sName] || 0) + total;
            });

            // Optimistic update
            setPurchases(prev => [...prev, ...optimisticPurchases]);

            if (pValues.length > 0) {
                await Promise.all([
                    sheetsService.append('Purchases!A1', pValues),
                    sheetsService.append('Batches!A1', bValues)
                ]);
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
            const optimisticPurchases: Purchase[] = [];

            validLines.forEach((line, idx) => {
                const qty = Number(line.qty);
                const rate = Number(line.rate);
                const total = qty * rate;
                const purchaseId = `PUR_${baseTs}_${idx}`;
                const batchId = `B_PUR_${baseTs}_${idx}`;
                
                pValues.push([purchaseId, form.date, line.itemId, qty, rate, total, form.supplierId, form.invoice]);
                bValues.push([batchId, line.itemId, form.date, qty, qty, rate, 'Purchase']);
                
                optimisticPurchases.push({
                    id: purchaseId,
                    date: form.date,
                    itemId: line.itemId,
                    qty,
                    rate,
                    total,
                    supplierId: form.supplierId,
                    invoice: form.invoice
                });
            });
            
            // Optimistic update
            setPurchases(prev => [...prev, ...optimisticPurchases]);

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
        { key: 'date', header: 'Date', cell: row => <span className="text-slate-500 dark:text-slate-400 font-mono text-xs">{row.date}</span>, sortable: true },
        { key: 'invoice', header: 'Invoice', cell: row => <span className="text-slate-700 dark:text-slate-300 font-mono text-xs">{row.invoice}</span>, sortable: true },
        { key: 'supplierId', header: 'Supplier', cell: row => <span className="font-semibold text-slate-700 dark:text-slate-200">{getSupplierName(row.supplierId)}</span>, sortable: true },
        { key: 'itemId', header: 'Item', cell: row => <span className="font-bold text-slate-900 dark:text-white">{getItemName(row.itemId)}</span>, sortable: true },
        { key: 'qty', header: 'Qty', align: 'right', cell: row => <span className="font-mono text-slate-700 dark:text-slate-300">{row.qty}</span>, sortable: true },
        { key: 'rate', header: 'Rate (Rs)', align: 'right', cell: row => <span className="font-mono text-slate-500 dark:text-slate-400">{Number(row.rate).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>, sortable: true },
        { key: 'total', header: 'Total (Rs)', align: 'right', cell: row => <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{Number(row.total).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>, sortable: true }
    ];

    const supplierOptions = activeSuppliers.map(s => ({ value: s.id, label: s.name }));
    const itemOptions = activeItems.map(i => ({ value: i.id, label: i.name }));

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight dark:text-white">Purchase Ledger</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Track incoming stock and procurement costs.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleOpenAdd}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium shadow-md hover:bg-emerald-700 transition-all"
                  >
                    <Plus size={16} /> New Purchase
                  </button>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 dark:bg-slate-900 dark:border-slate-800">
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
                    onExportPDF={(filteredData, activeColumns) => {
                        const headers = activeColumns.map(c => typeof c.header === 'string' ? c.header : c.key);
                        const rows = filteredData.map(p => 
                            activeColumns.map(c => {
                                switch (c.key) {
                                    case 'date': return p.date;
                                    case 'invoice': return p.invoice;
                                    case 'supplierId': return getSupplierName(p.supplierId);
                                    case 'itemId': return getItemName(p.itemId);
                                    case 'qty': return p.qty;
                                    case 'rate': return Number(p.rate).toFixed(2);
                                    case 'total': return Number(p.total).toFixed(2);
                                    default: return '';
                                }
                            })
                        );
                        exportTableToPDF(headers, rows, 'Purchases Ledger', 'purchases');
                    }}
                    onExportExcel={(filteredData, activeColumns) => {
                        const headers = activeColumns.map(c => typeof c.header === 'string' ? c.header : c.key);
                        const rows = filteredData.map(p => 
                            activeColumns.map(c => {
                                switch (c.key) {
                                    case 'date': return p.date;
                                    case 'invoice': return p.invoice;
                                    case 'supplierId': return getSupplierName(p.supplierId);
                                    case 'itemId': return getItemName(p.itemId);
                                    case 'qty': return Number(p.qty);
                                    case 'rate': return Number(p.rate);
                                    case 'total': return Number(p.total);
                                    default: return '';
                                }
                            })
                        );
                        exportTableToExcel(headers, rows, 'Purchases', 'purchases');
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
                            className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800"
                        >
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 dark:bg-slate-950/50 dark:border-slate-800">
                                <div>
                                  <h3 className="font-bold text-slate-900 dark:text-white">Bulk Purchase Entry</h3>
                                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider dark:text-slate-400">Log up to 10 items per voucher</p>
                                </div>
                                <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 p-1 dark:hover:text-slate-300">
                                  <Plus className="rotate-45" size={24} />
                                </button>
                            </div>
                            <div className="px-6 pt-4 border-b border-slate-100 flex gap-4 dark:border-slate-800">
                                <button 
                                    onClick={() => setActiveTab('form')}
                                    className={cn("pb-3 text-sm font-bold border-b-2 transition-all", activeTab === 'form' ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300")}
                                >
                                    Manual Entry
                                </button>
                                <button 
                                    onClick={() => setActiveTab('bulk')}
                                    className={cn("pb-3 text-sm font-bold border-b-2 transition-all", activeTab === 'bulk' ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300")}
                                >
                                    Bulk Import from Text
                                </button>
                            </div>
                            {activeTab === 'form' ? (
                                <>
                                    <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider dark:text-slate-500">Purchase Date</label>
                                                <div className="relative">
                                                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                <input type="date" className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" 
                                                    value={form.date} onChange={e => setForm({...form, date: e.target.value})}
                                                />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5 z-50">
                                                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider dark:text-slate-500">Supplier</label>
                                                <Select
                                                    options={supplierOptions}
                                                    value={supplierOptions.find(o => o.value === form.supplierId) || null}
                                                    onChange={(selected: any) => setForm({...form, supplierId: selected?.value || ''})}
                                                    styles={selectStyles}
                                                    placeholder="-- Choose Supplier --"
                                                    isClearable
                                                    menuPortalTarget={document.body}
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider dark:text-slate-500">Invoice / GRN #</label>
                                                <div className="relative">
                                                <Receipt size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                <input type="text" className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" placeholder="ID-001"
                                                    value={form.invoice} onChange={e => setForm({...form, invoice: e.target.value})}
                                                />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center bg-slate-100 p-2 rounded-lg dark:bg-slate-800">
                                                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider dark:text-slate-400">Purchase Items</label>
                                                <button onClick={addLine} disabled={form.lines.length >= 10} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-white px-3 py-1 rounded-md shadow-sm dark:bg-slate-900 dark:text-emerald-400 dark:hover:text-emerald-300">
                                                    <Plus size={14} /> Add Line
                                                </button>
                                            </div>
                                            
                                            <div className="space-y-3 pb-24">
                                                {form.lines.map((line, idx) => (
                                                    <div key={idx} className="relative flex flex-col sm:grid sm:grid-cols-12 gap-3 items-start animate-in slide-in-from-right-2 duration-200 bg-slate-50/50 p-3 pt-6 sm:p-3 sm:pt-3 rounded-xl border border-slate-100 dark:bg-slate-800/30 dark:border-slate-800">
                                                        <button onClick={() => removeLine(idx)} className="absolute right-1 top-1 sm:hidden p-2 text-slate-400 hover:text-red-500 transition-colors">
                                                            <Plus className="rotate-45" size={18} />
                                                        </button>
                                                        <div className="w-full sm:col-span-5 space-y-1">
                                                            <label className="text-[8px] uppercase font-bold text-slate-400 ml-1 dark:text-slate-500">Item</label>
                                                            <Select
                                                                options={itemOptions}
                                                                value={itemOptions.find(o => o.value === line.itemId) || null}
                                                                onChange={(selected: any) => updateLine(idx, 'itemId', selected?.value || '')}
                                                                styles={selectStyles}
                                                                placeholder="-- Select Item --"
                                                                isClearable
                                                                menuPortalTarget={document.body}
                                                            />
                                                            {line.itemId && (
                                                                <p className="text-[10px] text-slate-500 font-medium ml-1 mt-1 dark:text-slate-400">
                                                                    Stock limit available: <span className="font-bold text-slate-700 dark:text-slate-300">{(stockLevels[line.itemId] || 0).toFixed(2)}</span>
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="grid grid-cols-2 sm:flex sm:gap-2 w-full sm:col-span-7 items-end gap-2">
                                                            <div className="space-y-1">
                                                                <label className="text-[8px] uppercase font-bold text-slate-400 ml-1 dark:text-slate-500">Quantity</label>
                                                                <input type="number" 
                                                                    min="0"
                                                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                                                                    placeholder="0.0"
                                                                    value={line.qty} onChange={e => {
                                                                        const val = e.target.value;
                                                                        if (val.includes('-') || Number(val) < 0) return;
                                                                        updateLine(idx, 'qty', val)
                                                                    }}
                                                                />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-[8px] uppercase font-bold text-slate-400 ml-1 dark:text-slate-500">Rate (Rs.)</label>
                                                                <input type="number" 
                                                                    min="0"
                                                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                                                                    placeholder="0"
                                                                    value={line.rate} onChange={e => {
                                                                        const val = e.target.value;
                                                                        if (val.includes('-') || Number(val) < 0) return;
                                                                        updateLine(idx, 'rate', val)
                                                                    }}
                                                                />
                                                            </div>
                                                            <div className="col-span-2 sm:col-span-1 sm:flex-1 space-y-1">
                                                                <label className="text-[8px] uppercase font-bold text-slate-400 ml-1 text-emerald-600 dark:text-emerald-500">Total</label>
                                                                <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 min-h-[38px] flex items-center overflow-hidden dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300">
                                                                    <span className="truncate">{line.qty && line.rate ? (Number(line.qty) * Number(line.rate)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00'}</span>
                                                                </div>
                                                            </div>
                                                            <div className="hidden sm:block flex-none pb-1">
                                                                <button onClick={() => removeLine(idx)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                                                                    <Plus className="rotate-45" size={20} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="col-span-2 sm:hidden">
                                                            {line.itemId && line.rate && (
                                                                <div className="ml-1 text-xs">
                                                                    {getRateIndicator(line.itemId, line.rate)}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="hidden sm:block sm:col-span-12 mt-[-10px]">
                                                            {line.itemId && line.rate && (
                                                                <div className="ml-[42%] text-xs">
                                                                    {getRateIndicator(line.itemId, line.rate)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-6 bg-white border-t border-slate-100 flex justify-between items-center dark:bg-slate-900 dark:border-slate-800">
                                        <div className="text-sm font-bold text-slate-500 uppercase tracking-tight dark:text-slate-400">
                                            Total Value: <span className="text-emerald-600 font-mono tracking-tighter ml-2 dark:text-emerald-400">
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
                                                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-400">
                                                     <tr>
                                                         <th className="px-4 py-3 rounded-tl-lg text-slate-500 dark:text-slate-400">Date</th>
                                                         <th className="px-4 py-3 border-x dark:border-slate-800 dark:text-slate-400">Supplier</th>
                                                         <th className="px-4 py-3 dark:text-slate-400">Item</th>
                                                         <th className="px-4 py-3 text-right dark:text-slate-400">Qty</th>
                                                         <th className="px-4 py-3 text-right dark:text-slate-400">Rate</th>
                                                         <th className="px-4 py-3 text-right dark:text-slate-400">Total</th>
                                                         <th className="px-4 py-3 text-center dark:text-slate-400">Warnings</th>
                                                         <th className="px-4 py-3 w-10 border-l rounded-tr-lg dark:border-slate-800 dark:text-slate-400"></th>
                                                     </tr>
                                                 </thead>
                                                 <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                                                     {bulkPreview.map((line, idx) => {
                                                         const missingItem = !line.itemId;
                                                         const missingSupplier = !line.supplierId;
                                                         const isZeroQty = parseFloat(line.qty) <= 0;
                                                         const hasError = missingItem || missingSupplier || isZeroQty || line.isDuplicate;
                                                         return (
                                                             <tr key={line.id} className={cn(hasError && "bg-red-50/50 dark:bg-red-950/10")}>
                                                                 <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap dark:text-slate-400">{line.date}</td>
                                                                 <td className="px-4 py-3 font-semibold text-indigo-600 border-x dark:border-slate-800 dark:text-indigo-400">
                                                                     {!missingSupplier ? line.supplierName : <span className="text-red-500 text-xs flex items-center gap-1 dark:text-red-400"><AlertTriangle size={12}/> Match Not Found ({line.supplierName})</span>}
                                                                 </td>
                                                                 <td className="px-4 py-3 text-slate-900 font-medium dark:text-white">
                                                                     {!missingItem ? line.itemName : <span className="text-red-500 text-xs flex items-center gap-1 dark:text-red-400"><AlertTriangle size={12}/> Match Not Found ({line.itemName})</span>}
                                                                 </td>
                                                                 <td className="px-4 py-3 text-right text-slate-700 font-mono dark:text-slate-300">
                                                                     <input 
                                                                         type="number" 
                                                                         min="0"
                                                                         className={cn("w-20 px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-inset font-mono dark:bg-slate-800", isZeroQty ? "text-red-600 focus:ring-red-500 bg-red-50/30 dark:bg-red-950/40" : "focus:ring-emerald-500 dark:text-slate-200")}
                                                                         value={line.qty} 
                                                                         onChange={e => {
                                                                             const val = e.target.value;
                                                                             if (val.includes('-') || (val !== '' && Number(val) < 0)) return;
                                                                             const newPreview = [...bulkPreview];
                                                                             newPreview[idx].qty = val;
                                                                             setBulkPreview(newPreview);
                                                                         }}
                                                                     />
                                                                 </td>
                                                                 <td className="px-4 py-3 text-right text-slate-700 font-mono whitespace-nowrap dark:text-slate-300">
                                                                     <div className="flex flex-col items-end">
                                                                         <input 
                                                                             type="number" 
                                                                             min="0"
                                                                             className={cn("w-24 px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-inset font-mono dark:bg-slate-800", isZeroQty ? "text-red-600 focus:ring-red-500 bg-red-50/30 dark:bg-red-950/40" : "focus:ring-emerald-500 dark:text-slate-200")}
                                                                             value={line.rate} 
                                                                             onChange={e => {
                                                                                 const val = e.target.value;
                                                                                 if (val.includes('-') || (val !== '' && Number(val) < 0)) return;
                                                                                 const newPreview = [...bulkPreview];
                                                                                 newPreview[idx].rate = val;
                                                                                 setBulkPreview(newPreview);
                                                                             }}
                                                                         />
                                                                         {!missingItem && line.rate ? (
                                                                             <div className="mt-1 flex justify-end">
                                                                                 {getRateIndicator(line.itemId, line.rate)}
                                                                             </div>
                                                                         ) : null}
                                                                     </div>
                                                                 </td>
                                                                 <td className="px-4 py-3 text-right font-bold text-slate-900 font-mono whitespace-nowrap dark:text-white">
                                                                     {(parseFloat(line.qty) * parseFloat(line.rate) || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2})}
                                                                 </td>
                                                                 <td className="px-2 py-3 text-center">
                                                                     {line.isDuplicate && (
                                                                         <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30">
                                                                             <AlertTriangle size={12} />
                                                                             Duplicate Exists
                                                                         </span>
                                                                     )}
                                                                 </td>
                                                                 <td className="px-4 py-2 text-center border-l dark:border-slate-800">
                                                                     <button 
                                                                         onClick={() => setBulkPreview(bulkPreview.filter(l => l.id !== line.id))}
                                                                         className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors"
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
                                     <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-between items-center flex-wrap gap-4 rounded-b-lg dark:bg-slate-950/30 dark:border-slate-800">
                                         <div className="text-sm font-bold text-slate-500 uppercase tracking-tight dark:text-slate-400">
                                             Grand Total: <span className="text-emerald-600 font-mono tracking-tighter ml-2 dark:text-emerald-400">
                                                 Rs. {bulkPreview.reduce((sum, l) => sum + ((parseFloat(l.qty) * parseFloat(l.rate)) || 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                             </span>
                                         </div>
                                         <div className="flex gap-3">
                                             <button onClick={() => setBulkPreview(null)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors dark:text-slate-400 dark:hover:bg-slate-800">
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
                                 <div className="p-12 flex flex-col items-center justify-center text-center space-y-6 dark:bg-slate-900">
                                     <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-2 dark:bg-emerald-950/30 dark:text-emerald-400">
                                         <CheckCircle2 size={40} />
                                     </div>
                                     <div>
                                         <h3 className="text-2xl font-bold text-slate-900 mb-2 dark:text-white">Import Complete</h3>
                                         <p className="text-slate-500 dark:text-slate-400">Successfully logged {bulkSummary.successCount} purchases.</p>
                                     </div>
                                     <button onClick={() => setIsAdding(false)} className="px-8 py-3 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition-colors shadow-lg dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100">
                                         Done
                                     </button>
                                 </div>
                             ) : (
                                 <div className="p-6 space-y-6">
                                     <div className="space-y-2">
                                         <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Paste Data from Excel/Sheets</label>
                                         <p className="text-xs text-slate-500 dark:text-slate-500">Format: Date (tab) Item (tab) Qty (tab) Rate (tab) Total (tab) Supplier</p>
                                         <textarea
                                             className="w-full h-64 p-4 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:outline-none resize-none whitespace-pre dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                                             placeholder="5/2/2026&#9;Tandoori Masala 1kg Shaan&#9;5&#9;1550&#9;7750&#9;A. Rehman KHI"
                                             value={bulkText}
                                             onChange={e => setBulkText(e.target.value)}
                                         />
                                     </div>
                                     <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
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
