import React, { useState, useEffect } from 'react';
import { sheetsService } from '../services/sheetsService';
import { Search, Filter, Loader2, Package, Download } from 'lucide-react';
import { cn } from '../lib/utils';

export function InventoryView() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [itemList, batchList, issueList] = await Promise.all([
        sheetsService.read('Masters_Items!A2:J'), // Expand range to be safe
        sheetsService.read('Batches!A2:H'),
        sheetsService.read('Issues!A2:G')
      ]);

      const batches = Array.isArray(batchList) ? batchList : [];
      const items = Array.isArray(itemList) ? itemList : [];

      console.log(`Loaded ${items.length} items and ${batches.length} batches`);

      const bMap = batches.reduce((acc: any, b: any) => {
          if (!b || b.length < 5 || !b[1]) return acc;
          const id = String(b[1]).trim();
          
          const parseNum = (val: any) => {
              if (val === undefined || val === null) return 0;
              const str = String(val).replace(/,/g, '').trim();
              const n = parseFloat(str);
              return isNaN(n) ? 0 : n;
          };

          const rem = parseNum(b[4]);
          const cost = parseNum(b[5]);
          
          if (!acc[id]) acc[id] = { qty: 0, totalCost: 0 };
          acc[id].qty += rem;
          acc[id].totalCost += rem * cost;
          return acc;
      }, {});

      const processed = items.map((itm: any) => {
        if (!itm || !itm[0]) return null;
        const id = String(itm[0]).trim();
        const data = bMap[id] || { qty: 0, totalCost: 0 };
        const currentStock = Number(data.qty) || 0;
        const totalCostVal = Number(data.totalCost) || 0;
        
        let avgRate = 0;
        const itmBuyPrice = Number(String(itm[4] || '0').replace(/,/g, '')) || 0;

        if (currentStock > 0) {
            avgRate = totalCostVal / currentStock;
        } else {
            avgRate = itmBuyPrice;
        }
        
        if (isNaN(avgRate) || !isFinite(avgRate)) avgRate = 0;

        return {
          id,
          name: itm[1] || 'Unknown',
          unit: itm[3] || 'pcs',
          price: avgRate,
          type: itm[6] || 'Raw',
          opening: Number(String(itm[7]).replace(/,/g, '')) || 0,
          minParLevel: Number(String(itm[8]).replace(/,/g, '')) || 0,
          reorderQty: Number(String(itm[9]).replace(/,/g, '')) || 0,
          stock: currentStock,
          value: totalCostVal
        };
      }).filter(Boolean);

      setItems(processed as any[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const handleSort = (key: string) => {
      let direction: 'asc' | 'desc' = 'asc';
      if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
          direction = 'desc';
      }
      setSortConfig({ key, direction });
  };

  const filteredItems = items.filter(itm => 
    itm.name.toLowerCase().includes(search.toLowerCase()) ||
    itm.type.toLowerCase().includes(search.toLowerCase())
  );

  const sortedItems = [...filteredItems].sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;
      
      if (key === 'status') {
          const aStatus = a.stock <= a.minParLevel ? 0 : 1;
          const bStatus = b.stock <= b.minParLevel ? 0 : 1;
          if (aStatus < bStatus) return direction === 'asc' ? -1 : 1;
          if (aStatus > bStatus) return direction === 'asc' ? 1 : -1;
          return 0;
      }

      if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
      if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
      return 0;
  });

  const renderSortArrow = (key: string) => {
      if (!sortConfig || sortConfig.key !== key) return <span className="opacity-0 group-hover:opacity-50 ml-1">↑</span>;
      return <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Stock Inventory</h2>
          <p className="text-sm text-slate-500 font-medium">Real-time balances across all departments.</p>
        </div>
        
        {/* Total Value Summary Card */}
        <div className="bg-emerald-50 border border-emerald-200 px-6 py-3 rounded-2xl flex flex-col shadow-sm">
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-0.5">Total Inventory Value</span>
            <div className="flex items-baseline gap-1">
                <span className="text-xs font-bold text-emerald-500">Rs.</span>
                <span className="text-2xl font-bold text-emerald-900 tracking-tighter">
                    {items.reduce((sum, itm) => sum + itm.value, 0).toLocaleString()}
                </span>
            </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Filter items..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-64 shadow-sm transition-all" 
            />
          </div>
          <button onClick={fetchData} className="p-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-500 transition-all shadow-sm">
             <Filter size={18} />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium shadow-sm hover:bg-slate-50 transition-all">
             <Download size={14} className="text-slate-500" />
             Export
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 cursor-pointer group hover:bg-slate-100" onClick={() => handleSort('name')}>Item Details{renderSortArrow('name')}</th>
                <th className="px-6 py-3 cursor-pointer group hover:bg-slate-100" onClick={() => handleSort('type')}>Department{renderSortArrow('type')}</th>
                <th className="px-6 py-3 cursor-pointer group hover:bg-slate-100" onClick={() => handleSort('unit')}>Unit{renderSortArrow('unit')}</th>
                <th className="px-6 py-3 cursor-pointer group hover:bg-slate-100" onClick={() => handleSort('price')}>Unit Price{renderSortArrow('price')}</th>
                <th className="px-6 py-3 text-right cursor-pointer group hover:bg-slate-100" onClick={() => handleSort('stock')}>Current Stock{renderSortArrow('stock')}</th>
                <th className="px-6 py-3 text-right cursor-pointer group hover:bg-slate-100" onClick={() => handleSort('value')}>Stock Value{renderSortArrow('value')}</th>
                <th className="px-6 py-3 cursor-pointer group hover:bg-slate-100" onClick={() => handleSort('status')}>Status{renderSortArrow('status')}</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                       <Loader2 className="animate-spin text-emerald-500" size={24} />
                       <span className="font-medium">Syncing with Google Sheets...</span>
                    </div>
                  </td>
                </tr>
              ) : sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    No items found matching your criteria.
                  </td>
                </tr>
              ) : (
                sortedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-400">
                             <Package size={14} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 tracking-tight leading-tight">{item.name}</p>
                          </div>
                       </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-tight">
                        {item.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-medium">{item.unit}</td>
                    <td className="px-6 py-4 font-mono text-slate-600 tracking-tighter">Rs. {Number(item.price).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">
                       <span className={cn(
                         "font-bold font-mono text-sm tracking-tighter",
                         item.stock <= item.minParLevel ? "text-red-600" : "text-slate-900"
                       )}>
                         {item.stock.toFixed(2)}
                       </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900 font-mono tracking-tighter">
                      Rs. {item.value.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      {item.stock <= item.minParLevel ? (
                        <div className="flex flex-col gap-1">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight bg-red-100 text-red-700 max-w-max">
                            Low Stock
                          </span>
                          {item.reorderQty > 0 && (
                            <span className="text-[10px] font-medium text-red-600 leading-tight">
                              Order {item.reorderQty} {item.unit}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight bg-emerald-100 text-emerald-700 max-w-max">
                          Healthy
                        </span>
                      )}
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
}
