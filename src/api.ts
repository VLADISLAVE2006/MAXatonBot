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
            _fetch<{ id: number; title: string; description: string; date: number; max_slots: number | null; registered_count: number }[]>("/api/events", {
                method: "GET",
                token,
            }),
        getOrganizerEvents: (token: string) =>
            _fetch<{ id: number; title: string; description: string; date: number; max_slots: number | null; registered_count: number }[]>("/api/organizer/events", {
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
            _fetch<{ id: number; event_id: number; event_title: string; event_date: number; code: string; registered_at: number }[]>(
                "/api/user/registrations",
                { method: "GET", token },
            ),
        createEvent: (
            data: {
                title: string;
                description: string;
                content: string;
                max_slots: number | null;
                cancellation_rules: string | null;
                date: number;
                format: string;
                type: string;
            },
            token: string,
        ) =>
            _fetch("/api/events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
                token,
            }),
    },
};
