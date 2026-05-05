# TC Inventory Management Pro

Welcome to **TC Inventory Management Pro**—a robust, serverless inventory management system optimized for the hospitality & retail industries. Instead of relying on a traditional backend, this application leverages **Google Sheets as its database**, providing real-time synchronization, offline capabilities, and a seamless user experience.

## ✨ Key Features

- **Google Sheets Database:** Your data lives securely in your own Google Drive.
- **Offline-First Mode (PWA)**: App works offline, caching data locally via IndexedDB.
- **Reporting & Exports**: One-click PDF & Excel exports for tables and ledgers.
- **Optimistic UI Updates**: Table rows appear instantly before the API call finishes.
- **FIFO Inventory Engine**: Automatic First-In, First-Out cost and stock tracking holding true even for "Opening Stock" vs newer stock.
- **Multi-Section Support**: Manage transfers to different departments (Kitchen, Bar, Pizza, etc.).
- **Bulk Import Mastery**: Power-user tools for bulk issuing and bulk purchase importing via copy-paste.
- **Smart Audit Log & Automated Reversals**: Every transaction is tracked. Manual corrections strictly prioritize pushing reversed stock back to the top of the queue for the most accurate consecutive valuation.
- **Safe State Handling:** Intelligently mark items as inactive without destroying historical records.

## 🚀 Quick Start (Local Setup)

1. **Clone & Install**
   ```bash
   git clone https://github.com/your-username/inventory-pro.git
   cd inventory-pro
   npm install
   ```

2. **Configure Google Cloud**
   - Head to [Google Cloud Console](https://console.cloud.google.com/).
   - Enable **Google Sheets API**.
   - Create **OAuth 2.0 Credentials** (Web Application).
   - Add `http://localhost:3000` to Authorized JavaScript Origins.
   - Add `http://localhost:3000/api/auth/callback` to Authorized Redirect URIs.

3. **Environment Variables**
   Create a `.env` file in the root:
   ```env
   VITE_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
   ```

4. **Launch**
   ```bash
   npm run dev
   ```

## 🛠 Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **UI/UX**: Tailwind CSS, Framer Motion, Lucide Icons
- **Database**: Google Sheets API (Serverless architecture)
- **State Management**: React Hooks & Context API

## 📖 How to Use

1. **Initialization**: On first run, the app will guide you through connecting your Google account and creating a new Inventory Sheet.
2. **Setup Masters**: Add your **Items**, **Sections (Departments)**, and **Suppliers**.
3. **Purchasing**: Log arrivals in the **Purchase Ledger**. This builds your "FIFO Batches."
4. **Consumption**: Use the **Issue to Section** tool or **Bulk Issue** to move stock. The system will automatically pick the oldest stock batches first.
5. **Corrections**: Use the **Reverse** button in any log to undo a mistake; the system identifies the specific cost batches to return.

## 📙 Documentation & Roadmaps

- **[Development Journey](./DEVELOPMENT_JOURNEY.md)**: A detailed, story-driven breakdown of how this application was built from scratch—including architectural choices, the FIFO engine strategy, UI considerations, and issue resolution tracking.
- **[Future Roadmap](./FUTURE_ROADMAP.md)**: A strategic, specialist-level architectural plan mapping out basic, intermediate, and advanced feature scaling (including AI integrations and database migrations).

## 📄 License

MIT. Built for efficiency.
