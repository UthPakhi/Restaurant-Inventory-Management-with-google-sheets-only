import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Filter, Download, FileText, ArrowRightLeft, Utensils, Calendar, Package, Loader2, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { sheetsService } from '../services/sheetsService';
import { mapRowToItem, mapRowToDepartment, mapRowToIssue, mapRowToBatch } from '../services/dataMappers';
import { Item, Department, Issue, Batch } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn, parseFinancialNumber } from '../lib/utils';
import { useAppLookup } from '../context/AppContext';
import { DataTable, Column } from './DataTable';
import { normalize, fuzzyMatch } from '../lib/stringUtils';
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

export const IssuesView: React.FC = () => {
    const [issues, setIssues] = useState<Issue[]>([]);
    const { items, departments: depts, activeItems, activeDepartments, loadingStaticData } = useAppLookup();
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [activeTab, setActiveTab] = useState<'form' | 'bulk'>('form');
    const [bulkText, setBulkText] = useState('');
    const [bulkPreview, setBulkPreview] = useState<any[] | null>(null);
    const [bulkSummary, setBulkSummary] = useState<any | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'pivot' | 'itemSummary'>('list');
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
                const getPriority = (batch: any) => {
                    if (batch.id?.startsWith('B_OPEN_') || batch.source === 'Opening') return 0;
                    if (batch.id?.startsWith('B_REV_') || batch.source?.startsWith('Reversal')) return 1;
                    return 2;
                };
                
                const pA = getPriority(a);
                const pB = getPriority(b);
                
                if (pA !== pB) return pA - pB;

                // Robust date parsing for FIFO sorting
                const dateA = a.date ? new Date(a.date).getTime() : 0;
                const dateB = b.date ? new Date(b.date).getTime() : 0;
                return (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
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
            
            // Optimistic update
            const newIssues: Issue[] = issuesToPost.map((i, idx) => ({
                id: `ISS_TMP_${Date.now()}_${idx}`,
                date: i.date,
                itemId: i.itemId,
                qty: i.qty,
                total: calculateFIFOTotal(i.itemId, i.qty),
                rate: calculateFIFOTotal(i.itemId, i.qty) / i.qty,
                deptId: i.deptId
            }));
            setIssues(prev => [...prev, ...newIssues]);

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
            await fetchData(); // Rollback optimistic update
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
            // Optimistic updates
            const newIssues: Issue[] = bulkPreview!.map((l: any, idx: number) => ({
                id: `ISS_TMP_BULK_${Date.now()}_${idx}`,
                date: l.date,
                itemId: l.itemId,
                qty: Number(l.qty),
                total: calculateFIFOTotal(l.itemId, l.qty),
                rate: calculateFIFOTotal(l.itemId, l.qty) / Number(l.qty),
                deptId: l.deptId
            }));
            setIssues(prev => [...prev, ...newIssues]);

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
            await fetchData(); // Rollback optimistic update
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
            // Optimistic update
            const newIssue: Issue = {
                id: `REV_${issue.id}`,
                date: issue.date,
                itemId: issue.itemId,
                qty: -issue.qty,
                rate: issue.rate,
                total: -issue.total,
                deptId: issue.deptId
            };
            setIssues(prev => [newIssue, ...prev]);

            const res = await sheetsService.reverseIssue(issue);
            toast.success('Issue successfully reversed. Stock restored.');
            await fetchData();
        } catch (e: any) {
            console.error('Reversal failed:', e);
            toast.error(e.message || "Failed to reverse issue. Check your connection or sheet permissions.");
            await fetchData(); // Rollback on error
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
            cell: (row) => <span className="font-bold text-slate-900 dark:text-white">{getItemName(row.itemId)}</span>,
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
            key: 'rate',
            header: 'Unit Rate (Rs)',
            align: 'right',
            cell: (row) => <span className="font-medium text-slate-600 font-mono tracking-tighter dark:text-slate-300">
                {row.rate ? Number(row.rate).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2}) : '0.00'}
            </span>,
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
            cell: (row) => {
                const isReversed = issues.some(i => i.id === `REV_${row.id}`) || batches.some(b => b.source === `Reversal of ${row.id}`);
                return (
                <div className="flex justify-end">
                    {row.qty > 0 && !row.id.startsWith('REV_') && !isReversed && (
                        <button 
                            id={`reverse-issue-${row.id}`}
                            onClick={() => handleReverseIssue(row)}
                            className="px-2 py-1 bg-rose-50 text-rose-600 rounded text-[10px] font-bold uppercase hover:bg-rose-100 transition-colors"
                        >
                            Reverse
                        </button>
                    )}
                    {isReversed && (
                        <span className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">Reversed</span>
                    )}
                </div>
            )}
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

    const itemSummaryData = React.useMemo(() => {
        const itemMap: Record<string, { qty: number, totalAmount: number, itemName: string }> = {};
        let grandTotal = 0;

        displayedIssues.forEach(issue => {
            const qty = Number(issue.qty) || 0;
            const amount = Number(issue.total) || 0;
            const itemId = issue.itemId;
            const itemName = getItemName(itemId);

            if (!itemMap[itemId]) {
                itemMap[itemId] = { qty: 0, totalAmount: 0, itemName };
            }
            itemMap[itemId].qty += qty;
            itemMap[itemId].totalAmount += amount;
            grandTotal += amount;
        });

        const rows = Object.keys(itemMap).map(itemId => {
            const data = itemMap[itemId];
            const avgRate = data.qty !== 0 ? data.totalAmount / data.qty : 0;
            const percentage = grandTotal > 0 ? (data.totalAmount / grandTotal) * 100 : 0;
            return {
                id: itemId,
                itemName: data.itemName,
                qty: data.qty,
                avgRate,
                totalAmount: data.totalAmount,
                percentage
            };
        }).filter(r => r.qty !== 0 || r.totalAmount !== 0).sort((a,b) => b.totalAmount - a.totalAmount);

        return { rows, grandTotal };
    }, [displayedIssues]);

    const itemSummaryColumns: Column<any>[] = [
        {
            key: 'itemName',
            header: 'Item',
            cell: (row) => <span className="font-bold text-slate-900 dark:text-white">{row.itemName}</span>,
            sortable: true
        },
        {
            key: 'qty',
            header: 'Total Qty',
            align: 'right',
            cell: (row) => <span className="font-bold text-slate-900 font-mono dark:text-white">{row.qty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits:2})}</span>,
            sortable: true
        },
        {
            key: 'avgRate',
            header: 'Avg Rate (Rs)',
            align: 'right',
            cell: (row) => <span className="text-slate-500 font-mono dark:text-slate-400">{row.avgRate.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2})}</span>,
            sortable: true
        },
        {
            key: 'totalAmount',
            header: 'Total Amount (Rs)',
            align: 'right',
            cell: (row) => <span className="font-bold text-slate-700 font-mono dark:text-slate-300">{row.totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2})}</span>,
            sortable: true
        },
        {
            key: 'percentage',
            header: '%',
            align: 'right',
            cell: (row) => <span className="text-blue-600 font-mono dark:text-blue-400">{row.percentage.toFixed(2)}%</span>,
            sortFn: (a, b) => a.percentage - b.percentage,
            sortable: true
        }
    ];

    // Format pivotData.dates into array of objects to satisfy DataTable's requirement extending Record<string,any>
    const mappedPivotDates = pivotData.dates.map(date => ({ date, id: date }));

    const deptOptions = activeDepartments.map(d => ({ value: d.id, label: d.name }));
    const itemOptions = filteredItems.map(i => ({ value: i.id, label: i.name }));

    const pivotTotals = React.useMemo(() => {
        const totals: Record<string, number> = {};
        let grandTotal = 0;
        mappedPivotDates.forEach(r => {
            pivotData.cols.forEach(col => {
                const val = pivotData.data[r.date][col] || 0;
                totals[col] = (totals[col] || 0) + val;
                grandTotal += val;
            });
        });
        return { totals, grandTotal };
    }, [mappedPivotDates, pivotData]);

    const pivotSummaryRow = (
        <tr>
            <td className="px-6 py-4 whitespace-nowrap" colSpan={2}>
                <span className="font-bold">GRAND TOTAL</span>
            </td>
            {pivotData.cols.map(col => (
               <td key={col} className="px-6 py-4 text-right">
                  <span className="font-mono">{pivotTotals.totals[col] > 0 ? pivotTotals.totals[col].toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2}) : '-'}</span>
               </td>
            ))}
            <td className="px-6 py-4 text-right font-black">
                <span className="font-mono text-emerald-700 dark:text-emerald-400">{pivotTotals.grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2})}</span>
            </td>
        </tr>
    );

    const listGrandTotal = React.useMemo(() => {
        return displayedIssues.reduce((sum, issue) => sum + (Number(issue.total) || 0), 0);
    }, [displayedIssues]);

    const listSummaryRow = (
        <tr>
            <td colSpan={5} className="px-6 py-4 whitespace-nowrap text-right">
                <span className="font-bold">SUBTOTAL OF ALL DAYS</span>
            </td>
            <td className="px-6 py-4 text-right font-black border-x border-emerald-200/50 dark:border-emerald-800/50">
               <span className="font-mono text-emerald-700 dark:text-emerald-400">{listGrandTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2})}</span>
            </td>
            <td className="px-6 py-4"></td>
        </tr>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight dark:text-white">Consumption Log</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Record and track inventory usage by department.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800 overflow-x-auto">
                      <button onClick={() => setViewMode('list')} className={cn("whitespace-nowrap px-4 py-1.5 text-xs font-bold rounded-lg transition-all", viewMode === 'list' ? "bg-white text-emerald-600 shadow-sm dark:bg-slate-800 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400")}>List View</button>
                      <button onClick={() => setViewMode('itemSummary')} className={cn("whitespace-nowrap px-4 py-1.5 text-xs font-bold rounded-lg transition-all", viewMode === 'itemSummary' ? "bg-white text-emerald-600 shadow-sm dark:bg-slate-800 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400")}>Item Wise</button>
                      <button onClick={() => setViewMode('pivot')} className={cn("whitespace-nowrap px-4 py-1.5 text-xs font-bold rounded-lg transition-all", viewMode === 'pivot' ? "bg-white text-emerald-600 shadow-sm dark:bg-slate-800 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400")}>Pivot View</button>
                  </div>
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
                        onExportPDF={(filteredData, activeColumns) => {
                            const headers = activeColumns.map(c => typeof c.header === 'string' ? c.header : c.key);
                            const rows = filteredData.map(i => 
                                activeColumns.map(c => {
                                    switch (c.key) {
                                        case 'date': return i.date;
                                        case 'deptId': return getDeptName(i.deptId);
                                        case 'itemId': return getItemName(i.itemId);
                                        case 'qty': return i.qty;
                                        case 'rate': return i.rate ? Number(i.rate).toFixed(2) : '0.00';
                                        case 'total': return i.total ? Number(i.total).toFixed(2) : '0.00';
                                        default: return '';
                                    }
                                })
                            );
                            exportTableToPDF(headers, rows, 'Consumption Log', 'consumption_log');
                        }}
                        onExportExcel={(filteredData, activeColumns) => {
                            const headers = activeColumns.map(c => typeof c.header === 'string' ? c.header : c.key);
                            const rows = filteredData.map(i => 
                                activeColumns.map(c => {
                                    switch (c.key) {
                                        case 'date': return i.date;
                                        case 'deptId': return getDeptName(i.deptId);
                                        case 'itemId': return getItemName(i.itemId);
                                        case 'qty': return i.qty;
                                        case 'rate': return i.rate ? Number(i.rate) : 0;
                                        case 'total': return i.total ? Number(i.total) : 0;
                                        default: return '';
                                    }
                                })
                            );
                            exportTableToExcel(headers, rows, 'Consumption', 'consumption_log');
                        }}
                        summaryRow={listSummaryRow}
                    />
                ) : viewMode === 'itemSummary' ? (
                    <>
                        <div className="mb-4 flex items-center justify-between p-4 bg-emerald-50 rounded-lg border border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/50">
                            <span className="text-sm font-bold text-emerald-800 dark:text-emerald-400">Total Consumption</span>
                            <span className="text-xl font-black text-emerald-700 dark:text-emerald-400 tracking-tight">
                                Rs {itemSummaryData.grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </span>
                        </div>
                        <DataTable 
                            data={itemSummaryData.rows}
                            columns={itemSummaryColumns}
                            loading={loading}
                            emptyMessage="No consumption records found in this period."
                            customSearch={(row, q) => row.itemName.toLowerCase().includes(q)}
                            onExportPDF={(filteredData, activeColumns) => {
                                const headers = activeColumns.map(c => typeof c.header === 'string' ? c.header : c.key);
                                const rows = filteredData.map(i => 
                                    activeColumns.map(c => {
                                        switch (c.key) {
                                            case 'itemName': return i.itemName;
                                            case 'qty': return i.qty.toFixed(2);
                                            case 'avgRate': return i.avgRate.toFixed(2);
                                            case 'totalAmount': return i.totalAmount.toFixed(2);
                                            case 'percentage': return i.percentage.toFixed(2) + '%';
                                            default: return '';
                                        }
                                    })
                                );
                                const totalsRow = activeColumns.map(c => {
                                    if (c.key === 'itemName') return 'GRAND TOTAL';
                                    if (c.key === 'totalAmount') return itemSummaryData.grandTotal.toFixed(2);
                                    if (c.key === 'percentage') return '100.00%';
                                    return '';
                                });
                                rows.push(totalsRow);
                                exportTableToPDF(headers, rows, 'Item Wise Consumption', 'item_wise_consumption');
                            }}
                            onExportExcel={(filteredData, activeColumns) => {
                                const headers = activeColumns.map(c => typeof c.header === 'string' ? c.header : c.key);
                                const rows = filteredData.map(i => 
                                    activeColumns.map(c => {
                                        switch (c.key) {
                                            case 'itemName': return i.itemName;
                                            case 'qty': return i.qty;
                                            case 'avgRate': return i.avgRate;
                                            case 'totalAmount': return i.totalAmount;
                                            case 'percentage': return i.percentage.toFixed(2) + '%';
                                            default: return '';
                                        }
                                    })
                                );
                                const totalsRow = activeColumns.map(c => {
                                    if (c.key === 'itemName') return 'GRAND TOTAL';
                                    if (c.key === 'totalAmount') return itemSummaryData.grandTotal;
                                    if (c.key === 'percentage') return '100.00%';
                                    return '';
                                });
                                rows.push(totalsRow);
                                exportTableToExcel(headers, rows, 'Item Wise', 'item_wise_consumption');
                            }}
                        />
                    </>
                ) : (
                    <DataTable 
                        data={mappedPivotDates}
                        columns={pivotColumns}
                        loading={loading}
                        emptyMessage="No consumption logs found."
                        onExportPDF={(filteredData, activeColumns) => {
                            const headers = activeColumns.map(c => typeof c.header === 'string' ? c.header : c.key);
                            const rows = filteredData.map(row => {
                                return activeColumns.map(c => {
                                    if (c.key === 'date') return row.date;
                                    if (c.key === 'day') return format(new Date(row.date as string), 'EEE');
                                    if (c.key === 'total') return pivotData.cols.reduce((sum, col) => sum + (pivotData.data[row.date as string][col] || 0), 0).toFixed(2);
                                    const val = pivotData.data[row.date as string][c.key] || 0;
                                    return val > 0 ? val.toFixed(2) : '-';
                                });
                            });
                            exportTableToPDF(headers, rows, 'Consumption Pivot', 'consumption_pivot');
                        }}
                        onExportExcel={(filteredData, activeColumns) => {
                            const headers = activeColumns.map(c => typeof c.header === 'string' ? c.header : c.key);
                            const rows = filteredData.map(row => {
                                return activeColumns.map(c => {
                                    if (c.key === 'date') return row.date;
                                    if (c.key === 'day') return format(new Date(row.date as string), 'EEE');
                                    if (c.key === 'total') return pivotData.cols.reduce((sum, col) => sum + (pivotData.data[row.date as string][col] || 0), 0);
                                    const val = pivotData.data[row.date as string][c.key] || 0;
                                    return val > 0 ? val : 0;
                                });
                            });
                            exportTableToExcel(headers, rows, 'Consumption Pivot', 'consumption_pivot');
                        }}
                        summaryRow={pivotSummaryRow}
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
                                            <div className="space-y-1.5 z-50">
                                                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider dark:text-slate-500">Department / Section</label>
                                                <Select
                                                      options={deptOptions}
                                                      value={deptOptions.find(o => o.value === form.deptId) || null}
                                                      onChange={(selected: any) => setForm({...form, deptId: selected?.value || ''})}
                                                      styles={selectStyles}
                                                      placeholder="-- Select Section --"
                                                      isClearable
                                                      menuPortalTarget={document.body}
                                                  />
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider text-emerald-600 dark:text-emerald-500">Line Items</label>
                                                <button onClick={addLine} disabled={form.lines.length >= 10} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded dark:bg-emerald-950/30 dark:text-emerald-400">
                                                    <Plus size={12} /> Add Item
                                                </button>
                                            </div>
                                            <div className="space-y-3 pb-24">
                                                {form.lines.map((line, idx) => (
                                                    <div key={idx} className="relative flex flex-col sm:grid sm:grid-cols-12 gap-3 items-start animate-in slide-in-from-left-2 duration-200 bg-slate-50/50 sm:bg-transparent p-3 pt-6 sm:p-0 rounded-xl sm:rounded-none border border-slate-100 sm:border-0 dark:bg-slate-800/30 sm:dark:bg-transparent dark:border-slate-800">
                                                        <button onClick={() => removeLine(idx)} className="absolute right-1 top-1 sm:hidden p-2 text-slate-400 hover:text-red-500 transition-colors">
                                                            <Plus className="rotate-45" size={18} />
                                                        </button>
                                                        <div className="w-full sm:col-span-6 space-y-1">
                                                            <Select
                                                                options={itemOptions}
                                                                value={itemOptions.find(o => o.value === line.itemId) || null}
                                                                onChange={(selected: any) => updateLine(idx, 'itemId', selected?.value || '')}
                                                                styles={selectStyles}
                                                                placeholder="-- Choose Item --"
                                                                isClearable
                                                                menuPortalTarget={document.body}
                                                            />
                                                            {line.itemId && (
                                                                <div className="flex justify-between px-1 mt-1">
                                                                    <span className="text-[10px] font-bold text-slate-500 italic dark:text-slate-400">
                                                                        Stock: <span className="text-slate-700 dark:text-slate-300">{(stockLevels[line.itemId] || 0).toFixed(2)}</span>
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-3 w-full sm:col-span-6 items-center">
                                                            <div className="flex-1 sm:w-auto">
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
                                                            <div className="flex-1 sm:w-20 text-right">
                                                                {line.itemId && line.qty ? (
                                                                    <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
                                                                        Rs {(calculateFIFOTotal(line.itemId, line.qty) || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2})}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                            <div className="hidden sm:block text-center mt-[-2px]">
                                                                <button onClick={() => removeLine(idx)} className="p-2 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400">
                                                                    <Plus className="rotate-45" size={18} />
                                                                </button>
                                                            </div>
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
