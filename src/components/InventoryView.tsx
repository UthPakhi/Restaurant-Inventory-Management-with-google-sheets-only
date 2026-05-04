import React, { useState, useEffect } from 'react';
import { Package } from 'lucide-react';
import { sheetsService } from '../services/sheetsService';
import { mapRowToBatch } from '../services/dataMappers';
import { cn } from '../lib/utils';
import { Batch } from '../types';
import { useAppLookup } from '../context/AppContext';
import { DataTable, Column } from './DataTable';

export interface InventoryItem {
    id: string;
    name: string;
    unit: string;
    price: number;
    type: string;
    opening: number;
    minParLevel: number;
    reorderQty: number;
    stock: number;
    value: number;
}

export function InventoryView() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const { items: rawItems, loadingStaticData } = useAppLookup();

  const fetchData = async () => {
    if (loadingStaticData) return;
    setLoading(true);
    try {
      const [batchList] = await Promise.all([
        sheetsService.getAllBatches()
      ]);

      const batches = (batchList || []).map(mapRowToBatch);

      console.log(`Loaded ${rawItems.length} items and ${batches.length} batches`);

      const bMap = batches.reduce((acc: any, b: Batch) => {
          if (!b || !b.itemId) return acc;
          const id = String(b.itemId).trim();
          
          const rem = Number(b.remainingQty) || 0;
          const cost = Number(b.rate) || 0;
          
          if (!acc[id]) acc[id] = { qty: 0, totalCost: 0 };
          acc[id].qty += rem;
          acc[id].totalCost += (rem * cost);
          return acc;
      }, {});

      const processed = rawItems.map((itm) => {
        if (!itm || !itm.id) return null;
        const id = String(itm.id).trim();
        const data = bMap[id] || { qty: 0, totalCost: 0 };
        const currentStock = Number(data.qty) || 0;
        const totalCostVal = Number(data.totalCost) || 0;
        
        let avgRate = 0;
        const itmBuyPrice = Number(itm.buyPrice) || 0;

        if (currentStock > 0) {
            avgRate = totalCostVal / currentStock;
        } else {
            avgRate = itmBuyPrice; 
        }

        return {
          id,
          name: itm.name || 'Unknown',
          unit: itm.unit || 'pcs',
          price: avgRate,
          type: itm.category || 'Raw',
          opening: itm.openingStock || 0,
          minParLevel: itm.minParLevel || 0,
          reorderQty: itm.reorderQty || 0,
          stock: currentStock,
          value: totalCostVal
        };
      }).filter(Boolean);

      setItems(processed as InventoryItem[]);
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
  }, [loadingStaticData, rawItems]);

  const columns: Column<InventoryItem>[] = [
      {
          key: 'name',
          header: 'Item Details',
          cell: (item) => (
             <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                   <Package size={14} />
                </div>
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-200 tracking-tight leading-tight">{item.name}</p>
                </div>
             </div>
          ),
          sortable: true
      },
      {
          key: 'type',
          header: 'Department',
          cell: (item) => <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded text-[10px] font-bold uppercase tracking-tight">{item.type}</span>,
          sortable: true
      },
      {
          key: 'unit',
          header: 'Unit',
          cell: (item) => <span className="text-slate-500 dark:text-slate-400 font-medium">{item.unit}</span>,
          sortable: true
      },
      {
          key: 'price',
          header: 'Unit Price',
          cell: (item) => <span className="font-mono text-slate-600 dark:text-slate-400 tracking-tighter">Rs. {Number(item.price).toLocaleString()}</span>,
          sortable: true
      },
      {
          key: 'stock',
          header: 'Current Stock',
          align: 'right',
          cell: (item) => (
             <span className={cn(
               "font-bold font-mono text-sm tracking-tighter",
               item.stock <= item.minParLevel ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"
             )}>
               {item.stock.toFixed(2)}
             </span>
          ),
          sortable: true
      },
      {
          key: 'value',
          header: 'Stock Value',
          align: 'right',
          cell: (item) => <span className="font-bold text-slate-900 dark:text-white font-mono tracking-tighter">Rs. {item.value.toLocaleString()}</span>,
          sortable: true
      },
      {
          key: 'status',
          header: 'Status',
          sortable: true,
          sortFn: (a, b) => {
              const aStatus = a.stock <= a.minParLevel ? 0 : 1;
              const bStatus = b.stock <= b.minParLevel ? 0 : 1;
              if (aStatus < bStatus) return -1;
              if (aStatus > bStatus) return 1;
              return 0;
          },
          cell: (item) => (
              item.stock <= item.minParLevel ? (
                <div className="flex flex-col gap-1">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400 max-w-max">
                    Low Stock
                  </span>
                  {item.reorderQty > 0 && (
                    <span className="text-[10px] font-medium text-red-600 dark:text-red-500 leading-tight">
                      Order {item.reorderQty} {item.unit}
                    </span>
                  )}
                </div>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 max-w-max">
                  Healthy
                </span>
              )
          )
      }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Stock Inventory</h2>
          <p className="text-sm text-slate-500 font-medium dark:text-slate-400">Real-time balances across all departments.</p>
        </div>
        
        {/* Total Value Summary Card */}
        <div className="flex gap-4">
          <div className="bg-slate-50 border border-slate-200 px-6 py-3 rounded-2xl flex flex-col shadow-sm dark:bg-slate-900 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5 dark:text-slate-400">Total Items</span>
              <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-slate-900 tracking-tighter dark:text-white">
                      {items.length}
                  </span>
                  <span className="text-xs font-medium text-slate-400 ml-1">
                      ({items.filter(itm => itm.stock > 0).length} In Stock)
                  </span>
              </div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 px-6 py-3 rounded-2xl flex flex-col shadow-sm dark:bg-emerald-950/20 dark:border-emerald-900/30">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-0.5 dark:text-emerald-500">Total Inventory Value</span>
              <div className="flex items-baseline gap-1">
                  <span className="text-xs font-bold text-emerald-500">Rs.</span>
                  <span className="text-2xl font-bold text-emerald-900 tracking-tighter dark:text-emerald-100">
                      {items.reduce((sum, itm) => sum + itm.value, 0).toLocaleString()}
                  </span>
              </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
         <DataTable
             data={items}
             columns={columns}
             loading={loading}
             searchKeys={['name', 'type']}
             emptyMessage="No items found matching your criteria."
         />
      </div>
    </div>
  );
}
