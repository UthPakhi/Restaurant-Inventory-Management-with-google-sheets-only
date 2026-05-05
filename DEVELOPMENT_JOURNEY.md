# Development Journey: TC Inventory Management Pro

This document outlines the end-to-end development journey of the "TC Inventory Management Pro" application. It serves as a comprehensive record of the architectural decisions, features built, challenges overcome, and the refinement process.

## 1. Project Inception & Architecture Setup
The goal was to create a robust, serverless inventory management system optimized for the hospitality & retail industries, avoiding a traditional backend structure while relying on **Google Sheets as the database**. 

### Tech Stack Decisions:
- **Frontend Framework:** React 18 with TypeScript and Vite.
- **Styling:** Tailwind CSS (v4) for utility-first styling and robust theming.
- **Icons & Animations:** `lucide-react` for iconography and `motion` (Framer Motion) for smooth layout transitions.
- **"Backend" / Database:** Google Sheets API via a custom `sheetsService`.
- **State Management:** React Context API (`AppContext.tsx`) to globally manage loading states, authentication, and sheet data.

## 2. Core Functional Implementation
### A. The Setup Wizard & Google Authentication
- Integrated Google OAuth allowing users to attach their own Google accounts.
- Built a **Setup Wizard** (`SetupWizard.tsx`) that acts as a bootstrapping script. Once authorized, it automatically creates a new Google Spreadsheet and initializes necessary worksheet tabs (Metadata, Masters, Purchases, Issues, Audits, etc.) with the correct headers.

### B. Google Sheets Service 
- Developed `sheetsService.ts` to act as an ORM equivalent for Google Sheets.
- Abstracted operations to fetch tables, append rows, update individual rows, and query data using standard JSON mapping concepts (`dataMappers.ts`).
- Created a caching layer with refresh capabilities.

### C. Master Data Management
- Created the **Masters View** (`MastersView.tsx`) managing reference data:
  - **Items:** Track names, categories, and Reorder Levels.
  - **Sections:** Various departments (e.g., Kitchen, Bar).
  - **Suppliers:** Vendors for inwards.

## 3. The FIFO Inventory Engine (The Core Brain)
Building an accurate First-In, First-Out engine was central to the operation.
- **Purchases (Inwards):** Created `PurchasesView.tsx`. When items arrive, they are logged with their batch quantities and distinct costs.
- **Issues (Outwards):** Created `IssuesView.tsx`. 
- **The Engine (`fifoEngine.ts`):** We developed an algorithm that dynamically calculates the remaining value of inward batches. When an issue occurs, the engine traverses the history of purchases and issues, identifying exactly which historical batch is being fulfilled and calculates the precise blended cost for the issue.

## 4. Analytics & Reporting Views
- **Inventory View (`InventoryView.tsx`):** A real-time, calculated snapshot showing total inward quantity minus outward quantity, yielding the On-Hand stock and evaluating it against Reorder Levels.
- **Store Ledger (`StoreLedgerView.tsx`):** Detailed historical financial tracking demonstrating Opening balances, total inwards, total outwards, and Closing balances for reporting periods.
- **Summary Dashboard (`SummaryView.tsx`):** Actionable widgets showing Low Stock alerts, overall valuation, and recent issue trends using visual graphs (recharts).
- **Audit Logs View (`AuditLogsView.tsx`):** An immutable trail of every action taken within the system.

## 5. Iterations, Bug Fixes & Refinements
Throughout the development lifecycle, we encountered and fixed several complex challenges:

### Data Handling & String Parsing Challenges
- Discovered discrepancies in string matching due to accidental padding and casing differences between purchases and issues.
- Introduced `stringUtils.ts` containing `normalizeString` functions to rigorously sanitize sheet data (trimming logic, case normalization), ensuring the FIFO engine correctly matches items regardless of minor user typos.

### Complex Reversal Mechanism
- We wanted a way for users to "Undo" entries. We implemented a robust **Reversal Engine** inside the Audit Log. When reversing an issue, the system correctly "releases" the consumed batches back into available stock.

### Bulk Actions & User Experience
- To support data-entry professionals, we introduced bulk copy-paste modules parsing raw TSV/CSV data directly from users' clipboards, sanitizing it, and pushing it to Google Sheets in bulk.
- Replaced standard alerts with refined toasts using `sonner`.

### UI & Styling Enhancements
- Developed a comprehensive Data Table (`DataTable.tsx`) wrapping features like global searching, pagination, and sticky headers.
- Implemented Dark Mode capability.

### Offline-First Architecture (PWA)
- Integrated `vite-plugin-pwa` enabling Service Workers and establishing an Offline-First approach.
- Intercepted Google Sheets data fetches and stored them resiliently inside IndexedDB, so the app remains perfectly usable even if the user loses connectivity on the main floor.

### Export & Reporting
- Added front-end reporting capabilities utilizing `jspdf` and `xlsx`.
- Empowered users with 'One-Click Export' buttons inside `InventoryView`, `IssuesView`, `PurchasesView`, and `StoreLedgerView` to instantly generate and download formatted PDF invoices/reports and Excel spreadsheets directly in the browser.

### Optimistic UI Updates
- Re-engineered form submissions in `PurchasesView` and `IssuesView` to execute Optimistic UI Updates.
- Data input natively renders to the table list identically to a successful sheet update, masking the standard Google Sheets API latency. Updates execute seamlessly in the background.

### Resolving Tailwind CSS v4 Dark Mode Issue
- **The Problem:** The app's dark mode was failing to engage correctly when toggled.
- **The Solution:** We updated the `index.css` to align with Tailwind v4's new architecture. We swapped the custom variant definition to appropriately target the dark mode class. We applied `@custom-variant dark (&:where(.dark, .dark *));` to ensure child elements accurately respect the `.dark` class scope.

### Enhancing FIFO Engine Prioritization & Bulk Processing
- **The Prioritization Problem:** The stock valuation wasn't consistently capturing older stock when reversing an issue. Situations arose where an issue was reversed, but subsequent issues picked newer stock prices instead of returning to the historically reversed stock.
- **The Prioritization Solution:** Added strict mathematical priority sorting inside `fifoEngine.ts`. The algorithm now explicitly prefers "Opening Stock" (Priority 0) and "Reversals" (Priority 1) over standard purchases (Priority 2) during chronological ties, ensuring stock value depreciates linearly and perfectly matches accounting expectations.

### Bulk State Management
- **The Problem:** When processing multiple issues in a single bulk operation, subsequent issues were not accounting for the inventory decrements made by earlier items in the exact same batch run, causing overall total values to ignore the decrement.
- **The Solution:** Patched the `bulkIssueFIFO` processing in `sheetsService.ts`. Instead of a shallow reference, the internal function now constructs a deep isolated copy (`allBatches.map(b => ({...b}))`) arrays, mathematically consuming the state iteration-by-iteration, so the nth bulk item accurately calculates against the live remaining quantity of the batch dynamically.

## 6. Stability & Testing
- Embedded vitest to unit test our `fifoEngine.test.ts`, checking that calculating cost batches works mathematically properly.
- Tested edge cases: zero quantity issues, issues exceeding capacity, backwards-dated purchases.

## 7. Final Polish
- Centralized data fetching patterns.
- Adjusted responsive UI constraints so tables gracefully scroll horizontally on small screens.
- Consolidated final README documentation pointing users to quick setup instructions. 

## Conclusion
The project evolved from a conceptual serverless architecture into a fully operational application, utilizing advanced React capabilities, robust mathematical inventory algorithms, and seamlessly syncing with a Google Spreadsheet via REST APIs to provide a database experience.
