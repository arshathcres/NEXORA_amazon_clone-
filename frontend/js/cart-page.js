import { cartApi } from "./cartApi.js";
import { formatRupees, initCustomerHeader, showToast, escapeHtml } from "./ui-utils.js";

async function loadCart() {
  await initCustomerHeader();
  const container = document.getElementById("cart-content");

  try {
    const res = await cartApi.getCart();
    if (!res.success || !res.cart || !res.cart.items.length) {
      if (container) {
        container.innerHTML = `
          <div class="state-box">
            <div class="icon">🛒</div>
            <h3>Your shopping cart is empty</h3>
            <p>Explore our curated electronics and lifestyle gear to add items.</p>
            <a href="/pages/products.html" class="btn btn-primary">Browse Catalogue</a>
          </div>
        `;
      }
      return;
    }

    renderCart(res.cart);
  } catch (err) {
    if (container) {
      container.innerHTML = `
        <div class="state-box">
          <div class="icon">🔒</div>
          <h3>Please sign in to view your cart</h3>
          <p>Your saved cart items are linked securely to your customer profile.</p>
          <a href="/pages/login.html" class="btn btn-primary">Sign In</a>
        </div>
      `;
    }
  }
}

function renderCart(cart) {
  const container = document.getElementById("cart-content");
  if (!container) return;

  const itemsHtml = cart.items
    .map((item) => {
      const p = item.product;
      const primaryImg = p.images?.find((img) => img.is_primary) || p.images?.[0];
      const imgUrl = primaryImg ? primaryImg.image_path : null;

      let qtyOptions = "";
      const maxLimit = Math.min(p.stock, 10);
      for (let i = 1; i <= Math.max(maxLimit, item.quantity); i++) {
        qtyOptions += `<option value="${i}" ${i === item.quantity ? "selected" : ""}>${i}</option>`;
      }

      return `
        <div class="cart-item-row" data-product-id="${item.product_id}">
          <div class="cart-item-thumb">
            ${
              imgUrl
                ? `<img src="${imgUrl}" alt="${escapeHtml(p.name)}">`
                : `<span style="font-size:32px;">📦</span>`
            }
          </div>

          <div>
            <h4 style="font-size:15px;margin-bottom:4px;">
              <a href="/pages/product-detail.html?slug=${encodeURIComponent(p.slug)}">${escapeHtml(p.name)}</a>
            </h4>
            <div style="font-size:13px;color:var(--ink-secondary);">${formatRupees(p.price_paise)} each</div>
          </div>

          <div>
            <select class="cart-qty-select" data-product-id="${item.product_id}" style="padding:6px 10px;border-radius:6px;border:1px solid var(--line);">
              ${qtyOptions}
            </select>
          </div>

          <div style="font-weight:700;font-size:15px;text-align:right;">
            ${formatRupees(item.line_total_paise)}
          </div>

          <div style="text-align:right;">
            <button class="cart-remove-btn" data-product-id="${item.product_id}" title="Remove item" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:16px;">
              ✕
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="cart-layout">
      <div class="cart-items-table">
        ${itemsHtml}
      </div>

      <aside class="cart-summary-card">
        <h3 style="font-size:18px;margin-bottom:16px;">Order Summary</h3>
        <div class="summary-row">
          <span>Items (${cart.item_count})</span>
          <span>${formatRupees(cart.subtotal_paise)}</span>
        </div>
        <div class="summary-row">
          <span>Delivery</span>
          <span style="color:var(--success);font-weight:600;">FREE</span>
        </div>
        <div class="summary-row summary-total">
          <span>Total</span>
          <span>${formatRupees(cart.subtotal_paise)}</span>
        </div>

        <a href="/pages/checkout.html" class="btn btn-primary btn-block btn-lg" style="margin-top:20px;">
          Proceed to Checkout →
        </a>
      </aside>
    </div>
  `;

  // Attach quantity change listeners
  container.querySelectorAll(".cart-qty-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const pid = sel.dataset.productId;
      const qty = Number(sel.value);
      try {
        await cartApi.updateQuantity(pid, qty);
        showToast("Cart quantity updated.", "success");
        loadCart();
      } catch (err) {
        showToast(err.message || "Failed to update quantity.", "error");
        loadCart();
      }
    });
  });

  // Attach remove listeners
  container.querySelectorAll(".cart-remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pid = btn.dataset.productId;
      try {
        await cartApi.removeItem(pid);
        showToast("Item removed from cart.", "info");
        loadCart();
      } catch (err) {
        showToast(err.message || "Could not remove item.", "error");
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", loadCart);
