# RestoManage: Comprehensive Testing Plan

This document outlines a detailed, step-by-step testing plan to ensure all features implemented in the RestoManage application function correctly and handle edge cases gracefully.

## Phase 1: Setup and Authentication [COMPLETED]
1. **First-time Setup**
   - [x] Verify the Setup Wizard appears on the first load.
   - [x] Test "Continue with Google" OAuth flow.
   - [x] Verify Spreadsheet ID configuration and Google Sheets schema initialization.
   - [x] Verify the app state persists on reload.
2. **Demo Mode (Optional)**
   - [x] Test "Try Demo Mode" without connecting to Google Sheets.
   - [x] Verify demo data is loaded and operations work seamlessly in-memory.

## Phase 2: Master Data Management [COMPLETED]
**Navigation**: Masters View
1. **Items Master**
   - [x] Add a new item manually (verify default opening stock behaves correctly).
   - [x] Bulk import items using CSV/text pasting.
   - [x] Verify missing fields flag issues in bulk import validation.
   - [x] Edit an existing item and verify changes reflect everywhere.
2. **Departments Master**
   - [x] Create new departments (e.g., Kitchen, Bar).
   - [x] Ensure departments list updates automatically across other views.
3. **Suppliers Master**
   - [x] Add new suppliers.
   - [x] Check supplier presence in the Purchases view dropdowns.
4. **Data Seeding**
   - [x] Run the "Seed Demo Data" function and ensure sheets are populated properly without duplicating data excessively.

## Phase 3: Purchases (Inwards) & Inventory [COMPLETED]
**Navigation**: Purchases View & Inventory View
1. **Single Purchase Entry**
   - [x] Add a purchase for an existing item.
   - [x] Verify rate and quantity map correctly to total amount.
   - [x] Confirm stock increases in the **Inventory View**.
   - [x] Verify a new Batch is created in the backend (FIFO queue).
2. **Bulk Purchase Import**
   - [x] Paste a block of purchase rows.
   - [x] Test validation errors (e.g., unmatched item, unmatched supplier, negative quantity).
   - [x] Resolve errors in the preview table and submit.
   - [x] Verify stock increases across all imported items.
3. **Inventory Tracking**
   - [x] Verify Stock Value is correctly calculated based on batch rates (`Current Stock * Avg Rate`).
   - [x] Check Low Stock indicators when stock dips below the `minParLevel`.

## Phase 4: Issues (Outwards / Consumption) [COMPLETED]
**Navigation**: Issues View
1. **Issuing Stock**
   - [x] Issue an item to a specific department.
   - [x] Ensure you cannot issue more than the `Current Stock` (validation check).
   - [x] Verify FIFO cost calculation works (consumes oldest batch first, calculates weighted average cost).
   - [x] Check that `Current Stock` reduces accordingly in the Inventory View.
2. **Reverse Issue**
   - [x] Locate the previously issued log and click "Reverse".
   - [x] Confirm the stock returns to the Inventory View.
   - [x] Confirm the reversal creates a corresponding restock batch and negative-issue log.

## Phase 5: Reporting & Ledger [COMPLETED]
**Navigation**: Dashboard, Store Ledger View
1. **Summary Dashboard**
   - [x] Verify total inventory valuation matches the sum of all item values.
   - [x] Check if "Low Stock Alerts" display the right items.
   - [x] Test the department and date filters for the Consumption chart snippet.
   - [x] Export Summary to PDF/Excel (if applicable) and verify formatting.
2. **Store Ledger**
   - [x] Select a specific item and a date range.
   - [x] Verify the "Opening Balance" represents historical stock up to the start date.
   - [x] Verify "Inwards" match Purchases and "Outwards" match Issues for that date range.
   - [x] Verify "Closing Balance" matches the current real-time stock accurately.

## Phase 6: Audit and System [COMPLETED]
1. **Audit Logs**
   - [x] Navigate to Audit Logs View.
   - [x] Verify each of the actions performed above (Item creation, Purchases, Issues, Reversals) has a corresponding log item.
   - [x] Test search and sorting functionality on the Data Table.
2. **Settings**
   - [x] Update App Branding (Name/Logo) and verify UI updates immediately.
   - [x] Use "Clear App Data" and verify you are redirected to the Setup Wizard.
   - [x] Verify caching by refreshing the page and ensuring active login remains.

## Phase 7: Edge Cases & UI Interactions [COMPLETED]
1. [x] React unmounting & state updates (e.g., switching tabs rapidly).
2. [x] Entering negative numbers or alphabets in quantity/rate inputs.
3. [x] Network disconnection while submitting a sheet update.
4. [x] Verify all DataTables (pagination, searching, sorting) handle empty states.
