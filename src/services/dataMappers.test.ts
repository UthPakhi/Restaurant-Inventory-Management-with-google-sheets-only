import { describe, it, expect } from 'vitest';
import { mapRowToItem, mapItemToRow, mapRowToDepartment, mapRowToSupplier } from './dataMappers';
import { Item, Department, Supplier } from '../types';

describe('Data Mappers', () => {
    describe('Items', () => {
        it('should map row to item with active status', () => {
            const row = ["ITM1", "Item 1", "D1", "kg", "10", "20", "Cat1", "100", "10", "50", "Yes"];
            const item = mapRowToItem(row);
            expect(item.isActive).toBe(true);
            expect(item.name).toBe("Item 1");
        });

        it('should map row to item with inactive status', () => {
            const row = ["ITM1", "Item 1", "D1", "kg", "10", "20", "Cat1", "100", "10", "50", "No"];
            const item = mapRowToItem(row);
            expect(item.isActive).toBe(false);
        });

        it('should map item to row correctly', () => {
            const item: Item = {
                id: "ITM1",
                name: "Item 1",
                deptIds: "D1",
                unit: "kg",
                buyPrice: 10,
                sellPrice: 20,
                category: "Cat1",
                openingStock: 100,
                minParLevel: 10,
                reorderQty: 50,
                isActive: false
            };
            const row = mapItemToRow(item);
            expect(row[10]).toBe("No");
        });
    });

    describe('Departments', () => {
        it('should map row to dept with status', () => {
            const row = ["D1", "Dept 1", "No"];
            const dept = mapRowToDepartment(row);
            expect(dept.isActive).toBe(false);
            expect(dept.name).toBe("Dept 1");
        });
    });

    describe('Suppliers', () => {
        it('should map row to supplier with status', () => {
            const row = ["S1", "Sup 1", "Contact info", "Yes"];
            const supplier = mapRowToSupplier(row);
            expect(supplier.isActive).toBe(true);
            expect(supplier.contact).toBe("Contact info");
        });
    });
});
