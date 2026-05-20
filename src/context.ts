export type FlowName = "registration";

export type Step = "registration/consent" | "registration/name";

export interface Session {
    flow: FlowName | null;
    step: Step | null;
    data: Record<string, unknown>;
}

export const sessions = new Map<number, Session>();

export function getSession(userId: number): Session {
    return sessions.get(userId) ?? { flow: null, step: null, data: {} };
}

export function setSession(userId: number, s: Session) {
    sessions.set(userId, s);
}

export function setStep(userId: number, step: Step) {
    const s = getSession(userId);
    sessions.set(userId, { ...s, step });
}

export function mergeData(userId: number, patch: Record<string, unknown>) {
    const s = getSession(userId);
    sessions.set(userId, { ...s, data: { ...s.data, ...patch } });
}

export function resetSession(userId: number) {
    sessions.set(userId, { flow: null, step: null, data: {} });
}
