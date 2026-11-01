import { adminApi } from "./adminApi.js";
import { orderApi } from "./orderApi.js";
import { reviewApi } from "./reviewApi.js";
import { authApi } from "./authApi.js";
import { formatRupees, showToast, escapeHtml } from "./ui-utils.js";

let selectedFiles = [];

async function checkAdminAccess() {
  try {
    const sessionRes = await adminApi.checkSession();
    if (sessionRes.success && sessionRes.admin) {
      document.getElementById("admin-user-name").textContent = sessionRes.admin.full_name;
      document.getElementById("admin-user-email").textContent = sessionRes.admin.email;
      return true;
    }
  } catch (err) {
    console.error("Admin unauthorized:", err);
    // Redirect unauthenticated/customer directly to login
    window.location.assign("/pages/login.html");
    return false;
  }
}

// Tab navigation
function setupNavigation() {
  const links = document.querySelectorAll(".nav-link");
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const tabId = link.dataset.tab;
      switchTab(tabId);
    });
  });

  window.addEventListener("hashchange", () => {
    const hash = window.location.hash.replace("#", "") || "overview";
    switchTab(hash);
  });
}

function switchTab(tabId) {
  document.querySelectorAll(".nav-link").forEach((l) => {
    l.classList.toggle("active", l.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabId}`);
  });

  const titles = {
    overview: "Dashboard Overview",
    products: "Product Catalogue Manager",
    "add-product": "Add New Catalogue Product",
    categories: "Category Management",
    inventory: "Inventory & Stock Levels",
    orders: "Customer Order Management",
    customers: "Registered Customer Directory",
    reviews: "Customer Reviews Moderation",
  };
  const titleEl = document.getElementById("topbar-title");
  if (titleEl) titleEl.textContent = titles[tabId] || "Admin Dashboard";

  // Trigger data reload for active tab
  if (tabId === "overview") loadOverview();
  else if (tabId === "products") loadProducts();
  else if (tabId === "add-product") loadCategoriesForForm();
  else if (tabId === "categories") loadCategories();
  else if (tabId === "inventory") loadInventory();
  else if (tabId === "orders") loadOrders();
  else if (tabId === "customers") loadCustomers();
  else if (tabId === "reviews") loadReviews();
}

// 1. Overview
async function loadOverview() {
  try {
    const res = await adminApi.getOverview();
    if (res.success && res.stats) {
      document.getElementById("kpi-products").textContent = res.stats.total_products;
      document.getElementById("kpi-customers").textContent = res.stats.total_customers;
      document.getElementById("kpi-orders").textContent = res.stats.total_orders;
      document.getElementById("kpi-revenue").textContent = formatRupees(res.stats.total_revenue_paise);

      // Recent orders
      const ordersTbody = document.getElementById("overview-orders-tbody");
      if (ordersTbody) {
        if (!res.recent_orders.length) {
          ordersTbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--admin-text-subtle);">No orders recorded yet.</td></tr>`;
        } else {
          ordersTbody.innerHTML = res.recent_orders
            .map((o) => `
              <tr>
                <td style="font-weight:700;">#${o.id}</td>
                <td>${escapeHtml(o.customer_name)}<br><small style="color:var(--admin-text-subtle);">${escapeHtml(o.customer_email)}</small></td>
                <td style="font-weight:700;">${formatRupees(o.total_paise)}</td>
                <td><small>${o.payment_method}</small></td>
                <td><span class="order-status-tag status-${o.status}">${o.status}</span></td>
                <td><small>${o.created_at ? new Date(o.created_at).toLocaleDateString() : ""}</small></td>
              </tr>
            `)
            .join("");
        }
      }

      // Low stock
      const lowStockTbody = document.getElementById("overview-lowstock-tbody");
      if (lowStockTbody) {
        if (!res.low_stock_products.length) {
          lowStockTbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#10b981;">✓ All products have healthy stock levels (> 15 units).</td></tr>`;
        } else {
          lowStockTbody.innerHTML = res.low_stock_products
            .map((p) => `
              <tr>
                <td style="font-weight:700;">${escapeHtml(p.name)}</td>
                <td>${formatRupees(p.price_paise)}</td>
                <td style="color:${p.stock === 0 ? "var(--danger)" : "var(--accent-amber)"};font-weight:800;">${p.stock} units</td>
                <td><a href="#inventory" class="btn btn-sm btn-outline nav-link" data-tab="inventory">Adjust Stock</a></td>
              </tr>
            `)
            .join("");
        }
      }
    }
  } catch (err) {
    console.error("Overview error:", err);
  }
}

// 2. Products
async function loadProducts() {
  const tbody = document.getElementById("admin-products-tbody");
  try {
    const q = document.getElementById("admin-prod-search")?.value.trim() || "";
    const res = await adminApi.listProducts({ q, limit: 100 });
    if (res.success && tbody) {
      if (!res.products.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No products found.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.products
        .map((p) => {
          const thumb = p.product_images?.[0]?.image_path;
          return `
            <tr>
              <td>
                <div style="width:44px;height:44px;border-radius:6px;overflow:hidden;background:#edf3f0;display:grid;place-items:center;">
                  ${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;">` : "📦"}
                </div>
              </td>
              <td style="font-weight:700;">
                ${escapeHtml(p.name)}
                <div style="font-size:11px;color:var(--admin-text-subtle);font-weight:400;">slug: ${escapeHtml(p.slug)}</div>
              </td>
              <td>${escapeHtml(p.categories?.name || "General")}</td>
              <td style="font-weight:700;">${formatRupees(p.price_paise)}</td>
              <td style="font-weight:700;color:${p.stock === 0 ? "var(--danger)" : "inherit"};">${p.stock}</td>
              <td>
                <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;background:${p.is_active ? "#dcfce7;color:#166534" : "#fee2e2;color:#991b1b"}">
                  ${p.is_active ? "ACTIVE" : "INACTIVE"}
                </span>
              </td>
              <td>
                <div style="display:flex;gap:6px;">
                  <button class="btn btn-secondary btn-sm deactivate-prod-btn" data-id="${p.id}" style="color:${p.is_active ? "var(--danger)" : "var(--accent)"}">
                    ${p.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </td>
            </tr>
          `;
        })
        .join("");

      // Deactivate/Toggle listener
      tbody.querySelectorAll(".deactivate-prod-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const pid = btn.dataset.id;
          try {
            await adminApi.deactivateProduct(pid);
            showToast("Product status updated.", "info");
            loadProducts();
          } catch (err) {
            showToast(err.message || "Failed to update product.", "error");
          }
        });
      });
    }
  } catch (err) {
    console.error("Products error:", err);
  }
}

// 3. Add Product with Multiple Images
async function loadCategoriesForForm() {
  const select = document.getElementById("prod-form-categories");
  try {
    const res = await adminApi.listCategories();
    if (res.success && select) {
      select.innerHTML = `
        <option value="">Select a category…</option>
        ${res.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}
      `;
    }
  } catch (err) {
    console.error("Categories form load error:", err);
  }
}

function setupImageUploadPreview() {
  const input = document.getElementById("product-images-input");
  const preview = document.getElementById("create-images-preview");

  input?.addEventListener("change", () => {
    selectedFiles = Array.from(input.files || []).slice(0, 8);
    if (input.files?.length > 8) {
      showToast("Maximum 8 images allowed per product upload.", "error");
    }
    if (preview) {
      preview.replaceChildren();
      selectedFiles.forEach((file) => {
        const card = document.createElement("div");
        card.className = "image-preview-card";
        const img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        img.onload = () => URL.revokeObjectURL(img.src);
        card.appendChild(img);
        preview.appendChild(card);
      });
    }
  });
}

// 4. Categories
async function loadCategories() {
  const tbody = document.getElementById("admin-categories-tbody");
  try {
    const res = await adminApi.listCategories();
    if (res.success && tbody) {
      tbody.innerHTML = res.categories
        .map((c) => `
          <tr>
            <td style="font-weight:700;">${escapeHtml(c.name)}</td>
            <td style="color:var(--admin-text-subtle);">${escapeHtml(c.slug)}</td>
            <td><strong>${c.product_count}</strong> products</td>
            <td>
              <button class="btn btn-secondary btn-sm delete-cat-btn" data-id="${c.id}" style="color:var(--danger);">
                Delete
              </button>
            </td>
          </tr>
        `)
        .join("");

      tbody.querySelectorAll(".delete-cat-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const cid = btn.dataset.id;
          if (!confirm("Are you sure you want to delete this category? (Must have 0 products)")) return;
          try {
            await adminApi.deleteCategory(cid);
            showToast("Category deleted.", "info");
            loadCategories();
          } catch (err) {
            showToast(err.message || "Failed to delete category.", "error");
          }
        });
      });
    }
  } catch (err) {
    console.error("Categories load error:", err);
  }
}

// 5. Inventory
async function loadInventory() {
  const tbody = document.getElementById("admin-inventory-tbody");
  try {
    const res = await adminApi.listProducts({ limit: 100 });
    if (res.success && tbody) {
      tbody.innerHTML = res.products
        .map((p) => `
          <tr>
            <td>#${p.id}</td>
            <td style="font-weight:700;">${escapeHtml(p.name)}</td>
            <td>${formatRupees(p.price_paise)}</td>
            <td style="font-weight:800;font-size:15px;color:${p.stock <= 10 ? "var(--danger)" : "inherit"};">${p.stock}</td>
            <td>
              <div style="display:flex;gap:6px;align-items:center;">
                <input type="number" class="inventory-stock-input" value="${p.stock}" min="0" style="width:80px;padding:4px 8px;border:1px solid var(--admin-line);border-radius:4px;font-size:13px;">
                <button class="btn btn-secondary btn-sm save-stock-btn" data-id="${p.id}">Update</button>
              </div>
            </td>
          </tr>
        `)
        .join("");

      tbody.querySelectorAll(".save-stock-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const pid = btn.dataset.id;
          const input = btn.closest("tr")?.querySelector(".inventory-stock-input");
          const newStock = Number(input?.value);
          if (isNaN(newStock) || newStock < 0) {
            showToast("Enter a valid non-negative number.", "error");
            return;
          }
          try {
            await adminApi.updateProduct(pid, { stock: newStock });
            showToast("Stock updated successfully!", "success");
            loadInventory();
          } catch (err) {
            showToast(err.message || "Could not update stock.", "error");
          }
        });
      });
    }
  } catch (err) {
    console.error("Inventory error:", err);
  }
}

// 6. Orders
async function loadOrders() {
  const tbody = document.getElementById("admin-orders-tbody");
  const filter = document.getElementById("admin-orders-filter")?.value || "";
  try {
    const res = await orderApi.adminListAll(filter);
    if (res.success && tbody) {
      if (!res.orders.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No orders found matching status.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.orders
        .map((o) => `
          <tr>
            <td style="font-weight:700;">#${o.id}</td>
            <td>${escapeHtml(o.customer?.full_name || "Customer")}<br><small style="color:var(--admin-text-subtle);">${escapeHtml(o.customer?.email || "")}</small></td>
            <td><small>${(o.items || []).map((i) => `${escapeHtml(i.product_name)} (${i.quantity})`).join(", ")}</small></td>
            <td style="font-weight:700;">${formatRupees(o.total_paise)}</td>
            <td><small>${o.payments?.[0]?.payment_method || "N/A"}</small></td>
            <td><span class="order-status-tag status-${o.status}">${o.status}</span></td>
            <td>
              <select class="order-status-change" data-id="${o.id}" style="padding:4px 8px;border-radius:4px;border:1px solid var(--admin-line);font-size:12px;">
                <option value="PENDING" ${o.status === "PENDING" ? "selected" : ""}>PENDING</option>
                <option value="PROCESSING" ${o.status === "PROCESSING" ? "selected" : ""}>PROCESSING</option>
                <option value="SHIPPED" ${o.status === "SHIPPED" ? "selected" : ""}>SHIPPED</option>
                <option value="DELIVERED" ${o.status === "DELIVERED" ? "selected" : ""}>DELIVERED</option>
                <option value="CANCELLED" ${o.status === "CANCELLED" ? "selected" : ""}>CANCELLED</option>
              </select>
            </td>
          </tr>
        `)
        .join("");

      tbody.querySelectorAll(".order-status-change").forEach((sel) => {
        sel.addEventListener("change", async () => {
          const oid = sel.dataset.id;
          const status = sel.value;
          try {
            await orderApi.adminUpdateStatus(oid, status);
            showToast(`Order #${oid} status updated to ${status}.`, "success");
            loadOrders();
          } catch (err) {
            showToast(err.message || "Failed to update status.", "error");
            loadOrders();
          }
        });
      });
    }
  } catch (err) {
    console.error("Orders load error:", err);
  }
}

// 7. Customers
async function loadCustomers() {
  const tbody = document.getElementById("admin-customers-tbody");
  try {
    const res = await adminApi.listCustomers();
    if (res.success && tbody) {
      if (!res.customers.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No registered customers yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.customers
        .map((c) => `
          <tr>
            <td style="font-weight:700;">${escapeHtml(c.full_name)}</td>
            <td>${escapeHtml(c.email)}</td>
            <td><strong>${c.orders_count}</strong> orders</td>
            <td><strong>${c.reviews_count}</strong> reviews</td>
            <td><small>${c.created_at ? new Date(c.created_at).toLocaleDateString() : ""}</small></td>
          </tr>
        `)
        .join("");
    }
  } catch (err) {
    console.error("Customers load error:", err);
  }
}

// 8. Reviews
async function loadReviews() {
  const tbody = document.getElementById("admin-reviews-tbody");
  try {
    const res = await reviewApi.adminListAll();
    if (res.success && tbody) {
      if (!res.reviews.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No reviews submitted yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.reviews
        .map((r) => `
          <tr>
            <td style="font-weight:700;">${escapeHtml(r.product_name || `Product #${r.product_id}`)}</td>
            <td>${escapeHtml(r.user?.full_name || "")}<br><small style="color:var(--admin-text-subtle);">${escapeHtml(r.customer_email || "")}</small></td>
            <td><span class="star-badge">★ ${r.rating}/5</span></td>
            <td><small style="display:block;max-width:320px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.comment || "(No comment)")}</small></td>
            <td><small>${r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}</small></td>
            <td>
              <button class="btn btn-secondary btn-sm delete-rev-btn" data-id="${r.id}" style="color:var(--danger);">
                Remove
              </button>
            </td>
          </tr>
        `)
        .join("");

      tbody.querySelectorAll(".delete-rev-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const rid = btn.dataset.id;
          if (!confirm("Are you sure you want to delete this customer review?")) return;
          try {
            await reviewApi.adminModerateDelete(rid);
            showToast("Review moderated and removed.", "info");
            loadReviews();
          } catch (err) {
            showToast(err.message || "Failed to moderate review.", "error");
          }
        });
      });
    }
  } catch (err) {
    console.error("Reviews load error:", err);
  }
}

// Setup Event Listeners
document.addEventListener("DOMContentLoaded", async () => {
  const isAuthorized = await checkAdminAccess();
  if (!isAuthorized) return;

  setupNavigation();
  setupImageUploadPreview();

  // Create Product Form
  const prodForm = document.getElementById("create-product-form");
  prodForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("save-product-btn");
    btn.disabled = true;
    btn.textContent = "Creating Product & Uploading Images…";

    const data = Object.fromEntries(new FormData(prodForm).entries());
    const priceRupees = Number(data.price_rupees);
    const payload = {
      name: data.name.trim(),
      category_id: data.category_id ? data.category_id : null,
      price_paise: String(Math.round(priceRupees * 100)),
      stock: Number(data.stock),
      is_active: data.is_active === "true",
      description: data.description ? data.description.trim() : null,
    };

    try {
      const res = await adminApi.createProduct(payload);
      if (res.success && res.product) {
        // Upload images if any selected
        if (selectedFiles.length) {
          try {
            await adminApi.uploadProductImages(res.product.id, selectedFiles);
          } catch (imgErr) {
            showToast(`Product created, but image upload failed: ${imgErr.message}`, "error");
          }
        }
        showToast("Product published to store catalogue!", "success");
        prodForm.reset();
        selectedFiles = [];
        document.getElementById("create-images-preview")?.replaceChildren();
        switchTab("products");
      }
    } catch (err) {
      showToast(err.message || "Failed to create product.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Publish Product to Store →";
    }
  });

  // Create Category Form
  const catForm = document.getElementById("create-category-form");
  catForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(catForm).entries());
    try {
      await adminApi.createCategory({
        name: data.name.trim(),
        description: data.description ? data.description.trim() : null,
      });
      showToast("Category created successfully!", "success");
      catForm.reset();
      loadCategories();
    } catch (err) {
      showToast(err.message || "Failed to create category.", "error");
    }
  });

  // Search product input
  document.getElementById("admin-prod-search")?.addEventListener("input", () => {
    loadProducts();
  });

  // Orders status filter
  document.getElementById("admin-orders-filter")?.addEventListener("change", () => {
    loadOrders();
  });

  // Logout button
  document.getElementById("admin-logout-btn")?.addEventListener("click", async () => {
    await authApi.logout();
    window.location.assign("/pages/login.html");
  });

  const initialTab = window.location.hash.replace("#", "") || "overview";
  switchTab(initialTab);
});
