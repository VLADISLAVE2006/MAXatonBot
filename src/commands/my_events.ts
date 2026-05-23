import { api } from "@/api";
import { AppContext, getToken } from "@/context";
import { env } from "@/env";
import { Keyboard } from "@maxhub/max-bot-api";

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
                // TODO добавить вызов апи
                const events: { id: number; title: string; date: number }[] = [];

                if (events.length === 0) {
                    return ctx.reply(
                        "Вы ещё не записаны ни на одно мероприятие.\n\nПосмотрите доступные мероприятия командой /events",
                    );
                }

                const lines = events
                    .sort((a, b) => a.date - b.date)
                    .slice(0, 7)
                    .map((e, i) => `${i + 1}. — ${formatDate(e.date)}`)
                    .join("\n");

                return ctx.reply(`📋 Мои записи:\n\n${lines}`);
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

                const lines = events
                    .sort((a, b) => a.date - b.date)
                    .slice(0, 7)
                    .map((e, i) => `${i + 1}. ${e.title} — ${formatDate(e.date)}`)
                    .join("\n");

                return ctx.reply(`📋 Мои мероприятия:\n\n${lines}`, {
                    attachments: [
                        Keyboard.inlineKeyboard([
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
