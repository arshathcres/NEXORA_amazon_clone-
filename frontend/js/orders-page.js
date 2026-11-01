import { orderApi } from "./orderApi.js";
import { formatRupees, initCustomerHeader, showToast, escapeHtml } from "./ui-utils.js";

async function loadOrders() {
  await initCustomerHeader();
  const container = document.getElementById("orders-container");

  try {
    const res = await orderApi.myOrders();
    if (!res.success || !res.orders.length) {
      if (container) {
        container.innerHTML = `
          <div class="state-box">
            <div class="icon">📦</div>
            <h3>No orders placed yet</h3>
            <p>When you checkout with Cash on Delivery or Demo Payment, your order tracking will appear here.</p>
            <a href="/pages/products.html" class="btn btn-primary btn-sm">Explore Products</a>
          </div>
        `;
      }
      return;
    }

    renderOrders(res.orders);
  } catch (err) {
    if (container) {
      container.innerHTML = `
        <div class="state-box">
          <p>Please sign in to view your orders.</p>
          <a href="/pages/login.html" class="btn btn-primary btn-sm">Sign In</a>
        </div>
      `;
    }
  }
}

function renderOrders(orders) {
  const container = document.getElementById("orders-container");
  if (!container) return;

  container.innerHTML = orders
    .map((o) => {
      const isCancellable = ["PENDING", "PROCESSING"].includes(o.status);
      const payment = o.payments?.[0];

      return `
        <div class="order-card" data-order-id="${o.id}">
          <div class="order-header-bar">
            <div>
              <span style="font-size:12px;color:var(--ink-secondary);text-transform:uppercase;letter-spacing:0.05em;">Order #${o.id}</span>
              <div style="font-size:13px;font-weight:600;margin-top:2px;">
                Placed on ${o.created_at ? new Date(o.created_at).toLocaleDateString() : "Recent"}
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:12px;">
              <span class="order-status-tag status-${o.status}">${o.status}</span>
              <span style="font-weight:800;font-size:16px;">${formatRupees(o.total_paise)}</span>
            </div>
          </div>

          <!-- Items list -->
          <div class="order-item-list">
            ${(o.items || [])
              .map(
                (item) => `
              <div style="display:flex;justify-content:space-between;font-size:14px;border-bottom:1px dashed var(--line);padding-bottom:8px;">
                <span>${escapeHtml(item.product_name)} × ${item.quantity}</span>
                <span style="font-weight:600;">${formatRupees(item.line_total_paise)}</span>
              </div>
            `
              )
              .join("")}
          </div>

          <!-- Delivery address & payment -->
          <div style="font-size:12px;color:var(--ink-secondary);background:var(--surface-alt);padding:12px 14px;border-radius:6px;margin-bottom:12px;">
            <div><strong>Delivery To:</strong> ${escapeHtml(o.address?.full_name || "")} (${escapeHtml(o.address?.phone || "")}), ${escapeHtml(o.address?.address_line1 || "")}, ${escapeHtml(o.address?.city || "")}</div>
            <div style="margin-top:4px;"><strong>Payment Method:</strong> ${payment?.payment_method === "DEMO_PAYMENT" ? "Simulated Demo Payment (Completed)" : "Cash on Delivery (Pending)"}</div>
          </div>

          ${
            isCancellable
              ? `
            <div style="text-align:right;">
              <button class="btn btn-secondary btn-sm cancel-order-btn" data-order-id="${o.id}" style="color:var(--danger);">
                Cancel Order
              </button>
            </div>
          `
              : ""
          }
        </div>
      `;
    })
    .join("");

  // Cancel order listeners
  container.querySelectorAll(".cancel-order-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const oid = btn.dataset.orderId;
      if (!confirm(`Are you sure you want to cancel Order #${oid}? Product inventory will be restored.`)) return;
      btn.disabled = true;
      btn.textContent = "Cancelling…";
      try {
        await orderApi.cancelOrder(oid);
        showToast("Order cancelled and stock restored.", "info");
        loadOrders();
      } catch (err) {
        showToast(err.message || "Failed to cancel order.", "error");
        btn.disabled = false;
        btn.textContent = "Cancel Order";
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", loadOrders);
