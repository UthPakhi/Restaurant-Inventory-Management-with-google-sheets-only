# TC Inventory Management Pro

A professional, high-performance inventory and stock management system designed for hospitality and retail businesses. Built with **React 18**, **Tailwind CSS**, and powered by **Google Sheets** as a real-time serverless database.

## ✨ Key Features

- **FIFO Inventory Engine**: Automatic First-In, First-Out cost and stock tracking.
- **Multi-Section Support**: Manage transfers to different departments (Kitchen, Bar, Pizza, etc.).
- **Bulk Import Mastery**: Power-user tools for bulk issuing and bulk purchase importing via copy-paste.
- **Smart Audit Log**: Every transaction is tracked with reversal support (manual corrections restore inventory automatically).
- **Store Ledger**: Real-time valuation of your stock with monthly opening/closing visibility.
- **Setup Wizard**: Zero-config initial setup—creates your Google Sheets database structure automatically.

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

- **[Development Journey](./DEVELOPMENT_JOURNEY.md)**: A detailed breakdown of how this application was built from scratch—including architectural choices, the FIFO engine strategy, UI considerations, and issue resolution tracking.
- **[Future Roadmap](./FUTURE_ROADMAP.md)**: A strategic, specialist-level architectural plan mapping out basic, intermediate, and advanced feature scaling (including AI integrations and database migrations).

## 📄 License

MIT. Built for efficiency.
