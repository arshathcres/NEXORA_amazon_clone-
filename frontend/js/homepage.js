import { productApi } from "./productApi.js";
import { categoryApi } from "./categoryApi.js";
import { cartApi } from "./cartApi.js";
import { wishlistApi } from "./wishlistApi.js";
import { formatRupees, initCustomerHeader, showToast, escapeHtml } from "./ui-utils.js";

const CATEGORY_ICONS = {
  electronics: "⚡",
  fashion: "👔",
  gaming: "🎮",
  "home-kitchen": "☕",
  accessories: "🎒",
  sports: "🏃",
};

async function loadHome() {
  await initCustomerHeader();

  const categoriesBar = document.getElementById("categories-bar");
  const homeCategories = document.getElementById("home-categories");
  const homeProducts = document.getElementById("home-products");

  // 1. Fetch categories
  try {
    const catRes = await categoryApi.listCategories();
    if (catRes.success && catRes.categories.length) {
      if (categoriesBar) {
        categoriesBar.innerHTML = `
          <a href="/pages/products.html" class="active">All Products</a>
          ${catRes.categories
            .map(
              (c) => `<a href="/pages/products.html?category=${encodeURIComponent(c.slug)}">${escapeHtml(c.name)}</a>`
            )
            .join("")}
        `;
      }
      if (homeCategories) {
        homeCategories.innerHTML = catRes.categories
          .map((c) => {
            const icon = CATEGORY_ICONS[c.slug] || "🏷️";
            return `
            <a href="/pages/products.html?category=${encodeURIComponent(c.slug)}" class="cat-card">
              <span class="cat-icon">${icon}</span>
              <span class="cat-name">${escapeHtml(c.name)}</span>
            </a>
          `;
          })
          .join("");
      }
    }
  } catch (err) {
    console.error("Categories load failed:", err);
  }

  // 2. Fetch featured products from PostgreSQL database
  try {
    const prodRes = await productApi.listProducts({ limit: 8, sort: "newest" });
    if (prodRes.success && prodRes.products.length) {
      if (homeProducts) {
        homeProducts.innerHTML = prodRes.products
          .map((p) => renderProductCard(p))
          .join("");

        attachCardHandlers(homeProducts);
      }
    } else {
      if (homeProducts) {
        homeProducts.innerHTML = `<div class="state-box"><p>No products found in catalogue.</p></div>`;
      }
    }
  } catch (err) {
    console.error("Products load failed:", err);
    if (homeProducts) {
      homeProducts.innerHTML = `
        <div class="state-box">
          <div class="icon">⚠️</div>
          <h3>Unable to load products</h3>
          <p>Make sure the NEXORA backend server is running at http://localhost:5000.</p>
        </div>
      `;
    }
  }
}

export function renderProductCard(p) {
  const primaryImg = p.product_images?.find((img) => img.is_primary) || p.product_images?.[0];
  const imgUrl = primaryImg ? primaryImg.image_path : null;
  const inStock = p.stock > 0;

  return `
    <article class="product-card" data-product-id="${p.id}">
      <div class="product-thumb">
        ${
          imgUrl
            ? `<img src="${imgUrl}" alt="${escapeHtml(p.name)}" loading="lazy">`
            : `<div class="thumb-placeholder">${CATEGORY_ICONS[p.categories?.slug] || "📦"}</div>`
        }
        ${!inStock ? `<span class="product-badge" style="background:#b22d30;">Out of Stock</span>` : ""}
        <button class="wishlist-toggle" data-product-id="${p.id}" title="Save to wishlist" aria-label="Save to wishlist">
          ♥
        </button>
      </div>

      <div class="product-info">
        <span class="product-category">${escapeHtml(p.categories?.name || "General")}</span>
        <h3 class="product-title">
          <a href="/pages/product-detail.html?slug=${encodeURIComponent(p.slug)}">${escapeHtml(p.name)}</a>
        </h3>

        <div class="product-price-row">
          <span class="product-price">${formatRupees(p.price_paise)}</span>
          <span class="product-stock-tag ${inStock ? "stock-in" : "stock-out"}">
            ${inStock ? `${p.stock} in stock` : "Sold out"}
          </span>
        </div>
      </div>

      <div class="product-actions">
        <button class="btn btn-primary btn-block add-to-cart-btn" data-product-id="${p.id}" ${!inStock ? "disabled" : ""}>
          ${inStock ? "Add to Cart 🛒" : "Out of Stock"}
        </button>
      </div>
    </article>
  `;
}

export function attachCardHandlers(container) {
  // Add to cart buttons
  container.querySelectorAll(".add-to-cart-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const pid = btn.dataset.productId;
      btn.disabled = true;
      btn.textContent = "Adding…";
      try {
        await cartApi.addItem(pid, 1);
        showToast("Added to your shopping cart!", "success");
        // Update badge
        const badge = document.getElementById("header-cart-badge");
        if (badge) {
          const count = Number(badge.textContent || 0) + 1;
          badge.textContent = count;
          badge.hidden = false;
        }
      } catch (err) {
        showToast(err.message || "Please sign in to add items to cart.", "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Add to Cart 🛒";
      }
    });
  });

  // Wishlist toggle buttons
  container.querySelectorAll(".wishlist-toggle").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const pid = btn.dataset.productId;
      try {
        await wishlistApi.addItem(pid);
        btn.classList.add("active");
        showToast("Added to your wishlist!", "success");
      } catch (err) {
        showToast(err.message || "Please sign in to save items.", "error");
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", loadHome);
