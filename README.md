# Restaurant Inventory Management System (RestoManage)

A professional-grade inventory and stock management system designed for restaurants and hospitality businesses. Built with React 18, Vite, and powered by Google Sheets as a real-time database.

## 🚀 Key Features

- **Real-time Inventory Tracking**: Accurate stock levels with First-In, First-Out (FIFO) cost calculation.
- **Consumption Log (FIFO)**: Record issues to departments (Kitchen, Bar, etc.) with automatic inventory deduction and cost averaging.
- **Transaction Reversal**: One-click reversal for consumption entries to restore inventory levels.
- **Purchase Ledger**: Track procurement history, supplier costs, and GRN/Invoices.
- **Store Ledger**: Visualized monthly opening/closing balances and daily store valuation.
- **Bulk Import**: Power-user friendly TSV import for bulk consumption and purchase logs.
- **Audit Trails**: Complete transparency with automatic audit logging for all critical actions.
- **Settings & Branding**: Customize your restaurant name and logo (stored securely in Google Sheets).
- **Responsive Dashboard**: Beautiful, high-density UI built with Tailwind CSS and Framer Motion.

## ⚙️ Google Cloud & OAuth Setup

To use this app with your own Google Sheets, you must configure a Google Cloud Project:

1. **Enable APIs**: Enable 'Google Sheets API' and 'Google Drive API' in your [Google Cloud Console](https://console.cloud.google.com/).
2. **Create Credentials**: Create an OAuth 2.0 Client ID (Web Application).
3. **Authorized Redirect URIs**: 
   - For local development: `http://localhost:3000/api/auth/callback`
   - For AI Studio Preview: Add your current preview URL followed by `/api/auth/callback` (e.g., `https://ais-dev-...asia-southeast1.run.app/api/auth/callback`)
4. **Environment Variables**: Update your `.env` or App Settings:
   ```env
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   ```

## 📋 Prerequisites

- Node.js 18+
- A Google Cloud Project with the APIs mentioned above.

## 🛠 Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, Lucide Icons
- **Animation**: Framer Motion
- **Database**: Google Sheets API (via custom Express proxy)

## 📖 Usage Guide

1. **Initial Setup**: Launch the app and follow the Setup Wizard. If you don't have a Sheet yet, the wizard can create one for you.
2. **Setup Masters**: Add your Items, Departments, and Suppliers in the **Masters** view.
3. **Purchases**: Log new stock arrivals to build inventory.
4. **Consumption**: Use **Consumption Log** -> **Log Consumption** to issue items to departments.
5. **Reversals**: If you made a mistake in consumption, use the **Reverse** button in the Consumption Log list to restore stock.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License. Open source for your business.
