import { api } from "@/api";
import { type AppContext, getToken } from "@/context";
import { env } from "@/env";
import { buildEventDetailText, formatDate, formatSlots } from "@/utils/helpers";
import { Keyboard } from "@maxhub/max-bot-api";
import { backToEvents, backToHub } from "./menu";

type ShortEvent = { id: number; title: string; date: number; max_slots: number | null; registered_count: number };

export function prepareEventsListContent(events: ShortEvent[]) {
    const upcoming = events
        .filter((e) => e.date * 1000 >= Date.now())
        .sort((a, b) => a.date - b.date)
        .slice(0, 9);
    const list = upcoming.length > 0 ? upcoming : events.slice(0, 9);
    const lines = list
        .map((e, i) => `${i + 1}. ${e.title} — ${formatDate(e.date)}${formatSlots(e.max_slots, e.registered_count)}`)
        .join("\n");
    return { list, lines };
}

export async function handleHubEventsCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (payload !== "menu:events" && !payload?.startsWith("hub_event:")) return false;

    const token = getToken(ctx.user!.user_id) ?? "";

    if (payload === "menu:events") {
        try {
            const events = await api.events.getEvents(token);

            if (events.length === 0) {
                await ctx.editMessage({
                    text: "Ближайших мероприятий пока нет. Следите за обновлениями!",
                    attachments: [Keyboard.inlineKeyboard([[backToHub]])],
                });
                return true;
            }

            const { list, lines } = prepareEventsListContent(events);
            const numberButtons = list.map((e, i) => Keyboard.button.callback(`${i + 1}`, `hub_event:${e.id}`));

            await ctx.editMessage({
                text: `📅 Ближайшие мероприятия:\n\n${lines}`,
                attachments: [
                    Keyboard.inlineKeyboard([
                        numberButtons,
                        [Keyboard.button.link("Все мероприятия", `${env.CATALOG_URL}?token=${token}`)],
                        [backToHub],
                    ]),
                ],
            });
        } catch {
            await ctx.editMessage({
                text: "Произошла ошибка при загрузке мероприятий.",
                attachments: [Keyboard.inlineKeyboard([[backToHub]])],
            });
        }
        return true;
    }

    const eventId = parseInt(payload!.replace("hub_event:", ""), 10);
    if (isNaN(eventId)) return false;

    try {
        const event = await api.events.getEventById(eventId, token);
        const actionButton = event.is_registered
            ? Keyboard.button.callback("❌ Отменить запись", `cancel:${event.id}`)
            : Keyboard.button.callback("Записаться", `register:${event.id}`);
        await ctx.editMessage({
            text: buildEventDetailText(event),
            attachments: [Keyboard.inlineKeyboard([[actionButton], [backToEvents]])],
        });
    } catch {
        await ctx.editMessage({
            text: "Не удалось загрузить информацию о мероприятии.",
            attachments: [Keyboard.inlineKeyboard([[backToEvents]])],
        });
    }
    return true;
}

export async function handleRegisterCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (!payload?.startsWith("register:")) return false;

    const eventId = parseInt(payload.replace("register:", ""), 10);
    if (isNaN(eventId)) return false;

    const token = getToken(ctx.user!.user_id) ?? "";
    try {
        const result = await api.events.registerEvent(eventId, token);
        await ctx.editMessage({
            text: `✅ Вы успешно записались!\n\n📌 ${result.event_title}\n📅 ${formatDate(result.event_date)}\n\n🎫 Код записи: ${result.code}`,
            attachments: [Keyboard.inlineKeyboard([[backToHub]])],
        });
    } catch {
        await ctx.editMessage({
            text: "Не удалось записаться. Возможно, вы уже записаны или нет свободных мест.",
            attachments: [Keyboard.inlineKeyboard([[backToEvents]])],
        });
    }
    return true;
}
