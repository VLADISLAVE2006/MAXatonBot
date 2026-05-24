import QRCode from "qrcode";
import { api } from "@/api";
import { type AppContext, getToken } from "@/context";
import { env } from "@/env";
import { buildEventDetailText, formatDate, formatSlots } from "@/utils/helpers";
import { Keyboard } from "@maxhub/max-bot-api";
import { backToHub, backToMyEvents, toHubNew } from "./menu";

type Registration = {
    id: number;
    event_id: number;
    event_title: string;
    event_date: number;
    code: string;
    registered_at: number;
};
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
                                [
                                    Keyboard.button.link(
                                        "Создать мероприятие",
                                        `${env.CATALOG_URL}/organizer?token=${token}`,
                                    ),
                                ],
                                [backToHub],
                            ]),
                        ],
                    });
                    return true;
                }

                const { list, lines } = prepareOrganizerEventsContent(events);
                const numberButtons = list.map((e, i) => Keyboard.button.callback(`${i + 1}`, `hub_my_event:${e.id}`));

                await ctx.editMessage({
                    text: `📋 Мои мероприятия:\n\n${lines}`,
                    attachments: [
                        Keyboard.inlineKeyboard([
                            numberButtons,
                            [
                                Keyboard.button.link(
                                    "Управлять мероприятиями",
                                    `${env.CATALOG_URL}/organizer?token=${token}`,
                                ),
                            ],
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
        const role = ctx.user!.role;
        const isPast = event.date * 1000 < Date.now() + 3 * 60 * 60 * 1000;
        const buttons =
            role === "applicant"
                ? [
                      ...(isPast && event.closed
                          ? [[Keyboard.button.callback("✍️ Оставить отзыв", `review:${event.id}`)]]
                          : []),
                      ...(!isPast ? [[Keyboard.button.callback("❌ Отменить запись", `cancel:${event.id}`)]] : []),
                      [backToMyEvents],
                  ]
                : [
                      ...(isPast ? [[Keyboard.button.callback("📊 Статистика", `event_stats:${event.id}`)]] : []),
                      ...(isPast && !event.closed
                          ? [[Keyboard.button.callback("🔒 Закрыть мероприятие", `close_event:${event.id}`)]]
                          : []),
                      [Keyboard.button.callback("📲 QR-код посещаемости", `event_qr:${event.id}`)],
                      [backToMyEvents],
                  ];
        await ctx.editMessage({
            text: buildEventDetailText(event),
            attachments: [Keyboard.inlineKeyboard(buttons)],
        });
    } catch {
        await ctx.editMessage({
            text: "Не удалось загрузить информацию о мероприятии.",
            attachments: [Keyboard.inlineKeyboard([[backToMyEvents]])],
        });
    }
    return true;
}

export async function handleCloseEventCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (!payload?.startsWith("close_event:")) return false;

    const eventId = parseInt(payload.replace("close_event:", ""), 10);
    if (isNaN(eventId)) return false;

    const token = getToken(ctx.user!.user_id) ?? "";
    try {
        await api.events.closeEvent(eventId, token);
        await ctx.editMessage({
            text: "🔒 Мероприятие закрыто. Участники теперь могут оставлять отзывы.",
            attachments: [Keyboard.inlineKeyboard([[backToMyEvents]])],
        });
    } catch {
        await ctx.editMessage({
            text: "Не удалось закрыть мероприятие.",
            attachments: [Keyboard.inlineKeyboard([[backToMyEvents]])],
        });
    }
    return true;
}

export async function handleQrCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (!payload?.startsWith("event_qr:")) return false;

    const eventId = parseInt(payload.replace("event_qr:", ""), 10);
    if (isNaN(eventId)) return false;

    try {
        const deeplink = `${env.BOT_LINK}?start=attend_${eventId}`;
        const qrBuffer = await QRCode.toBuffer(deeplink);
        const imageAttachment = await ctx.api.uploadImage({ source: qrBuffer });
        await ctx.reply("📲 QR-код для отметки посещаемости:", {
            attachments: [imageAttachment.toJson(), Keyboard.inlineKeyboard([[toHubNew]])],
        });
    } catch {
        await ctx.reply("Не удалось сгенерировать QR-код.");
    }
    return true;
}

export async function handleEventStatsCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (!payload?.startsWith("event_stats:")) return false;

    const eventId = parseInt(payload.replace("event_stats:", ""), 10);
    if (isNaN(eventId)) return false;

    const token = getToken(ctx.user!.user_id) ?? "";
    try {
        const stats = await api.events.getEventStats(eventId, token);
        const ratingLine =
            stats.reviews_count > 0
                ? `⭐ Рейтинг: ${stats.average_rating.toFixed(1)} (${stats.reviews_count} отзывов)\n`
                : "";
        await ctx.editMessage({
            text:
                `📊 Статистика мероприятия\n\n` +
                `👥 Записалось: ${stats.total_registered}\n` +
                `✅ Пришло: ${stats.total_attended}\n` +
                `📈 Явка: ${stats.percentage.toFixed(1)}%\n` +
                ratingLine,
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.callback("👥 Список участников", `event_attendees:${eventId}:0`)],
                    [backToMyEvents],
                ]),
            ],
        });
    } catch (error) {
        console.error(error);
        await ctx.editMessage({
            text: "Не удалось загрузить статистику.",
            attachments: [Keyboard.inlineKeyboard([[backToMyEvents]])],
        });
    }
    return true;
}

const PAGE_SIZE = 10;

export async function handleAttendeesCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (!payload?.startsWith("event_attendees:")) return false;

    const parts = payload.replace("event_attendees:", "").split(":");
    const eventId = parseInt(parts[0] ?? "", 10);
    const page = parseInt(parts[1] ?? "0", 10);
    if (isNaN(eventId) || isNaN(page)) return false;

    const token = getToken(ctx.user!.user_id) ?? "";
    try {
        const attendees = await api.events.getEventAttendees(eventId, token);
        const total = attendees.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const slice = attendees.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

        const lines = slice
            .map((a, i) => `${page * PAGE_SIZE + i + 1}. ${a.full_name} ${a.attended ? "✅" : "❌"}`)
            .join("\n");

        const navRow: ReturnType<typeof Keyboard.button.callback>[] = [];
        if (page > 0) navRow.push(Keyboard.button.callback("🔙 Назад", `event_attendees:${eventId}:${page - 1}`));
        if (page < totalPages - 1)
            navRow.push(Keyboard.button.callback("Вперёд ⏩", `event_attendees:${eventId}:${page + 1}`));

        const rows = [
            ...(navRow.length ? [navRow] : []),
            [Keyboard.button.callback("📊 К статистике", `event_stats:${eventId}`)],
        ];

        await ctx.editMessage({
            text: `👥 Участники (${total}):\n\n${lines}`,
            attachments: [Keyboard.inlineKeyboard(rows)],
        });
    } catch {
        await ctx.editMessage({
            text: "Не удалось загрузить список участников.",
            attachments: [
                Keyboard.inlineKeyboard([[Keyboard.button.callback("📊 К статистике", `event_stats:${eventId}`)]]),
            ],
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
