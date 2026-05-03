export interface Item {
  id: string;
  name: string;
  deptIds: string;
  unit: string;
  buyPrice: number;
  sellPrice: number;
  category: string;
  openingStock: number;
  minParLevel: number;
  reorderQty: number;
  isActive: boolean;
  rowIndex?: number;
}

export interface Department {
  id: string;
  name: string;
  rowIndex?: number;
}

export interface Supplier {
  id: string;
  name: string;
  contact?: string; // Noticed Contact in Masters_Suppliers schema
  rowIndex?: number;
}

export interface Batch {
  id: string;
  itemId: string;
  date: string;
  originalQty: number;
  remainingQty: number;
  rate: number;
  source: string;
}

export interface Issue {
  id: string;
  date: string;
  deptId: string;
  itemId: string;
  qty: number;
  rate: number;
  total: number;
  userEmail?: string;
}

export interface Purchase {
  id: string;
  date: string;
  itemId: string;
  qty: number;
  rate: number;
  total: number;
  supplierId: string;
  invoice: string;
  userEmail?: string;
}

export interface DailyConsumption {
  date: string;
  day: string;
  handi: number;
  bar: number;
  karahi: number;
  drinks: number;
  pantree: number;
  pizza: number;
  tandoor: number;
  bbq: number;
  tea: number;
  totalCost: number;
}

export interface Sales {
  id: string;
  date: string;
  amount: number;
  deptId: string;
}

export interface Cashflow {
  id: string;
  date: string;
  type: string;
  amount: number;
  description: string;
  refId: string;
}

export interface AuditLog {
  timestamp: string;
  userEmail: string;
  action: string;
  sheetName: string;
  details: string;
}
