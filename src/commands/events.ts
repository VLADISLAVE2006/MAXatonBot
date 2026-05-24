import { api } from "@/api";
import { type AppContext, getToken } from "@/context";
import { env } from "@/env";
import { Keyboard } from "@maxhub/max-bot-api";

const TYPE_LABELS: Record<string, string> = {
    hackathon: "Хакатон",
    olympiad: "Олимпиада",
    conference: "Конференция",
    openday: "День открытых дверей",
};

function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function formatSlots(maxSlots: number | null, registeredCount: number): string {
    if (maxSlots == null) return "";
    const free = maxSlots - registeredCount;
    if (free <= 0) return " · ❌ мест нет";
    if (free <= 5) return ` · ⚠️ осталось: ${free} из ${maxSlots}`;
    return ` · свободно: ${free} из ${maxSlots}`;
}

export async function eventsCommand(ctx: AppContext) {
    if (!ctx.user) return;
    const token = getToken(ctx.user.user_id) ?? "";
    try {
        const events = await api.events.getEvents(token);

        if (events.length === 0) {
            await ctx.reply("Ближайших мероприятий пока нет. Следите за обновлениями!");
            return;
        }

        const upcoming = events
            .filter((e) => e.date * 1000 >= Date.now())
            .sort((a, b) => a.date - b.date)
            .slice(0, 9);

        const list = upcoming.length > 0 ? upcoming : events.slice(0, 9);

        const lines = list.map((e, i) =>
            `${i + 1}. ${e.title} — ${formatDate(e.date)}${formatSlots(e.max_slots, e.registered_count)}`
        ).join("\n");

        const numberButtons = list.map((e, i) => Keyboard.button.callback(`${i + 1}`, `event:${e.id}`));

        await ctx.reply(`📅 Ближайшие мероприятия:\n\n${lines}`, {
            attachments: [
                Keyboard.inlineKeyboard([
                    numberButtons,
                    [Keyboard.button.link("Все мероприятия", `${env.CATALOG_URL}?token=${token}`)],
                ]),
            ],
        });
    } catch (error) {
        console.error(error);
        await ctx.reply("Произошла ошибка при загрузке мероприятий");
    }
}

export async function handleEventsCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (!payload?.startsWith("event:")) return false;

    const eventId = parseInt(payload.replace("event:", ""), 10);
    if (isNaN(eventId)) return false;

    const token = getToken(ctx.user!.user_id) ?? "";
    try {
        const event = await api.events.getEventById(eventId, token);

        const text =
            `${event.title}\n\n` +
            `${event.description}\n\n` +
            `📅 ${formatDate(event.date)}\n` +
            `📍 ${event.content}\n` +
            `👥 Мест: ${event.max_slots == null ? "∞" : event.max_slots - event.registered_count <= 0 ? "нет мест" : `свободно ${event.max_slots - event.registered_count} из ${event.max_slots}`}\n` +
            `🌐 ${event.format === "online" ? "Онлайн" : "Оффлайн"}\n` +
            `🏷️ ${TYPE_LABELS[event.type] ?? event.type}`;

        await ctx.reply(text, {
            attachments: [Keyboard.inlineKeyboard([[Keyboard.button.callback("Записаться", `register:${event.id}`)]])],
        });
        return true;
    } catch (error) {
        console.error(error);
        await ctx.reply("Не удалось загрузить информацию о мероприятии");
        return true;
    }
}
