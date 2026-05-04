import { parseFinancialNumber } from '../lib/utils';
import { 
    Item, Department, Supplier, Purchase, Issue, 
    Batch, DailyConsumption, Sales, Cashflow, AuditLog 
} from '../types';

// ============================================
// Item Mappers (Masters_Items)
// ["ID", "Name", "Dept_IDs", "Unit", "BuyPrice", "SellPrice", "Category", "OpeningStock", "MinParLevel", "ReorderQty"]
// ============================================

export const mapRowToItem = (row: any[]): Item => ({
    id: row[0] || '',
    name: row[1] || '',
    deptIds: row[2] || '',
    unit: row[3] || '',
    buyPrice: parseFinancialNumber(row[4]),
    sellPrice: parseFinancialNumber(row[5]),
    category: row[6] || '',
    openingStock: parseFinancialNumber(row[7]),
    minParLevel: parseFinancialNumber(row[8]),
    reorderQty: parseFinancialNumber(row[9]),
    isActive: row[10] !== 'No',
});

export const mapItemToRow = (item: Item): any[] => [
    item.id,
    item.name,
    item.deptIds,
    item.unit,
    item.buyPrice,
    item.sellPrice,
    item.category,
    item.openingStock,
    item.minParLevel,
    item.reorderQty,
    item.isActive === false ? 'No' : 'Yes'
];

export const mapRowToDepartment = (row: any[]): Department => ({
    id: row[0] || '',
    name: row[1] || '',
    isActive: row[2] !== 'No'
});

export const mapRowToSupplier = (row: any[]): Supplier => ({
    id: row[0] || '',
    name: row[1] || '',
    contact: row[2] || '',
    isActive: row[3] !== 'No'
});

// Purchases: ["ID", "Date", "Item_ID", "Qty", "Rate", "Total", "Supplier_ID", "Invoice_No", "UserEmail"]
export const mapRowToPurchase = (row: any[]): Purchase => ({
    id: row[0] || '',
    date: row[1] || '',
    itemId: row[2] || '',
    qty: parseFinancialNumber(row[3]),
    rate: parseFinancialNumber(row[4]),
    total: parseFinancialNumber(row[5]),
    supplierId: row[6] || '',
    invoice: row[7] || '',
    userEmail: row[8] || ''
});

export const mapPurchaseToRow = (purchase: Purchase): any[] => [
    purchase.id,
    purchase.date,
    purchase.itemId,
    purchase.qty,
    purchase.rate,
    purchase.total,
    purchase.supplierId,
    purchase.invoice,
    purchase.userEmail || ''
];

// Issues: ["ID", "Date", "Dept_ID", "Item_ID", "Qty", "Rate", "UserEmail"]
export const mapRowToIssue = (row: any[]): Issue => ({
    id: row[0] || '',
    date: row[1] || '',
    deptId: row[2] || '',
    itemId: row[3] || '',
    qty: parseFinancialNumber(row[4]),
    rate: parseFinancialNumber(row[5]),
    total: parseFinancialNumber(row[4]) * parseFinancialNumber(row[5]), // Calculated if needed, or row[5] is already something else
    userEmail: row[6] || ''
});

// Batches: ["Batch_ID", "Item_ID", "Date", "Qty_Original", "Qty_Remaining", "Unit_Cost", "Source"]
export const mapRowToBatch = (row: any[]): Batch => ({
    id: row[0] || '',
    itemId: row[1] || '',
    date: row[2] || '',
    originalQty: parseFinancialNumber(row[3]),
    remainingQty: parseFinancialNumber(row[4]),
    rate: parseFinancialNumber(row[5]),
    source: row[6] || ''
});

export const mapBatchToRow = (batch: Batch): any[] => [
    batch.id,
    batch.itemId,
    batch.date,
    batch.originalQty,
    batch.remainingQty,
    batch.rate,
    batch.source
];

// DailyConsumption: ["Date", "Day", "Handi", "Bar", "Karahi", "Drinks", "Pantree", "Pizza", "Tandoor", "BBQ", "Tea", "TOTAL"]
export const mapRowToDailyConsumption = (row: any[]): DailyConsumption => ({
    date: row[0] || '',
    day: row[1] || '',
    handi: parseFinancialNumber(row[2]),
    bar: parseFinancialNumber(row[3]),
    karahi: parseFinancialNumber(row[4]),
    drinks: parseFinancialNumber(row[5]),
    pantree: parseFinancialNumber(row[6]),
    pizza: parseFinancialNumber(row[7]),
    tandoor: parseFinancialNumber(row[8]),
    bbq: parseFinancialNumber(row[9]),
    tea: parseFinancialNumber(row[10]),
    totalCost: parseFinancialNumber(row[11])
});

export const mapRowToSales = (row: any[]): Sales => ({
    id: row[0] || '',
    date: row[1] || '',
    amount: parseFinancialNumber(row[2]),
    deptId: row[3] || ''
});

export const mapRowToCashflow = (row: any[]): Cashflow => ({
    id: row[0] || '',
    date: row[1] || '',
    type: row[2] || '',
    amount: parseFinancialNumber(row[3]),
    description: row[4] || '',
    refId: row[5] || ''
});

export const mapRowToAuditLog = (row: any[]): AuditLog => ({
    timestamp: row[0] || '',
    userEmail: row[1] || '',
    action: row[2] || '',
    sheetName: row[3] || '',
    details: row[4] || ''
});
