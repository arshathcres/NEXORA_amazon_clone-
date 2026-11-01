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

export const reviewApi = {
  // Public
  getProductReviews: (productId) => request(`/reviews/product/${encodeURIComponent(productId)}`),

  // Customer
  submitReview: (productId, review) =>
    request(`/reviews/product/${encodeURIComponent(productId)}`, {
      method: "POST",
      body: JSON.stringify(review),
    }),
  deleteMyReview: (reviewId) =>
    request(`/reviews/${encodeURIComponent(reviewId)}`, { method: "DELETE" }),

  // Admin
  adminListAll: (page = 1, limit = 20) =>
    request(`/reviews/admin/all?page=${page}&limit=${limit}`),
  adminModerateDelete: (reviewId) =>
    request(`/reviews/admin/${encodeURIComponent(reviewId)}`, { method: "DELETE" }),
};
