import React, { useState, useEffect } from 'react';
import { LineChart as LineChartIcon, Upload, ArrowRight, Loader2, Search, FileText } from 'lucide-react';
import { sheetsService } from '../services/sheetsService';
import { cn } from '../lib/utils';
import { format, subDays } from 'date-fns';

export const VarianceReportView: React.FC = () => {
    const [loading, setLoading] = useState(false);
    
    const [rawItems, setRawItems] = useState<any[]>([]);
    const [recipes, setRecipes] = useState<any[]>([]);
    const [sales, setSales] = useState<any[]>([]);
    const [issues, setIssues] = useState<any[]>([]);
    
    // Date Filters
    const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    
    // UI State
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importText, setImportText] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const [itemsRow, recipesRow, salesRow, issuesRow] = await Promise.all([
                sheetsService.read('Masters_Items!A2:H'),
                sheetsService.read('Recipes!A2:C'),
                sheetsService.read('MenuSales!A2:D'),
                sheetsService.read('Issues!A2:G')
            ]);
            setRawItems(Array.isArray(itemsRow) ? itemsRow : []);
            setRecipes(Array.isArray(recipesRow) ? recipesRow : []);
            setSales(Array.isArray(salesRow) ? salesRow : []);
            setIssues(Array.isArray(issuesRow) ? issuesRow : []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const parseNum = (val: any) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        return parseFloat(val.toString().replace(/,/g, '')) || 0;
    };

    const handleImportSales = async () => {
        if (!importText.trim()) return;
        setLoading(true);
        try {
            const lines = importText.split('\n');
            const newSalesRows: any[][] = [];
            const importDate = format(new Date(), 'yyyy-MM-dd'); // Default to today or parse if found
            
            for (let line of lines) {
                if (!line.trim()) continue;
                
                // Try parsing the pattern: Qty > Item_Name (ID) Amount
                // Example: 5,288.00 > PISTA CHAI (255) 789,150.00
                // Or standard TSV from Excel
                const tabSplit = line.split('\t');
                if (tabSplit.length >= 2) {
                    // TSV format: ItemName Qty Amount
                    const name = tabSplit[0]?.trim();
                    const qty = parseNum(tabSplit[1]);
                    const amount = parseNum(tabSplit[2] || 0);
                    if (name && qty) {
                        newSalesRows.push([importDate, name, qty, amount]);
                    }
                } else if (line.includes('>')) {
                    // Custom PDF parse
                    const parts = line.split('>');
                    const qtyStr = parts[0].trim();
                    const qty = parseNum(qtyStr);
                    
                    const rest = parts[1].trim();
                    // usually rest is "PISTA CHAI (255)   789,150.00"
                    // Need to extract the amount from the end
                    const match = rest.match(/(.*?)\s+([\d,\.]+)$/);
                    if (match) {
                        let name = match[1].trim();
                        // Remove the (255) if present
                        name = name.replace(/\s*\(\d+\)$/, '').trim();
                        const amount = parseNum(match[2]);
                        newSalesRows.push([importDate, name, qty, amount]);
                    } else {
                        // Fallback
                        let name = rest;
                        name = name.replace(/\s*\(\d+\)$/, '').trim();
                        newSalesRows.push([importDate, name, qty, 0]);
                    }
                }
            }

            if (newSalesRows.length > 0) {
                await sheetsService.append('MenuSales!A:D', newSalesRows);
            }
            
            setImportText('');
            setIsImportOpen(false);
            await fetchData();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // Calculate Variance
    // 1. Filter sales and issues by date
    // 2. Compute Theoretical Consumption per Raw Item
    // 3. Compare with Actual Issues per Raw Item
    
    const filteredSales = sales.filter(s => {
        const d = s[0];
        return d >= startDate && d <= endDate;
    });

    const filteredIssues = issues.filter(i => {
        const d = i[1];
        return d >= startDate && d <= endDate;
    });

    // Compute Theoretical
    // key: rawItemId => value: theoretical qty
    const theoreticalMap: Record<string, number> = {};
    
    filteredSales.forEach(saleRow => {
        const menuItemName = saleRow[1];
        const qtySold = parseNum(saleRow[2]);
        
        // Find recipe for this menu item
        const recipeRows = recipes.filter(r => r[0] === menuItemName);
        recipeRows.forEach(r => {
            const rawItemId = r[1];
            const qtyPerPortion = parseNum(r[2]);
            if (!theoreticalMap[rawItemId]) theoreticalMap[rawItemId] = 0;
            theoreticalMap[rawItemId] += (qtySold * qtyPerPortion);
        });
    });

    // Compute Actual
    // key: rawItemId => value: actual qty issued
    const actualMap: Record<string, number> = {};
    filteredIssues.forEach(issueRow => {
        const rawItemId = issueRow[3];
        const qtyIssued = parseNum(issueRow[4]);
        if (!actualMap[rawItemId]) actualMap[rawItemId] = 0;
        actualMap[rawItemId] += qtyIssued;
    });

    // Build Report Array
    const reportData = rawItems.map(item => {
        const id = item[0];
        const name = item[1];
        const unit = item[3];
        const unitCost = parseNum(item[4]); // BuyPrice
        
        const theoQty = theoreticalMap[id] || 0;
        const actQty = actualMap[id] || 0;
        const varianceQty = theoQty - actQty; 
        // Note: theo - act. If variance is negative, we used MORE than theoretical (Unfavorable)
        // If variance is positive, we used LESS than theoretical (Favorable, or under-portioning)
        const varianceCost = varianceQty * unitCost;

        return {
            id, name, unit, unitCost, theoQty, actQty, varianceQty, varianceCost
        };
    }).filter(row => row.theoQty > 0 || row.actQty > 0)
      .sort((a, b) => a.varianceCost - b.varianceCost); // Sort by most negative cost (biggest loss) first

    const totalFavorable = reportData.filter(r => r.varianceCost > 0).reduce((s, r) => s + r.varianceCost, 0);
    const totalUnfavorable = reportData.filter(r => r.varianceCost < 0).reduce((s, r) => s + Math.abs(r.varianceCost), 0);
    const netVariance = totalFavorable - totalUnfavorable;

    return (
        <div className="space-y-6 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <LineChartIcon className="text-rose-500" />
                        Variance Report
                    </h2>
                    <p className="text-sm font-medium text-slate-500">Track Theoretical vs Actual Consumption to uncover food waste and theft.</p>
                </div>
                
                <button 
                    onClick={() => setIsImportOpen(!isImportOpen)}
                    className="px-4 py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20 active:scale-[0.98]"
                >
                    <Upload size={16} />
                    Import Sales Data
                </button>
            </div>

            {isImportOpen && (
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-slate-900 flex items-center gap-2"><FileText size={18} className="text-indigo-500" /> Paste POS Sales Log</h3>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Lines format: Qty {'>'} Item Name Amount</p>
                    </div>
                    <textarea 
                        value={importText}
                        onChange={e => setImportText(e.target.value)}
                        placeholder={'Example:\n5288 > PISTA CHAI 789150\n4686 > CHAPATI 138720'}
                        className="w-full h-48 p-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono bg-slate-50"
                    />
                    <div className="flex justify-end gap-2">
                        <button 
                            onClick={() => setIsImportOpen(false)}
                            className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleImportSales}
                            disabled={loading || !importText.trim()}
                            className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {loading && <Loader2 className="animate-spin" size={16} />}
                            Process & Save
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Start Date</label>
                        <input 
                            type="date" 
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-rose-500 outline-none"
                        />
                    </div>
                    <ArrowRight size={14} className="text-slate-300" />
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">End Date</label>
                        <input 
                            type="date" 
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-rose-500 outline-none"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-b border-slate-100 py-6">
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unfavorable Variance (Loss)</p>
                        <p className="text-3xl font-bold text-rose-500 tracking-tight">Rs. {totalUnfavorable.toLocaleString()}</p>
                        <p className="text-xs font-medium text-slate-500">Over-portioning, waste, or theft</p>
                    </div>
                    <div className="space-y-1 border-l border-slate-100 pl-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Favorable Variance</p>
                        <p className="text-3xl font-bold text-emerald-500 tracking-tight">Rs. {totalFavorable.toLocaleString()}</p>
                        <p className="text-xs font-medium text-slate-500">Under-portioning, unrecorded issues</p>
                    </div>
                    <div className="space-y-1 border-l border-slate-100 pl-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Net Variance Impact</p>
                        <p className={cn("text-3xl font-bold tracking-tight", netVariance < 0 ? 'text-rose-600' : 'text-slate-900')}>
                            {netVariance < 0 ? '-' : '+'}Rs. {Math.abs(netVariance).toLocaleString()}
                        </p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b-2 border-slate-100">
                                <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Raw Ingredient</th>
                                <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Theoretical<br/><span className="text-[10px] text-slate-400 font-medium">(Should Use)</span></th>
                                <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actual<br/><span className="text-[10px] text-slate-400 font-medium">(Issued)</span></th>
                                <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Variance Qty</th>
                                <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Variance Cost</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && reportData.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-slate-400">
                                        <Loader2 className="animate-spin mx-auto" />
                                    </td>
                                </tr>
                            ) : reportData.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-sm font-bold text-slate-400">
                                        No variance data found for this period. Ensure recipes are set up and sales/issues are recorded.
                                    </td>
                                </tr>
                            ) : (
                                reportData.map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-3 px-4">
                                            <div className="font-bold text-slate-800">{row.name}</div>
                                            <div className="text-[10px] font-bold text-slate-400">UNIT: {row.unit} &middot; COST: Rs.{row.unitCost}</div>
                                        </td>
                                        <td className="py-3 px-4 text-right font-medium text-slate-600">{row.theoQty.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                                        <td className="py-3 px-4 text-right font-bold text-slate-900">{row.actQty.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                                        <td className="py-3 px-4 text-right">
                                            <span className={cn(
                                                "px-2 py-1 rounded-md text-xs font-bold",
                                                row.varianceQty < 0 ? "bg-rose-100 text-rose-700" : 
                                                row.varianceQty > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                                            )}>
                                                {row.varianceQty > 0 ? '+' : ''}{row.varianceQty.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <span className={cn(
                                                "font-bold",
                                                row.varianceCost < 0 ? "text-rose-600" : 
                                                row.varianceCost > 0 ? "text-emerald-600" : "text-slate-500"
                                            )}>
                                                Rs. {row.varianceCost.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
