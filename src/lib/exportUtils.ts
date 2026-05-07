import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface ExportMetadata {
  title?: string;
  filters?: string;
  timestamp?: string;
}

export const exportTableToPDF = async (headers: string[], rows: any[][], title: string, filename: string, metadata?: ExportMetadata) => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      const doc = new jsPDF('landscape'); // use landscape for better fit typically
      
      const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
      
      // Header
      doc.setFontSize(20);
      doc.setTextColor(15, 23, 42);
      doc.text(title, 14, 22);
      
      let startY = 32;
      
      if (metadata?.timestamp || metadata?.filters) {
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        if (metadata.timestamp) {
            doc.text(`Generated exactly at: ${metadata.timestamp}`, 14, startY);
            startY += 6;
        }
        if (metadata.filters) {
            doc.text(`Filters: ${metadata.filters}`, 14, startY);
            startY += 6;
        }
        startY += 2;
      }
      
      autoTable(doc, {
        startY,
        head: [headers],
        body: rows,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didDrawPage: function (data) {
          // Footer with page number
          const str = 'Page ' + doc.internal.getCurrentPageInfo().pageNumber + ' of ' + doc.internal.getNumberOfPages();
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text(
            str,
            pageWidth - data.settings.margin.right,
            pageHeight - 10,
            { align: 'right' }
          );
        },
      });

      doc.save(`${filename}.pdf`);
      resolve();
    }, 10);
  });
};

export const exportTableToExcel = async (headers: string[], rows: any[][], sheetName: string, filename: string, metadata?: ExportMetadata) => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      const wb = XLSX.utils.book_new();
      
      const exportData: any[][] = [];
      if (metadata?.title) exportData.push([metadata.title]);
      if (metadata?.timestamp) exportData.push([`Generated: ${metadata.timestamp}`]);
      if (metadata?.filters) exportData.push([`Filters: ${metadata.filters}`]);
      if (exportData.length > 0) exportData.push([]); // empty row
      
      exportData.push(headers);
      rows.forEach(r => exportData.push(r));
      
      const ws = XLSX.utils.aoa_to_sheet(exportData);
      
      // Auto-size columns based on content
      const colWidths = headers.map((_, colIdx) => {
        let max = 10;
        exportData.forEach(row => {
            const val = row[colIdx];
            if (val !== undefined && val !== null) {
                const len = String(val).length;
                if (len > max) max = len;
            }
        });
        return { wch: Math.min(max + 2, 50) }; // cap at 50 chars
      });
      ws['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `${filename}.xlsx`);
      resolve();
    }, 10);
  });
};

