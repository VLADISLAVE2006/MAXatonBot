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

type ShortEvent = {
  id: number;
  title: string;
  description: string;
  date: number;
  format: string;
  type: string;
  max_slots: number | null;
  registered_count: number;
  image_url: string;
};

type Event = {
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
  is_registered: boolean;
  closed: boolean;
  image_url: string;
};

type EventInput = {
  title: string;
  description: string;
  content: string;
  max_slots: number | null;
  cancellation_rules: string | null;
  date: number;
  format: string;
  type: string;
  image?: File;
};

function buildEventForm(data: EventInput): FormData {
  const form = new FormData();
  form.append("title", data.title);
  form.append("description", data.description);
  form.append("content", data.content);
  form.append("date", String(data.date));
  form.append("format", data.format);
  form.append("type", data.type);
  if (data.max_slots != null) form.append("max_slots", String(data.max_slots));
  if (data.cancellation_rules) form.append("cancellation_rules", data.cancellation_rules);
  if (data.image) form.append("image", data.image);
  return form;
}

export const api = {
  events: {
    getAll: (): Promise<ShortEvent[]> =>
      _fetch("/api/events"),

    getById: (id: number): Promise<Event> =>
      _fetch(`/api/events/${id}`),

    getMyEvents: (): Promise<ShortEvent[]> =>
      _fetch("/api/organizer/events"),

    create: (data: EventInput): Promise<Event> =>
      _fetch("/api/events", {
        method: "POST",
        body: buildEventForm(data),
      }),

    update: (id: number, data: EventInput): Promise<Event> =>
      _fetch(`/api/events/${id}`, {
        method: "PUT",
        body: buildEventForm(data),
      }),

    delete: (id: number): Promise<void> =>
      _fetch(`/api/events/${id}`, { method: "DELETE" }),
  },
};
