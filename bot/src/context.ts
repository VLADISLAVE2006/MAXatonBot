import { Context } from "@maxhub/max-bot-api";
import type { User } from "@maxhub/max-bot-api/types";
import type { Role } from "@/types/app";

export type FlowName = "registration" | "review" | "admin" | "csv_upload";

export type Step =
    | "registration/consent"
    | "registration/name"
    | "registration/organizer_request"
    | "review/comment"
    | "admin/create_organizer_id"
    | "admin/create_organizer_name"
    | "admin/upload_agreement_version"
    | "admin/upload_agreement_file"
    | "csv_upload/waiting_file";

export type AppUser = User & {
    role: Role | null | undefined;
};

export class AppContext extends Context {
    override get user(): AppUser | undefined {
        const user = super.user;
        if (!user) return undefined;

        const session = getSession(user.user_id);
        return { ...user, role: session.role };
    }
}

export interface Session {
    flow: FlowName | null;
    step: Step | null;
    data: Record<string, unknown>;
    role: Role | undefined | null;
    token: string | null;
    fullName?: string;
}

export const sessions = new Map<number, Session>();

export function getSession(userId: number): Session {
    return sessions.get(userId) ?? { flow: null, step: null, data: {}, role: undefined, token: null };
}

export function setSession(userId: number, s: Session) {
    sessions.set(userId, s);
}

export function setStep(userId: number, step: Step) {
    const s = getSession(userId);
    sessions.set(userId, { ...s, step });
}

export function setFlow(userId: number, flow: FlowName) {
    const s = getSession(userId);
    sessions.set(userId, { ...s, flow });
}

export function mergeData(userId: number, patch: Record<string, unknown>) {
    const s = getSession(userId);
    sessions.set(userId, { ...s, data: { ...s.data, ...patch } });
}

export function setRole(userId: number, role: Role) {
    const s = getSession(userId);
    sessions.set(userId, { ...s, role });
}

export function setToken(userId: number, token: string) {
    const s = getSession(userId);
    sessions.set(userId, { ...s, token });
}

export function getToken(userId: number): string | null {
    const s = getSession(userId);
    return s.token;
}

export function setFullName(userId: number, fullName: string) {
    const s = getSession(userId);
    sessions.set(userId, { ...s, fullName });
}

export function resetSession(userId: number) {
    const s = getSession(userId);
    sessions.set(userId, { flow: null, step: null, data: {}, role: s.role, token: s.token });
}
