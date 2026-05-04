import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Filter, Download, ArrowRightLeft, Utensils, Calendar, Package, Loader2, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { sheetsService } from '../services/sheetsService';
import { mapRowToItem, mapRowToDepartment, mapRowToIssue, mapRowToBatch } from '../services/dataMappers';
import { Item, Department, Issue, Batch } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn, parseFinancialNumber } from '../lib/utils';
import { useAppLookup } from '../context/AppContext';
import { DataTable, Column } from './DataTable';
import { normalize, fuzzyMatch } from '../lib/stringUtils';

import { toast } from 'sonner';
export const IssuesView: React.FC = () => {
    const [issues, setIssues] = useState<Issue[]>([]);
    const { items, departments: depts, activeItems, activeDepartments, loadingStaticData } = useAppLookup();
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [activeTab, setActiveTab] = useState<'form' | 'bulk'>('form');
    const [bulkText, setBulkText] = useState('');
    const [bulkPreview, setBulkPreview] = useState<any[] | null>(null);
    const [bulkSummary, setBulkSummary] = useState<any | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'pivot'>('list');
    const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', dept: '', itemSearch: '' });

    const [form, setForm] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        deptId: '',
        lines: [{ itemId: '', qty: '' }]
    });

    const [stockLevels, setStockLevels] = useState<{ [key: string]: number }>({});
    const [batches, setBatches] = useState<Batch[]>([]);
    const [reversingIssue, setReversingIssue] = useState<Issue | null>(null);

    const fetchData = async () => {
        if (loadingStaticData) return;
        setLoading(true);
        try {
            const [iRows, bRows] = await Promise.all([
                sheetsService.getAllIssues(),
                sheetsService.getAllBatches()
            ]);
            setIssues((iRows || []).map(mapRowToIssue));
            const mappedBatches = (bRows || []).map(mapRowToBatch);
            setBatches(mappedBatches);
            
            // Calculate stock for all items
            const stocks: { [key: string]: number } = {};
            mappedBatches.forEach(b => {
                const id = String(b.itemId).trim();
                const qty = Number(b.remainingQty) || 0;
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
    const getDeptName = (id: string) => {
        const strId = String(id).trim();
        const found = depts.find(d => String(d.id).trim() === strId)?.name;
        if (found) return found;
        return strId.startsWith('DPT_') ? 'Deleted Dept' : strId;
    };

    const calculateFIFOTotal = (itemId: string, qtyStr: string | number) => {
        const qtyToIssue = parseFloat(String(qtyStr)) || 0;
        if (qtyToIssue <= 0 || !itemId) return 0;
        
        const itemBatches = [...batches]
            .filter(b => b.itemId === itemId && Number(b.remainingQty) > 0)
            .sort((a, b) => {
                // Robust date parsing for FIFO sorting
                const dateA = a.date ? new Date(a.date).getTime() : 0;
                const dateB = b.date ? new Date(b.date).getTime() : 0;
                
                if (dateA !== dateB) return (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
                
                // If dates are same, prioritize Opening sources
                const isOpA = a.source === 'Opening' || a.id?.startsWith('B_OPEN_');
                const isOpB = b.source === 'Opening' || b.id?.startsWith('B_OPEN_');
                if (isOpA && !isOpB) return -1;
                if (!isOpA && isOpB) return 1;
                
                return 0;
            });
            
        let remQty = qtyToIssue;
        let total = 0;
        for (const b of itemBatches) {
            if (remQty <= 0) break;
            const bRQty = Number(b.remainingQty) || 0;
            const bRate = Number(b.rate) || 0;
            const issueFromThis = Math.min(remQty, bRQty);
            total += issueFromThis * bRate;
            remQty -= issueFromThis;
        }
        return total;
    };

    const filteredItems = activeItems.filter(i => {
        if (!form.deptId) return true;
        const itemDeptIds = String(i.deptIds || '').split(',').map(s => s.trim()).filter(Boolean);
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
            const issuesToPost = validLines.map(l => ({
                itemId: l.itemId,
                qty: Number(l.qty),
                date: form.date,
                deptId: form.deptId,
                itemName: getItemName(l.itemId),
                deptName: getDeptName(form.deptId)
            }));

            const results = await sheetsService.bulkIssueFIFO(issuesToPost);
            
            const failed = results.filter((r: any) => !r.success);
            if (failed.length > 0) {
                toast.error(`Failed to post ${failed.length} items. Check stock levels.`);
            } else {
                toast.success(`Successfully posted ${results.length} items`);
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
            toast.error(e.message || "Failed to record issue.");
        } finally {
            setLoading(false);
        }
    };

    const handleBulkParse = () => {
        const lines = bulkText.split('\n').filter(l => l.trim().length > 0);
        const validLines = [];
        const errors = [];

        for (let i = 0; i < lines.length; i++) {
            const lineClean = lines[i].replace(/\r/g, ''); // Handle Windows line endings
            const row = lineClean.split('\t');
            if (row.length < 4) {
                errors.push(`Row ${i + 1}: Invalid format. Expected 4 columns (Date, Section, Item, Qty). Found ${row.length}.`);
                continue;
            }
            const [dateStr, deptNameStr, itemNameStr, qtyStr] = row;
            
            const foundDept = depts.find(d => fuzzyMatch(d.name, deptNameStr));
            if (!foundDept) {
                errors.push(`Row ${i + 1}: Section "${deptNameStr.trim()}" not found.`);
                continue;
            }

            const normItemInput = normalize(itemNameStr);
            
            // Try fuzzy match
            const foundItem = items.find(itm => fuzzyMatch(itm.name, itemNameStr));
            
            if (!foundItem) {
                // If it still fails, let's look for partial matches to help the user
                const partialMatches = items
                    .filter(itm => normalize(itm.name).includes(normItemInput) || normItemInput.includes(normalize(itm.name)))
                    .slice(0, 3)
                    .map(itm => itm.name);

                let errMsg = `Row ${i + 1}: Item "${itemNameStr.trim()}" not found.`;
                if (partialMatches.length > 0) {
                    errMsg += ` (Did you mean: ${partialMatches.join(', ')}?)`;
                }
                errors.push(errMsg);
                continue;
            }

            const qty = parseFloat(qtyStr.trim().replace(/,/g, ''));
            if (isNaN(qty) || qty <= 0) {
                errors.push(`Row ${i + 1}: Invalid Quantity "${qtyStr.trim()}"`);
                continue;
            }
            
            let formattedDate;
            try {
                const parsedDate = new Date(dateStr.trim());
                if (isNaN(parsedDate.getTime())) throw new Error();
                formattedDate = format(parsedDate, 'yyyy-MM-dd');
            } catch {
                errors.push(`Row ${i + 1}: Invalid Date format "${dateStr.trim()}". Use YYYY-MM-DD or MM/DD/YYYY.`);
                continue;
            }

            validLines.push({
                id: `line_${Date.now()}_${i}`,
                date: formattedDate,
                deptId: foundDept.id,
                itemId: foundItem.id,
                qty,
                deptName: foundDept.name,
                itemName: foundItem.name,
                stock: stockLevels[foundItem.id] || 0
            });
        }

        if (errors.length > 0) {
            // Log full errors to console for debugging
            console.error("Bulk Issue Errors:", errors);
            toast.error(
                <div className="space-y-1">
                    <p className="font-bold">Import failed for {errors.length} items:</p>
                    <ul className="text-[10px] list-disc list-inside max-h-32 overflow-auto">
                        {errors.map((e, idx) => <li key={idx}>{e}</li>)}
                    </ul>
                </div>, 
                { duration: 6000 }
            );
        }
        
        if (validLines.length > 0) {
            setBulkPreview(validLines);
            setIsAdding(false);
            if (errors.length === 0) {
                toast.success(`Successfully parsed ${validLines.length} items`);
            }
        }
    };

    const submitBulkPreview = async () => {
        setLoading(true);
        try {
            const results = await sheetsService.bulkIssueFIFO(bulkPreview!);
            
            let totalCost = 0;
            const bySection: Record<string, number> = {};
            let successCount = 0;
            const failedLines = [];

            results.forEach((res: any, idx: number) => {
                const line = bulkPreview![idx];
                if (res.success) {
                    totalCost += res.totalCost;
                    bySection[line.deptName] = (bySection[line.deptName] || 0) + res.totalCost;
                    successCount++;
                } else {
                    failedLines.push({ ...line, error: res.error });
                }
            });

            setBulkPreview(null);
            setBulkSummary({
                successCount,
                failedLines,
                totalCost,
                bySection
            });
            setBulkText('');
            fetchData();
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || "Bulk import failed.");
        } finally {
            setLoading(false);
        }
    };

    const handleReverseIssue = async (issue: Issue) => {
        if (issue.qty <= 0) {
            toast.error("This transaction is already a reversal.");
            return;
        }
        setReversingIssue(issue);
    };

    const confirmReversal = async () => {
        if (!reversingIssue) return;
        
        setLoading(true);
        const issue = reversingIssue;
        setReversingIssue(null);
        
        try {
            const res = await sheetsService.reverseIssue(issue);
            toast.success('Issue successfully reversed. Stock restored.');
            await fetchData();
        } catch (e: any) {
            console.error('Reversal failed:', e);
            toast.error(e.message || "Failed to reverse issue. Check your connection or sheet permissions.");
        } finally {
            setLoading(false);
        }
    };

    const displayedIssues = [...issues].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).filter(row => {
        const date = row.date;
        const deptId = row.deptId;
        const itemName = getItemName(row.itemId).toLowerCase();
        
        if (filters.dateFrom && new Date(date) < new Date(filters.dateFrom)) return false;
        if (filters.dateTo && new Date(date) > new Date(filters.dateTo)) return false;
        if (filters.dept && deptId !== filters.dept) return false;
        if (filters.itemSearch && !itemName.includes(filters.itemSearch.toLowerCase())) return false;
        return true;
    });

    const pivotData = React.useMemo(() => {
        const rows: Record<string, Record<string, number>> = {};
        const cols = new Set<string>();
        
        displayedIssues.forEach(issue => {
            const date = issue.date;
            const deptName = getDeptName(issue.deptId);
            const qty = Number(issue.qty) || 0;
            const rate = Number(issue.rate || 0) || 0;
            const amount = qty * rate;
            
            if (!rows[date]) rows[date] = {};
            rows[date][deptName] = (rows[date][deptName] || 0) + amount;
            cols.add(deptName);
        });
        
        return {
            dates: Object.keys(rows).sort((a,b) => new Date(b).getTime() - new Date(a).getTime()),
            cols: Array.from(cols).sort(),
            data: rows
        };
    }, [displayedIssues]);

    const listColumns: Column<Issue>[] = [
        {
            key: 'date',
            header: 'Date',
            cell: (row) => (
                <div className="flex items-center gap-2 text-slate-500 font-medium">
                   <Calendar size={14} />
                   {row.date}
                </div>
            ),
            sortable: true
        },
        {
            key: 'deptId',
            header: 'Department',
            cell: (row) => (
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold uppercase tracking-tight">
                  {getDeptName(row.deptId)}
                </span>
            ),
            sortable: true
        },
        {
            key: 'itemId',
            header: 'Item',
            cell: (row) => <span className="font-bold text-slate-900">{getItemName(row.itemId)}</span>,
            sortable: true
        },
        {
            key: 'qty',
            header: 'Qty Issued',
            align: 'right',
            cell: (row) => <span className="font-bold text-slate-900 font-mono tracking-tighter dark:text-white">{row.qty}</span>,
            sortable: true
        },
        {
            key: 'total',
            header: 'Total Amount (Rs)',
            align: 'right',
            cell: (row) => <span className="font-bold text-slate-500 font-mono tracking-tighter dark:text-slate-400">
                {row.total ? Number(row.total).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2}) : '0.00'}
            </span>,
            sortable: true
        },
        {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            cell: (row) => (
                <div className="flex justify-end">
                    {row.qty > 0 && (
                        <button 
                            id={`reverse-issue-${row.id}`}
                            onClick={() => handleReverseIssue(row)}
                            className="px-2 py-1 bg-rose-50 text-rose-600 rounded text-[10px] font-bold uppercase hover:bg-rose-100 transition-colors"
                        >
                            Reverse
                        </button>
                    )}
                </div>
            )
        }
    ];

    const pivotColumns: Column<any>[] = [
        { key: 'date', header: 'Date', cell: (row) => <span className="font-mono font-bold text-slate-600 dark:text-slate-400">{row.date}</span>, sortable: true },
        { key: 'day', header: 'Day', cell: (row) => <span className="font-medium text-slate-500 dark:text-slate-500">{format(new Date(row.date), 'EEE')}</span> },
        ...pivotData.cols.map(col => ({
            key: col,
            header: col,
            align: 'right' as const,
            sortable: true,
            sortFn: (a: any, b: any) => (pivotData.data[a.date][col] || 0) - (pivotData.data[b.date][col] || 0),
            cell: (row: any) => {
                const val = pivotData.data[row.date][col] || 0;
                return <span className="font-mono text-slate-700 dark:text-slate-300">{val > 0 ? val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</span>;
            }
        })),
        {
            key: 'total',
            header: 'TOTAL',
            align: 'right',
            sortable: true,
            sortFn: (a: any, b: any) => {
                const totalA = pivotData.cols.reduce((sum, col) => sum + (pivotData.data[a.date][col] || 0), 0);
                const totalB = pivotData.cols.reduce((sum, col) => sum + (pivotData.data[b.date][col] || 0), 0);
                return totalA - totalB;
            },
            cell: (row: any) => {
                const rowTotal = pivotData.cols.reduce((sum, col) => sum + (pivotData.data[row.date][col] || 0), 0);
                return <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{rowTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
            }
        }
    ];

    // Format pivotData.dates into array of objects to satisfy DataTable's requirement extending Record<string,any>
    const mappedPivotDates = pivotData.dates.map(date => ({ date, id: date }));

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight dark:text-white">Consumption Log</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Record and track inventory usage by department.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
                      <button onClick={() => setViewMode('list')} className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all", viewMode === 'list' ? "bg-white text-emerald-600 shadow-sm dark:bg-slate-800 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400")}>List View</button>
                      <button onClick={() => setViewMode('pivot')} className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all", viewMode === 'pivot' ? "bg-white text-emerald-600 shadow-sm dark:bg-slate-800 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400")}>Pivot View</button>
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium shadow-sm hover:bg-slate-50 transition-all dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
                    <Download size={14} className="text-slate-500 dark:text-slate-400" />
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

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 dark:bg-slate-900 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-4 mb-4 bg-slate-50 p-4 rounded-xl border border-slate-100 dark:bg-slate-950/50 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                        <Filter className="text-slate-400" size={16}/>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Filters</span>
                    </div>
                    
                    <select className="border border-slate-200 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" value={filters.dept} onChange={e => setFilters({...filters, dept: e.target.value})}>
                        <option value="">All Departments</option>
                        {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>

                    <div className="flex items-center gap-2">
                        <input type="date" className="border border-slate-200 rounded-md px-3 py-1.5 text-sm bg-white text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" value={filters.dateFrom} onChange={e => setFilters({...filters, dateFrom: e.target.value})} />
                        <span className="text-slate-400">to</span>
                        <input type="date" className="border border-slate-200 rounded-md px-3 py-1.5 text-sm bg-white text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" value={filters.dateTo} onChange={e => setFilters({...filters, dateTo: e.target.value})} />
                    </div>

                    {(filters.dept || filters.dateFrom || filters.dateTo) && (
                        <button onClick={() => setFilters({ dept: '', dateFrom: '', dateTo: '', itemSearch: '' })} className="text-xs text-red-500 hover:text-red-700 font-medium">
                            Clear Filters
                        </button>
                    )}
                </div>

                {viewMode === 'list' ? (
                    <DataTable 
                        data={displayedIssues}
                        columns={listColumns}
                        loading={loading}
                        emptyMessage="No consumption logs found."
                        customSearch={(row, q) => {
                            return row.date.toLowerCase().includes(q) ||
                                   getItemName(row.itemId).toLowerCase().includes(q) ||
                                   getDeptName(row.deptId).toLowerCase().includes(q);
                        }}
                    />
                ) : (
                    <DataTable 
                        data={mappedPivotDates}
                        columns={pivotColumns}
                        loading={loading}
                        emptyMessage="No consumption logs found."
                    />
                )}
            </div>

            <AnimatePresence>
                {reversingIssue && (
                    <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800"
                        >
                            <div className="p-6 text-center space-y-4">
                                <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-rose-950/30 dark:text-rose-400">
                                    <ArrowRightLeft size={32} />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Confirm Reversal</h3>
                                <div className="bg-slate-50 p-4 rounded-xl text-left border border-slate-100 space-y-2 dark:bg-slate-950/50 dark:border-slate-800">
                                   <div className="flex justify-between text-xs">
                                       <span className="text-slate-500 dark:text-slate-400">Item:</span>
                                       <span className="font-bold text-slate-900 dark:text-white">{getItemName(reversingIssue.itemId)}</span>
                                   </div>
                                   <div className="flex justify-between text-xs">
                                       <span className="text-slate-500 dark:text-slate-400">Quantity:</span>
                                       <span className="font-bold text-slate-900 dark:text-white">{reversingIssue.qty} {items.find(i => i.id === reversingIssue.itemId)?.unit}</span>
                                   </div>
                                   <div className="flex justify-between text-xs">
                                       <span className="text-slate-500 dark:text-slate-400">Department:</span>
                                       <span className="font-bold text-slate-900 dark:text-white">{getDeptName(reversingIssue.deptId)}</span>
                                   </div>
                                   <div className="flex justify-between text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
                                       <span className="text-slate-500 font-bold dark:text-slate-400">Total Amount:</span>
                                       <span className="font-bold text-rose-600 dark:text-rose-400">Rs {Number(reversingIssue.total).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                   </div>
                                </div>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    This will create a restoration entry in inventory and a negative consumption log to balance the records.
                                </p>
                            </div>
                            <div className="p-6 bg-slate-50 flex gap-3 border-t border-slate-100 dark:bg-slate-950/30 dark:border-slate-800">
                                <button 
                                    onClick={() => setReversingIssue(null)}
                                    className="flex-1 py-3 px-4 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={confirmReversal}
                                    className="flex-1 py-3 px-4 bg-rose-600 text-white rounded-xl font-bold shadow-lg shadow-rose-600/20 hover:bg-rose-700 transition-all flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Confirm Reverse'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {isAdding && (
                    <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800"
                        >
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 dark:bg-slate-950/50 dark:border-slate-800">
                                <div>
                                  <h3 className="font-bold text-slate-900 dark:text-white">Bulk Store Issue</h3>
                                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider dark:text-slate-400">Kitchen & Section Consumption</p>
                                </div>
                                <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 p-1 dark:hover:text-slate-300">
                                  <Plus className="rotate-45" size={24} />
                                </button>
                            </div>

                            <div className="px-6 pt-4 border-b border-slate-100 flex gap-4 dark:border-slate-800">
                                <button 
                                    onClick={() => setActiveTab('form')}
                                    className={cn("pb-3 text-sm font-bold border-b-2 transition-all", activeTab === 'form' ? "border-emerald-500 text-emerald-600 dark:text-emerald-500" : "border-transparent text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300")}
                                >
                                    Manual Entry
                                </button>
                                <button 
                                    onClick={() => setActiveTab('bulk')}
                                    className={cn("pb-3 text-sm font-bold border-b-2 transition-all", activeTab === 'bulk' ? "border-emerald-500 text-emerald-600 dark:text-emerald-500" : "border-transparent text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300")}
                                >
                                    Bulk Import (Text)
                                </button>
                            </div>

                            {activeTab === 'form' ? (
                                <>
                                    <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh]">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider dark:text-slate-500">Date</label>
                                                <div className="relative">
                                                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                  <input type="date" className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" 
                                                      value={form.date} onChange={e => setForm({...form, date: e.target.value})}
                                                  />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider dark:text-slate-500">Department / Section</label>
                                                <div className="relative">
                                                  <Utensils size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                  <select className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none appearance-none bg-no-repeat transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                                                      style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%23a1a1aa\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\' /%3E%3C/svg%3E")', backgroundPosition: 'right 0.75rem center', backgroundSize: '1rem' }}
                                                      value={form.deptId} onChange={e => setForm({...form, deptId: e.target.value})}
                                                  >
                                                      <option value="">-- Select Section --</option>
                                                      {activeDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                  </select>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider text-emerald-600 dark:text-emerald-500">Line Items</label>
                                                <button onClick={addLine} disabled={form.lines.length >= 10} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded dark:bg-emerald-950/30 dark:text-emerald-400">
                                                    <Plus size={12} /> Add Item
                                                </button>
                                            </div>
                                            <div className="space-y-3">
                                                {form.lines.map((line, idx) => (
                                                    <div key={idx} className="grid grid-cols-12 gap-3 items-start animate-in slide-in-from-left-2 duration-200">
                                                        <div className="col-span-6 space-y-1">
                                                            <select className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                                                                value={line.itemId} onChange={e => updateLine(idx, 'itemId', e.target.value)}
                                                            >
                                                                <option value="">-- Choose Item --</option>
                                                                {filteredItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                                            </select>
                                                            {line.itemId && (
                                                                <div className="flex justify-between px-1">
                                                                    <span className="text-[8px] font-bold text-slate-400 italic dark:text-slate-500">
                                                                        Stock: {(stockLevels[line.itemId] || 0).toFixed(2)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="col-span-3">
                                                            <input type="number" 
                                                                className={cn(
                                                                    "w-full px-3 py-2 bg-slate-50 border rounded-lg text-sm focus:ring-2 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200",
                                                                    line.qty && stockLevels[line.itemId] !== undefined && Number(line.qty) > stockLevels[line.itemId]
                                                                        ? "border-red-500 focus:ring-red-500/20 dark:border-red-900"
                                                                        : "border-slate-200 focus:ring-emerald-500/20 dark:border-slate-700"
                                                                )}
                                                                placeholder="Qty"
                                                                value={line.qty} onChange={e => updateLine(idx, 'qty', e.target.value)}
                                                            />
                                                        </div>
                                                        <div className="col-span-2 pt-2 text-right">
                                                            {line.itemId && line.qty ? (
                                                                <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
                                                                    Rs {(calculateFIFOTotal(line.itemId, line.qty) || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2})}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                        <div className="col-span-1 text-center">
                                                            <button onClick={() => removeLine(idx)} className="p-2 text-slate-300 hover:text-red-500 mt-0.5 dark:text-slate-600 dark:hover:text-red-400">
                                                                <Plus className="rotate-45" size={18} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-6 bg-slate-50 border-t border-slate-100 dark:bg-slate-950/30 dark:border-slate-800">
                                        <button
                                            onClick={handleSubmit} 
                                            disabled={loading || !form.deptId || form.lines.some(l => !l.itemId || !l.qty || (stockLevels[l.itemId] !== undefined && Number(l.qty) > stockLevels[l.itemId]))}
                                            className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold shadow-lg shadow-emerald-600/20 flex items-center justify-center transition-all hover:bg-emerald-700 disabled:bg-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                                        >
                                            {loading ? <Loader2 size={20} className="animate-spin" /> : `Post ${form.lines.filter(l => l.itemId && l.qty).length} Items`}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="p-6 space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider dark:text-slate-500">Paste Text (TSV Format)</label>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">Format strictly: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 dark:bg-slate-800 dark:text-slate-300">Date [tab] Section/Dept [tab] Item Name [tab] Qty</code></p>
                                            <textarea 
                                                className="w-full h-48 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all whitespace-pre dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                                                placeholder="5/1/2026&#9;Handi&#9;Oil Talo&#9;1&#10;5/1/2026&#9;Pizza&#9;Macaroni&#9;2"
                                                value={bulkText} onChange={e => setBulkText(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="p-6 bg-slate-50 border-t border-slate-100 dark:bg-slate-950/30 dark:border-slate-800">
                                        <button
                                            onClick={handleBulkParse} 
                                            disabled={loading || loadingStaticData || !bulkText.trim()}
                                            className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold shadow-lg shadow-emerald-600/20 flex items-center justify-center transition-all hover:bg-emerald-700 disabled:bg-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                                        >
                                            {loading || loadingStaticData ? <Loader2 size={20} className="animate-spin" /> : `Process Bulk Import`}
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </div>
                )}
                
                {bulkPreview && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-white rounded-xl shadow-xl w-full max-w-4xl flex flex-col max-h-[90vh] dark:bg-slate-900 dark:border dark:border-slate-800"
                        >
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center dark:border-slate-800">
                                <div>
                                    <h3 className="font-bold text-slate-900 text-lg dark:text-white">Confirm Bulk Issue</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Review {bulkPreview.length} item(s) before submitting.</p>
                                </div>
                                <button onClick={() => setBulkPreview(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors dark:hover:bg-slate-800 dark:text-slate-500">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto p-4 bg-slate-50/50 dark:bg-slate-950/20">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-950 dark:text-slate-400">
                                        <tr>
                                            <th className="px-4 py-3 rounded-tl-lg">Date</th>
                                            <th className="px-4 py-3">Section</th>
                                            <th className="px-4 py-3">Item</th>
                                            <th className="px-4 py-3 text-right">Stock</th>
                                            <th className="px-4 py-3 w-32 border-x whitespace-nowrap bg-white text-center dark:bg-slate-900 dark:border-slate-800">Issue Qty</th>
                                            <th className="px-4 py-3 text-right">Est. Total (Rs)</th>
                                            <th className="px-4 py-3 w-10 rounded-tr-lg"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                                        {(() => {
                                            const itemTotals: Record<string, number> = {};
                                            bulkPreview.forEach(l => {
                                                itemTotals[l.itemId] = (itemTotals[l.itemId] || 0) + (parseFloat(l.qty) || 0);
                                            });
                                            const hasGlobalError = bulkPreview.some(l => itemTotals[l.itemId] > l.stock);

                                            return bulkPreview.map((line, idx) => {
                                                const hasError = itemTotals[line.itemId] > line.stock;
                                                return (
                                                    <tr key={line.id} className={cn(hasError && "bg-red-50/50 dark:bg-red-950/20")}>
                                                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap dark:text-slate-400">{line.date}</td>
                                                        <td className="px-4 py-3 font-semibold text-indigo-600 whitespace-nowrap dark:text-indigo-400">{line.deptName}</td>
                                                        <td className="px-4 py-3 text-slate-900 font-medium dark:text-white">{line.itemName}</td>
                                                        <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-500">{line.stock.toFixed(2)}</td>
                                                        <td className="p-0 border-x relative dark:border-slate-800">
                                                            <input 
                                                                type="number" 
                                                                className={cn("w-full h-full px-4 py-3 text-center focus:outline-none focus:ring-2 focus:ring-inset font-bold dark:bg-slate-800", hasError ? "text-red-600 focus:ring-red-500 bg-red-50/30 dark:bg-red-950/40" : "focus:ring-emerald-500 dark:text-slate-200")}
                                                                value={line.qty} 
                                                                onChange={e => {
                                                                    const newPreview = [...bulkPreview];
                                                                    newPreview[idx].qty = parseFloat(e.target.value) || 0;
                                                                    setBulkPreview(newPreview);
                                                                }}
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-bold text-slate-700 dark:text-slate-300">
                                                            {line.qty ? (calculateFIFOTotal(line.itemId, line.qty) || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2}) : '-'}
                                                        </td>
                                                        <td className="px-4 py-2 text-center">
                                                            <button 
                                                                onClick={() => setBulkPreview(bulkPreview.filter(l => l.id !== line.id))}
                                                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors dark:text-slate-600 dark:hover:text-red-400 dark:hover:bg-red-950/30"
                                                                title="Remove Item"
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            });
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                             <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between dark:bg-slate-950/30 dark:border-slate-800">
                                <div className="text-sm font-medium">
                                    {(() => {
                                        const itemTotals: Record<string, number> = {};
                                        bulkPreview.forEach(l => {
                                            itemTotals[l.itemId] = (itemTotals[l.itemId] || 0) + (parseFloat(l.qty as string) || 0);
                                        });
                                        const hasGlobalError = bulkPreview.some(l => itemTotals[l.itemId] > l.stock);
                                        return hasGlobalError ? (
                                            <span className="text-red-600 flex items-center gap-1 dark:text-red-400"><AlertTriangle size={16}/> Warning: Some items cumulatively exceed available stock.</span>
                                        ) : (
                                            <span className="text-emerald-600 flex items-center gap-1 dark:text-emerald-400"><CheckCircle2 size={16}/> All items have sufficient stock.</span>
                                        );
                                    })()}
                                </div>
                                <div className="flex gap-3">
                                    <button 
                                        onClick={() => {
                                            setBulkPreview(null);
                                            setIsAdding(true);
                                        }} 
                                        className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors dark:text-slate-400 dark:hover:bg-slate-800"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={submitBulkPreview}
                                        disabled={loading || bulkPreview.length === 0 || (() => {
                                            const itemTotals: Record<string, number> = {};
                                            bulkPreview.forEach(l => {
                                                itemTotals[l.itemId] = (itemTotals[l.itemId] || 0) + (parseFloat(l.qty as string) || 0);
                                            });
                                            return bulkPreview.some(l => itemTotals[l.itemId] > l.stock);
                                        })()}
                                        className="px-6 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {loading ? <Loader2 size={16} className="animate-spin" /> : 'Confirm & Issue'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {bulkSummary && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col"
                        >
                            <div className="p-6 border-b border-slate-100 flex items-center gap-3">
                                <div className="p-2 bg-emerald-100 rounded-full text-emerald-600">
                                    <CheckCircle2 size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 text-lg">Import Complete</h3>
                                    <p className="text-sm text-slate-500">Successfully issued {bulkSummary.successCount} items.</p>
                                </div>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Total Worth Issued</p>
                                    <p className="text-2xl font-bold text-slate-900 text-emerald-600">Rs {bulkSummary.totalCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                                </div>
                                <div className="pt-4 border-t border-slate-100">
                                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-3">Issued By Section</p>
                                    <div className="space-y-2">
                                        {Object.entries(bulkSummary.bySection).map(([dept, cost]) => (
                                            <div key={dept} className="flex justify-between items-center text-sm">
                                                <span className="font-medium text-slate-700">{dept}</span>
                                                <span className="font-bold text-slate-900">Rs {(cost as number).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {bulkSummary.failedLines.length > 0 && (
                                    <div className="pt-4 border-t border-slate-100">
                                        <p className="text-[10px] uppercase font-bold text-red-500 tracking-wider mb-2 flex items-center gap-1"><AlertTriangle size={12}/> Failed to Issue ({bulkSummary.failedLines.length})</p>
                                        <div className="max-h-32 overflow-y-auto space-y-1 text-xs">
                                            {bulkSummary.failedLines.map((l: any, i: number) => (
                                                <div key={i} className="text-red-700 bg-red-50 p-2 rounded">
                                                    <strong>{l.itemName}</strong>: {l.error}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                                <button 
                                    onClick={() => setBulkSummary(null)}
                                    className="px-6 py-2 bg-slate-900 text-white text-sm font-bold rounded-lg shadow-lg hover:bg-slate-800 transition-all"
                                >
                                    Done
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
