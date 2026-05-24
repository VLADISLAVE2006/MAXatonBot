import { api } from "@/api";
import { type AppContext, getToken } from "@/context";
import { env } from "@/env";
import { buildEventDetailText, formatDate, formatSlots } from "@/utils/helpers";
import { Keyboard } from "@maxhub/max-bot-api";
import { backToHub, backToMyEvents } from "./menu";

type Registration = { id: number; event_id: number; event_title: string; event_date: number; code: string; registered_at: number };
type OrganizerEvent = { id: number; title: string; date: number; max_slots: number | null; registered_count: number };

export function prepareRegistrationsContent(registrations: Registration[]) {
    const list = registrations.sort((a, b) => a.event_date - b.event_date).slice(0, 9);
    const lines = list.map((r, i) => `${i + 1}. ${r.event_title} — ${formatDate(r.event_date)}`).join("\n");
    return { list, lines };
}

export function prepareOrganizerEventsContent(events: OrganizerEvent[]) {
    const list = events.sort((a, b) => a.date - b.date).slice(0, 9);
    const lines = list
        .map((e, i) => `${i + 1}. ${e.title} — ${formatDate(e.date)}${formatSlots(e.max_slots, e.registered_count)}`)
        .join("\n");
    return { list, lines };
}

export async function handleHubMyEventsCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (payload !== "menu:my_events" && !payload?.startsWith("hub_my_event:")) return false;

    const token = getToken(ctx.user!.user_id) ?? "";

    if (payload === "menu:my_events") {
        const role = ctx.user!.role;
        try {
            if (role === "applicant") {
                const registrations = await api.events.getMyRegistrations(token);

                if (registrations.length === 0) {
                    await ctx.editMessage({
                        text: "Вы ещё не записаны ни на одно мероприятие.",
                        attachments: [Keyboard.inlineKeyboard([[backToHub]])],
                    });
                    return true;
                }

                const { list, lines } = prepareRegistrationsContent(registrations);
                const numberButtons = list.map((r, i) =>
                    Keyboard.button.callback(`${i + 1}`, `hub_my_event:${r.event_id}`),
                );

                await ctx.editMessage({
                    text: `📋 Мои записи:\n\n${lines}`,
                    attachments: [Keyboard.inlineKeyboard([numberButtons, [backToHub]])],
                });
            } else {
                const events = await api.events.getOrganizerEvents(token);

                if (events.length === 0) {
                    await ctx.editMessage({
                        text: "У вас ещё нет созданных мероприятий.",
                        attachments: [
                            Keyboard.inlineKeyboard([
                                [Keyboard.button.link("Создать мероприятие", `${env.CATALOG_URL}/organizer?token=${token}`)],
                                [backToHub],
                            ]),
                        ],
                    });
                    return true;
                }

                const { list, lines } = prepareOrganizerEventsContent(events);
                const numberButtons = list.map((e, i) =>
                    Keyboard.button.callback(`${i + 1}`, `hub_my_event:${e.id}`),
                );

                await ctx.editMessage({
                    text: `📋 Мои мероприятия:\n\n${lines}`,
                    attachments: [
                        Keyboard.inlineKeyboard([
                            numberButtons,
                            [Keyboard.button.link("Управлять мероприятиями", `${env.CATALOG_URL}/organizer?token=${token}`)],
                            [backToHub],
                        ]),
                    ],
                });
            }
        } catch {
            await ctx.editMessage({
                text: "Произошла ошибка при загрузке мероприятий.",
                attachments: [Keyboard.inlineKeyboard([[backToHub]])],
            });
        }
        return true;
    }

    const eventId = parseInt(payload!.replace("hub_my_event:", ""), 10);
    if (isNaN(eventId)) return false;

    try {
        const event = await api.events.getEventById(eventId, token);
        await ctx.editMessage({
            text: buildEventDetailText(event),
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.callback("❌ Отменить запись", `cancel:${event.id}`)],
                    [backToMyEvents],
                ]),
            ],
        });
    } catch {
        await ctx.editMessage({
            text: "Не удалось загрузить информацию о мероприятии.",
            attachments: [Keyboard.inlineKeyboard([[backToMyEvents]])],
        });
    }
    return true;
}

export async function handleCancelRegistrationCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (!payload?.startsWith("cancel:")) return false;

    const eventId = parseInt(payload.replace("cancel:", ""), 10);
    if (isNaN(eventId)) return false;

    const token = getToken(ctx.user!.user_id) ?? "";
    try {
        await api.events.cancelRegistration(eventId, token);
        await ctx.editMessage({
            text: "✅ Запись на мероприятие отменена.",
            attachments: [Keyboard.inlineKeyboard([[backToMyEvents]])],
        });
        return true;
    } catch (error) {
        console.error(error);
        await ctx.editMessage({
            text: "Не удалось отменить запись. Попробуйте позже.",
            attachments: [Keyboard.inlineKeyboard([[backToMyEvents]])],
        });
        return true;
    }
}
