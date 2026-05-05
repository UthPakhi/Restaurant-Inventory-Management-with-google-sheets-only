/**
 * Pure logic for FIFO inventory calculations.
 */

export interface Batch {
    id: string;
    itemId: string;
    date: string;
    originalQty: number;
    remainingQty: number;
    cost: number;
    source: string;
    rowIndex?: number;
}

export interface IssueRequest {
    itemId: string;
    qty: number;
    date: string;
    deptId: string;
    itemName?: string;
    deptName?: string;
}

export interface IssueResult {
    success: boolean;
    error?: string;
    issueId?: string;
    avgRate?: number;
    totalCost?: number;
    itemId: string;
    itemName?: string;
    deptName?: string;
    consumedBatches?: { rowIndex: number; consumed: number; newRemaining: number }[];
}

export function calculateFIFO(
    issueReq: IssueRequest,
    availableBatches: Batch[]
): IssueResult {
    const { itemId, qty: qtyRequested, itemName, deptName } = issueReq;

    if (qtyRequested <= 0) {
        return {
            success: false,
            error: `Invalid quantity requested for ${itemName || itemId}: ${qtyRequested}`,
            itemId
        };
    }

    // Filter and sort for FIFO
    const itemBatches = [...availableBatches]
        .filter(b => b.itemId === itemId && b.remainingQty > 0)
        .sort((a, b) => {
            const getPriority = (batch: Batch) => {
                if (batch.id.startsWith('B_OPEN_') || batch.source === 'Opening') return 0;
                if (batch.id.startsWith('B_REV_') || (batch.source && batch.source.startsWith('Reversal'))) return 1;
                return 2;
            };
            
            const pA = getPriority(a);
            const pB = getPriority(b);
            
            if (pA !== pB) return pA - pB;

            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
        });

    const totalAvailable = Math.round(itemBatches.reduce((sum, b) => sum + b.remainingQty, 0) * 10000) / 10000;
    if (totalAvailable < qtyRequested) {
        return { 
            success: false, 
            error: `Insufficient stock for ${itemName || itemId}. Available: ${totalAvailable}, Requested: ${qtyRequested}`, 
            itemId 
        };
    }

    let remainingToIssue = qtyRequested;
    let totalCost = 0;
    const consumedBatches = [];

    for (const batch of itemBatches) {
        if (remainingToIssue <= 0) break;
        const consumedFromThisBatch = Math.round(Math.min(batch.remainingQty, remainingToIssue) * 10000) / 10000;
        const newRemaining = Math.round((batch.remainingQty - consumedFromThisBatch) * 10000) / 10000;
        
        totalCost += consumedFromThisBatch * batch.cost;
        remainingToIssue = Math.round((remainingToIssue - consumedFromThisBatch) * 10000) / 10000;
        
        if (batch.rowIndex !== undefined) {
            consumedBatches.push({
                rowIndex: batch.rowIndex,
                consumed: consumedFromThisBatch,
                newRemaining
            });
        }
    }

    const avgRate = totalCost / qtyRequested;

    return {
        success: true,
        issueId: `ISS_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        avgRate,
        totalCost,
        itemId,
        itemName,
        deptName,
        consumedBatches
    };
}
