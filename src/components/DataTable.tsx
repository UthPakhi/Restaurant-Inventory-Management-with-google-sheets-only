import React, { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, Loader2, FileText, Download } from 'lucide-react';
import { cn } from '../lib/utils';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (item: T) => React.ReactNode;
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
  onExportPDF?: (filteredData: T[]) => void;
  onExportExcel?: (filteredData: T[]) => void;
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
  onExportExcel
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

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
                    onClick={() => onExportPDF(filteredData)}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                    title="Export to PDF"
                  >
                    <FileText size={16} className="text-red-500" />
                    <span className="hidden sm:inline">PDF</span>
                  </button>
                )}
                {onExportExcel && (
                  <button 
                    onClick={() => onExportExcel(filteredData)}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                    title="Export to Excel"
                  >
                    <Download size={16} className="text-emerald-500" />
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
    </div>
  );
}
