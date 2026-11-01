const API_BASE_URL = window.location.port === "5000" ? "/api" : "http://localhost:5000/api";

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: options.body instanceof FormData
        ? options.headers
        : { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
    });
  } catch {
    throw new Error(`Could not reach the NEXORA API at ${API_BASE_URL}.`);
  }

  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`The API returned an unexpected response (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(payload.message || `Request failed (HTTP ${response.status}).`);
  return payload;
}

export const adminApi = {
  checkSession: () => request("/admin/session"),
  getOverview: () => request("/admin/overview"),
  listCustomers: (page = 1, limit = 20) => request(`/admin/customers?page=${page}&limit=${limit}`),
  listCategories: () => request("/admin/categories"),
  listProducts: (query = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    }
    const qStr = qs.toString();
    return request(`/admin/products${qStr ? `?${qStr}` : ""}`);
  },
  createProduct: (product) => request("/admin/products", { method: "POST", body: JSON.stringify(product) }),
  updateProduct: (id, updates) => request(`/admin/products/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(updates) }),
  deactivateProduct: (id) => request(`/admin/products/${encodeURIComponent(id)}`, { method: "DELETE" }),
  uploadProductImages: (id, files) => {
    const body = new FormData();
    for (const file of files) body.append("images", file);
    return request(`/admin/products/${encodeURIComponent(id)}/images`, { method: "POST", body });
  },
  setPrimaryImage: (productId, imageId) => request(`/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}/primary`, { method: "PATCH" }),
  removeProductImage: (productId, imageId) => request(`/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`, { method: "DELETE" }),
  createCategory: (category) => request("/admin/categories", { method: "POST", body: JSON.stringify(category) }),
  updateCategory: (id, updates) => request(`/admin/categories/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(updates) }),
  deleteCategory: (id) => request(`/admin/categories/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
