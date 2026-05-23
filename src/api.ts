const token = new URLSearchParams(window.location.search).get("token");

const _fetch = async (path: string, options?: RequestInit) => {
  const headers = new Headers(options?.headers);
  if (import.meta.env.VITE_API_KEY) {
    headers.set("X-API-Key", import.meta.env.VITE_API_KEY);
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return;
  return res.json();
};

export const api = {
  events: {
    getAll: (): Promise<{ id: number; title: string; description: string; date: number; max_slots: number | null; registered_count: number }[]> =>
      _fetch("/api/events"),

    getById: (id: number): Promise<{
      id: number;
      title: string;
      description: string;
      content: string;
      max_slots: number | null;
      cancellation_rules: string | null;
      date: number;
      format: string;
      type: string;
      created_by: number;
      created_at: number;
      updated_at: number;
      registered_count: number;
    }> => _fetch(`/api/events/${id}`),

    getMyEvents: (): Promise<{ id: number; title: string; description: string; date: number; registered_count: number }[]> =>
      _fetch("/api/organizer/events"),

    create: (data: {
      title: string;
      description: string;
      content: string;
      max_slots: number | null;
      date: number;
      format: string;
      type: string;
    }): Promise<{ id: number; title: string; description: string; content: string; max_slots: number | null; date: number; format: string; type: string }> =>
      _fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),

    update: (id: number, data: {
      title: string;
      description: string;
      content: string;
      max_slots: number | null;
      date: number;
      format: string;
      type: string;
    }): Promise<{ id: number; title: string; description: string; content: string; max_slots: number | null; date: number; format: string; type: string }> =>
      _fetch(`/api/events/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),

    delete: (id: number): Promise<void> =>
      _fetch(`/api/events/${id}`, { method: "DELETE" }),
  },
};
