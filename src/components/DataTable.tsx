import React, { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, Loader2, FileText, Download, X, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { AnimatePresence, motion } from 'motion/react';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (item: T) => React.ReactNode;
  exportValue?: (item: T) => any; // For extracting plain data for exports
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  sortFn?: (a: T, b: T) => number;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  searchable?: boolean;
  searchKeys?: (keyof T | string)[]; // Can be simple keys or nested accessors if we add support, but sticking to simple keys normally
  customSearch?: (data: T, query: string) => boolean;
  emptyMessage?: string;
  pagination?: boolean;
  pageSizeStats?: number[];
  defaultPageSize?: number;
  onExportPDF?: (filteredData: T[], activeColumns: Column<T>[]) => Promise<void> | void;
  onExportExcel?: (filteredData: T[], activeColumns: Column<T>[]) => Promise<void> | void;
  summaryRow?: React.ReactNode;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  loading = false,
  searchable = true,
  searchKeys = [],
  customSearch,
  emptyMessage = "No data found",
  pagination = true,
  pageSizeStats = [10, 25, 50, 100],
  defaultPageSize = 25,
  onExportPDF,
  onExportExcel,
  summaryRow
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // Export State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState<'pdf' | 'excel' | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(columns.map(c => c.key));
  const [isExporting, setIsExporting] = useState(false);


  const filteredData = useMemo(() => {
    let result = [...data];

    // Search
    if (search.trim() && (searchKeys.length > 0 || customSearch)) {
      const q = search.toLowerCase();
      result = result.filter(item => {
        if (customSearch) return customSearch(item, q);
        return searchKeys.some(key => {
            const val = item[key as string];
            if (val === undefined || val === null) return false;
            return String(val).toLowerCase().includes(q);
        });
      });
    }

    // Sort
    if (sortConfig) {
      const col = columns.find(c => c.key === sortConfig.key);
      if (col) {
        result.sort((a, b) => {
          if (col.sortFn) {
            return sortConfig.direction === 'asc' ? col.sortFn(a, b) : col.sortFn(b, a);
          }
          const aVal = a[sortConfig.key];
          const bVal = b[sortConfig.key];
          if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
      }
    }

    return result;
  }, [data, search, searchKeys, customSearch, sortConfig, columns]);

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = useMemo(() => {
    if (!pagination) return filteredData;
    const start = (page - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, page, pageSize, pagination]);

  // Adjust page if data shrinks
  React.useEffect(() => {
     if (page > totalPages && totalPages > 0) {
         setPage(totalPages);
     }
  }, [totalPages, page]);

  const handleSort = (key: string) => {
    const col = columns.find(c => c.key === key);
    if (!col || !col.sortable) return;

    setSortConfig(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return null;
      }
      return { key, direction: 'asc' };
    });
  };

  const executeExport = async () => {
    if (!exportType) return;
    setIsExporting(true);
    try {
        const activeCols = columns.filter(c => selectedColumns.includes(c.key));
        if (exportType === 'pdf' && onExportPDF) await onExportPDF(filteredData, activeCols);
        if (exportType === 'excel' && onExportExcel) await onExportExcel(filteredData, activeCols);
    } catch(e) {
        console.error("Export Failed", e);
    } finally {
        setIsExporting(false);
        setShowExportModal(false);
        setExportType(null);
    }
  };

  return (
    <div className="space-y-4">
      {(searchable || onExportPDF || onExportExcel) && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            {searchable && (
              <div className="relative max-w-sm w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                />
              </div>
            )}
            
            {(onExportPDF || onExportExcel) && (
              <div className="flex gap-2">
                {onExportPDF && (
                  <button 
                    onClick={() => { setExportType('pdf'); setShowExportModal(true); }}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50"
                    title="Export to PDF"
                    disabled={isExporting}
                  >
                    {isExporting && exportType === 'pdf' ? <Loader2 size={16} className="animate-spin text-red-500"/> : <FileText size={16} className="text-red-500" />}
                    <span className="hidden sm:inline">PDF</span>
                  </button>
                )}
                {onExportExcel && (
                  <button 
                    onClick={() => { setExportType('excel'); setShowExportModal(true); }}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50"
                    title="Export to Excel"
                    disabled={isExporting}
                  >
                    {isExporting && exportType === 'excel' ? <Loader2 size={16} className="animate-spin text-emerald-500"/> : <Download size={16} className="text-emerald-500" />}
                    <span className="hidden sm:inline">Excel</span>
                  </button>
                )}
              </div>
            )}
          </div>
          {pagination && (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
               <span>Show</span>
               <select
                 className="p-1 border border-slate-200 rounded bg-white text-slate-700 outline-none dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300"
                 value={pageSize}
                 onChange={(e) => {
                     setPageSize(Number(e.target.value));
                     setPage(1);
                 }}
               >
                 {pageSizeStats.map(size => <option key={size} value={size}>{size}</option>)}
               </select>
               <span>entries</span>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden dark:bg-slate-900 dark:border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200 dark:bg-slate-950/50 dark:text-slate-400 dark:border-slate-800">
              <tr>
                {columns.map(col => (
                  <th 
                    key={col.key}
                    className={cn(
                        "px-6 py-4 whitespace-nowrap select-none",
                        col.sortable && "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors",
                        col.align === 'right' && "text-right",
                        col.align === 'center' && "text-center"
                    )}
                    onClick={() => handleSort(col.key)}
                  >
                    <div className={cn("flex items-center gap-2", col.align === 'right' && "justify-end", col.align === 'center' && "justify-center")}>
                        {col.header}
                        {col.sortable && (
                            <ArrowUpDown size={12} className={cn("text-slate-300 dark:text-slate-600", sortConfig?.key === col.key && "text-emerald-500")} />
                        )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-12 text-center">
                    <Loader2 className="animate-spin text-slate-400 dark:text-slate-600 mx-auto" size={24} />
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-12 text-center text-slate-400 italic dark:text-slate-600">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    {columns.map(col => (
                      <td 
                        key={col.key} 
                        className={cn(
                            "px-6 py-4",
                            col.align === 'right' && "text-right",
                            col.align === 'center' && "text-center"
                        )}
                       >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {summaryRow && (
              <tfoot className="bg-emerald-50 text-[11px] uppercase tracking-wider text-emerald-800 font-bold border-t border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50">
                {summaryRow}
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {pagination && filteredData.length > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
            <div>
               Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, filteredData.length)} of {filteredData.length} entries
            </div>
            <div className="flex items-center gap-1">
               <button
                 className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                 disabled={page === 1}
                 onClick={() => setPage(p => p - 1)}
               >
                   <ChevronLeft size={16} />
               </button>
               <div className="flex gap-1 items-center px-2">
                 {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = i + 1;
                    // Simple logic when many pages (center around current)
                    if (totalPages > 5) {
                        if (page > 3) pageNum = page - 2 + i;
                        if (page > totalPages - 2) pageNum = totalPages - 4 + i;
                    }
                    return (
                        <button
                          key={pageNum}
                          className={cn(
                              "w-7 h-7 rounded-md font-medium transition-colors",
                              page === pageNum ? "bg-emerald-500 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                          )}
                          onClick={() => setPage(pageNum)}
                        >
                            {pageNum}
                        </button>
                    )
                 })}
               </div>
               <button
                 className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                 disabled={page === totalPages}
                 onClick={() => setPage(p => p + 1)}
               >
                   <ChevronRight size={16} />
               </button>
            </div>
        </div>
      )}

      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-slate-800 dark:text-slate-200">
                  Select Columns to Export
                </h3>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
                {columns.filter(c => c.key !== 'actions').map(col => (
                  <label key={col.key} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                    <div className={cn("w-5 h-5 rounded flex items-center justify-center border transition-colors", selectedColumns.includes(col.key) ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900")}>
                      {selectedColumns.includes(col.key) && <Check size={14} />}
                    </div>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={selectedColumns.includes(col.key)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedColumns(p => [...p, col.key]);
                        else setSelectedColumns(p => p.filter(k => k !== col.key));
                      }}
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {typeof col.header === 'string' ? col.header : col.key}
                    </span>
                  </label>
                ))}
              </div>
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900/50">
                <button
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeExport}
                  disabled={isExporting || selectedColumns.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-emerald-700 transition-all disabled:opacity-50"
                >
                  {isExporting ? <Loader2 size={16} className="animate-spin" /> : (exportType === 'pdf' ? <FileText size={16} /> : <Download size={16} />)}
                  Export {exportType === 'pdf' ? 'PDF' : 'Excel'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
