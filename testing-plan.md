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

## Phase 2: Master Data Management
**Navigation**: Masters View
1. **Items Master**
   - Add a new item manually (verify default opening stock behaves correctly).
   - Bulk import items using CSV/text pasting.
   - Verify missing fields flag issues in bulk import validation.
   - Edit an existing item and verify changes reflect everywhere.
2. **Departments Master**
   - Create new departments (e.g., Kitchen, Bar).
   - Ensure departments list updates automatically across other views.
3. **Suppliers Master**
   - Add new suppliers.
   - Check supplier presence in the Purchases view dropdowns.
4. **Data Seeding**
   - Run the "Seed Demo Data" function and ensure sheets are populated properly without duplicating data excessively.

## Phase 3: Purchases (Inwards) & Inventory
**Navigation**: Purchases View & Inventory View
1. **Single Purchase Entry**
   - Add a purchase for an existing item.
   - Verify rate and quantity map correctly to total amount.
   - Confirm stock increases in the **Inventory View**.
   - Verify a new Batch is created in the backend (FIFO queue).
2. **Bulk Purchase Import**
   - Paste a block of purchase rows.
   - Test validation errors (e.g., unmatched item, unmatched supplier, negative quantity).
   - Resolve errors in the preview table and submit.
   - Verify stock increases across all imported items.
3. **Inventory Tracking**
   - Verify Stock Value is correctly calculated based on batch rates (`Current Stock * Avg Rate`).
   - Check Low Stock indicators when stock dips below the `minParLevel`.

## Phase 4: Issues (Outwards / Consumption)
**Navigation**: Issues View
1. **Issuing Stock**
   - Issue an item to a specific department.
   - Ensure you cannot issue more than the `Current Stock` (validation check).
   - Verify FIFO cost calculation works (consumes oldest batch first, calculates weighted average cost).
   - Check that `Current Stock` reduces accordingly in the Inventory View.
2. **Reverse Issue**
   - Locate the previously issued log and click "Reverse".
   - Confirm the stock returns to the Inventory View.
   - Confirm the reversal creates a corresponding restock batch and negative-issue log.

## Phase 5: Reporting & Ledger
**Navigation**: Dashboard, Store Ledger View
1. **Summary Dashboard**
   - Verify total inventory valuation matches the sum of all item values.
   - Check if "Low Stock Alerts" display the right items.
   - Test the department and date filters for the Consumption chart snippet.
   - Export Summary to PDF/Excel (if applicable) and verify formatting.
2. **Store Ledger**
   - Select a specific item and a date range.
   - Verify the "Opening Balance" represents historical stock up to the start date.
   - Verify "Inwards" match Purchases and "Outwards" match Issues for that date range.
   - Verify "Closing Balance" matches the current real-time stock accurately.

## Phase 6: Audit and System
1. **Audit Logs**
   - Navigate to Audit Logs View.
   - Verify each of the actions performed above (Item creation, Purchases, Issues, Reversals) has a corresponding log item.
   - Test search and sorting functionality on the Data Table.
2. **Settings**
   - Update App Branding (Name/Logo) and verify UI updates immediately.
   - Use "Clear App Data" and verify you are redirected to the Setup Wizard.
   - Verify caching by refreshing the page and ensuring active login remains.

## Phase 7: Edge Cases & UI Interactions
1. React unmounting & state updates (e.g., switching tabs rapidly).
2. Entering negative numbers or alphabets in quantity/rate inputs.
3. Network disconnection while submitting a sheet update.
4. Verify all DataTables (pagination, searching, sorting) handle empty states.
