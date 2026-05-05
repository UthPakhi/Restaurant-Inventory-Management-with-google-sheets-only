# TC Inventory Management Pro: Technical & Logical Bug Report

This report identifies critical vulnerabilities, logical flaws, and technical debt discovered during the deep-system audit.

## 🔴 [Critical] High Severity: Concurrency & Race Conditions

### B-001: The "Double Issue" Inventory Drift
*   **Description**: The system reads the entire `Batches` sheet into memory, calculates the FIFO depletion locally, and then writes the result back. If two users perform an issue at the same time, User B's write will overwrite User A's changes because User B's local "snapshot" didn't include User A's depletion.
*   **Impact**: Inventory levels will be higher than actual stock. This is a "silent" failure that causes financial discrepancies.
*   **Trigger**: Two users issuing the same item within the same ~2-second window.

### B-002: Batch Append Overlap
*   **Description**: The `append` operation is atomic in Google Sheets, but when doing `Promise.all([append(Purchases), append(Batches)])`, if one fails and the other succeeds, the system enters an inconsistent state where a Purchase exists but its corresponding FIFO Batch does not.
*   **Impact**: Manual database correction required.

---

## 🟡 [Medium] Medium Severity: Data Integrity & Precision

### B-003: Floating Point Precision Errors
*   **Description**: Standard JavaScript numbers are used for financial calculations (Quantity * Cost). Over thousands of transactions, small rounding errors in the `remainingQty` can accumulate.
*   **Impact**: A batch might end up with `0.00000000001` remaining, preventing it from ever "closing" logically.
*   **Requirement**: Need strict decimal rounding (e.g., `decimal.js` or fixed `Math.round(val * 100) / 100`).

### B-004: Out-of-Order Reversal Corruption
*   **Description**: If Issue #1 takes from Batch A, and Issue #2 takes the rest of Batch A, and only Issue #1 is reversed, Batch A is restored. However, if a user then manually edits the sheet, the `rowIndex` references in the logic could become stale.
*   **Impact**: Reversals might restore stock to the wrong physical row in the sheet if rows were sorted/moved manually by the admin.

---

## 🔵 [Low] Low Severity: UI/UX & Resilence

### B-005: Silent Master Deletion
*   **Description**: If a "Department" or "Item" is deleted from the Masters sheet, existing transactions in the "Issues" log will show "Unknown Item/Dept" or break the UI rendering.
*   **Requirement**: Implement "Soft Deletes" or a check that prevents deletion if transactions exist.

### B-006: Bulk Import Character Limit
*   **Description**: Passing 1000+ lines of text in a single URL/API body may hit the Google Cloud Nginx buffer limits (8kb - 16kb headers/body).
*   **Impact**: Bulk imports might fail for very large datasets without clear error messages.

### B-007: FIFO Reversal Mis-prioritization & Bulk Issue State Freezing [RESOLVED]
*   **Description**: Reversals did not push the batch back to the highest priority, causing new issues to fulfill from newer, more expensive stock. During bulk imports, multiple items consuming the exact same batch concurrently passed via the same `issuesToPost` array did not subtract from a unified memory ledger.
*   **Impact**: Cost accuracy drift and total stock value misreporting.
*   **Resolution Details**: Applied dynamic `.sort()` priority tagging in `fifoEngine` enforcing that `B_OPEN_` and `B_REV_` references inherently queue before newer batch dates. Solved bulk state freezes by cloning the live ledger array sequentially during the `bulkIssueFIFO` iterator loop.

---

## 🛠 Strategic Recommendations

1.  **Row Versioning (ETag/Optimistic Locking)**: Add a `version` or `lastUpdated` column to the `Batches` sheet. Before writing, check if the value on the sheet matches the one we read. If not, the data changed, and the user must refresh.
2.  **Transactional Logic**: Move multi-sheet updates into a single server-side `BatchUpdate` where possible to ensure "All or Nothing" execution.
3.  **Master ID Immutability**: Ensure that even if a name changes, the `ID` remains identical throughout history.
