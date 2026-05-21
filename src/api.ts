import { $fetch } from "ofetch";
import type { Role } from "@/types/app";
import { env } from "@/env";

const _fetch = <T>(path: string, options?: RequestInit) => {
    const headers = new Headers(options?.headers);

    if (process.env.API_KEY) {
        headers.set("X-API-Key", env.API_KEY);
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
        profile: (userId: number, fullName: string) =>
            _fetch("/api/user/profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: userId,
                    full_name: fullName,
                }),
            }),
        role: (userId: number) =>
            _fetch<{
                role: Role;
                requested_organizer: boolean;
            }>(`/api/user/role?user_id=${userId}`, {
                method: "GET",
            }),
        requestOrganizer: (userId: number) =>
            _fetch("/api/user/request-organizer", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId }),
            }),
    },
    admin: {
        setRole: (adminUserId: number, targetUserId: number, role: string) =>
            _fetch("/api/admin/set-role", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    admin_user_id: adminUserId,
                    target_user_id: targetUserId,
                    role,
                }),
            }),
    },
};
