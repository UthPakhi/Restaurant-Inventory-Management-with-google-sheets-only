# 🚀 Strategic Future Roadmap: TC Inventory Management Pro

**Authored by:** Lead Systems Architect
**Date:** May 2026

This document outlines the strategic progression of the TC Inventory Management Pro application. As the foundational architecture (React + Google Sheets + FIFO Engine) is now stable, this roadmap provides a clear path to scale the system from a robust small-business tool into an enterprise-grade ERP module. 

---

## 📋 Phase 1: Foundational Enhancements (Basic)
*Target: Improve Quality of Life, Speed, and Usability.*

- [ ] **Offline-First Mode via Service Workers (PWA)**
  - *Implementation:* Integrate `vite-plugin-pwa`. Cache the React app shell. Use IndexedDB (via `idb`) to locally store Google Sheets data reads. Allow offline caching of Masters and Inventory so the floor manager can view stock when internet is spotty.
  - *🤖 LLM Execution Prompt:* "Install `vite-plugin-pwa` and `idb`. Update `vite.config.ts` to include the PWA plugin with standard web manifest caching. Create a service `src/services/localDb.ts` wrapping `idb` to mirror Google Sheet schemas (`types/index.ts`). In `sheetsService.ts`, intercept reads: try `localDb` first, then fetch from Sheets and update `localDb` in the background. In `main.tsx` or `App.tsx`, register the service worker via `virtual:pwa-register`."

- [ ] **PDF & Excel Report Exports**
  - *Implementation:* Integrate `jspdf`, `jspdf-autotable`, and `xlsx` for generating Store Ledgers, Issue Logs, and Current Inventory snapshots directly in the browser without server overhead. Ensure exports maintain current filtering/sorting.
  - *🤖 LLM Execution Prompt:* "Install `jspdf`, `jspdf-autotable`, and `xlsx`. Create a utilities module `src/lib/exportUtils.ts`. Create functions like `exportTableToPDF(headers, rows, title)` and `exportTableToExcel(headers, rows, sheetName)`. Update `DataTable.tsx` or specific views (`StoreLedgerView.tsx`, `InventoryView.tsx`) to add a 'Download' dropdown next to the Search bar. Hook the currently filtered `rows` into these export functions."

- [ ] **Barcode / QR Code Scanning Integration**
  - *Implementation:* Integrate `html5-qrcode` to allow users to scan physical items for faster bulk receiving and issue entry. Match the barcode against a new `barcode` column in the Masters tab.
  - *🤖 LLM Execution Prompt:* "Install `html5-qrcode`. Update `types/index.ts` to add an optional `barcode: string` to the `MasterItem` interface. Update `SetupWizard.tsx` to add literal 'Barcode' to the Masters sheet creation headers. Create a `src/components/BarcodeScannerModal.tsx` wrapper for the scanner. Add a 'Scan' button icon in `IssuesView.tsx` near the Item dropdown. When scanned, parse the result, match it in `state.masters.items` by `barcode`, and pre-fill the form."

- [ ] **Optimistic UI Updates**
  - *Implementation:* Bypass the Google Sheets API latency. Ensure all UI writes optimistic-render the table row locally before the API resolves, rolling back gracefully and showing an error toast if the API throws a network error.
  - *🤖 LLM Execution Prompt:* "Modify `AppContext.tsx` dispatch actions. Instead of waiting for `sheetsService.postRow` to resolve before updating React state, immediately fire `dispatch({type: 'ADD_PURCHASE', payload: tempRow})`. Surround the `postRow` in a try/catch. In `catch`, fire `dispatch({type: 'REMOVE_PURCHASE', payload: tempRow})` and trigger a `toast.error('Sync failed')`. Do this for `IssuesView` and `PurchasesView`."

## 📋 Phase 2: System Hardening & Collaboration (Intermediate)
*Target: Scale team collaboration and data integrity.*

- [ ] **Role-Based Access Control (RBAC)**
  - *Implementation:* Add a `Users` tab to the Google Sheet. Introduce strict roles (`admin`, `manager`, `viewer`). Hide the "Masters" and "Issues" tabs based on the logged-in Google OAuth email to prevent unauthorized data manipulation.
  - *🤖 LLM Execution Prompt:* "Update `SetupWizard.tsx` to automatically generate a 'Users' worksheet with headers ['Email', 'Role', 'Status']. In `types/index.ts`, define `UserRole` interface (`admin`, `manager`, `viewer`). In `sheetsService.ts`, fetch the Users tab upon login matching against Google Auth `userInfo.email`. Store the derived `activeRole` into React Context. Build a `ProtectedRoute` wrapper guarding `MastersView` and specific action buttons to only allow `admin` or `manager`."

- [ ] **Automated Low-Stock Alerts (Email/SMS Integration)**
  - *Implementation:* Build a Google Apps Script trigger bound to the central spreadsheet, or use a lightweight background cloud function, to ping an external service (e.g., SendGrid/Twilio/Telegram) when the FIFO Engine calculates "On-Hand < Reorder Level."
  - *🤖 LLM Execution Prompt:* "Create a new folder `/gas-scripts/` and output a `.js` file written for Google Apps Script. Document in the README how the user can copy-paste this gas code into Extensions > Apps Script. The script should use `UrlFetchApp` to ping a Telegram Bot API. It should iterate Google Sheets row by row tracking On-Hand vs Reorder values, and bundle alerts into a scheduled daily digest function."

- [ ] **Data Pagination & Virtualization**
  - *Implementation:* As logs grow past 5,000 rows, DOM rendering will crash or lag. Implement `@tanstack/react-virtual` in `DataTable.tsx` to ensure 60fps scrolling. Modify `sheetsService.ts` to fetch sheets data in paginated chunks rather than pulling the entire sheet in a single payload.
  - *🤖 LLM Execution Prompt:* "Install `@tanstack/react-virtual`. Rewrite the `tbody` mapping in `DataTable.tsx` to use the `useVirtualizer` hook, wrapping scrolling containers. For the backend, update `sheetsService.ts` fetch methods (like `fetchPurchases`) to optionally accept `offset` and `limit`. Modify standard A1-notation requests (e.g., `Purchases!A2:H`) to be dynamic (e.g., `Purchases!A${offset}:H${offset+limit}`). Introduce 'Load More' logic in the UI or infinite scroll."

- [ ] **Database Migration Plan (Google Sheets -> Backend-as-a-Service)**
  - *Implementation:* To support companies that outgrow the 5M cell limit, abstract `sheetsService.ts` behind a standard `IDataProvider` interface. Write parallel adapters for Firebase (Firestore) and Supabase (PostgreSQL).
  - *🤖 LLM Execution Prompt:* "Refactor `sheetsService.ts`. Define a TypeScript Interface `IDataProvider` in `types/index.ts` containing methods (`fetchPurchases`, `postIssue`, etc.). Rename current `sheetsService` to `GoogleSheetsAdapter` implementing `IDataProvider`. Create a UI dropdown in settings allowing users to select 'Database Source'. Use dependency injection in `AppContext.tsx` to mount the chosen active adapter. Note: Write empty skeleton adapters for Firebase and Supabase at this phase."

## 📋 Phase 3: Advanced Enterprise Features (Advanced)
*Target: Transform the app into a proactive, intelligent ERP.*

- [ ] **AI-Powered Demand Forecasting**
  - *Implementation:* Integrate the `@google/genai` SDK. Pass anonymized consumption velocity (historic Issues & Purchase data) to the Gemini model to predict next month's required purchases for specific items, inherently compensating for seasonal and weekly trends.
  - *🤖 LLM Execution Prompt:* "Install `@google/genai`. Create a `src/services/aiService.ts`. Write a prompt template that accepts aggregated JSON: `[{itemId, history: [{date, quantityIssued}]}]`. Send this context to the Gemini API with structured output instructions asking for an array of `RecommendedPurchaseOrder` objects. Add a 'Forecast Demand' button in `SummaryView.tsx` that triggers this function, displaying results in an AI suggestion card."

- [ ] **Multi-Warehouse / Multi-Store Architecture**
  - *Implementation:* Overhaul the state management and FIFO engine to accept a `LocationID`. Isolate inventory pools geographically, allowing "Transfers" between locations that record simultaneously as an Issue from Location A and a Purchase to Location B.
  - *🤖 LLM Execution Prompt:* "Update `SetupWizard.tsx` to add a 'Locations' master sheet. Update all core Types (`Purchase`, `Issue`) in `types/index.ts` to include a mandatory `locationId: string`. Refactor `fifoEngine.ts` to strictly partition batches by `locationId`. Whenever fetching or calculating inventory, group the results by location. Add a global dropdown in the Navigation Bar to filter the entire view context between 'Location A', 'Location B', or 'All Locations'."

- [ ] **Automated Supplier Purchase Orders (PO)**
  - *Implementation:* Generate draft PDF POs when stock goes low, and add a one-click "Email Supplier" functionality routing through Gmail API.
  - *🤖 LLM Execution Prompt:* "Expand `MastersView.tsx` to include detailed Supplier data (email, contact info). Build a `DraftPurchaseOrder.tsx` component that renders a printable PO document template. In `InventoryView`, next to Low Stock items, add an 'Auto-Draft PO' action. When clicked, aggregate the Low Stock items linked to a specific Supplier ID, embed them into the Draft PO, and present a preview modal with a 'Send via Email' button using the user's active Google Auth token via the Gmail API."

---

## 🛠️ Execution Strategy & Developer Instructions

To execute any of the features listed above, adhere strictly to the following architectural guidelines:

### 1. Planning & Schema Definitions
- **Select the Feature**: Pick a single checklist item.
- **Data Mapping First:** Review `types/index.ts` and `dataMappers.ts`. If your feature requires new columns, define the TypeScript `Interfaces` first.
- **Database Schema:** For Google Sheets additions (e.g., RBAC), update the `SetupWizard.tsx` to generate the new worksheet automatically during initial bootstrap. Write a migration script that prompts existing users to "Upgrade Sheet Architecture" which will auto-append missing tabs/columns.

### 2. Component Architecture
- Build UI components in isolation inside `src/components/`. 
- Leverage existing design tokens via Tailwind CSS (`.dark` context included) and `lucide-react` for graphics.
- Keep application state lifted to `AppContext.tsx` ONLY if it needs to be globally reactive. If state is confined to a singular view, use local component level state.

### 3. Testing Protocols (Critical)
- **Mathematical Integrity:** Any change that touches financial values or the `fifoEngine.ts` algorithm must be strictly Test-Driven (TDD). Add new test cases to `src/lib/fifoEngine.test.ts`. Run tests constantly using `vitest` (`npm run test` if configured).
- **Stress Testing:** Push mock arrays of 10,000+ purchases through the system and evaluate the React Profiler. Ensure no infinite re-renders are triggered by `useEffect` dependencies.

### 4. Review & Deployment
- Run local linters: `npm run lint`. Fix strict typing errors immediately, never suppress them with `@ts-ignore` without a written justification.
- Ensure all dark mode properties (like the recently fixed `.dark:text-white`) remain intact via manual QA toggle.
- When shipped, document the release in the `README.md` and check the item off this very list!
