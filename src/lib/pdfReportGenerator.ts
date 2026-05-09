import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export const exportDashboardToPDF = async (elementId: string, filename: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;

    try {
        const canvas = await html2canvas(element, {
            scale: 2, // higher resolution
            useCORS: true,
            logging: false,
            backgroundColor: '#f8fafc' // slate-50
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        const imgProps = pdf.getImageProperties(imgData);
        let imgWidth = pdfWidth;
        let imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

        // If the scaled height is greater than page height, scale down to fit the height instead
        // or support multi-page (a bit complex for an arbitrary element, but we can do a scale-to-fit)
        
        let position = 0;

        // Simple approach: fit to 1 page if possible, otherwise we just print as much as it fits or add pages
        // Since it's a dashboard, it might be long. Let's add multiple pages if needed.
        let heightLeft = imgHeight;
        
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;

        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;
        }

        pdf.save(`${filename}.pdf`);
    } catch (error) {
        console.error("Error generating PDF:", error);
    }
};
