import { productApi } from "./productApi.js";
import { categoryApi } from "./categoryApi.js";
import { initCustomerHeader, escapeHtml } from "./ui-utils.js";
import { renderProductCard, attachCardHandlers } from "./homepage.js";

const state = {
  page: 1,
  limit: 12,
  q: "",
  category: "",
  minPrice: "",
  maxPrice: "",
  sort: "newest",
};

function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("q")) state.q = params.get("q");
  if (params.get("category")) state.category = params.get("category");
  if (params.get("sort")) state.sort = params.get("sort");
  if (params.get("page")) state.page = Number(params.get("page")) || 1;
}

async function loadCategories() {
  const container = document.getElementById("category-filter-list");
  try {
    const res = await categoryApi.listCategories();
    if (res.success && container) {
      const radios = res.categories.map((c) => `
        <label class="filter-option">
          <input type="radio" name="category" value="${escapeHtml(c.slug)}" ${state.category === c.slug ? "checked" : ""}>
          <span>${escapeHtml(c.name)}</span>
        </label>
      `).join("");
      container.innerHTML = `
        <label class="filter-option">
          <input type="radio" name="category" value="" ${!state.category ? "checked" : ""}>
          <span>All Categories</span>
        </label>
        ${radios}
      `;

      container.querySelectorAll('input[name="category"]').forEach((r) => {
        r.addEventListener("change", (e) => {
          state.category = e.target.value;
          state.page = 1;
          syncUrlAndFetch();
        });
      });
    }
  } catch (err) {
    console.error("Filter categories error:", err);
  }
}

async function fetchProducts() {
  const grid = document.getElementById("catalog-grid");
  const countLabel = document.getElementById("catalog-count");
  const pagination = document.getElementById("pagination");

  if (grid) grid.innerHTML = `<div class="state-box" style="grid-column: 1 / -1;"><p>Fetching products…</p></div>`;

  const queryParams = {
    page: state.page,
    limit: state.limit,
    sort: state.sort,
  };
  if (state.q) queryParams.q = state.q;
  if (state.category) queryParams.category = state.category;
  if (state.minPrice) queryParams.minPricePaise = String(Number(state.minPrice) * 100);
  if (state.maxPrice) queryParams.maxPricePaise = String(Number(state.maxPrice) * 100);

  try {
    const res = await productApi.listProducts(queryParams);
    if (res.success) {
      if (countLabel) countLabel.textContent = `Showing ${res.products.length} of ${res.total} products`;
      if (!res.products.length) {
        if (grid) grid.innerHTML = `<div class="state-box" style="grid-column: 1 / -1;"><div class="icon">🔍</div><h3>No products matched your criteria</h3><p>Try resetting filters or searching with a different term.</p></div>`;
        if (pagination) pagination.innerHTML = "";
        return;
      }

      if (grid) {
        grid.innerHTML = res.products.map((p) => renderProductCard(p)).join("");
        attachCardHandlers(grid);
      }

      if (pagination && res.totalPages > 1) {
        let btns = "";
        for (let i = 1; i <= res.totalPages; i++) {
          btns += `<button class="btn btn-sm ${i === state.page ? "btn-primary" : "btn-secondary"}" data-page="${i}">${i}</button>`;
        }
        pagination.innerHTML = btns;
        pagination.querySelectorAll("button").forEach((b) => {
          b.addEventListener("click", () => {
            state.page = Number(b.dataset.page);
            syncUrlAndFetch();
            window.scrollTo({ top: 0, behavior: "smooth" });
          });
        });
      } else if (pagination) {
        pagination.innerHTML = "";
      }
    }
  } catch (err) {
    console.error("Catalog load error:", err);
    if (grid) grid.innerHTML = `<div class="state-box" style="grid-column: 1 / -1;"><p>Could not load products. Please check server.</p></div>`;
  }
}

function syncUrlAndFetch() {
  const url = new URL(window.location);
  if (state.q) url.searchParams.set("q", state.q); else url.searchParams.delete("q");
  if (state.category) url.searchParams.set("category", state.category); else url.searchParams.delete("category");
  if (state.sort && state.sort !== "newest") url.searchParams.set("sort", state.sort); else url.searchParams.delete("sort");
  if (state.page > 1) url.searchParams.set("page", String(state.page)); else url.searchParams.delete("page");
  window.history.replaceState({}, "", url);
  fetchProducts();
}

document.addEventListener("DOMContentLoaded", async () => {
  parseUrlParams();
  await initCustomerHeader();
  await loadCategories();

  // Search input binding
  const searchInput = document.getElementById("search-input");
  if (searchInput && state.q) searchInput.value = state.q;
  document.getElementById("search-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    state.q = searchInput.value.trim();
    state.page = 1;
    syncUrlAndFetch();
  });

  // Sort binding
  const sortSelect = document.getElementById("sort-select");
  if (sortSelect) {
    sortSelect.value = state.sort;
    sortSelect.addEventListener("change", (e) => {
      state.sort = e.target.value;
      state.page = 1;
      syncUrlAndFetch();
    });
  }

  // Price filter
  document.getElementById("apply-price-btn")?.addEventListener("click", () => {
    state.minPrice = document.getElementById("min-price-input").value.trim();
    state.maxPrice = document.getElementById("max-price-input").value.trim();
    state.page = 1;
    syncUrlAndFetch();
  });

  // Reset filters
  document.getElementById("reset-filters-btn")?.addEventListener("click", () => {
    state.q = "";
    state.category = "";
    state.minPrice = "";
    state.maxPrice = "";
    state.sort = "newest";
    state.page = 1;
    if (searchInput) searchInput.value = "";
    document.getElementById("min-price-input").value = "";
    document.getElementById("max-price-input").value = "";
    const allCatRadio = document.querySelector('input[name="category"][value=""]');
    if (allCatRadio) allCatRadio.checked = true;
    if (sortSelect) sortSelect.value = "newest";
    syncUrlAndFetch();
  });

  fetchProducts();
});
