# NEXORA — Full-Stack E-Commerce Application

A complete, responsive, full-stack e-commerce web platform inspired by Amazon, engineered with an original brand identity, pure Vanilla JavaScript frontend, Node.js/Express backend, PostgreSQL, and Prisma ORM.

---

## 🌟 Key Features

### 🛍️ Customer Shopping Website (`http://localhost:5500/`)
- **Product Catalogue:** Real-time search, category filtering, price filtering, sorting (Price, Newest, Oldest), and pagination.
- **Product Details:** Multi-image gallery with thumbnail switcher, real-time stock indicator, and verified customer reviews.
- **Authentication:** Customer sign-up and sign-in with bcrypt password hashing and secure HttpOnly cookie session management.
- **Shopping Cart:** Add items with automatic stock validation in database transactions, live subtotal computation in paise, and quantity adjusters.
- **Wishlist:** Save favorite items with duplicate prevention and one-click "Move to Cart".
- **Address Book:** Add, edit, delete, and set default delivery addresses.
- **Checkout & Payments:**
  - **Simulated Demo Payment:** Instant sandbox order placement with unique reference code.
  - **Cash on Delivery (COD):** Delivery with pending payment status.
  - *No real paid payment gateways or third-party cloud lock-in.*
- **Order Tracking & History:** View past orders, snapshot pricing/items, delivery address details, and cancellable orders with automatic stock restoration.
- **Customer Reviews:** Star ratings (1–5) and comments with strict backend enforcement of **one review per product per customer**.

### ⚡ Admin Command Center (`http://localhost:5500/admin/index.html`)
- **Protected Access:** Server-side role verification (`requireAdmin`) preventing ordinary customers or unauthenticated users from accessing administrative tools.
- **Dashboard Overview:** Live KPI tiles for Total Products, Customers, Orders, and Total Revenue (calculated from PostgreSQL transactions), plus recent orders and low-stock alerts ($\le 15$ units).
- **Product Management:** Create new products, edit fields/stock, and deactivate listings without breaking historical order snapshots.
- **Local Multi-Image Uploads:** Upload up to 8 images per product stored in `backend/uploads/products/` via Multer, with verified image magic number signatures (JPEG, PNG, WebP) and 5MB size limits.
- **Category Management:** Create, view, and safely delete categories (categories with active products cannot be accidentally deleted).
- **Inventory Adjustment:** In-line stock adjustments with instant feedback.
- **Order Processing:** View customer details, update order status (`PENDING`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`), and automated payment completion for COD upon delivery.
- **Review Moderation:** Inspect and delete inappropriate customer reviews.

---

## 🛠️ Technology Stack

- **Frontend:** HTML5, CSS3 (Custom Responsive Design System with CSS variables), Pure Vanilla JavaScript (ES Modules). *No React, Tailwind, or Bootstrap.*
- **Backend:** Node.js, Express.js (TypeScript with `tsx`).
- **Database & ORM:** PostgreSQL 18, Prisma ORM 7.10 with `@prisma/adapter-pg`.
- **Security & Libraries:**
  - `bcryptjs` for salted password hashing.
  - `jsonwebtoken` for identity tokens in HttpOnly cookies.
  - `zod` for strict request validation.
  - `multer` for local image uploads.
  - `helmet`, `cors`, and `express-rate-limit` for HTTP header security and throttling.

---

## 🚀 Getting Started (Windows 11)

### 1. Prerequisites
- **Node.js:** v20+ (developed on Node v24.22.0)
- **PostgreSQL:** Running locally on port `5432` with a database named `nexora`.

### 2. Database Setup
You can easily create the tables and initial sample products using the included SQL script:
1. Open pgAdmin 4 or `psql`.
2. Connect to your PostgreSQL server and create a database named `nexora`:
   ```sql
   CREATE DATABASE nexora;
   ```
3. Run the schema and seed file located at `database/schema.sql` inside your `nexora` database.

### 3. Environment Variables
Copy `backend/.env.example` to `backend/.env` and configure your credentials:
```env
DATABASE_URL="postgresql://your_user:your_password@localhost:5432/nexora?schema=public"
JWT_SECRET="your-secure-random-jwt-secret-min-32-chars-long"
PORT=5000
FRONTEND_ORIGIN="http://localhost:5000"
```

### 4. Run the Application
You only need to run **one** command! The Express backend serves both the complete frontend website and the backend APIs:
```powershell
cd backend
npm install
npm run dev
```

Now open your browser and visit:
- **Customer Shopping Website:** `http://localhost:5000` (or `http://localhost:5000/index.html`)
- **Product Catalogue:** `http://localhost:5000/pages/products.html`
- **Customer Sign In:** `http://localhost:5000/pages/login.html`
- **Customer Sign Up:** `http://localhost:5000/pages/register.html`
- **Admin Command Center:** `http://localhost:5000/admin/index.html`

### 5. Provisioning an Administrator Account
1. Open `http://localhost:5000/pages/register.html` in your browser and register an account.
2. In your terminal, run the administrative provisioning CLI tool:
   ```powershell
   cd backend
   npm run provision-admin -- your-email@example.com
   ```
3. Type `PROMOTE` when prompted.
4. Sign in at `http://localhost:5000/pages/login.html` and click **⚡ Admin** in the header or navigate directly to `http://localhost:5000/admin/index.html`.

---

## 📂 Project Structure

```text
nexora/
├── frontend/
│   ├── index.html                 # Customer Homepage
│   ├── pages/
│   │   ├── register.html          # Sign Up Page
│   │   ├── login.html             # Sign In Page
│   │   ├── products.html          # Search, Filter & Catalogue Grid
│   │   ├── product-detail.html    # Gallery, Details, Reviews
│   │   ├── cart.html              # Shopping Cart & Line Totals
│   │   ├── wishlist.html          # Saved Wishlist Grid
│   │   ├── checkout.html          # Address Selector & Demo/COD Payment
│   │   ├── addresses.html         # Delivery Address Book
│   │   ├── orders.html            # Order History & Tracking
│   │   ├── profile.html           # Customer Profile Editor
│   │   └── 404.html               # Custom Not Found Page
│   ├── admin/
│   │   └── index.html             # Unified Admin Dashboard
│   ├── css/
│   │   ├── main.css               # Customer Design System
│   │   ├── auth.css               # Auth Pages Styling
│   │   └── admin.css              # Admin Theme & Tables
│   └── js/
│       ├── authApi.js             # Authentication API service
│       ├── productApi.js          # Product Catalogue API service
│       ├── categoryApi.js         # Category API service
│       ├── cartApi.js             # Shopping Cart API service
│       ├── wishlistApi.js         # Wishlist API service
│       ├── addressApi.js          # Address API service
│       ├── orderApi.js            # Orders & Checkout API service
│       ├── reviewApi.js           # Reviews API service
│       ├── adminApi.js            # Admin Operations API service
│       ├── ui-utils.js            # Rupee formatting, toasts, header state
│       ├── homepage.js            # Homepage data loader & product cards
│       ├── products-page.js       # Dynamic search, filter, pagination
│       ├── product-detail-page.js # Image thumbnails, reviews loader
│       ├── cart-page.js           # Live cart updater
│       ├── checkout-page.js       # Transaction checkout submission
│       ├── addresses-page.js      # Address modal and actions
│       ├── wishlist-page.js       # Wishlist item mover
│       ├── orders-page.js         # Order tracking & cancellations
│       └── admin-dashboard.js     # Admin tab panels & KPI manager
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.ts        # Prisma Client with pg driver adapter
│   │   ├── middleware/
│   │   │   ├── authMiddleware.ts  # JWT cookie verify & DB role authorization
│   │   │   └── productImageUpload.ts # Multer multi-upload with magic bytes check
│   │   ├── routes/
│   │   │   ├── authRoutes.ts      # Register, Login, Logout, /me
│   │   │   ├── categoryRoutes.ts  # Public categories
│   │   │   ├── productRoutes.ts   # Public products with filtering & search
│   │   │   ├── cartRoutes.ts      # Customer cart in DB transactions
│   │   │   ├── wishlistRoutes.ts  # Customer saved wishlist
│   │   │   ├── addressRoutes.ts   # Customer delivery addresses
│   │   │   ├── orderRoutes.ts     # Atomic checkout, cancellations & admin orders
│   │   │   ├── reviewRoutes.ts    # Product reviews & admin moderation
│   │   │   └── adminRoutes.ts     # Protected product/category CRUD & overview
│   │   ├── validators/
│   │   │   └── authValidators.ts  # Zod schemas for auth payloads
│   │   └── server.ts              # Express application configuration
│   ├── scripts/
│   │   └── provision-admin.ts     # Interactive CLI tool to grant ADMIN role
│   ├── uploads/
│   │   └── products/              # Stored uploaded product images
│   ├── prisma/
│   │   └── schema.prisma          # PostgreSQL 12-table data model
│   └── package.json
├── docs/
│   └── API.md                     # Complete endpoint documentation
└── README.md
```

---

## 🔒 Security Best Practices Implemented

1. **Passwords:** Salting & hashing via `bcryptjs` (cost factor 12). Plaintext passwords and hashes are never exposed.
2. **Session Authentication:** Identity verified via JWT stored inside an `HttpOnly` cookie, inaccessible to malicious client scripts.
3. **Server-Side Authorization:** Roles are retrieved fresh from the PostgreSQL database on every sensitive request. Frontend-supplied roles are completely ignored.
4. **Checkout Integrity:** Product prices and order totals are calculated **strictly on the backend**. Stock decrements and order snapshots occur within atomic Prisma database transactions (`prisma.$transaction`) to prevent race conditions and overselling.
5. **Upload Protection:** Multer checks MIME types, limits file size to 5MB, verifies the file magic byte headers (preventing disguised executables), and assigns randomized UUID filenames to prevent path traversal attacks.

---

## 📄 License
ISC © 2026 NEXORA Team. Developed locally on Windows 11.
