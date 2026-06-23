import React, { useState, useEffect } from 'react';
import { Package, Sparkles, Brain, AlertTriangle, CheckCircle2, RefreshCw, FileText, Copy, Check, FileDown } from 'lucide-react';
import { sheetsService } from '../services/sheetsService';
import { mapRowToBatch, mapRowToIssue } from '../services/dataMappers';
import { cn } from '../lib/utils';
import { Batch } from '../types';
import { useAppLookup } from '../context/AppContext';
import { DataTable, Column } from './DataTable';
import { exportTableToPDF, exportTableToExcel } from '../lib/exportUtils';

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
  const { activeItems: rawItems, loadingStaticData } = useAppLookup();

  // AI Reorder Prediction States
  const [rawIssues, setRawIssues] = useState<any[]>([]);
  const [aiPredictions, setAiPredictions] = useState<any[]>([]);
  const [loadingPredictions, setLoadingPredictions] = useState<boolean>(false);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [showPredictions, setShowPredictions] = useState<boolean>(false);
  const [copiedSelected, setCopiedSelected] = useState<boolean>(false);

  const fetchData = async () => {
    if (loadingStaticData) return;
    setLoading(true);
    try {
      const [batchList, issueList] = await Promise.all([
        sheetsService.getAllBatches(),
        sheetsService.getAllIssues()
      ]);

      const batches = (batchList || []).map(mapRowToBatch);
      const mappedIssues = (issueList || []).map(mapRowToIssue);
      setRawIssues(mappedIssues);

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

  const fetchAiPredictions = async () => {
    setLoadingPredictions(true);
    setPredictionError(null);
    try {
      const now = new Date();
      const nowTime = now.getTime();
      const oneDayMs = 24 * 60 * 60 * 1000;

      // Group issues by item to optimize calculations
      const issuesByItem: Record<string, any[]> = {};
      rawIssues.forEach(iss => {
        const key = String(iss.itemId).trim();
        if (!issuesByItem[key]) issuesByItem[key] = [];
        issuesByItem[key].push(iss);
      });

      const itemsWithTrends = items.map(itm => {
        const idTrimmed = String(itm.id).trim();
        const itemIssues = issuesByItem[idTrimmed] || [];

        let qty7Days = 0;
        let qty14Days = 0;
        let qty30Days = 0;
        let lastIssueDate = "None";

        if (itemIssues.length > 0) {
          // Find latest issue date
          let latestTime = 0;
          itemIssues.forEach(iss => {
            const t = new Date(iss.date).getTime();
            if (!isNaN(t) && t > latestTime) {
              latestTime = t;
              lastIssueDate = iss.date;
            }

            const issDate = new Date(iss.date);
            if (!isNaN(issDate.getTime())) {
              const diffDays = (nowTime - issDate.getTime()) / oneDayMs;
              
              if (diffDays >= 0 && diffDays <= 7) {
                qty7Days += Number(iss.qty || 0);
              }
              if (diffDays >= 0 && diffDays <= 14) {
                qty14Days += Number(iss.qty || 0);
              }
              if (diffDays >= 0 && diffDays <= 30) {
                qty30Days += Number(iss.qty || 0);
              }
            }
          });
        }

        // Calculate average daily consumption over 30 days
        const averageDailyConsumption = qty30Days / 30;

        return {
          id: itm.id,
          name: itm.name,
          unit: itm.unit,
          stock: itm.stock,
          minParLevel: itm.minParLevel,
          reorderQty: itm.reorderQty,
          qty7Days,
          qty14Days,
          qty30Days,
          averageDailyConsumption,
          lastIssueDate
        };
      });

      const response = await fetch("/api/gemini/reorder-predictions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          items: itemsWithTrends
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      if (data.predictions) {
        setAiPredictions(data.predictions);
      } else {
        throw new Error("No predictions returned from AI model.");
      }
    } catch (err: any) {
      console.error(err);
      setPredictionError(err.message || "An unknown error occurred while analyzing stock with AI.");
    } finally {
      setLoadingPredictions(false);
    }
  };

  const handleTogglePredictions = () => {
    const nextVal = !showPredictions;
    setShowPredictions(nextVal);
    if (nextVal && aiPredictions.length === 0) {
      if (items.length > 0) {
        fetchAiPredictions();
      }
    }
  };

  const handleCopyOrderList = () => {
    const recommendedList = aiPredictions
      .map(pred => {
        const item = items.find(itm => String(itm.id).trim() === String(pred.itemId).trim());
        if (!item || !pred.suggestedReorderQty || pred.suggestedReorderQty <= 0) return null;
        return {
          name: item.name,
          qty: pred.suggestedReorderQty,
          unit: item.unit,
          confidence: pred.confidence,
          reasoning: pred.reasoning
        };
      })
      .filter(Boolean);

    if (recommendedList.length === 0) {
      return;
    }

    const text = recommendedList
      .map((rec, idx) => `${idx + 1}. ${rec.name}: Reorder ${rec.qty!.toFixed(1)} ${rec.unit} (${rec.confidence} confidence) - ${rec.reasoning}`)
      .join("\n");

    const header = `📋 AI SUGGESTED REORDER LIST\nGenerated on: ${new Date().toLocaleDateString()}\n\n`;
    
    navigator.clipboard.writeText(header + text)
      .then(() => {
        setCopiedSelected(true);
        setTimeout(() => setCopiedSelected(false), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy list: ", err);
      });
  };

  const handleExportPredictionsPDF = () => {
    if (aiPredictions.length === 0) return;

    const headers = ['Item Name', 'Daily Avg Consumption', 'Days Remaining', 'AI Recommendation', 'Confidence', 'AI Reasoning'];
    const rows = aiPredictions
      .map(pred => {
        const item = items.find(itm => String(itm.id).trim() === String(pred.itemId).trim());
        if (!item) return null;
        
        const daysLeft = pred.daysRemaining >= 999 ? '999+ days' : `${pred.daysRemaining.toFixed(1)} days`;
        const dailyAvg = `${pred.averageDailyConsumption.toFixed(2)} ${item.unit}/day`;
        const reorderQty = pred.suggestedReorderQty > 0 ? `Reorder ${pred.suggestedReorderQty.toFixed(1)} ${item.unit}` : 'Healthy (0)';
        
        return [
          item.name,
          dailyAvg,
          daysLeft,
          reorderQty,
          pred.confidence,
          pred.reasoning
        ];
      })
      .filter(Boolean) as any[][];

    exportTableToPDF(
      headers, 
      rows, 
      'Smart Reorder Predictions - AI Analysis Report', 
      'ai_reorder_predictions_report',
      {
        title: 'Smart Reorder Predictions - AI Analysis Report',
        timestamp: new Date().toLocaleString(),
      }
    );
  };

  const handleExportPredictionsExcel = () => {
    if (aiPredictions.length === 0) return;

    const headers = ['Item Name', 'Daily Avg Consumption', 'Days Remaining', 'AI Recommendation', 'Confidence', 'AI Reasoning'];
    const rows = aiPredictions
      .map(pred => {
        const item = items.find(itm => String(itm.id).trim() === String(pred.itemId).trim());
        if (!item) return null;

        const daysLeft = pred.daysRemaining >= 999 ? '999+' : pred.daysRemaining;
        const dailyAvg = pred.averageDailyConsumption;
        const reorderQty = pred.suggestedReorderQty;

        return [
          item.name,
          `${dailyAvg.toFixed(2)} ${item.unit}/day`,
          daysLeft,
          reorderQty > 0 ? `Reorder ${reorderQty.toFixed(1)} ${item.unit}` : 'Healthy (0)',
          pred.confidence,
          pred.reasoning
        ];
      })
      .filter(Boolean) as any[][];

    exportTableToExcel(
      headers, 
      rows, 
      'AI Analysis', 
      'ai_reorder_predictions_report',
      {
        title: 'Smart Reorder Predictions - AI Analysis Report',
        timestamp: new Date().toLocaleString()
      }
    );
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
        <div className="flex flex-col md:flex-row md:items-baseline md:gap-4 gap-2">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Stock Inventory</h2>
          <button
            onClick={handleTogglePredictions}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-1.5 border rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer max-w-max",
              showPredictions 
                ? "bg-violet-600 border-violet-600 text-white hover:bg-violet-700" 
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            )}
          >
            <Sparkles size={14} className={cn(showPredictions ? "animate-pulse" : "text-violet-500")} />
            AI Reorder Predictions
          </button>
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

      {showPredictions && (
        <div className="bg-gradient-to-br from-violet-50/50 to-indigo-50/30 border border-violet-100 p-6 rounded-3xl shadow-sm dark:from-slate-950 dark:to-slate-900 dark:border-violet-950/40">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-violet-600/10 dark:bg-violet-500/10">
                <Brain size={20} className="text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 tracking-tight">
                  Smart Reorder Predictions
                  <span className="px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase bg-violet-600 text-white rounded">AI-Powered</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium dark:text-slate-400">
                  AI analyzed recent consumption trends & current stock levels to predict reorder requirements.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {aiPredictions.length > 0 && aiPredictions.some(pred => (pred.suggestedReorderQty || 0) > 0) && (
                <button
                  onClick={handleCopyOrderList}
                  disabled={loadingPredictions}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 border cursor-pointer",
                    copiedSelected 
                      ? "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700 font-bold" 
                      : "bg-violet-50 hover:bg-violet-100 text-violet-700 border-violet-100 font-bold dark:bg-violet-950/20 dark:border-violet-900/30 dark:text-violet-300"
                  )}
                >
                  {copiedSelected ? <Check size={13} /> : <Copy size={13} />}
                  {copiedSelected ? "Copied List!" : "Copy Suggested Order List"}
                </button>
              )}
              {aiPredictions.length > 0 && (
                <>
                  <button
                    onClick={handleExportPredictionsPDF}
                    disabled={loadingPredictions}
                    className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                  >
                    <FileDown size={13} className="text-red-500" />
                    Download PDF
                  </button>
                  <button
                    onClick={handleExportPredictionsExcel}
                    disabled={loadingPredictions}
                    className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                  >
                    <FileDown size={13} className="text-emerald-500" />
                    Download Excel
                  </button>
                </>
              )}
              <button
                onClick={fetchAiPredictions}
                disabled={loadingPredictions}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw size={13} className={cn("text-slate-500", loadingPredictions && "animate-spin")} />
                Refresh Analysis
              </button>
            </div>
          </div>

          {loadingPredictions ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 bg-white/40 rounded-2xl dark:bg-slate-900/30">
              <RefreshCw className="animate-spin text-violet-600" size={32} />
              <p className="text-sm font-bold text-violet-700 dark:text-violet-400 tracking-tight animate-pulse">Running Gemini analysis...</p>
              <p className="text-xs text-slate-400 font-medium">Crunching historical issues and safety margins</p>
            </div>
          ) : predictionError ? (
            <div className="p-5 border border-red-100 rounded-2xl bg-red-50/50 flex flex-col md:flex-row gap-3 items-start dark:bg-red-950/15 dark:border-red-950/30">
              <AlertTriangle className="text-red-500 flex-shrink-0" size={20} />
              <div className="space-y-1">
                <p className="text-sm font-bold text-red-800 dark:text-red-400">Analysis Failed</p>
                <p className="text-xs text-red-600 dark:text-red-500 font-medium">{predictionError}</p>
                <button
                  onClick={fetchAiPredictions}
                  className="mt-2 text-xs font-bold text-violet-600 hover:text-violet-700 underline dark:text-violet-400"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : aiPredictions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 bg-white/40 rounded-2xl dark:bg-slate-900/30">
              <Sparkles className="text-slate-400" size={24} />
              <p className="text-sm font-medium text-slate-500">No prediction data found. Click Refresh to run analysis.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/60 shadow-sm bg-white dark:bg-slate-900 dark:border-slate-800">
              <table className="w-full text-left border-collapse table-auto">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 dark:bg-slate-900/60 dark:border-slate-800">
                    <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400">Item Name</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right dark:text-slate-400 w-28">Daily Avg</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right dark:text-slate-400 w-32">Days Remaining</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right dark:text-slate-400 w-40">AI Recommendation</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400 w-28">Confidence</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400">AI Reasoning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {aiPredictions.map((pred, i) => {
                    const item = items.find(itm => String(itm.id).trim() === String(pred.itemId).trim());
                    if (!item) return null;

                    const daysLeft = pred.daysRemaining;
                    const dailyAvg = pred.averageDailyConsumption;
                    const reorderQty = pred.suggestedReorderQty;
                    
                    let statusLabel = "";
                    let runoutStyle = "text-slate-700 dark:text-slate-300 font-bold font-mono text-sm";
                    
                    if (daysLeft < 3) {
                      statusLabel = "Critical Risk";
                      runoutStyle = "text-rose-600 dark:text-rose-400 font-bold font-mono text-sm animate-pulse";
                    } else if (daysLeft < 7) {
                      statusLabel = "At Risk";
                      runoutStyle = "text-amber-600 dark:text-amber-500 font-bold font-mono text-sm";
                    } else {
                      statusLabel = "Safe";
                    }

                    return (
                      <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                        <td className="py-3 px-4 text-sm font-bold text-slate-800 dark:text-slate-200">
                          {item.name}
                        </td>
                        <td className="py-3 px-4 text-sm text-right font-medium text-slate-600 dark:text-slate-400 font-mono">
                          {dailyAvg.toFixed(2)} {item.unit}/day
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className={runoutStyle}>
                              {daysLeft >= 999 ? "∞" : `${daysLeft.toFixed(1)} days`}
                            </span>
                            {statusLabel && (
                              <span className={cn(
                                "text-[9px] font-bold uppercase tracking-tight leading-none mt-0.5",
                                statusLabel === "Critical Risk" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-500"
                              )}>
                                {statusLabel}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {reorderQty > 0 ? (
                            <span className="px-2 py-1 rounded bg-violet-50 text-violet-800 border border-violet-100 text-xs font-bold dark:bg-violet-950/20 dark:border-violet-900/40 dark:text-violet-400">
                              Order +{reorderQty.toFixed(1)} {item.unit}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">No order needed</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight",
                            pred.confidence === "High" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400" :
                            pred.confidence === "Medium" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400" :
                            "bg-slate-50 text-slate-600 dark:bg-slate-850 dark:text-slate-400"
                          )}>
                            {pred.confidence}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs font-medium text-slate-500 dark:text-slate-400 max-w-xs md:max-w-none truncate md:whitespace-normal">
                          {pred.reasoning}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
         <DataTable
             data={items}
             columns={columns}
             loading={loading}
             searchKeys={['name', 'type']}
             emptyMessage="No items found matching your criteria."
             onExportPDF={(filteredData, activeColumns) => {
                 const headers = activeColumns.map(c => typeof c.header === 'string' ? c.header : c.key);
                 const rows = filteredData.map(item => 
                     activeColumns.map(c => {
                         switch (c.key) {
                             case 'name': return item.name;
                             case 'type': return item.type;
                             case 'unit': return item.unit;
                             case 'price': return item.price.toFixed(2);
                             case 'stock': return item.stock.toFixed(2);
                             case 'value': return item.value.toFixed(2);
                             case 'status': return item.stock <= item.minParLevel ? 'Low Stock' : 'Healthy';
                             default: return '';
                         }
                     })
                 );
                 exportTableToPDF(headers, rows, 'Inventory Report', 'inventory_report');
             }}
             onExportExcel={(filteredData, activeColumns) => {
                 const headers = activeColumns.map(c => typeof c.header === 'string' ? c.header : c.key);
                 const rows = filteredData.map(item => 
                     activeColumns.map(c => {
                         switch (c.key) {
                             case 'name': return item.name;
                             case 'type': return item.type;
                             case 'unit': return item.unit;
                             case 'price': return item.price;
                             case 'stock': return item.stock;
                             case 'value': return item.value;
                             case 'status': return item.stock <= item.minParLevel ? 'Low Stock' : 'Healthy';
                             default: return '';
                         }
                     })
                 );
                 exportTableToExcel(headers, rows, 'Inventory', 'inventory_report');
             }}
         />
      </div>
    </div>
  );
}
