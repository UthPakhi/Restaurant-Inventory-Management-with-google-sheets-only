import React, { useState, useEffect, useMemo } from 'react';
import { sheetsService } from '../services/sheetsService';
import { mapRowToBatch, mapRowToIssue } from '../services/dataMappers';
import { Batch, Issue } from '../types';
import { motion } from 'motion/react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isBefore, isSameDay, parseISO, startOfDay, getYear, getMonth, set } from 'date-fns';
import { Loader2, Calendar, FileText, Download, Package } from 'lucide-react';
import { cn, parseFinancialNumber } from '../lib/utils';
import { useAppLookup } from '../context/AppContext';

export const StoreLedgerView: React.FC = () => {
    const [batches, setBatches] = useState<Batch[]>([]);
    const [issues, setIssues] = useState<Issue[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
    const [selectedItem, setSelectedItem] = useState<string>('all');
    
    const { items: allItems } = useAppLookup();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [bRows, iRows] = await Promise.all([
                sheetsService.read('Batches!A2:H'),
                sheetsService.read('Issues!A2:G')
            ]);
            setBatches((bRows || []).map(mapRowToBatch));
            setIssues((iRows || []).map(mapRowToIssue));
        } catch (e) {
            console.error('Failure fetching store ledger data', e);
        } finally {
            setLoading(false);
        }
    };

    const ledgerData = useMemo(() => {
        if (!batches.length && !issues.length) return { initialBalance: 0, closingBalance: 0, ledgerDays: [] };

        const [yearStr, monthStr] = selectedMonth.split('-');
        const monthStart = startOfMonth(set(new Date(), { year: parseInt(yearStr), month: parseInt(monthStr) - 1, date: 1 }));
        const monthEnd = endOfMonth(monthStart);
        
        let initialBalance = 0;

        // Calculate initial balance (all transactions before monthStart)
        batches.forEach(b => {
             if (selectedItem !== 'all' && b.itemId !== selectedItem) return;
             const bDate = b.date ? new Date(b.date) : new Date(0);
             if (isBefore(bDate, monthStart)) {
                 initialBalance += selectedItem !== 'all' ? Number(b.originalQty) : Number(b.originalQty) * Number(b.rate);
             }
        });

        issues.forEach(i => {
             if (selectedItem !== 'all' && i.itemId !== selectedItem) return;
             const iDate = i.date ? new Date(i.date) : new Date(0);
             if (isBefore(iDate, monthStart)) {
                 initialBalance -= selectedItem !== 'all' ? Number(i.qty) : Number(i.qty) * Number(i.rate || 0); // Assuming rate might be missing in older issues
             }
        });

        const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
        const ledgerDays: any[] = [];
        let currentBalance = initialBalance;

        daysInMonth.forEach(day => {
            let dailyPurchased = 0;
            let dailyUsed = 0;

            batches.forEach(b => {
                if (selectedItem !== 'all' && b.itemId !== selectedItem) return;
                const bDate = b.date ? startOfDay(new Date(b.date)) : new Date(0);
                if (isSameDay(bDate, day)) {
                    dailyPurchased += selectedItem !== 'all' ? Number(b.originalQty) : Number(b.originalQty) * Number(b.rate);
                }
            });

            issues.forEach(i => {
                if (selectedItem !== 'all' && i.itemId !== selectedItem) return;
                const iDate = i.date ? startOfDay(new Date(i.date)) : new Date(0);
                if (isSameDay(iDate, day)) {
                    dailyUsed += selectedItem !== 'all' ? Number(i.qty) : Number(i.qty) * Number(i.rate || 0);
                }
            });

            const closingBalance = currentBalance + dailyPurchased - dailyUsed;

            if (dailyPurchased > 0 || dailyUsed > 0) {
                ledgerDays.push({
                    date: format(day, 'yyyy-MM-dd'),
                    openingBalance: currentBalance,
                    purchased: dailyPurchased,
                    used: dailyUsed,
                    closingBalance: closingBalance
                });
            }

            currentBalance = closingBalance;
        });

        // Ensure at least one row if empty
        if (ledgerDays.length === 0) {
            ledgerDays.push({
                date: format(monthStart, 'yyyy-MM-dd'),
                openingBalance: currentBalance,
                purchased: 0,
                used: 0,
                closingBalance: currentBalance,
                isEmpty: true
            });
        } else {
             // Add a closing row for the month if the last active day wasn't the last day
             const lastActiveDay = ledgerDays[ledgerDays.length - 1].date;
             if (lastActiveDay !== format(monthEnd, 'yyyy-MM-dd')) {
                 ledgerDays.push({
                     date: format(monthEnd, 'yyyy-MM-dd'),
                     openingBalance: currentBalance,
                     purchased: 0,
                     used: 0,
                     closingBalance: currentBalance,
                     isClosingRow: true
                 });
             }
        }

        return {
            initialBalance,
            closingBalance: currentBalance,
            ledgerDays
        };

    }, [batches, issues, selectedMonth, selectedItem]);

    const getMonthsOptions = () => {
        const options = [];
        for (let i = 0; i < 12; i++) {
            const d = set(new Date(), { month: new Date().getMonth() - i, date: 1 });
            options.push(format(d, 'yyyy-MM'));
        }
        return options;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Store Ledger</h2>
                  <p className="text-sm text-slate-500">Track daily store value, opening balances, and consumption.</p>
                </div>
                <div className="flex items-center gap-3">
                  <select 
                      className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all shadow-sm cursor-pointer"
                      value={selectedItem}
                      onChange={(e) => setSelectedItem(e.target.value)}
                  >
                      <option value="all">All Items (Value in Rs)</option>
                      {allItems.sort((a,b) => a.name.localeCompare(b.name)).map(item => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                  </select>
                  <select 
                      className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all shadow-sm cursor-pointer"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                  >
                      {getMonthsOptions().map(opt => (
                          <option key={opt} value={opt}>{format(parseISO(opt + '-01'), 'MMMM yyyy')}</option>
                      ))}
                  </select>
                  <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium shadow-sm hover:bg-slate-50 transition-all">
                    <Download size={14} className="text-slate-500" />
                    Export
                  </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                </div>
            ) : (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
                >
                    <div className="p-6 bg-slate-50/50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Opening {selectedItem === 'all' ? 'Store Value' : 'Stock Quantity'}</p>
                             <h3 className="text-2xl font-black text-slate-800 font-mono tracking-tighter">{selectedItem === 'all' ? 'Rs ' : ''}{(ledgerData.initialBalance || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2})}</h3>
                         </div>
                         <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Closing {selectedItem === 'all' ? 'Store Value' : 'Stock Quantity'}</p>
                             <h3 className="text-2xl font-black text-emerald-600 font-mono tracking-tighter">{selectedItem === 'all' ? 'Rs ' : ''}{(ledgerData.closingBalance || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2})}</h3>
                         </div>
                    </div>
                    <div className="overflow-x-auto min-h-[400px]">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 text-[10px] uppercase font-bold text-slate-500 tracking-wider">Date</th>
                                    <th className="px-6 py-4 text-[10px] uppercase font-bold text-slate-500 tracking-wider text-right">Opening Balance</th>
                                    <th className="px-6 py-4 text-[10px] uppercase font-bold text-slate-500 tracking-wider text-right">Purchased / Added</th>
                                    <th className="px-6 py-4 text-[10px] uppercase font-bold text-slate-500 tracking-wider text-right">Used / Issued</th>
                                    <th className="px-6 py-4 text-[10px] uppercase font-bold text-slate-500 tracking-wider text-right">Closing Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {ledgerData.ledgerDays && ledgerData.ledgerDays.map((day: any, idx: number) => (
                                    <tr key={`${day.date}-${idx}`} className={cn("hover:bg-slate-50/50 transition-colors", (day.isEmpty || day.isClosingRow) && "bg-slate-50/30")}>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 font-medium text-slate-700">
                                                <Calendar size={14} className="text-slate-400" />
                                                {format(parseISO(day.date), 'dd MMM yyyy')}
                                                {day.isClosingRow && <span className="text-[10px] ml-2 px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded">End of Month</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-slate-600 font-medium whitespace-nowrap">
                                            {day.openingBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-emerald-600 font-medium whitespace-nowrap">
                                            {day.purchased > 0 ? `+ ${day.purchased.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-rose-600 font-medium whitespace-nowrap">
                                            {day.used > 0 ? `- ${day.used.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-slate-900 font-bold whitespace-nowrap tracking-tight">
                                            {day.closingBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            )}
        </div>
    );
};
