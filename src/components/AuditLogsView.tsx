import React, { useState, useEffect } from 'react';
import { History, Loader2 } from 'lucide-react';
import { sheetsService } from '../services/sheetsService';
import { mapRowToAuditLog } from '../services/dataMappers';
import { AuditLog } from '../types';
import { DataTable, Column } from './DataTable';

export const AuditLogsView: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<AuditLog[]>([]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const rows = await sheetsService.read('AuditLogs!A2:E');
            setLogs((rows || []).map(mapRowToAuditLog).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const columns: Column<AuditLog>[] = [
        {
            key: 'timestamp',
            header: 'Timestamp',
            cell: (log) => <span className="font-medium text-slate-600">{new Date(log.timestamp).toLocaleString()}</span>,
            sortable: true
        },
        {
            key: 'userEmail',
            header: 'User Email',
            cell: (log) => <span className="font-bold text-slate-900">{log.userEmail}</span>,
            sortable: true
        },
        {
            key: 'action',
            header: 'Action',
            cell: (log) => <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold uppercase tracking-wider">{log.action}</span>,
            sortable: true
        },
        {
            key: 'sheetName',
            header: 'Sheet Activity',
            cell: (log) => <span className="font-medium text-slate-600">{log.sheetName}</span>,
            sortable: true
        },
        {
            key: 'details',
            header: 'Details',
            cell: (log) => <span className="font-medium text-slate-500">{log.details}</span>
        }
    ];

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
                <DataTable 
                    data={logs} 
                    columns={columns} 
                    loading={loading}
                    searchKeys={['userEmail', 'action', 'sheetName', 'details']}
                    emptyMessage="No audit history found."
                />
            </div>
        </div>
    );
};
