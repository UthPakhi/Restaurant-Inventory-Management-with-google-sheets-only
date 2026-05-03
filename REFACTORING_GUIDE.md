# Complete Application Refactoring & Improvement Guidelines

This document provides a step-by-step master plan for an LLM to refactor the application. The goals are to remove architectural constraints, enforce strict TypeScript safety, implement a missing "Reversal" feature for transactions, and modernize the UX feedback mechanism.

## Rules of Engagement
- **Do not attempt to fix all pieces in a single step.**
- Treat each of the four phases as a separate execution block.
- Follow the exact specification provided beneath each phase.

---

## Phase 1: Strong Typings & Mappers (Removing `any`)

**The Problem:** 
The app relies heavily on `any[][]` and `any[]` to deal with 2D array matrix responses from Google Sheets. This causes magic index numbers (e.g., `row[1]`, `b[4]`) everywhere, making the code brittle and extremely difficult to safely refactor.

**Instructions for LLM:**
1. **Create strict Types:** Create `src/types/index.ts` and define TypeScript interfaces for every entity:
   - `Item`: id, name, deptIds, unit, buyPrice, sellPrice, category, openingStock, minParLevel, reorderQty, isActive
   - `Department`: id, name
   - `Supplier`: id, name
   - `Purchase`: id, date, itemId, qty, rate, total, supplierId, invoice
   - `Issue`: id, date, deptId, itemId, qty, unitCost, totalCost
   - `Batch`: id, itemId, date, qtyOriginal, qtyRemaining, unitCost, source
   - `DailyConsumption`: date, deptId, totalCost
   - `Cashflow`: id, date, type, amount, description, refId
2. **Create Mappers:** Inside `src/services/` (either in `sheetsService.ts` or a new `dataMappers.ts`), create bidirectional mapping functions mapping Google Sheets Arrays `string[]` to Types, and vice versa. E.g., `mapRowToItem(row: any[]): Item`, `mapItemToRow(item: Item): any[]`.
3. **Refactor Components:** Go through every view component (`PurchasesView`, `IssuesView`, `SummaryView`, `MastersView`, etc.) and replace `useState<any[]>` with proper typed states (`useState<Item[]>([])`). Rewrite the component logic to use `item.name` instead of `item[1]`.

---

## Phase 2: Architectural Constraints & State Management

**The Problem:** 
Google Sheets API rate limits will easily be hit because every component fetches the entire database (Batches, Items, etc.) independently on mount (`useEffect`). There is zero data caching.

**Instructions for LLM:**
1. **Abstract Google Sheets APIs:** Currently, components call `sheetsService.read('SheetName!A2:Z')` which hardcodes spreadsheet logic into the UI. Create wrapping service functions inside `sheetsService.ts` like `getAllItems()`, `getAllBatches()`, `createPurchases(purchases: Purchase[])`.
2. **Implement Global State / Caching:**
   - Option A: Use a lightweight global context (e.g., `src/context/AppContext.tsx`).
   - Option B: Use a caching hook architecture.
   - You must fetch the static lookup data (`Masters_Items`, `Masters_Depts`, `Masters_Suppliers`) ONCE at the root of the app, and pass them down (or distribute them via context) to prevent redundant sheet network calls every time a tab is switched.
3. **Centralize Parsing Logic:** Clean up the disparate `parseFloat(String(b[4]).replace(/,/g, ''))` formulas duplicated identically across 5 different components. Create a `parseFinancialNumber` utility in `src/lib/utils.ts` and use it exclusively.

---

## Phase 3: Missing "Reversals" (Delete/Undo Operations)

**The Problem:** 
Once a Purchase or Issue is processed, it is permanent. If a user makes a mistake entering a purchase, they cannot delete it. Deleting in an inventory system is complex because it requires re-calculating or un-consuming FIFO batches.

**Instructions for LLM:**
1. **Design the Reversal Logic in Services:**
   - **For Purchases (`reversePurchase`):**
     - Search the `Batches` sheet for the exact batch tied to the Purchase ID.
     - Check if `qtyRemaining` equals `qtyOriginal`. If it doesn't, it means the purchase has already been issued to the kitchen (Consumed). Reject the reversal and alert the user they must reverse the issues first.
     - Soft-delete or clear the row in `Purchases` and `Batches` sheets.
     - Log action to `AuditLogs`.
   - **For Issues (`reverseIssue`):**
     - Fetch the `Issue` row. Find which Batches were consumed by looking at `AuditLogs` or introducing a `Batch_Issuance_Map`. (Note: FIFO usually consumes multiple batches. If you can't trace exactly which batches, the simplest approach is to create a positive "Adjustment" Batch to return the stock back to the system).
     - Delete the `Issue` row.
2. **Add UI Elements:**
   - On the `AuditLogsView` and the history tables in `PurchasesView`/`IssuesView`, add a trash/undo action icon to the right side of the rows.
   - Create a confirmation dialogue ("Are you sure you want to reverse this transaction? This will impact current stock.").

---

## Phase 4: UX Toast Feedbacks replacing primitive alert()

**The Problem:** 
Using generic browser `alert()` and `console.error` creates a jarring user experience, blocking threads and looking unprofessional.

**Instructions for LLM:**
1. **Install/Add Toast Capabilities:**
   - Use a lightweight custom tailwind toast state if installing external libraries is undesired, or configure a library like `sonner` or `react-hot-toast`.
   - To do this practically in a strict environment, create a robust custom `<ToastProvider>` in `src/components/ui/Toast.tsx` using `motion` (framer-motion).
   - Ensure Toasts have a Success (Green), Error (Red/Rose), and Info (Blue) variant utilizing `lucide-react` icons (CheckCircle, AlertTriangle, Info).
2. **Purge Alerts:** Perform a codebase-wide find-and-replace to strip out all `alert("...")` and replace them with `toast.success("...")`.
3. **Handle Silent Fails:** Inside the `try/catch` blocks across the views (especially `SummaryView` and `StoreLedgerView`), errors are simply logged to the console via `console.error(e)`. The user has no idea a network request failed. Append `toast.error("Failed to load data. Please try again.")` to these blocks.
