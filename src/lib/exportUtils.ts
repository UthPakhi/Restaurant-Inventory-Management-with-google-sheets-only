import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface ExportMetadata {
  title?: string;
  filters?: string;
  timestamp?: string;
}

const COMPANY_NAME = "My Inventory Company";
const APP_TAGLINE = "Smart Store & Inventory Management system";

export const exportTableToPDF = async (headers: string[], rows: any[][], title: string, filename: string, metadata?: ExportMetadata) => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      const doc = new jsPDF('landscape'); // use landscape for better fit typically
      
      const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
      
      // Branding Header
      doc.setFillColor(16, 185, 129); // emerald-500
      doc.rect(14, 12, 4, 14, 'F');
      
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.setFont(undefined, 'bold');
      doc.text(COMPANY_NAME, 22, 18);
      
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.setFont(undefined, 'normal');
      doc.text(APP_TAGLINE, 22, 24);

      // Title
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.setFont(undefined, 'bold');
      doc.text(title, 14, 38);
      
      let startY = 46;
      
      if (metadata?.timestamp || metadata?.filters) {
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.setFont(undefined, 'normal');
        if (metadata.timestamp) {
            doc.text(`Generated on: ${metadata.timestamp}`, 14, startY);
            startY += 5;
        }
        if (metadata.filters) {
            doc.text(`Filters: ${metadata.filters}`, 14, startY);
            startY += 5;
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
          // Footer
          doc.setFontSize(8);
          doc.setTextColor(150);
          
          doc.text(
            `${COMPANY_NAME} - Automated Report`,
            14,
            pageHeight - 10
          );
          
          const str = 'Page ' + doc.internal.getCurrentPageInfo().pageNumber + ' of ' + doc.internal.getNumberOfPages();
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
      exportData.push([COMPANY_NAME]);
      exportData.push([APP_TAGLINE]);
      exportData.push([]);
      
      if (title) exportData.push([title]); // Use sheetName as fallback title if metadata.title not present
      if (metadata?.title) exportData[3] = [metadata.title]; 
      
      if (metadata?.timestamp) exportData.push([`Generated: ${metadata.timestamp}`]);
      if (metadata?.filters) exportData.push([`Filters: ${metadata.filters}`]);
      if (exportData.length > 4) exportData.push([]); // empty row
      
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

