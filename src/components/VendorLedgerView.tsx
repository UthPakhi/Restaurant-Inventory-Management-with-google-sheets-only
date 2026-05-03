import React, { useState, useEffect } from 'react';
import { BookOpen, Search, Loader2, TrendingUp } from 'lucide-react';
import { sheetsService } from '../services/sheetsService';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export const VendorLedgerView: React.FC = () => {
    const [loading, setLoading] = useState(false);
    
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [purchases, setPurchases] = useState<any[]>([]);
    const [cashflow, setCashflow] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    
    // UI State
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>('all');
    const [selectedItemId, setSelectedItemId] = useState<string>('all');
    
    const fetchData = async () => {
        setLoading(true);
        try {
            const [supRow, purRow, cashRow, itemRow] = await Promise.all([
                sheetsService.read('Masters_Suppliers!A2:C'),
                sheetsService.read('Purchases!A2:I'),
                sheetsService.read('Cashflow!A2:F'),
                sheetsService.read('Masters_Items!A2:J')
            ]);
            setSuppliers(Array.isArray(supRow) ? supRow : []);
            setPurchases(Array.isArray(purRow) ? purRow : []);
            setCashflow(Array.isArray(cashRow) ? cashRow : []);
            setItems(Array.isArray(itemRow) ? itemRow : []);
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

    // Calculate vendor balances
    const getVendorBalances = () => {
        return suppliers.map(sup => {
            const supplierId = sup[0];
            const name = sup[1];
            
            const vendorPurchases = purchases.filter(p => p[6] === supplierId);
            const totalBilled = vendorPurchases.reduce((sum, p) => sum + parseNum(p[5]), 0);
            
            const vendorPayments = cashflow.filter(c => c[2] === 'Expense' && c[5] === supplierId);
            const totalPaid = vendorPayments.reduce((sum, c) => sum + parseNum(c[3]), 0);
            
            const balance = totalBilled - totalPaid;
            
            return { supplierId, name, totalBilled, totalPaid, balance };
        });
    };

    const vendorBalances = getVendorBalances();
    const filteredVendorBalances = selectedSupplierId === 'all' 
        ? vendorBalances 
        : vendorBalances.filter(v => v.supplierId === selectedSupplierId);

    // Get Item Price History
    const getPriceHistory = () => {
        if (selectedItemId === 'all') return [];
        
        let relatedPurchases = purchases.filter(p => p[2] === selectedItemId);
        if (selectedSupplierId !== 'all') {
            relatedPurchases = relatedPurchases.filter(p => p[6] === selectedSupplierId);
        }
        
        // Group by Date and average the rate if multiple purchases on same day
        const grouped = relatedPurchases.reduce((acc: any, p) => {
            const date = p[1];
            const rate = parseNum(p[4]);
            if (!acc[date]) acc[date] = [];
            acc[date].push(rate);
            return acc;
        }, {});
        
        return Object.keys(grouped).sort().map(date => {
            const rates = grouped[date];
            const avgRate = rates.reduce((a: number, b: number) => a + b, 0) / rates.length;
            return {
                date: format(new Date(date), 'MMM dd'),
                rate: avgRate
            };
        });
    };

    const priceData = getPriceHistory();

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                    <BookOpen className="text-purple-500" />
                    Vendor Ledger & Price Tracking
                </h2>
                <p className="text-sm font-medium text-slate-500">Track total purchases vs actual payments, and monitor item price inflation.</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="w-full sm:w-64">
                         <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Filter by Supplier</label>
                         <select 
                            value={selectedSupplierId}
                            onChange={(e) => setSelectedSupplierId(e.target.value)}
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:ring-2 focus:ring-purple-500"
                        >
                            <option value="all">All Suppliers (Summary View)</option>
                            {suppliers.map((s, i) => (
                                <option key={i} value={s[0]}>{s[1]}</option>
                            ))}
                        </select>
                    </div>
                    {selectedSupplierId !== 'all' && (
                        <div className="w-full sm:w-auto text-right">
                             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Unpaid Balance</p>
                             <p className="text-3xl font-bold text-rose-500 tracking-tight">
                                 Rs. {filteredVendorBalances[0]?.balance.toLocaleString() || '0'}
                             </p>
                        </div>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse border border-slate-100 rounded-xl overflow-hidden">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Vendor Name</th>
                                <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Total Billed (Purchases)</th>
                                <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Total Paid (Cashflow)</th>
                                <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Remaining Balance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && vendorBalances.length === 0 ? (
                                <tr><td colSpan={4} className="py-8 text-center text-slate-400"><Loader2 className="animate-spin mx-auto" /></td></tr>
                            ) : filteredVendorBalances.length === 0 ? (
                                <tr><td colSpan={4} className="py-8 text-center text-sm font-bold text-slate-400">No vendor data found.</td></tr>
                            ) : (
                                filteredVendorBalances.map((v, i) => (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-4 px-4 font-bold text-slate-800">{v.name}</td>
                                        <td className="py-4 px-4 text-right font-medium text-slate-600">Rs. {v.totalBilled.toLocaleString()}</td>
                                        <td className="py-4 px-4 text-right font-medium text-slate-600">Rs. {v.totalPaid.toLocaleString()}</td>
                                        <td className="py-4 px-4 text-right">
                                            <span className={cn(
                                                "font-bold",
                                                v.balance > 0 ? "text-rose-600" : "text-emerald-600"
                                            )}>
                                                Rs. {v.balance.toLocaleString()}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

             <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                 <div className="flex items-center gap-2 mb-4">
                     <TrendingUp className="text-emerald-500" />
                     <h3 className="font-bold text-slate-900">Historical Price Tracking</h3>
                 </div>
                 
                 <div className="w-full sm:w-1/3 mb-6">
                     <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Select Item to Track</label>
                     <select 
                        value={selectedItemId}
                        onChange={(e) => setSelectedItemId(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                        <option value="all">-- Select Item --</option>
                        {items.map((itm, i) => (
                            <option key={i} value={itm[0]}>{itm[1]}</option>
                        ))}
                    </select>
                 </div>
                 
                 {selectedItemId !== 'all' && priceData.length > 0 ? (
                     <div className="h-[300px] w-full">
                         <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={priceData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} 
                                    tickFormatter={(val) => `Rs.${val}`}
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(value: any) => [`Rs. ${value}`, 'Average Price']}
                                />
                                <Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={3} dot={{ strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                     </div>
                 ) : selectedItemId !== 'all' ? (
                     <div className="py-12 text-center text-slate-400">
                         No purchase history found for this item from the selected supplier.
                     </div>
                 ) : (
                     <div className="py-12 text-center text-slate-400">
                         Select an item to view its price history chart.
                     </div>
                 )}
             </div>
        </div>
    );
};
