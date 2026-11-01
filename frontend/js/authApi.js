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
  } catch (error) {
    const detail = error instanceof Error ? ` (${error.message})` : "";
    throw new Error(`Could not reach ${API_BASE_URL}${path}. Make sure the NEXORA backend is running.${detail}`);
  }

  const responseText = await response.text();
  const contentType = response.headers.get("content-type") || "";
  let payload;

  if (contentType.includes("application/json")) {
    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error(`NEXORA API returned invalid JSON (HTTP ${response.status}).`);
    }
  } else {
    const readableText = responseText.replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ").trim().slice(0, 240);
    const detail = readableText ? ` ${readableText}` : "";
    throw new Error(`Expected JSON from ${API_BASE_URL}${path}, but received ${contentType || "an unknown content type"} (HTTP ${response.status}).${detail}`);
  }

  if (!response.ok) {
    const fieldMessages = Array.isArray(payload.errors)
      ? payload.errors.map((item) => typeof item === "string" ? item : item?.message).filter(Boolean)
      : payload.errors && typeof payload.errors === "object"
        ? Object.values(payload.errors).flatMap((messages) => Array.isArray(messages) ? messages : [messages]).filter((item) => typeof item === "string")
        : [];
    throw new Error(fieldMessages.length ? fieldMessages.join(" ") : payload.message || `Request failed (HTTP ${response.status}).`);
  }
  return payload;
}

export { API_BASE_URL };

export const authApi = {
  register: (details) => request("/auth/register", { method: "POST", body: JSON.stringify(details) }),
  login: (credentials) => request("/auth/login", { method: "POST", body: JSON.stringify(credentials) }),
  currentUser: () => request("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),
};
