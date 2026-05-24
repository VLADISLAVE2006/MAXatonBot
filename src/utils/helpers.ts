export function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
    });
}

export function formatSlots(maxSlots: number | null, registeredCount: number): string {
    if (maxSlots == null) return "";
    const free = maxSlots - registeredCount;
    if (free <= 0) return " · ❌ мест нет";
    if (free <= 5) return ` · ⚠️ осталось: ${free} из ${maxSlots}`;
    return ` · свободно: ${free} из ${maxSlots}`;
}

export const TYPE_LABELS: Record<string, string> = {
    hackathon: "Хакатон",
    olympiad: "Олимпиада",
    conference: "Конференция",
    openday: "День открытых дверей",
};

export function buildEventDetailText(event: {
    title: string;
    description: string;
    date: number;
    content: string;
    max_slots: number | null;
    registered_count: number;
    format: string;
    type: string;
}): string {
    const slots =
        event.max_slots == null
            ? "∞"
            : event.max_slots - event.registered_count <= 0
              ? "нет мест"
              : `свободно ${event.max_slots - event.registered_count} из ${event.max_slots}`;
    return (
        `${event.title}\n\n` +
        `${event.description}\n\n` +
        `📅 ${formatDate(event.date)}\n` +
        `📍 ${event.content}\n` +
        `👥 Мест: ${slots}\n` +
        `🌐 ${event.format === "online" ? "Онлайн" : "Оффлайн"}\n` +
        `🏷️ ${TYPE_LABELS[event.type] ?? event.type}`
    );
}
