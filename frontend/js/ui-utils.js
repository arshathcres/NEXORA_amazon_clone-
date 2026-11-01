import { authApi } from "./authApi.js";
import { cartApi } from "./cartApi.js";

export function formatRupees(paise) {
  const num = typeof paise === "bigint" ? Number(paise) : Number(paise || 0);
  const rupees = num / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

export function showToast(message, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

export async function initCustomerHeader() {
  const authNav = document.getElementById("header-auth-nav");
  const cartBadge = document.getElementById("header-cart-badge");

  try {
    const userRes = await authApi.currentUser();
    if (userRes.success && userRes.user) {
      const u = userRes.user;
      if (authNav) {
        authNav.innerHTML = `
          <a href="/pages/profile.html" class="action-btn" title="My Profile">
            <span aria-hidden="true">👤</span>
            <span>${escapeHtml(u.full_name.split(" ")[0])}</span>
          </a>
          ${u.role === "ADMIN" ? `<a href="/admin/index.html" class="action-btn" style="color:var(--accent-amber);" title="Admin Panel"><span aria-hidden="true">⚡</span> Admin</a>` : ""}
          <button id="header-logout-btn" class="action-btn" style="background:none;border:none;cursor:pointer;">Logout</button>
        `;
        document.getElementById("header-logout-btn")?.addEventListener("click", async () => {
          await authApi.logout();
          showToast("Logged out successfully.", "success");
          window.location.reload();
        });
      }

      // Fetch live cart count
      try {
        const cartRes = await cartApi.getCart();
        if (cartBadge && cartRes.success) {
          cartBadge.textContent = cartRes.cart.item_count || 0;
          cartBadge.hidden = cartRes.cart.item_count === 0;
        }
      } catch {}
    }
  } catch {
    // Unauthenticated state
    if (authNav) {
      authNav.innerHTML = `
        <a href="/pages/login.html" class="action-btn">Sign in</a>
        <a href="/pages/register.html" class="btn btn-primary btn-sm">Join</a>
      `;
    }
    if (cartBadge) cartBadge.hidden = true;
  }
}

export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
