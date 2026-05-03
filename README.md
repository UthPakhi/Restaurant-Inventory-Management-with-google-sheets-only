# Restaurant Inventory Management System (RestoManage)

A professional-grade inventory and stock management system designed for restaurants and hospitality businesses. Built with React 18, Vite, and powered by Google Sheets as a real-time database.

## 🚀 Key Features

- **Real-time Inventory Tracking**: Accurate stock levels with First-In, First-Out (FIFO) cost calculation.
- **Consumption Logging**: Record store issues to specific departments (Kitchen, Bar, BBQ, etc.) with real-time stock validation.
- **Purchase Ledger**: Track procurement history, supplier costs, and GRN/Invoices.
- **Store Ledger**: Visualized monthly opening/closing balances and daily store valuation.
- **Bulk Import**: Power-user friendly TSV import for bulk consumption and purchase logs.
- **Audit Trails**: Complete transparency with automatic audit logging for all critical inventory actions.
- **Google Sheets Integration**: Seamlessly sync data to your own spreadsheets for external reporting.
- **Responsive Dashboard**: Beautiful, high-density UI built with Tailwind CSS and Framer Motion.

## 🛠 Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, Lucide Icons, Shadcn-inspired custom components
- **Animation**: Framer Motion
- **Database**: Google Sheets API (via custom Express proxy)
- **Deployment**: Vercel/Cloud Run ready

## 📋 Prerequisites

- Node.js 18+
- A Google Cloud Project with Google Sheets and Google Drive APIs enabled
- Google OAuth 2.0 Credentials (Client ID & Secret)

## ⚙️ Setup & Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/resto-manage.git
   cd resto-manage
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the root:
   ```env
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback
   APP_URL=http://localhost:3000
   ```

4. **Run the Development Server**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`.

## 📖 Usage Guide

1. **Initial Setup**: Launch the app and follow the Setup Wizard. You can choose "Try Demo" to explore with local data or "Connect Google Sheets" to use your own.
2. **Master Data**: Set up your Items, Departments, and Suppliers in the Masters view.
3. **Log Purchases**: Record new stock arrival in the Purchases Ledger.
4. **Log Consumption**: Issue stock to the kitchen using the Consumption Log (supports FIFO).
5. **Monitor Balance**: Check the Store Ledger for valuation and the Inventory view for par-level alerts.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License. Open source for your business.
