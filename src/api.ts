const params = new URLSearchParams(window.location.search);
const token = params.get("token");

export const _fetch = async (path: string, options?: RequestInit) => {
  const headers = new Headers(options?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    ...options,
    headers,
  });
};

export const api = {
  // getMyEvents: (token) => _fetch("/events/"),
  getEvents: () => _fetch("/api/events/"),
  createEvent: (eventData) =>
    _fetch("/api/events/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }),
};
