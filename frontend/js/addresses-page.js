import { addressApi } from "./addressApi.js";
import { initCustomerHeader, showToast, escapeHtml } from "./ui-utils.js";

async function loadAddresses() {
  await initCustomerHeader();
  const grid = document.getElementById("addresses-grid");

  try {
    const res = await addressApi.listAddresses();
    if (!res.success || !res.addresses.length) {
      if (grid) {
        grid.innerHTML = `
          <div class="state-box" style="grid-column: 1 / -1;">
            <div class="icon">📍</div>
            <h3>No delivery addresses saved</h3>
            <p>Add a delivery address to make checkout fast and seamless.</p>
          </div>
        `;
      }
      return;
    }

    renderAddresses(res.addresses);
  } catch (err) {
    if (grid) {
      grid.innerHTML = `
        <div class="state-box" style="grid-column: 1 / -1;">
          <p>Please sign in to manage your addresses.</p>
          <a href="/pages/login.html" class="btn btn-primary btn-sm">Sign In</a>
        </div>
      `;
    }
  }
}

function renderAddresses(list) {
  const grid = document.getElementById("addresses-grid");
  if (!grid) return;

  grid.innerHTML = list
    .map(
      (a) => `
    <div class="address-card ${a.is_default ? "is-default" : ""}" data-id="${a.id}">
      ${a.is_default ? `<span class="default-chip">Default Address</span>` : ""}
      <h3 style="font-size:16px;margin-bottom:6px;">${escapeHtml(a.full_name)}</h3>
      <div style="font-size:13px;color:var(--ink-secondary);line-height:1.6;flex:1;">
        <div>📞 ${escapeHtml(a.phone)}</div>
        <div style="margin-top:6px;">
          ${escapeHtml(a.address_line1)}${a.address_line2 ? `, ${escapeHtml(a.address_line2)}` : ""}<br>
          ${escapeHtml(a.city)}, ${escapeHtml(a.state)} - ${escapeHtml(a.postal_code)}<br>
          ${escapeHtml(a.country || "India")}
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;border-top:1px solid var(--line);padding-top:12px;">
        ${
          !a.is_default
            ? `<button class="btn btn-outline btn-sm set-default-btn" data-id="${a.id}">Set Default</button>`
            : ""
        }
        <button class="btn btn-secondary btn-sm delete-addr-btn" data-id="${a.id}" style="color:var(--danger);margin-left:auto;">
          Delete
        </button>
      </div>
    </div>
  `
    )
    .join("");

  // Set default listener
  grid.querySelectorAll(".set-default-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await addressApi.updateAddress(btn.dataset.id, { is_default: true });
        showToast("Default address updated.", "success");
        loadAddresses();
      } catch (err) {
        showToast(err.message || "Could not update address.", "error");
      }
    });
  });

  // Delete listener
  grid.querySelectorAll(".delete-addr-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to delete this delivery address?")) return;
      try {
        await addressApi.deleteAddress(btn.dataset.id);
        showToast("Address deleted.", "info");
        loadAddresses();
      } catch (err) {
        showToast(err.message || "Could not delete address.", "error");
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const formWrap = document.getElementById("address-form-wrap");
  const showBtn = document.getElementById("show-add-form-btn");
  const cancelBtn = document.getElementById("cancel-form-btn");
  const form = document.getElementById("new-address-form");

  showBtn?.addEventListener("click", () => {
    formWrap.style.display = "block";
    formWrap.scrollIntoView({ behavior: "smooth" });
  });

  cancelBtn?.addEventListener("click", () => {
    formWrap.style.display = "none";
    form.reset();
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const payload = {
      full_name: data.full_name.trim(),
      phone: data.phone.trim(),
      address_line1: data.address_line1.trim(),
      address_line2: data.address_line2 ? data.address_line2.trim() : null,
      city: data.city.trim(),
      state: data.state.trim(),
      postal_code: data.postal_code.trim(),
      country: data.country.trim() || "India",
      is_default: data.is_default === "on",
    };

    try {
      await addressApi.createAddress(payload);
      showToast("Address saved successfully!", "success");
      formWrap.style.display = "none";
      form.reset();
      loadAddresses();
    } catch (err) {
      showToast(err.message || "Could not save address.", "error");
    }
  });

  loadAddresses();
});
