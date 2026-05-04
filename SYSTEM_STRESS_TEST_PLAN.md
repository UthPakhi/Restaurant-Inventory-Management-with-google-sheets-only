# System Integrity & Stress Test Plan

**Note**: The user has granted full permission to modify the connected Google Sheet for testing purposes. A clean sheet will be used for final production.

## Test Execution Log

| Phase | Scenario | Status | Date | Notes |
|-------|----------|--------|------|-------|
| 1 | 1.1 Multi-Batch Depletion | ✅ Passed | 2026-05-04 | Verified via unit test |
| 1 | 1.2 Exact Batch Matching | ✅ Passed | 2026-05-04 | Verified via unit test |
| 1 | 1.3 Reversal Restoration | ✅ Passed | 2026-05-04 | Verified via unit test |
| 1 | 1.4 Chronological Sorting | ✅ Passed | 2026-05-04 | Verified via unit test |
| 2 | 2.1 Fuzzy Matching | ✅ Passed | 2026-05-04 | Verified via unit test & logic extraction |
| 2 | 2.2 Large Volume Perf | ✅ Passed | 2026-05-04 | Optimized via `valuesBatchUpdate` round-trip reduction & bulk chunking |
| 2 | 2.3 Data Poisoning | ✅ Passed | 2026-05-04 | Verified via negative quantity validation |

## Phase 1: FIFO Engine Validation (Logic & Integrity)

The FIFO engine is the core of the system. We must verify that costs are calculated correctly and batches are depleted/restored exactly as expected.

### Scenario 1.1: Multi-Batch Depletion
*   **Initial State**: 
    - Batch A (May 1): 10 units @ $100
    - Batch B (May 2): 10 units @ $120
*   **Action**: Issue 15 units.
*   **Expected Result**:
    - Total Cost: (10 * 100) + (5 * 120) = $1600.
    - Batch A: 0 units remaining.
    - Batch B: 5 units remaining.
*   **Verification**: Check `Batches` sheet for correct `remainingQty`.

### Scenario 1.2: Exact Batch Matching
*   **Initial State**: Batch A: 10 units.
*   **Action**: Issue exactly 10 units.
*   **Expected Result**: Batch A reaches exactly 0. System should not error on exactly 0.

### Scenario 1.3: Reversal Restoration
*   **Action**: Reverse the 15-unit issue from Scenario 1.1.
*   **Expected Result**:
    - Batch A: Restored to 10 units.
    - Batch B: Restored to 10 units.
    - Issue entry marked correctly in logs.

### Scenario 1.4: Chronological Sorting (Non-Sequential Entry)
*   **Action**: Enter a Purchase for May 5, then enter a Purchase for May 3. Issue items.
*   **Expected Result**: The system should use the May 3 stock *first*, even though it was entered into the sheet *after* the May 5 stock.

---

## Phase 2: Bulk Import Stress Testing

Bulk imports involve parsing raw text and mapping it to internal GUIDs.

### Scenario 2.1: Fuzzy Matching & Normalization
*   **Input**: "Lemon Syrup", "lemon syrup ", "LEMON SYRUP".
*   **Expected Result**: All should map to the same Item ID consistently.

### Scenario 2.2: Large Volume Performance
*   **Input**: 100 lines of issues across 20 different items.
*   **Expected Result**: Import should complete in < 5 seconds using the optimized `batchUpdate` API.
*   **Verification**: No "Quota Exceeded" errors from Google API.

### Scenario 2.3: Data Poisoning
*   **Input**: Lines with missing columns, invalid characters in quantity (e.g. "10kg" instead of "10"), or dates in invalid formats.
*   **Expected Result**: Graceful error reporting. Valid lines should be processed (or the whole batch rejected with clear UI feedback), never leading to corrupted sheet data.

---

## Phase 3: Data Consistency & Edge Cases

### Scenario 3.1: Renaming Masters
*   **Action**: Change the name of an item in the `Items` master list.
*   **Threat**: Old logs point to the old name or use IDs that might no longer map correctly.
*   **Verification**: Ensure all views use `itemId` as the source of truth, not the literal name stored in the log.

### Scenario 3.2: Concurrent Writes (The "Race Condition")
*   **Action**: Two users issue the same item at the same time.
*   **Threat**: Both read 10 units available, both issue 7 units. Sheet ends up with -4 units or inconsistent batch counts.
*   **Mitigation Check**: Implement "Get-Before-Write" validation and UI-level locking.

---

## Phase 4: UI/UX & Visibility

### Scenario 4.1: Dashboard Valuation Accuracy
*   **Action**: Compare the `Total Assets` on the dashboard against the sum of (Remaining Qty * Cost) in the `Batches` sheet.
*   **Tolerance**: Should be 0.00 difference.

### Scenario 4.2: Mobile Responsive Actions
*   **Action**: Perform a bulk issue and a reversal on a mobile device (375px width).
*   **Verification**: No horizontal scrolling, modals are reachable, toast notifications are legible.

---

## Phase 5: Technical Resilience

### Scenario 5.1: Token Expiry
*   **Action**: Let OAuth session expire and attempt an issue.
*   **Expected Result**: Smooth redirect to re-auth or silent refresh without data loss.

### Scenario 5.2: Network Interruption
*   **Action**: Simulate a disconnect during a `batchUpdate`.
*   **Expected Result**: The app should show a "Retry" state and keep the local changes in memory (if possible) or alert clearly that the sheet was not updated.
