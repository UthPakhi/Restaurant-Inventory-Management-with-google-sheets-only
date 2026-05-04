# 🚀 Strategic Future Roadmap: TC Inventory Management Pro

**Authored by:** Lead Systems Architect
**Date:** May 2026

This document outlines the strategic progression of the TC Inventory Management Pro application. As the foundational architecture (React + Google Sheets + FIFO Engine) is now stable, this roadmap provides a clear path to scale the system from a robust small-business tool into an enterprise-grade ERP module. 

---

## 📋 Phase 1: Foundational Enhancements (Basic)
*Target: Improve Quality of Life, Speed, and Usability.*

- [ ] **Offline-First Mode via Service Workers (PWA)**
  - *Implementation:* Integrate `vite-plugin-pwa`. Cache the React app shell. Use IndexedDB (via `idb`) to locally store Google Sheets data reads. Allow offline caching of Masters and Inventory so the floor manager can view stock when internet is spotty.
  - *🤖 LLM Execution Plan:*
    1. **Install Dependencies:** Add `vite-plugin-pwa` and `idb` to the project.
    2. **Configure Vite:** Update `vite.config.ts` to incorporate the PWA plugin and configure standard web manifest caching.
    3. **Create Local DB:** Build a new service `src/services/localDb.ts` wrapping `idb`, ensuring it perfectly mirrors the schemas in `types/index.ts`.
    4. **Intercept Reads:** Modify `sheetsService.ts` to fetch from `localDb` first, then seamlessly background-sync the latest data from Google Sheets into the local store.
    5. **Register Worker:** Import and register the service worker in `src/main.tsx` or `src/App.tsx` using `virtual:pwa-register`.

- [ ] **PDF & Excel Report Exports**
  - *Implementation:* Integrate `jspdf`, `jspdf-autotable`, and `xlsx` for generating Store Ledgers, Issue Logs, and Current Inventory snapshots directly in the browser without server overhead. Ensure exports maintain current filtering/sorting.
  - *🤖 LLM Execution Plan:*
    1. **Install Dependencies:** Add `jspdf`, `jspdf-autotable`, and `xlsx`.
    2. **Utility Module:** Create `src/lib/exportUtils.ts`.
    3. **Export Functions:** Implement functions such as `exportTableToPDF(headers, rows, title)` and `exportTableToExcel(headers, rows, sheetName)` handling the respective libraries.
    4. **UI Integration:** Update `DataTable.tsx` (and specific views like `StoreLedgerView.tsx` or `InventoryView.tsx`) to add a 'Download' dropdown button next to the Search bar.
    5. **Data Hookup:** Feed the currently *filtered* array of `rows` directly into the export functions upon user interaction.

- [ ] **Barcode / QR Code Scanning Integration**
  - *Implementation:* Integrate `html5-qrcode` to allow users to scan physical items for faster bulk receiving and issue entry. Match the barcode against a new `barcode` column in the Masters tab.
  - *🤖 LLM Execution Plan:*
    1. **Install Dependency:** Add `html5-qrcode`.
    2. **Schema Update:** Modify `types/index.ts` to add an optional `barcode?: string` attribute to the `MasterItem` interface.
    3. **Setup Wizard Update:** Update `SetupWizard.tsx` to automatically append a 'Barcode' column header during Masters sheet creation.
    4. **Scanner Component:** Build a wrapper component `src/components/BarcodeScannerModal.tsx` that triggers the device camera.
    5. **View Integration:** Add a "Scan" icon/button in `IssuesView.tsx` or `PurchasesView.tsx` near the item dropdown.
    6. **Auto-Fill Logic:** Upon a successful scan, parse the string, search `state.masters.items` for a matching `barcode`, and pre-fill the form fields.

- [ ] **Optimistic UI Updates**
  - *Implementation:* Bypass the Google Sheets API latency. Ensure all UI writes optimistic-render the table row locally before the API resolves, rolling back gracefully and showing an error toast if the API throws a network error.
  - *🤖 LLM Execution Plan:*
    1. **Modify Dispatchers:** Update state-mutating actions in `AppContext.tsx` so that React state is updated synchronously *before* the API call finishes.
    2. **Implement Try/Catch:** Wrap `sheetsService.postRow` (or similar write operations) inside a try/catch block.
    3. **State Rollback:** If the `catch` block executes, dispatch a removal/reversal of the optimistic row.
    4. **Error Handling:** Trigger a `toast.error('Sync failed')` immediately upon rollback alerting the user of the network issue.
    5. **Target Views:** Apply this pattern comprehensively across `IssuesView` and `PurchasesView`.

## 📋 Phase 2: System Hardening & Collaboration (Intermediate)
*Target: Scale team collaboration and data integrity.*

- [ ] **Role-Based Access Control (RBAC)**
  - *Implementation:* Add a `Users` tab to the Google Sheet. Introduce strict roles (`admin`, `manager`, `viewer`). Hide the "Masters" and "Issues" tabs based on the logged-in Google OAuth email to prevent unauthorized data manipulation.
  - *🤖 LLM Execution Plan:*
    1. **Sheet Setup:** Update `SetupWizard.tsx` to generate a dedicated 'Users' worksheet with headers ['Email', 'Role', 'Status'].
    2. **Type Definitions:** In `types/index.ts`, define a `UserRole` interface accommodating `admin`, `manager`, and `viewer` types.
    3. **Read Permissions:** Modify `sheetsService.ts` to fetch the 'Users' tab upon successful Google OAuth login, verifying `userInfo.email`.
    4. **Context Update:** Save the calculated `activeRole` into the global React state via `AppContext.tsx`.
    5. **Protected Routing:** Build a `<ProtectedRoute requireRole={...} />` wrapper component to guard restricted paths (like `MastersView`) and critical action buttons for `admin` or `manager` only.

- [ ] **Automated Low-Stock Alerts (Email/SMS Integration)**
  - *Implementation:* Build a Google Apps Script trigger bound to the central spreadsheet, or use a lightweight background cloud function, to ping an external service (e.g., SendGrid/Twilio/Telegram) when the FIFO Engine calculates "On-Hand < Reorder Level."
  - *🤖 LLM Execution Plan:*
    1. **Script Scaffolding:** Create a `/gas-scripts/` directory at the root and initialize a new `.js` file targeting Google Apps Script environments.
    2. **Documentation Guide:** Update `README.md` explaining exactly how the user can paste this script into their Google Sheets (Extensions > Apps Script).
    3. **API Integration:** Write the script utilizing `UrlFetchApp` to ping an external alerting service like the Telegram Bot API or Twilio.
    4. **Calculation Logic:** Implement a script loop that processes rows, comparing calculated On-Hand stock against respective Reorder Levels.
    5. **Scheduling:** Configure the script as a bundled daily digest rather than pinging per item, grouping all low-stock alerts into one payload.

- [ ] **Data Pagination & Virtualization**
  - *Implementation:* As logs grow past 5,000 rows, DOM rendering will crash or lag. Implement `@tanstack/react-virtual` in `DataTable.tsx` to ensure 60fps scrolling. Modify `sheetsService.ts` to fetch sheets data in paginated chunks rather than pulling the entire sheet in a single payload.
  - *🤖 LLM Execution Plan:*
    1. **Install Virtualizer:** Add `@tanstack/react-virtual` to handling heavy processing rendering workloads.
    2. **Component Rewrite:** Refactor `DataTable.tsx`'s `tbody` iteration to leverage `useVirtualizer`, wrapping row outputs in fixed absolute-positioned containers.
    3. **Backend Refactor:** Update `sheetsService.ts` read processes (like `fetchPurchases`) extending parameters to accept an `offset` and `limit`.
    4. **A1-Notation Updates:** Dynamically calculate A1 ranges in requests instead of static ends (e.g., swapping `Purchases!A2:H` for `Purchases!A${offset}:H${offset+limit}`).
    5. **Infinite Scroll:** Implement "Load More" controls or an intersection observer in the UI to trigger the paginated fetch gracefully.

- [ ] **Database Migration Plan (Google Sheets -> Backend-as-a-Service)**
  - *Implementation:* To support companies that outgrow the 5M cell limit, abstract `sheetsService.ts` behind a standard `IDataProvider` interface. Write parallel adapters for Firebase (Firestore) and Supabase (PostgreSQL).
  - *🤖 LLM Execution Plan:*
    1. **Interface Contract:** Define a strict TypeScript interface `IDataProvider` inside `types/index.ts` detailing all fundamental CRUD methods (`fetchPurchases`, `postIssue`, etc.).
    2. **Adapter Refactor:** Rename the existing `sheetsService.ts` to `GoogleSheetsAdapter.ts` and explicitly implement `IDataProvider`.
    3. **Adapter Skeletons:** Scaffold empty skeleton adapter files (e.g., `FirebaseAdapter.ts`, `SupabaseAdapter.ts`) conforming to the same interface.
    4. **UI Integration:** Add a "Database Source" dropdown option within the Setup/Settings menu for infrastructure toggling.
    5. **Dependency Injection:** Update `AppContext.tsx` to instantiate and mount the selected active adapter based on user preferences.

## 📋 Phase 3: Advanced Enterprise Features (Advanced)
*Target: Transform the app into a proactive, intelligent ERP.*

- [ ] **AI-Powered Demand Forecasting**
  - *Implementation:* Integrate the `@google/genai` SDK. Pass anonymized consumption velocity (historic Issues & Purchase data) to the Gemini model to predict next month's required purchases for specific items, inherently compensating for seasonal and weekly trends.
  - *🤖 LLM Execution Plan:*
    1. **Install SDK:** Add `@google/genai` dependency.
    2. **Service Layer:** Build `src/services/aiService.ts` responsible for secure API interaction.
    3. **Prompt Engineering:** Formulate a structured prompt template feeding clean, aggregated JSON context (e.g., `[{itemId, history: [{date, quantityIssued}]}]`).
    4. **Instruct LLM Output:** Explicitly ask the Gemini API for structured JSON output detailing an array of `RecommendedPurchaseOrder` objects.
    5. **View Hookup:** Place a "Forecast Demand" action button inside `SummaryView.tsx`, processing the result into an actionable dashboard card indicating recommended re-stock targets.

- [ ] **Multi-Warehouse / Multi-Store Architecture**
  - *Implementation:* Overhaul the state management and FIFO engine to accept a `LocationID`. Isolate inventory pools geographically, allowing "Transfers" between locations that record simultaneously as an Issue from Location A and a Purchase to Location B.
  - *🤖 LLM Execution Plan:*
    1. **Schema Expansion:** Update `SetupWizard.tsx` to automatically inject a 'Locations' sheet.
    2. **Type Adjustments:** Ensure `Purchase`, `Issue`, and related interfaces in `types/index.ts` integrate a required `locationId: string`.
    3. **FIFO Partitioning:** Refactor `src/lib/fifoEngine.ts` to categorically segment costing batches strictly by `locationId`.
    4. **Aggregation Updates:** Adjust inventory calculations across the app to group metrics sequentially by location.
    5. **UI Scoping:** Implement a persistent global context dropdown in the primary Navigation Bar allowing users to toggle their view scope ("Location A", "Location B", or an aggregated "All Locations").

- [ ] **Automated Supplier Purchase Orders (PO)**
  - *Implementation:* Generate draft PDF POs when stock goes low, and add a one-click "Email Supplier" functionality routing through Gmail API.
  - *🤖 LLM Execution Plan:*
    1. **Enhanced Supplier Data:** Update `MastersView.tsx` to handle more granular Supplier fields (Email, Contact Number, Terms).
    2. **Template Design:** Write `DraftPurchaseOrder.tsx`, a component visually styled to represent a formal, printable PO document.
    3. **Inventory Action Integration:** In `InventoryView.tsx`, attach an inline 'Auto-Draft PO' action to low-stock identified rows.
    4. **Data Splicing:** On action, collect all Low Stock items tied to that respective supplier ID and funnel them into the template structure.
    5. **Email API Hookup:** Render a localized preview modal offering a final "Send via Email" button, securely authenticated through the user's active Google Auth token connecting to the standard Gmail API.

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
