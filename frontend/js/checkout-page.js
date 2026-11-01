import { cartApi } from "./cartApi.js";
import { addressApi } from "./addressApi.js";
import { orderApi } from "./orderApi.js";
import { formatRupees, initCustomerHeader, showToast, escapeHtml } from "./ui-utils.js";

async function loadCheckout() {
  await initCustomerHeader();
  const container = document.getElementById("checkout-view");

  try {
    const [cartRes, addrRes] = await Promise.all([cartApi.getCart(), addressApi.listAddresses()]);

    if (!cartRes.success || !cartRes.cart || !cartRes.cart.items.length) {
      if (container) {
        container.innerHTML = `
          <div class="state-box">
            <h3>Your cart is empty</h3>
            <p>Add some items to your shopping cart before proceeding to checkout.</p>
            <a href="/pages/products.html" class="btn btn-primary">Browse Catalogue</a>
          </div>
        `;
      }
      return;
    }

    renderCheckout(cartRes.cart, addrRes.addresses || []);
  } catch (err) {
    if (container) {
      container.innerHTML = `
        <div class="state-box">
          <h3>Authentication Required</h3>
          <p>Please log in to your NEXORA account to complete your order.</p>
          <a href="/pages/login.html" class="btn btn-primary">Sign In</a>
        </div>
      `;
    }
  }
}

function renderCheckout(cart, addresses) {
  const container = document.getElementById("checkout-view");
  if (!container) return;

  const defaultAddr = addresses.find((a) => a.is_default) || addresses[0];

  const addressChoices = addresses.length
    ? addresses
        .map(
          (a) => `
        <label class="address-card-choice">
          <input type="radio" name="selected_address" value="${a.id}" ${a.id === defaultAddr?.id ? "checked" : ""}>
          <div>
            <div style="font-weight:700;font-size:14px;">${escapeHtml(a.full_name)} · ${escapeHtml(a.phone)}</div>
            <div style="font-size:13px;color:var(--ink-secondary);margin-top:2px;">
              ${escapeHtml(a.address_line1)}${a.address_line2 ? `, ${escapeHtml(a.address_line2)}` : ""},
              ${escapeHtml(a.city)}, ${escapeHtml(a.state)} - ${escapeHtml(a.postal_code)}
            </div>
          </div>
        </label>
      `
        )
        .join("")
    : `
      <div class="state-box" style="margin:10px 0;padding:24px;">
        <p>You haven't saved any delivery addresses yet.</p>
        <a href="/pages/addresses.html" class="btn btn-secondary btn-sm" target="_blank">+ Add Address First</a>
      </div>
    `;

  container.innerHTML = `
    <div class="checkout-layout">
      <div>
        <!-- Step 1: Address -->
        <div class="checkout-step">
          <h2><span class="step-number">1</span> Delivery Address</h2>
          <div id="address-selection-box">
            ${addressChoices}
          </div>
          <div style="margin-top:12px;">
            <a href="/pages/addresses.html" class="btn btn-outline btn-sm" target="_blank">+ Manage Addresses</a>
          </div>
        </div>

        <!-- Step 2: Payment Method -->
        <div class="checkout-step">
          <h2><span class="step-number">2</span> Payment Method</h2>
          <label class="payment-option selected" id="opt-demo">
            <input type="radio" name="payment_method" value="DEMO_PAYMENT" checked>
            <div>
              <div style="font-weight:700;font-size:14px;">Simulated Demo Payment (Recommended for testing)</div>
              <div style="font-size:12px;color:var(--ink-secondary);margin-top:2px;">
                Instant demo authorization. No real credit card or bank details required. 100% simulated sandbox.
              </div>
            </div>
          </label>

          <label class="payment-option" id="opt-cod">
            <input type="radio" name="payment_method" value="COD">
            <div>
              <div style="font-weight:700;font-size:14px;">Cash on Delivery (COD)</div>
              <div style="font-size:12px;color:var(--ink-secondary);margin-top:2px;">
                Pay with cash upon arrival at your doorstep.
              </div>
            </div>
          </label>
        </div>
      </div>

      <!-- Order Review Sidebar -->
      <aside class="cart-summary-card">
        <h3 style="font-size:18px;margin-bottom:16px;">Order Items (${cart.item_count})</h3>
        <div style="max-height:240px;overflow-y:auto;margin-bottom:16px;">
          ${cart.items
            .map(
              (i) => `
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px;">
              <span>${escapeHtml(i.product.name)} × ${i.quantity}</span>
              <span style="font-weight:600;">${formatRupees(i.line_total_paise)}</span>
            </div>
          `
            )
            .join("")}
        </div>

        <div class="summary-row">
          <span>Subtotal</span>
          <span>${formatRupees(cart.subtotal_paise)}</span>
        </div>
        <div class="summary-row">
          <span>Standard Delivery</span>
          <span style="color:var(--success);font-weight:600;">FREE</span>
        </div>
        <div class="summary-row summary-total">
          <span>Amount Payable</span>
          <span>${formatRupees(cart.subtotal_paise)}</span>
        </div>

        <button id="place-order-btn" class="btn btn-primary btn-block btn-lg" style="margin-top:20px;" ${!addresses.length ? "disabled" : ""}>
          Place Order Now →
        </button>
      </aside>
    </div>
  `;

  // Visual toggle on payment radio
  document.querySelectorAll('input[name="payment_method"]').forEach((r) => {
    r.addEventListener("change", () => {
      document.querySelectorAll(".payment-option").forEach((el) => el.classList.remove("selected"));
      r.closest(".payment-option")?.classList.add("selected");
    });
  });

  // Place order submission
  document.getElementById("place-order-btn")?.addEventListener("click", async () => {
    const selectedAddress = document.querySelector('input[name="selected_address"]:checked')?.value;
    const paymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value;
    const btn = document.getElementById("place-order-btn");

    if (!selectedAddress) {
      showToast("Please choose or add a delivery address first.", "error");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Processing Order Transaction…";

    try {
      const res = await orderApi.checkout({
        address_id: selectedAddress,
        payment_method: paymentMethod,
      });

      if (res.success && res.order) {
        showToast("Order placed successfully!", "success");
        window.location.assign(`/pages/orders.html?orderId=${encodeURIComponent(res.order.id)}`);
      }
    } catch (err) {
      showToast(err.message || "Checkout failed. Please check stock.", "error");
      btn.disabled = false;
      btn.textContent = "Place Order Now →";
    }
  });
}

document.addEventListener("DOMContentLoaded", loadCheckout);
