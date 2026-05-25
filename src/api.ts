import { $fetch } from "ofetch";
import type { Role } from "@/types/app";
import { env } from "@/env";

const _fetch = <T>(path: string, options?: RequestInit & { token?: string }) => {
    const headers = new Headers(options?.headers);

    if (process.env.API_KEY) {
        headers.set("X-API-Key", env.API_KEY);
    }

    if (options?.token) {
        headers.set("Authorization", `Bearer ${options.token}`);
    }

    return $fetch<T>(`${env.API_URL}${path}`, {
        ...options,
        headers,
    });
};

export const api = {
    user: {
        consent: (userId: number, agreed: boolean, agreementVersion: string) =>
            _fetch("/api/user/consent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: userId,
                    agreed,
                    agreement_version: agreementVersion,
                }),
            }),
        profile: (fullName: string, token: string) =>
            _fetch("/api/user/profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    full_name: fullName,
                }),
                token,
            }),
        me: (userId: number) =>
            _fetch<{
                role: Role;
                full_name: string;
                token: string;
            }>(`/api/user/me?user_id=${userId}`, {
                method: "GET",
            }),
    },
    notifications: {
        get: (token: string) =>
            _fetch<{ enabled: boolean }>("/api/user/notifications", {
                method: "GET",
                token,
            }),
        update: (enabled: boolean, token: string) =>
            _fetch("/api/user/notifications", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled }),
                token,
            }),
    },
    reminders: {
        getPending: () =>
            _fetch<{ registration_id: number; user_id: number; event_id: number; event_title: string; event_date: number }[]>(
                "/api/reminders/pending",
                { method: "GET" },
            ),
        markSent: (registrationIds: number[]) =>
            _fetch("/api/reminders/mark-sent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ registration_ids: registrationIds }),
            }),
    },
    admin: {
        createOrganizer: (userId: number, fullName: string, token: string) =>
            _fetch("/api/admin/organizers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, full_name: fullName }),
                token,
            }),
    },
    events: {
        getEvents: (token: string) =>
            _fetch<{ id: number; title: string; description: string; date: number; format: string; type: string; max_slots: number | null; registered_count: number; image_url: string }[]>("/api/events", {
                method: "GET",
                token,
            }),
        getOrganizerEvents: (token: string) =>
            _fetch<{ id: number; title: string; description: string; date: number; format: string; type: string; max_slots: number | null; registered_count: number; image_url: string }[]>("/api/organizer/events", {
                method: "GET",
                token,
            }),
        getEventById: (id: number, token: string) =>
            _fetch<{
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
            }>(`/api/events/${id}`, {
                method: "GET",
                token,
            }),
        registerEvent: (id: number, token: string) =>
            _fetch<{
                status: string;
                code: string;
                event_id: number;
                event_title: string;
                event_date: number;
                registered_at: number;
            }>(`/api/events/${id}/register`, {
                method: "POST",
                token,
            }),
        cancelRegistration: (id: number, token: string) =>
            _fetch(`/api/events/${id}/register`, {
                method: "DELETE",
                token,
            }),
        getMyRegistrations: (token: string) =>
            _fetch<{ id: number; event_id: number; event_title: string; event_date: number; code: string; registered_at: number; attended: boolean }[]>(
                "/api/user/registrations",
                { method: "GET", token },
            ),
        deleteEvent: (id: number, token: string) =>
            _fetch(`/api/events/${id}`, {
                method: "DELETE",
                token,
            }),
        markAttendance: (id: number, code: string, token: string) =>
            _fetch<{ status: string }>(`/api/events/${id}/attendance`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code }),
                token,
            }),
        getEventStats: (id: number, token: string) =>
            _fetch<{ total_registered: number; total_attended: number; percentage: number; reviews_count: number; average_rating: number }>(
                `/api/events/${id}/stats`,
                { method: "GET", token },
            ),
        getEventAttendees: (id: number, token: string) =>
            _fetch<{ user_id: number; full_name: string; registered_at: number; attended: boolean }[]>(
                `/api/events/${id}/attendees`,
                { method: "GET", token },
            ),
        closeEvent: (id: number, token: string) =>
            _fetch<{ status: string }>(`/api/events/${id}/close`, {
                method: "POST",
                token,
            }),
        addReview: (id: number, rating: number, comment: string | undefined, token: string) =>
            _fetch<{ status: string }>(`/api/events/${id}/review`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rating, ...(comment ? { comment } : {}) }),
                token,
            }),
    },
};
