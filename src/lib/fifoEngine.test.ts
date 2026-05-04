import { describe, it, expect } from 'vitest';
import { calculateFIFO, Batch, IssueRequest } from './fifoEngine';

describe('FIFO Engine', () => {
  it('Scenario 1.1: Should deplete multiple batches correctly', () => {
    const batches: Batch[] = [
      { id: 'B1', itemId: 'ITEM1', date: '2026-05-01', originalQty: 10, remainingQty: 10, cost: 100, source: 'Purchase', rowIndex: 2 },
      { id: 'B2', itemId: 'ITEM1', date: '2026-05-02', originalQty: 10, remainingQty: 10, cost: 120, source: 'Purchase', rowIndex: 3 },
    ];
    
    const request: IssueRequest = {
      itemId: 'ITEM1',
      qty: 15,
      date: '2026-05-04',
      deptId: 'DEPT1'
    };

    const result = calculateFIFO(request, batches);

    expect(result.success).toBe(true);
    expect(result.totalCost).toBe(1600); // (10 * 100) + (5 * 120)
    expect(result.avgRate).toBe(106.66666666666667);
    expect(result.consumedBatches).toHaveLength(2);
    expect(result.consumedBatches[0]).toEqual({ rowIndex: 2, consumed: 10, newRemaining: 0 });
    expect(result.consumedBatches[1]).toEqual({ rowIndex: 3, consumed: 5, newRemaining: 5 });
  });

  it('Scenario 1.2: Should handle exact batch matching', () => {
    const batches: Batch[] = [
      { id: 'B1', itemId: 'ITEM1', date: '2026-05-01', originalQty: 10, remainingQty: 10, cost: 100, source: 'Purchase', rowIndex: 2 },
    ];
    
    const request: IssueRequest = { itemId: 'ITEM1', qty: 10, date: '2026-05-04', deptId: 'DEPT1' };
    const result = calculateFIFO(request, batches);

    expect(result.success).toBe(true);
    expect(result.totalCost).toBe(1000);
    expect(result.consumedBatches[0].newRemaining).toBe(0);
  });

  it('Scenario 1.4: Should sort batches by date correctly (FIFO)', () => {
    const batches: Batch[] = [
      { id: 'B2', itemId: 'ITEM1', date: '2026-05-05', originalQty: 10, remainingQty: 10, cost: 150, source: 'Purchase', rowIndex: 3 },
      { id: 'B1', itemId: 'ITEM1', date: '2026-05-03', originalQty: 10, remainingQty: 10, cost: 100, source: 'Purchase', rowIndex: 2 },
    ];
    
    const request: IssueRequest = { itemId: 'ITEM1', qty: 5, date: '2026-05-06', deptId: 'DEPT1' };
    const result = calculateFIFO(request, batches);

    expect(result.success).toBe(true);
    // Should use B1 (May 03) first
    expect(result.totalCost).toBe(500); 
    expect(result.consumedBatches[0].rowIndex).toBe(2);
  });

  it('Scenario: Should prioritize Opening stock if dates are identical', () => {
    const batches: Batch[] = [
        { id: 'B_PURCH', itemId: 'ITEM1', date: '2026-05-01', originalQty: 10, remainingQty: 10, cost: 150, source: 'Purchase', rowIndex: 3 },
        { id: 'B_OPEN_1', itemId: 'ITEM1', date: '2026-05-01', originalQty: 10, remainingQty: 10, cost: 100, source: 'Opening', rowIndex: 2 },
    ];
    
    const request: IssueRequest = { itemId: 'ITEM1', qty: 5, date: '2026-05-02', deptId: 'DEPT1' };
    const result = calculateFIFO(request, batches);

    expect(result.success).toBe(true);
    // Should use B_OPEN_1 first
    expect(result.totalCost).toBe(500); 
    expect(result.consumedBatches[0].rowIndex).toBe(2);
  });

  it('Scenario: Should return error if insufficient stock', () => {
    const batches: Batch[] = [
      { id: 'B1', itemId: 'ITEM1', date: '2026-05-01', originalQty: 10, remainingQty: 10, cost: 100, source: 'Purchase', rowIndex: 2 },
    ];
    
    const request: IssueRequest = { itemId: 'ITEM1', qty: 15, date: '2026-05-04', deptId: 'DEPT1' };
    const result = calculateFIFO(request, batches);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient stock');
  });

  it('Scenario 1.3: Should restore stock correctly after a reversal', () => {
    // Initial: Batch A (10 units), Issued 10 (Result: 0 remaining)
    // Reversal: New Batch B (10 units) added back with original date
    const batches: Batch[] = [
      { id: 'B1', itemId: 'ITEM1', date: '2026-05-01', originalQty: 10, remainingQty: 0, cost: 100, source: 'Purchase', rowIndex: 2 },
      { id: 'B_REV_1', itemId: 'ITEM1', date: '2026-05-01', originalQty: 10, remainingQty: 10, cost: 100, source: 'Reversal', rowIndex: 3 },
    ];
    
    const request: IssueRequest = { itemId: 'ITEM1', qty: 5, date: '2026-05-04', deptId: 'DEPT1' };
    const result = calculateFIFO(request, batches);

    expect(result.success).toBe(true);
    expect(result.totalCost).toBe(500);
    expect(result.consumedBatches[0].rowIndex).toBe(3);
  });

  it('Scenario: Should handle floating point precision correctly', () => {
    // 0.1 + 0.2 in JS is 0.30000000000000004
    const batches: Batch[] = [
      { id: 'B1', itemId: 'ITEM1', date: '2026-05-01', originalQty: 0.1, remainingQty: 0.1, cost: 100, source: 'Purchase', rowIndex: 2 },
      { id: 'B2', itemId: 'ITEM1', date: '2026-05-02', originalQty: 0.2, remainingQty: 0.2, cost: 100, source: 'Purchase', rowIndex: 3 },
    ];
    
    // Requesting 0.3 should succeed exactly
    const request: IssueRequest = { itemId: 'ITEM1', qty: 0.3, date: '2026-05-04', deptId: 'DEPT1' };
    const result = calculateFIFO(request, batches);

    expect(result.success).toBe(true);
    expect(result.totalCost).toBe(30);
    // Be careful with exact float comparison in tests if not rounded, 
    // but our engine now rounds to 4 decimals.
    expect(result.consumedBatches[1].newRemaining).toBe(0);
  });

  it('Scenario: Should return error for zero or negative quantity', () => {
    const batches: Batch[] = [
      { id: 'B1', itemId: 'ITEM1', date: '2026-05-01', originalQty: 10, remainingQty: 10, cost: 100, source: 'Purchase', rowIndex: 2 },
    ];
    
    let result = calculateFIFO({ itemId: 'ITEM1', qty: 0, date: '2026-05-04', deptId: 'DEPT1' }, batches);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid quantity');

    result = calculateFIFO({ itemId: 'ITEM1', qty: -5, date: '2026-05-04', deptId: 'DEPT1' }, batches);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid quantity');
  });
});
