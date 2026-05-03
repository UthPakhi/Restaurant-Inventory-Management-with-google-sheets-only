import React, { useState, useEffect } from 'react';
import { History, Search, Loader2 } from 'lucide-react';
import { sheetsService } from '../services/sheetsService';

export const AuditLogsView: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const rows = await sheetsService.read('AuditLogs!A2:E');
            setLogs(Array.isArray(rows) ? rows : []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const filteredLogs = logs.filter(log => {
        const text = log.join(' ').toLowerCase();
        return text.includes(searchQuery.toLowerCase());
    }).sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                    <History className="text-blue-500" />
                    Audit Logs
                </h2>
                <p className="text-sm font-medium text-slate-500">Track all sensitive actions, edits, and entries across the application.</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <div className="relative">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search logs by action, user, or details..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 p-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b-2 border-slate-100">
                                <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Timestamp</th>
                                <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">User Email</th>
                                <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                                <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Sheet Activity</th>
                                <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-slate-400">
                                        <Loader2 className="animate-spin mx-auto" />
                                    </td>
                                </tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-sm font-bold text-slate-400">
                                        No audit history found.
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map((log, i) => (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-3 px-4 text-sm font-medium text-slate-600">
                                            {new Date(log[0]).toLocaleString()}
                                        </td>
                                        <td className="py-3 px-4 text-sm font-bold text-slate-900">{log[1]}</td>
                                        <td className="py-3 px-4">
                                            <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold uppercase tracking-wider">
                                                {log[2]}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-sm font-medium text-slate-600">{log[3]}</td>
                                        <td className="py-3 px-4 text-sm font-medium text-slate-500">{log[4]}</td>
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
