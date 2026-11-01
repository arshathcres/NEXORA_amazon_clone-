import { productApi } from "./productApi.js";
import { reviewApi } from "./reviewApi.js";
import { cartApi } from "./cartApi.js";
import { wishlistApi } from "./wishlistApi.js";
import { formatRupees, initCustomerHeader, showToast, escapeHtml } from "./ui-utils.js";

let currentProduct = null;

async function loadProduct() {
  await initCustomerHeader();

  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");
  const container = document.getElementById("product-detail-view");
  const reviewsSection = document.getElementById("reviews-section");

  if (!slug) {
    if (container) container.innerHTML = `<div class="state-box"><h3>No product selected</h3><p><a href="/pages/products.html">Return to catalogue</a></p></div>`;
    return;
  }

  try {
    const res = await productApi.getProductBySlug(slug);
    if (!res.success || !res.product) {
      if (container) container.innerHTML = `<div class="state-box"><h3>Product not found</h3><p><a href="/pages/products.html">Browse other products</a></p></div>`;
      return;
    }

    currentProduct = res.product;
    document.title = `${currentProduct.name} — NEXORA`;

    renderProductDetail(currentProduct);
    if (reviewsSection) reviewsSection.style.display = "block";
    loadReviews(currentProduct.id);
  } catch (err) {
    console.error("Detail load error:", err);
    if (container) container.innerHTML = `<div class="state-box"><p>Failed to load product details.</p></div>`;
  }
}

function renderProductDetail(p) {
  const container = document.getElementById("product-detail-view");
  if (!container) return;

  const images = p.product_images || [];
  const primaryImg = images.find((i) => i.is_primary) || images[0];
  const inStock = p.stock > 0;
  const maxQty = Math.min(p.stock, 10);

  let qtyOptions = "";
  for (let i = 1; i <= (maxQty || 1); i++) {
    qtyOptions += `<option value="${i}">${i}</option>`;
  }

  container.innerHTML = `
    <div class="detail-grid">
      <!-- Image Gallery -->
      <div class="gallery-shell">
        <div class="main-image-wrap" id="main-image-wrap">
          ${
            primaryImg
              ? `<img id="main-image" src="${primaryImg.image_path}" alt="${escapeHtml(p.name)}">`
              : `<div class="thumb-placeholder" style="font-size:64px;">📦</div>`
          }
        </div>
        ${
          images.length > 1
            ? `<div class="thumb-strip" id="thumb-strip">
                ${images
                  .map(
                    (img, idx) => `
                    <button class="thumb-btn ${img.id === primaryImg?.id ? "active" : ""}" data-src="${img.image_path}">
                      <img src="${img.image_path}" alt="Thumbnail ${idx + 1}">
                    </button>
                  `
                  )
                  .join("")}
               </div>`
            : ""
        }
      </div>

      <!-- Info & Buy box -->
      <div class="product-meta-block">
        <span class="detail-category">${escapeHtml(p.categories?.name || "General")}</span>
        <h1 class="detail-title">${escapeHtml(p.name)}</h1>

        <div class="detail-rating-row" id="detail-rating-badge">
          <span class="star-badge">★ <span id="avg-rating-val">--</span></span>
          <span style="color:var(--ink-secondary);" id="review-count-val">Loading reviews…</span>
        </div>

        <div class="detail-price">${formatRupees(p.price_paise)}</div>

        <div class="detail-desc">
          <p>${escapeHtml(p.description || "No product description provided.")}</p>
        </div>

        <div>
          <span class="product-stock-tag ${inStock ? "stock-in" : "stock-out"}" style="font-size:14px;">
            ${inStock ? `● In Stock (${p.stock} units available)` : "● Currently Out of Stock"}
          </span>
        </div>

        <div class="purchase-box">
          <div class="qty-picker">
            <label for="detail-qty" style="font-size:13px;font-weight:700;">Quantity:</label>
            <select id="detail-qty" class="qty-select" ${!inStock ? "disabled" : ""}>
              ${qtyOptions}
            </select>
          </div>

          <div style="display:flex;gap:12px;">
            <button id="add-to-cart-detail-btn" class="btn btn-primary btn-lg" style="flex:2;" ${!inStock ? "disabled" : ""}>
              ${inStock ? "Add to Shopping Cart 🛒" : "Sold Out"}
            </button>
            <button id="add-to-wishlist-detail-btn" class="btn btn-secondary btn-lg" style="flex:1;" title="Save item">
              Save ♥
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Gallery thumb switching
  document.querySelectorAll(".thumb-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".thumb-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const mainImg = document.getElementById("main-image");
      if (mainImg) mainImg.src = btn.dataset.src;
    });
  });

  // Add to cart
  document.getElementById("add-to-cart-detail-btn")?.addEventListener("click", async () => {
    const qty = Number(document.getElementById("detail-qty")?.value) || 1;
    const btn = document.getElementById("add-to-cart-detail-btn");
    btn.disabled = true;
    btn.textContent = "Adding…";
    try {
      await cartApi.addItem(p.id, qty);
      showToast(`Added ${qty} item(s) to your shopping cart!`, "success");
      const badge = document.getElementById("header-cart-badge");
      if (badge) {
        badge.textContent = Number(badge.textContent || 0) + qty;
        badge.hidden = false;
      }
    } catch (err) {
      showToast(err.message || "Failed to add to cart.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Add to Shopping Cart 🛒";
    }
  });

  // Add to wishlist
  document.getElementById("add-to-wishlist-detail-btn")?.addEventListener("click", async () => {
    try {
      await wishlistApi.addItem(p.id);
      showToast("Saved to your wishlist!", "success");
    } catch (err) {
      showToast(err.message || "Please sign in to save item.", "error");
    }
  });
}

async function loadReviews(productId) {
  const listEl = document.getElementById("review-list");
  const avgRatingEl = document.getElementById("avg-rating-val");
  const countEl = document.getElementById("review-count-val");

  try {
    const res = await reviewApi.getProductReviews(productId);
    if (res.success) {
      if (avgRatingEl) avgRatingEl.textContent = res.average_rating ? res.average_rating.toFixed(1) : "New";
      if (countEl) countEl.textContent = `(${res.total_reviews} customer ${res.total_reviews === 1 ? "review" : "reviews"})`;

      if (!res.reviews.length) {
        if (listEl) listEl.innerHTML = `<p style="color:var(--ink-secondary);">No customer reviews yet. Be the first to review this product!</p>`;
        return;
      }

      if (listEl) {
        listEl.innerHTML = res.reviews
          .map((r) => `
            <div class="review-item">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <span style="font-weight:700;font-size:14px;">${escapeHtml(r.user?.full_name || "Verified Customer")}</span>
                <span class="star-badge">★ ${r.rating}/5</span>
              </div>
              <p style="font-size:14px;color:var(--ink);line-height:1.5;">${escapeHtml(r.comment || "")}</p>
              <div style="font-size:11px;color:var(--ink-subtle);margin-top:6px;">
                ${r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
              </div>
            </div>
          `)
          .join("");
      }
    }
  } catch (err) {
    console.error("Reviews load error:", err);
  }
}

// Add Review form
document.getElementById("add-review-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentProduct) return;
  const rating = Number(document.getElementById("review-rating").value);
  const comment = document.getElementById("review-comment").value.trim();
  const btn = document.getElementById("submit-review-btn");

  btn.disabled = true;
  btn.textContent = "Submitting…";

  try {
    await reviewApi.submitReview(currentProduct.id, { rating, comment });
    showToast("Review submitted successfully!", "success");
    document.getElementById("review-comment").value = "";
    loadReviews(currentProduct.id);
  } catch (err) {
    showToast(err.message || "Failed to submit review.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Post Review";
  }
});

document.addEventListener("DOMContentLoaded", loadProduct);
