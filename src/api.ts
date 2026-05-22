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
                requested_organizer: boolean;
                full_name: string;
                token: string;
            }>(`/api/user/me?user_id=${userId}`, {
                method: "GET",
            }),
        requestOrganizer: (file: Buffer, token: string) => {
            const fd = new FormData();
            const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
            fd.append("file", new Blob([arrayBuffer], { type: "application/pdf" }), "document.pdf");
            return _fetch("/api/user/request-organizer", {
                method: "POST",
                body: fd,
                token,
            });
        },
    },
    admin: {
        setRole: (targetUserId: number, role: string, token: string) =>
            _fetch("/api/admin/set-role", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    target_user_id: targetUserId,
                    role,
                }),
            }),
        getOrganizerRequests: (token: string) =>
            _fetch<{ id: number; full_name: string; created_at: string }[]>("/api/admin/organizer-requests", {
                method: "GET",
                token,
            }),
        getOrganizerRequestById: (id: number, token: string) =>
            _fetch<{
                id: number;
                full_name: string;
                created_at: string;
                file_url: string;
                status: "pending" | "approved" | "rejected";
            }>(`/api/admin/organizer-requests/${id}`, {
                method: "GET",
                token,
            }),
    },
    events: {
        getEvents: (token: string) =>
            _fetch<{ id: number; title: string; description: string; date: number }[]>("/api/events", {
                method: "GET",
                token,
            }),
        getEventById: (id: number, token: string) =>
            _fetch<{
                id: number;
                title: string;
                description: string;
                content: string;
                max_slots: number;
                cancellation_rules: string;
                date: number;
                format: string;
                type: string;
                created_at: number;
                updated_at: number;
            }>(`/api/events/${id}`, {
                method: "GET",
                token,
            }),
        createEvent: (
            data: {
                title: string;
                description: string;
                content: string;
                max_slots: number;
                cancellation_rules: string;
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
