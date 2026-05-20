import { Context } from "@maxhub/max-bot-api";
import type { User } from "@maxhub/max-bot-api/types";
import type { Role } from "@/types/app";

export type FlowName = "registration";

export type Step = "registration/consent" | "registration/name" | "registration/organizer_request";

export type AppUser = User & {
    role: Role;
};

export class AppContext extends Context {
    override get user(): AppUser | undefined {
        const user = super.user;
        if (!user) return undefined;

        const session = getSession(user.user_id);
        return { ...user, role: session.role ?? "applicant" };
    }
}

export interface Session {
    flow: FlowName | null;
    step: Step | null;
    data: Record<string, unknown>;
    role: Role | undefined | null;
}

export const sessions = new Map<number, Session>();

export function getSession(userId: number): Session {
    return sessions.get(userId) ?? { flow: null, step: null, data: {}, role: undefined };
}

export function setSession(userId: number, s: Session) {
    sessions.set(userId, s);
}

export function setStep(userId: number, step: Step) {
    const s = getSession(userId);
    sessions.set(userId, { flow: s.flow, step, data: s.data, role: s.role });
}

export function mergeData(userId: number, patch: Record<string, unknown>) {
    const s = getSession(userId);
    sessions.set(userId, {
        flow: s.flow,
        step: s.step,
        data: { ...s.data, ...patch },
        role: s.role,
    });
}

export function setRole(userId: number, role: Role) {
    const s = getSession(userId);
    sessions.set(userId, { flow: s.flow, step: s.step, data: s.data, role });
}

export function resetSession(userId: number) {
    const s = getSession(userId);
    sessions.set(userId, { flow: null, step: null, data: {}, role: s.role });
}
