# NEXORA — API Specification & Endpoint Reference

Base URL: `http://localhost:5000/api`

All mutating endpoints (`POST`, `PATCH`, `DELETE`) require `credentials: "include"` for cross-site cookie transmission and request origin headers matching `http://localhost:5500` or `http://127.0.0.1:5500`.

Prices are denominated in **Paise** (1 Rupee = 100 Paise) and serialized as numeric strings to prevent JavaScript 64-bit float precision loss.

---

## 1. Authentication (`/auth`)

### `POST /auth/register`
Create a new customer account.
- **Access:** Public
- **Body:**
  ```json
  {
    "full_name": "Asha Kumar",
    "email": "asha@example.com",
    "password": "Password123!"
  }
  ```
- **Response (201):** Sets `nexora_session` cookie; returns `{ "success": true, "user": { "id": "...", "full_name": "...", "email": "...", "role": "CUSTOMER" } }`.

### `POST /auth/login`
Authenticate an existing customer or administrator.
- **Access:** Public
- **Body:** `{ "email": "...", "password": "..." }`
- **Response (200):** Sets `nexora_session` cookie; returns `{ "success": true, "user": { ... } }`.

### `GET /auth/me`
Retrieve currently logged-in user profile.
- **Access:** Authenticated Customer/Admin (`nexora_session` cookie required)
- **Response (200):** `{ "success": true, "user": { "id": "...", "full_name": "...", "email": "...", "role": "..." } }`

### `PATCH /auth/me`
Update profile details.
- **Access:** Authenticated Customer/Admin
- **Body:** `{ "full_name": "...", "email": "..." }`

### `POST /auth/logout`
Clear the session cookie.
- **Access:** Public

---

## 2. Categories (`/categories`)

### `GET /categories`
List all product categories.
- **Access:** Public
- **Response (200):** `{ "success": true, "total": 6, "categories": [ { "id": "1", "name": "Electronics", "slug": "electronics", ... } ] }`

---

## 3. Products Catalogue (`/products`)

### `GET /products`
Browse active products with search, filtering, sorting, and pagination.
- **Access:** Public
- **Query Parameters:**
  - `q` (string): Text query searching name and description.
  - `category` (string): Filter by category slug (e.g. `gaming`, `electronics`).
  - `minPricePaise` / `maxPricePaise` (numeric string): Price range in paise.
  - `sort` (`newest` | `oldest` | `price_asc` | `price_desc`): Ordering. Default `newest`.
  - `page` (number): Default `1`.
  - `limit` (number): Default `12` (max 100).
- **Response (200):** `{ "success": true, "total": 8, "page": 1, "totalPages": 1, "products": [...] }`

### `GET /products/:slug`
Retrieve single product details by URL slug.
- **Access:** Public
- **Response (200):** `{ "success": true, "product": { "id": "1", "name": "...", "product_images": [...], "categories": {...} } }`

---

## 4. Shopping Cart (`/cart`)

### `GET /cart`
View current customer's shopping cart.
- **Access:** Authenticated Customer
- **Response (200):** `{ "success": true, "cart": { "id": "...", "items": [...], "subtotal_paise": "499800", "item_count": 2 } }`

### `POST /cart/items`
Add item to cart or increment quantity with inventory validation.
- **Access:** Authenticated Customer
- **Body:** `{ "product_id": "1", "quantity": 1 }`

### `PATCH /cart/items/:productId`
Update cart item quantity.
- **Access:** Authenticated Customer
- **Body:** `{ "quantity": 3 }`

### `DELETE /cart/items/:productId`
Remove item from cart.
- **Access:** Authenticated Customer

---

## 5. Wishlist (`/wishlist`)

### `GET /wishlist`
View customer's saved items.
- **Access:** Authenticated Customer
- **Response (200):** `{ "success": true, "total": 2, "wishlist": [...] }`

### `POST /wishlist/:productId`
Add product to wishlist (idempotent; duplicate adds are safely ignored).
- **Access:** Authenticated Customer

### `DELETE /wishlist/:productId`
Remove product from wishlist.
- **Access:** Authenticated Customer

---

## 6. Addresses (`/addresses`)

### `GET /addresses`
List all delivery addresses for the customer.
- **Access:** Authenticated Customer

### `POST /addresses`
Create a new delivery address.
- **Access:** Authenticated Customer
- **Body:**
  ```json
  {
    "full_name": "Asha Kumar",
    "phone": "9876543210",
    "address_line1": "Flat 402, Green Valley",
    "address_line2": "Near City Mall",
    "city": "Chennai",
    "state": "Tamil Nadu",
    "postal_code": "600001",
    "country": "India",
    "is_default": true
  }
  ```

### `PATCH /addresses/:id`
Update an existing address.
- **Access:** Authenticated Customer

### `DELETE /addresses/:id`
Delete an address (promotes next address to default if deleted address was default).
- **Access:** Authenticated Customer

---

## 7. Orders & Checkout (`/orders`)

### `POST /orders/checkout`
Checkout the active cart in an atomic database transaction.
- **Access:** Authenticated Customer
- **Body:**
  ```json
  {
    "address_id": "1",
    "payment_method": "DEMO_PAYMENT" // or "COD"
  }
  ```
- **Operations:**
  1. Validates address ownership.
  2. Verifies cart items and stock in real-time.
  3. Computes subtotal in paise on the server.
  4. Snapshots product names and prices into `order_items`.
  5. Atomically decrements product stock.
  6. Records payment status (`COMPLETED` for `DEMO_PAYMENT`, `PENDING` for `COD`).
  7. Clears cart items.
- **Response (201):** `{ "success": true, "order": { "id": "1", "status": "PENDING", ... } }`

### `GET /orders/my`
List customer's order history.
- **Access:** Authenticated Customer

### `GET /orders/my/:id`
View details and item snapshots of a single order.
- **Access:** Authenticated Customer

### `POST /orders/my/:id/cancel`
Cancel an order (only if `PENDING` or `PROCESSING`).
- **Access:** Authenticated Customer
- **Operations:** Reverts status to `CANCELLED`, cancels payments, and **restores inventory stock**.

### `GET /orders/admin/all`
List all customer orders across the platform.
- **Access:** Authenticated Administrator (`role: "ADMIN"`)
- **Query:** `status`, `page`, `limit`

### `PATCH /orders/admin/:id/status`
Update order status (`PENDING`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`).
- **Access:** Authenticated Administrator
- **Body:** `{ "status": "DELIVERED" }`

---

## 8. Reviews & Ratings (`/reviews`)

### `GET /reviews/product/:productId`
Retrieve reviews and aggregate metrics for a product.
- **Access:** Public
- **Response (200):** `{ "success": true, "total_reviews": 5, "average_rating": 4.6, "reviews": [...] }`

### `POST /reviews/product/:productId`
Post a review and 1–5 star rating.
- **Access:** Authenticated Customer
- **Enforcement:** Exactly 1 review per product per user. Subsequent attempts return `409 Conflict`.
- **Body:** `{ "rating": 5, "comment": "Excellent quality!" }`

### `DELETE /reviews/:id`
Customer deletes their own review.
- **Access:** Authenticated Customer

### `GET /reviews/admin/all`
List all reviews for moderation.
- **Access:** Authenticated Administrator

### `DELETE /reviews/admin/:id`
Moderate/delete a review.
- **Access:** Authenticated Administrator

---

## 9. Admin Operations (`/admin`)

All `/admin` endpoints require both `requireAuth` and `requireAdmin` server-side guards.

### `GET /admin/session`
Verify administrator credentials and session token.

### `GET /admin/overview`
Retrieve KPI metrics: `total_products`, `total_customers`, `total_orders`, `total_revenue_paise`, recent orders, and low-stock products ($\le 15$ units).

### `GET /admin/customers`
List registered customer profiles and their order/review counts.

### `GET /admin/categories`
List categories with their total product count.

### `POST /admin/categories`
Create category.
- **Body:** `{ "name": "...", "description": "..." }`

### `PATCH /admin/categories/:id`
Update category name or description.

### `DELETE /admin/categories/:id`
Delete category (only permitted if the category currently has 0 products).

### `GET /admin/products`
List all products (including inactive drafts) with search.

### `POST /admin/products`
Create product.
- **Body:** `{ "name": "...", "category_id": "1", "price_paise": "199900", "stock": 50, "description": "..." }`

### `PATCH /admin/products/:id`
Update product information, pricing, stock, or active status.

### `DELETE /admin/products/:id`
Soft-delete product by setting `is_active: false`.

### `POST /admin/products/:id/images`
Upload up to 8 images for a product (`multipart/form-data`, key `images`).
- Validates file magic bytes (JPEG, PNG, WebP) and 5MB limit.
- Stores files in `backend/uploads/products/`.
- Saves file paths in `product_images`.

### `PATCH /admin/products/:id/images/:imageId/primary`
Set primary image for product.

### `DELETE /admin/products/:id/images/:imageId`
Delete product image from database and filesystem.
