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

export const productApi = {
  listProducts: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    }
    const query = qs.toString();
    return request(`/products${query ? `?${query}` : ""}`);
  },
  getProductBySlug: (slug) => request(`/products/${encodeURIComponent(slug)}`),
};
