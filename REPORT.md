# Restaurant Inventory Management System Report

## Core Essentials for the Report

### Problem Statement
In the restaurant industry, manual inventory tracking often leads to significant operational inefficiencies. The lack of real-time visibility into stock levels can result in:
*   **Waste due to spoilage:** Over-ordering perishable ingredients that expire before use.
*   **Theft and pilferage:** Untracked inventory creates loopholes where stock goes missing without accountability.
*   **Stockouts:** Failing to track critical ingredients, leading to unavailable menu items and dissatisfied customers.
*   **Human Error:** Manual ledger entries are prone to miscalculations, causing discrepancies between actual physical stock and recorded stock.

This system aims to solve these issues by providing a centralized, automated platform for tracking inventory movements.

### Module Descriptions
The system is divided into several interconnected modules:
*   **Masters (Configuration):** The foundational module where entities like Items, Sections (Departments), and Suppliers are defined. This sets the rules and relationships for the rest of the system.
*   **Purchases (Inbound):** Handles the stocking of ingredients. Users can record inbound deliveries from suppliers, which automatically increments the stock levels. It tracks quantities, purchase rates, and total costs.
*   **Issues (Outbound / Consumption):** Records the consumption of inventory by dispatching stock to different sections of the restaurant (e.g., Kitchen, Bar, Pizza Station). If linked to a POS, this acts as the auto-deduction or manual deduction module based on production needs.
*   **Store Ledger (Transaction History):** A detailed timeline of all inventory movements. It shows the opening balance, additions (purchases), deductions (issues), and the closing balance for any given period, ensuring complete auditability.
*   **Summary & Reports (Business Analysis):** Provides a high-level dashboard with key metrics such as Total Inventory Value, Low Stock Alerts, and consumption trends to aid in decision-making.

### System Design & Entity-Relationship (ER) Concepts
While a visual ER diagram would be drawn externally, the core relationships in the system are as follows:

*   **Item:** The central entity. It has attributes like `id`, `name`, `unit`, `categoryId`, `parLevel`, and `defaultRate`.
*   **Supplier:** Supplies one or more `Items`.
*   **Section:** Requests or consumes one or more `Items`.
*   **Purchase Line:** A transaction record linking a `Supplier`, an `Item`, and a `Date`, increasing the item's stock.
*   **Issue Line:** A transaction record linking a `Section`, an `Item`, and a `Date`, decreasing the item's stock.
*   **Recipe/BOM (Bill of Materials) - *Conceptual*:** Maps a "Menu Item" (e.g., Margherita Pizza) to multiple "Ingredients" (e.g., 200g Flour, 50g Cheese, 30g Tomato Sauce) to allow for automatic deduction during sales.

### Key Features Documentation

#### Stock Tracking
Provides real-time visibility with updates on ingredients whenever a transaction occurs. Whether it's adding 50 kilograms of flour or issuing 10 liters of oil to the kitchen, the system recalculates the current available stock instantly using a First-In-First-Out (FIFO) or Weighted Average cost methodology.

#### Threshold Alerts
Automated "Low Stock" notifications. Each item can have a defined `parLevel` (minimum required stock). The Summary dashboard explicitly highlights items that have fallen below this threshold, acting as an automated prompt for reordering.

#### Waste Management & Variance Tracking
By comparing the system's "Closing Balance" (expected stock) with a physical stock count, management can identify variance. Unexplained variance often points to undocumented waste (spillage, dropped items, expired goods) or theft, allowing managers to investigate specific discrepancies quickly.

### Technology Stack
*   **Frontend Interface:** React.js via Vite, utilized for its fast rendering and component-based architecture.
*   **Language:** TypeScript, providing static typing to reduce runtime errors.
*   **Styling:** Tailwind CSS, enabling rapid, utility-first UI development and responsive design.
*   **Icons:** Lucide React for consistent and crisp vector icons.
*   **Charting:** Recharts for visual data representation in the dashboard.
*   **Database / Backend:** The AI Studio Applet environment uses an in-memory client-side data store with `zustand` style persistence for rapid prototyping.

### Testing & Screenshots
*(Note: In a formal document, actual screenshots of the application would be inserted here.)*

1.  **Inventory Dashboard:** Visual proof of the "Summary View" showing KPI cards, Low Stock Alerts table, and the Inventory Value Chart.
2.  **Purchase Entry:** Screenshot showing the tabular entry of new stock with validation.
3.  **Store Ledger:** Screenshot demonstrating the tracked history of an item's balance over a selected month.
4.  **Issue (Consumption) Entry:** Screenshot showing dispatch of items with running stock balances preventing negative values.
