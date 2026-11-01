import { wishlistApi } from "./wishlistApi.js";
import { cartApi } from "./cartApi.js";
import { formatRupees, initCustomerHeader, showToast, escapeHtml } from "./ui-utils.js";

async function loadWishlist() {
  await initCustomerHeader();
  const grid = document.getElementById("wishlist-grid");

  try {
    const res = await wishlistApi.getWishlist();
    if (!res.success || !res.wishlist.length) {
      if (grid) {
        grid.innerHTML = `
          <div class="state-box" style="grid-column: 1 / -1;">
            <div class="icon">🤍</div>
            <h3>Your wishlist is empty</h3>
            <p>Save items you're interested in while browsing so you can find them later.</p>
            <a href="/pages/products.html" class="btn btn-primary btn-sm">Explore Products</a>
          </div>
        `;
      }
      return;
    }

    renderWishlist(res.wishlist);
  } catch (err) {
    if (grid) {
      grid.innerHTML = `
        <div class="state-box" style="grid-column: 1 / -1;">
          <p>Please sign in to view your wishlist.</p>
          <a href="/pages/login.html" class="btn btn-primary btn-sm">Sign In</a>
        </div>
      `;
    }
  }
}

function renderWishlist(list) {
  const grid = document.getElementById("wishlist-grid");
  if (!grid) return;

  grid.innerHTML = list
    .map((item) => {
      const p = item.product;
      const primaryImg = p.images?.find((img) => img.is_primary) || p.images?.[0];
      const imgUrl = primaryImg ? primaryImg.image_path : null;
      const inStock = p.stock > 0;

      return `
        <article class="product-card">
          <div class="product-thumb">
            ${
              imgUrl
                ? `<img src="${imgUrl}" alt="${escapeHtml(p.name)}">`
                : `<div class="thumb-placeholder">📦</div>`
            }
          </div>
          <div class="product-info">
            <span class="product-category">${escapeHtml(p.category?.name || "General")}</span>
            <h3 class="product-title">
              <a href="/pages/product-detail.html?slug=${encodeURIComponent(p.slug)}">${escapeHtml(p.name)}</a>
            </h3>
            <div class="product-price-row">
              <span class="product-price">${formatRupees(p.price_paise)}</span>
            </div>
          </div>
          <div class="product-actions" style="display:flex;gap:8px;">
            <button class="btn btn-primary btn-sm move-to-cart-btn" data-product-id="${p.id}" style="flex:1;" ${!inStock ? "disabled" : ""}>
              ${inStock ? "Move to Cart" : "Out of Stock"}
            </button>
            <button class="btn btn-secondary btn-sm remove-wishlist-btn" data-product-id="${p.id}">
              Remove
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  // Move to cart listeners
  grid.querySelectorAll(".move-to-cart-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pid = btn.dataset.productId;
      try {
        await cartApi.addItem(pid, 1);
        await wishlistApi.removeItem(pid);
        showToast("Moved to your cart!", "success");
        loadWishlist();
      } catch (err) {
        showToast(err.message || "Failed to move to cart.", "error");
      }
    });
  });

  // Remove listeners
  grid.querySelectorAll(".remove-wishlist-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pid = btn.dataset.productId;
      try {
        await wishlistApi.removeItem(pid);
        showToast("Removed from wishlist.", "info");
        loadWishlist();
      } catch (err) {
        showToast(err.message || "Could not remove item.", "error");
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", loadWishlist);
