const API_BASE_URL = window.location.port === "5000" ? "/api" : "http://localhost:5000/api";

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(`Could not reach NEXORA API at ${API_BASE_URL}.`);
  }

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`The API returned an unexpected response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(payload.message || `Request failed (HTTP ${response.status}).`);
  }
  return payload;
}

export const orderApi = {
  // Customer actions
  myOrders: () => request("/orders/my"),
  getOrder: (id) => request(`/orders/my/${encodeURIComponent(id)}`),
  checkout: (details) =>
    request("/orders/checkout", { method: "POST", body: JSON.stringify(details) }),
  cancelOrder: (id) =>
    request(`/orders/my/${encodeURIComponent(id)}/cancel`, { method: "POST" }),

  // Admin actions
  adminListAll: (status = "") =>
    request(`/orders/admin/all${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  adminUpdateStatus: (id, status) =>
    request(`/orders/admin/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};
