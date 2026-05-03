import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  PieChart, 
  ChevronDown, 
  Filter, 
  Calendar,
  Layers,
  Activity,
  ArrowUpRight,
  Loader2,
  Package,
  Table as TableIcon,
  Download,
  FileText,
  ShoppingCart
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  Cell,
  Legend
} from 'recharts';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { sheetsService } from '../services/sheetsService';
import { cn } from '../lib/utils';

export const SummaryView: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [depts, setDepts] = useState<any[]>([]);
    const [issues, setIssues] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [dailyLogs, setDailyLogs] = useState<any[]>([]);
    const [batches, setBatches] = useState<any[]>([]);
    const [sales, setSales] = useState<any[]>([]);
    const [expenses, setExpenses] = useState<any[]>([]);
    
    // Filters
    const [selectedDept, setSelectedDept] = useState('all');
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [topN, setTopN] = useState(10);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [dRows, iRows, itemRows, dailyRows, bRows] = await Promise.all([
                sheetsService.read('Masters_Depts!A2:B'),
                sheetsService.read('Issues!A2:G'),
                sheetsService.read('Masters_Items!A2:H'),
                sheetsService.read('DailyConsumption!A2:L'),
                sheetsService.read('Batches!A2:H')
            ]);
            setDepts(Array.isArray(dRows) ? dRows : []);
            setIssues(Array.isArray(iRows) ? iRows : []);
            setItems(Array.isArray(itemRows) ? itemRows : []);
            setDailyLogs(Array.isArray(dailyRows) ? dailyRows : []);
            setBatches(Array.isArray(bRows) ? bRows : []);
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
        if (val === undefined || val === null) return 0;
        const str = String(val).replace(/,/g, '').trim();
        const n = Number(str);
        return isNaN(n) ? 0 : n;
    };

    // 1. Department Wise Consumption Data
    const getDeptConsumptionData = () => {
        const filtered = selectedDept === 'all' 
            ? issues 
            : issues.filter(i => i[2] === selectedDept);
            
        const monthFiltered = filtered.filter(i => i[1] && i[1].startsWith(selectedMonth));
        
        const aggregated = monthFiltered.reduce((acc: any, curr: any) => {
            const itemId = String(curr[3]).trim();
            const itemName = items.find(it => String(it[0]).trim() === itemId)?.[1] || itemId;
            const qty = parseNum(curr[4]);
            const rate = parseNum(curr[5]);
            const val = qty * rate;
            
            if (!acc[itemName]) acc[itemName] = { value: 0, qty: 0 };
            acc[itemName].value += val;
            acc[itemName].qty += qty;
            
            return acc;
        }, {});

        return Object.entries(aggregated)
            .map(([name, data]: [string, any]) => ({ name, value: Number(data.value), qty: Number(data.qty) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, topN);
    };

    // 2. Monthly Trend Data
    const getMonthlyTrendData = () => {
        const months = eachMonthOfInterval({
            start: subMonths(new Date(), 5),
            end: new Date()
        }).map(d => format(d, 'yyyy-MM'));

        return months.map(m => {
            const monthlyIssues = issues.filter(iss => iss[1] && iss[1].startsWith(m));
            const total = monthlyIssues.reduce((sum, curr) => sum + (parseNum(curr[4]) * parseNum(curr[5])), 0);
            return { month: format(new Date(m + '-01'), 'MMM yy'), total };
        });
    };

    // 3. Section Comparison
    const getSectionComparison = () => {
        const aggregated = issues.filter(i => i[1] && i[1].startsWith(selectedMonth)).reduce((acc: any, curr: any) => {
            const deptName = depts.find(d => d[0] === curr[2])?.[1] || curr[2];
            const val = parseNum(curr[4]) * parseNum(curr[5]);
            acc[deptName] = (acc[deptName] || 0) + val;
            return acc;
        }, {});

        return Object.entries(aggregated)
            .map(([name, value]) => ({ name, value: Number(value) }))
            .sort((a, b) => b.value - a.value);
    };

    // 4. Food Cost Analysis (Simplified based on daily logs)
    const getFoodCostStats = () => {
        const monthLogs = dailyLogs.filter(l => l[0] && l[0].includes(format(new Date(selectedMonth + '-01'), 'MMM')));
        const totalStoreIssues = issues
            .filter(i => i[1] && i[1].startsWith(selectedMonth))
            .reduce((sum, i) => sum + (parseNum(i[4]) * parseNum(i[5])), 0);
            
        const dailyTotal = monthLogs.reduce((sum, l) => sum + (parseNum(l[11])), 0);
        
        return {
            storeIssues: totalStoreIssues,
            freshPurchase: dailyTotal,
            totalCost: totalStoreIssues + dailyTotal
        };
    };

    const getInventoryValue = () => {
        return batches.reduce((sum, b) => {
            const rem = parseNum(b[4]);
            const cost = parseNum(b[5]);
            return sum + (rem * cost);
        }, 0);
    };

    const getRestockAlerts = () => {
        const stockMap = new Map<string, number>();
        batches.forEach(b => {
             const itemId = b[1];
             const rem = parseNum(b[4]);
             stockMap.set(itemId, (stockMap.get(itemId) || 0) + rem);
        });
        
        const alerts: any[] = [];
        items.forEach(itm => {
            const minPar = parseNum(itm[8]); 
            if (minPar > 0) {
               const currentStock = stockMap.get(itm[0]) || 0;
               if (currentStock <= minPar) {
                   alerts.push({
                       id: itm[0],
                       name: itm[1],
                       current: currentStock,
                       min: minPar,
                       reorder: parseNum(itm[9]),
                       unit: itm[3]
                   });
               }
            }
        });
        return alerts.sort((a, b) => (a.current / a.min) - (b.current / b.min));
    };

    const handleGeneratePO = () => {
        const alerts = getRestockAlerts();
        if (alerts.length === 0) {
            alert("No items below minimum par level.");
            return;
        }

        const doc = new jsPDF();
        
        doc.setFontSize(20);
        doc.text(`Purchase Order Request`, 14, 22);
        
        doc.setFontSize(10);
        doc.text(`Date: ${format(new Date(), 'dd MMM yyyy')}`, 14, 30);
        
        autoTable(doc, {
            startY: 40,
            head: [['Item Name', 'Current Stock', 'Min Level', 'Recommended Order']],
            body: alerts.map(a => [a.name, `${a.current} ${a.unit}`, `${a.min} ${a.unit}`, `${a.reorder || Math.max(a.min - a.current, 0)} ${a.unit}`]),
            theme: 'striped',
            headStyles: { fillColor: [5, 150, 105] },
        });
        
        doc.save(`Recommended_PO_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    };

    const handleExportPDF = () => {
        const doc = new jsPDF();
        
        doc.setFontSize(20);
        doc.text(`Operations Report - ${format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}`, 14, 22);
        
        doc.setFontSize(12);
        doc.text("Food Cost Analysis", 14, 35);
        autoTable(doc, {
            startY: 40,
            head: [['Metric', 'Amount (Rs.)']],
            body: [
                ['Current Inventory Value', getInventoryValue().toLocaleString()],
                ['Store Consumption', getFoodCostStats().storeIssues.toLocaleString()],
                ['Fresh Purchases', getFoodCostStats().freshPurchase.toLocaleString()],
                ['Total Food Cost', getFoodCostStats().totalCost.toLocaleString()],
            ],
            theme: 'striped',
            headStyles: { fillColor: [5, 150, 105] },
        });

        doc.text("Sales & Expenses", 14, (doc as any).lastAutoTable.finalY + 15);
        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 20,
            head: [['Metric', 'Amount (Rs.)']],
            body: [
                ['Total Sales', getSalesAndExpensesStats().totalSales.toLocaleString()],
                ['Total Expenses', getSalesAndExpensesStats().totalExpenses.toLocaleString()],
                ['Net Profit', getSalesAndExpensesStats().netProfit.toLocaleString()],
                ['Food Cost Percentage', getSalesAndExpensesStats().totalSales ? ((getFoodCostStats().totalCost / getSalesAndExpensesStats().totalSales) * 100).toFixed(2) + '%' : 'N/A'],
            ],
            theme: 'striped',
            headStyles: { fillColor: [15, 23, 42] },
        });

        doc.text("Top Items Consumed", 14, (doc as any).lastAutoTable.finalY + 15);
        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 20,
            head: [['Item Name', 'Value (Rs.)']],
            body: getDeptConsumptionData().map(d => [d.name, d.value.toLocaleString()]),
            theme: 'striped',
        });
        
        doc.save(`resto_report_${selectedMonth}.pdf`);
    };

    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        // Summary sheet
        const summaryData = [
            ['Metric', 'Value (Rs.)'],
            ['Total Sales', getSalesAndExpensesStats().totalSales],
            ['Total Expenses', getSalesAndExpensesStats().totalExpenses],
            ['Total Food Cost', getFoodCostStats().totalCost],
            ['Store Consumption', getFoodCostStats().storeIssues],
            ['Fresh Purchases', getFoodCostStats().freshPurchase],
            ['Inventory Value', getInventoryValue()]
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

        // Top Items Sheet
        const itemsData = [['Item Name', 'Value (Rs.)'], ...getDeptConsumptionData().map(d => [d.name, d.value])];
        const wsItems = XLSX.utils.aoa_to_sheet(itemsData);
        XLSX.utils.book_append_sheet(wb, wsItems, 'Top Items');

        // Section Mix Sheet
        const sectionExp = [['Section', 'Value (Rs.)'], ...getSectionComparison().map(d => [d.name, d.value])];
        const wsSection = XLSX.utils.aoa_to_sheet(sectionExp);
        XLSX.utils.book_append_sheet(wb, wsSection, 'Section Distribution');

        XLSX.writeFile(wb, `resto_report_${selectedMonth}.xlsx`);
    };

    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importText, setImportText] = useState('');

    const handleImportDaily = async () => {
        if (!importText.trim()) return;
        setLoading(true);
        try {
            const lines = importText.trim().split('\n');
            const values: any[][] = [];
            
            lines.forEach(line => {
                const parts = line.split('\t');
                if (parts.length >= 11) {
                    if (parts[0].toLowerCase() === 'date' || !parts[0].trim()) return;
                    // Format: Date, Day, Handi, Bar, Karahi, Drinks, Pantree, Pizza, Tandoor, BBQ, Tea, TOTAL
                    values.push(parts.map(p => p.trim()));
                }
            });

            if (values.length > 0) {
                await sheetsService.append('DailyConsumption!A:L', values);
                setIsImportOpen(false);
                setImportText('');
                fetchData();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col h-full items-center justify-center space-y-4">
                <Loader2 className="animate-spin text-emerald-500" size={48} />
                <p className="text-slate-500 font-medium animate-pulse">Analyzing operations data...</p>
            </div>
        );
    }

    const deptChartData = getDeptConsumptionData();
    const trendData = getMonthlyTrendData();
    const sectionData = getSectionComparison();
    const costStats = getFoodCostStats();
    const inventoryValue = getInventoryValue();

    return (
        <div className="space-y-6 pb-20">
            {/* Header & Filters */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">Operations Analytics</h2>
                    <p className="text-sm text-slate-500">Deep-dive into consumption patterns and costing.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button 
                        onClick={handleExportPDF}
                        className="px-4 py-2 bg-rose-50 text-rose-600 rounded-lg text-sm font-bold border border-rose-100 hover:bg-rose-100 transition-all flex items-center gap-2"
                    >
                        <FileText size={16} /> Export PDF
                    </button>
                    <button 
                        onClick={handleExportExcel}
                        className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-lg text-sm font-bold border border-emerald-100 hover:bg-emerald-100 transition-all flex items-center gap-2"
                    >
                        <Download size={16} /> Export Excel
                    </button>
                    <button 
                        onClick={() => setIsImportOpen(true)}
                        className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold border border-slate-200 hover:bg-slate-200 transition-all ml-2"
                    >
                        Import Daily Logs
                    </button>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">View Month</label>
                        <input 
                            type="month" 
                            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Section Filter</label>
                        <select 
                            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 focus:outline-none"
                            value={selectedDept}
                            onChange={(e) => setSelectedDept(e.target.value)}
                        >
                            <option value="all">All Sections</option>
                            {depts.map(d => <option key={d[0]} value={d[0]}>{d[1]}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Top KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4">
                {[
                    { label: 'Total Food Cost', value: `Rs. ${costStats.totalCost.toLocaleString()}`, icon: Activity, color: 'text-rose-600', sub: 'Store + Fresh' },
                    { label: 'Total Inventory Value', value: `Rs. ${inventoryValue.toLocaleString()}`, icon: Package, color: 'text-emerald-600', sub: 'Locked stock capital' },
                    { label: 'Fresh vs Store', value: `${costStats.storeIssues ? ((costStats.freshPurchase / costStats.storeIssues) * 100).toFixed(0) : 0}%`, icon: Layers, color: 'text-amber-600', sub: 'Fresh daily ratio' },
                ].map((kpi, i) => (
                    <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-2">
                            <div className={cn("p-2 rounded-lg bg-opacity-10", kpi.color.replace('text-', 'bg-'))}>
                                <kpi.icon size={18} className={kpi.color} />
                            </div>
                            <ArrowUpRight size={14} className="text-slate-300" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 mt-3">{kpi.label}</p>
                            <p className="text-xl font-bold text-slate-900 tracking-tight truncate">{kpi.value}</p>
                            <p className="text-[10px] text-slate-500 font-medium mt-1">{kpi.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Restock Alerts */}
            {getRestockAlerts().length > 0 && (
                <div className="bg-rose-50 border border-emerald-200 p-6 rounded-2xl shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h3 className="text-lg font-bold text-rose-800 flex items-center gap-2">
                                <Activity size={20} />
                                Smart Restock Alerts
                            </h3>
                            <p className="text-sm text-rose-600 font-medium">The following items have fallen below their minimum par level.</p>
                        </div>
                        <button 
                            onClick={handleGeneratePO}
                            className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-rose-700 transition flex items-center gap-2"
                        >
                            <ShoppingCart size={16} /> Generate PO
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left bg-white rounded-xl overflow-hidden shadow-sm border border-rose-100">
                            <thead className="bg-rose-100/50">
                                <tr>
                                    <th className="py-3 px-4 text-xs font-bold text-rose-800 uppercase tracking-wider">Item Name</th>
                                    <th className="py-3 px-4 text-xs font-bold text-rose-800 uppercase tracking-wider text-right">Current Stock</th>
                                    <th className="py-3 px-4 text-xs font-bold text-rose-800 uppercase tracking-wider text-right">Min Par Level</th>
                                    <th className="py-3 px-4 text-xs font-bold text-rose-800 uppercase tracking-wider text-right">Recommended Reorder</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-rose-50">
                                {getRestockAlerts().map((alert, i) => (
                                    <tr key={i} className="hover:bg-rose-50/50 transition-colors">
                                        <td className="py-3 px-4 text-sm font-bold text-slate-800">{alert.name}</td>
                                        <td className="py-3 px-4 text-sm font-bold text-rose-600 text-right">{alert.current} {alert.unit}</td>
                                        <td className="py-3 px-4 text-sm font-medium text-slate-500 text-right">{alert.min} {alert.unit}</td>
                                        <td className="py-3 px-4 text-sm font-bold text-emerald-600 text-right">
                                            {alert.reorder || Math.max(alert.min - alert.current, 0)} {alert.unit}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-12 gap-6">
                {/* Consumption Mix */}
                <div className="col-span-12 lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <BarChart3 size={18} className="text-emerald-500" />
                            <h3 className="font-bold text-slate-900 tracking-tight">Top {topN} Items by Value</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] font-bold text-slate-400">Limit</label>
                            <input 
                                type="number" 
                                className="w-12 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-center"
                                value={topN}
                                onChange={(e) => setTopN(Number(e.target.value))}
                            />
                        </div>
                    </div>
                    <div className="flex-1 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={deptChartData} layout="vertical" margin={{ left: 40, right: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                <XAxis type="number" hide />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 10, fontWeight: 600, fill: '#64748b' }}
                                    width={120}
                                />
                                <Tooltip 
                                    cursor={{ fill: '#f8fafc' }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-white p-3 rounded-xl shadow-lg border border-slate-100 text-xs">
                                                    <p className="font-bold text-slate-800 mb-1">{data.name}</p>
                                                    <p className="text-slate-600 font-medium pb-0.5">Value: <span className="text-emerald-600 font-bold font-mono">Rs. {data.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></p>
                                                    <p className="text-slate-600 font-medium">Quantity: <span className="text-slate-800 font-bold font-mono">{data.qty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                                    {deptChartData.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={index === 0 ? '#059669' : '#10b981'} fillOpacity={1 - (index * 0.08)} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Section Distribution */}
                <div className="col-span-12 lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
                    <div className="flex items-center gap-2 mb-6">
                        <PieChart size={18} className="text-blue-500" />
                        <h3 className="font-bold text-slate-900 tracking-tight">Section Contribution</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                        {sectionData.map((sec, i) => {
                            const percentage = ((sec.value / costStats.storeIssues) * 100).toFixed(1);
                            return (
                                <div key={i} className="space-y-1.5">
                                    <div className="flex justify-between items-center text-[11px] font-bold text-slate-600">
                                        <span className="uppercase tracking-wide">{sec.name}</span>
                                        <span>Rs. {sec.value.toLocaleString()} ({percentage}%)</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2">
                                        <div 
                                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Monthly Store Trend */}
                <div className="col-span-12 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-[350px]">
                    <div className="flex items-center gap-2 mb-6">
                        <TrendingUp size={18} className="text-orange-500" />
                        <h3 className="font-bold text-slate-900 tracking-tight">Store Consumption Trend (Last 6 Months)</h3>
                    </div>
                    <div className="w-full h-full pb-10">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis 
                                    dataKey="month" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} 
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                                    tickFormatter={(v) => `Rs. ${v/1000}k`}
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="total" 
                                    stroke="#ec4899" 
                                    strokeWidth={3} 
                                    dot={{ r: 4, fill: '#ec4899', strokeWidth: 2, stroke: '#fff' }}
                                    activeDot={{ r: 6 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Import Modal */}
            {isImportOpen && (
                <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6 text-slate-900">
                    <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <div>
                                <h3 className="font-bold">Mass Import Daily Section Data</h3>
                                <p className="text-[10px] text-slate-500 font-bold uppercase">Paste from your Daily Food Cost Excel</p>
                            </div>
                            <button onClick={() => setIsImportOpen(false)} className="text-slate-400 p-1 hover:text-red-500 transition-colors">Close</button>
                        </div>
                        <div className="p-6">
                             <textarea 
                                className="w-full h-80 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all resize-none"
                                placeholder="Paste your table here (including headers is fine)..."
                                value={importText}
                                onChange={(e) => setImportText(e.target.value)}
                            />
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                            <button onClick={() => setIsImportOpen(false)} className="flex-1 py-3 text-sm font-bold text-slate-500">Cancel</button>
                            <button 
                                onClick={handleImportDaily}
                                disabled={loading || !importText}
                                className="flex-[2] py-3 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:bg-slate-300 flex items-center justify-center gap-2"
                            >
                                {loading ? <Loader2 size={16} className="animate-spin" /> : "Process Logs"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
