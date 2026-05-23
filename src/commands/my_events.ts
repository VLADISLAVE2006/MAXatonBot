import { api } from "@/api";
import { AppContext, getToken } from "@/context";
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

export async function myEventsCommand(ctx: AppContext) {
    if (!ctx.user) return;
    const role = ctx.user.role;
    const token = getToken(ctx.user.user_id) ?? "";

    try {
        switch (role) {
            case "applicant": {
                const registrations = await api.events.getMyRegistrations(token);

                if (registrations.length === 0) {
                    return ctx.reply(
                        "Вы ещё не записаны ни на одно мероприятие.\n\nПосмотрите доступные мероприятия командой /events",
                    );
                }

                const list = registrations
                    .sort((a, b) => a.event_date - b.event_date)
                    .slice(0, 9);

                const lines = list
                    .map((r, i) => `${i + 1}. ${r.event_title} — ${formatDate(r.event_date)}`)
                    .join("\n");

                const numberButtons = list.map((r, i) =>
                    Keyboard.button.callback(`${i + 1}`, `my_event:${r.event_id}`),
                );

                return ctx.reply(`📋 Мои записи:\n\n${lines}`, {
                    attachments: [Keyboard.inlineKeyboard([numberButtons])],
                });
            }

            case "organizer":
            case "admin": {
                const events = await api.events.getOrganizerEvents(token);

                if (events.length === 0) {
                    return ctx.reply("У вас ещё нет созданных мероприятий.", {
                        attachments: [
                            Keyboard.inlineKeyboard([
                                [
                                    Keyboard.button.link(
                                        "Создать мероприятие",
                                        `${env.CATALOG_URL}/organizer?token=${token}`,
                                    ),
                                ],
                            ]),
                        ],
                    });
                }

                const list = events
                    .sort((a, b) => a.date - b.date)
                    .slice(0, 9);

                const lines = list
                    .map((e, i) => {
                        const seats = e.max_slots != null
                            ? ` (${e.max_slots - e.registered_count}/${e.max_slots} мест)`
                            : "";
                        return `${i + 1}. ${e.title} — ${formatDate(e.date)}${seats}`;
                    })
                    .join("\n");

                const numberButtons = list.map((e, i) =>
                    Keyboard.button.callback(`${i + 1}`, `event:${e.id}`),
                );

                return ctx.reply(`📋 Мои мероприятия:\n\n${lines}`, {
                    attachments: [
                        Keyboard.inlineKeyboard([
                            numberButtons,
                            [
                                Keyboard.button.link(
                                    "Управлять мероприятиями",
                                    `${env.CATALOG_URL}/organizer?token=${token}`,
                                ),
                            ],
                        ]),
                    ],
                });
            }

            default:
                return ctx.reply("У вас нет доступа к этой команде");
        }
    } catch (error) {
        console.error(error);
        return ctx.reply("Произошла ошибка при загрузке мероприятий");
    }
}

export async function handleMyEventsCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (!payload?.startsWith("my_event:")) return false;

    const eventId = parseInt(payload.replace("my_event:", ""), 10);
    if (isNaN(eventId)) return false;

    const token = getToken(ctx.user!.user_id) ?? "";
    try {
        const event = await api.events.getEventById(eventId, token);

        const text =
            `${event.title}\n\n` +
            `${event.description}\n\n` +
            `📅 ${formatDate(event.date)}\n` +
            `📍 ${event.content}\n` +
            `👥 Мест: ${event.max_slots ?? "∞"}\n` +
            `🌐 ${event.format === "online" ? "Онлайн" : "Оффлайн"}\n` +
            `🏷️ ${TYPE_LABELS[event.type] ?? event.type}`;

        await ctx.reply(text, {
            attachments: [
                Keyboard.inlineKeyboard([[Keyboard.button.callback("❌ Отменить запись", `cancel:${event.id}`)]]),
            ],
        });
        return true;
    } catch (error) {
        console.error(error);
        await ctx.reply("Не удалось загрузить информацию о мероприятии");
        return true;
    }
}

export async function handleCancelRegistrationCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (!payload?.startsWith("cancel:")) return false;

    const eventId = parseInt(payload.replace("cancel:", ""), 10);
    if (isNaN(eventId)) return false;

    const token = getToken(ctx.user!.user_id) ?? "";
    try {
        await api.events.cancelRegistration(eventId, token);
        await ctx.reply("✅ Запись на мероприятие отменена.");
        return true;
    } catch (error) {
        console.error(error);
        await ctx.reply("Не удалось отменить запись. Попробуйте позже.");
        return true;
    }
}
