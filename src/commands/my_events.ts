import QRCode from "qrcode";
import { stringify } from "csv-stringify/sync";
import { api } from "@/api";
import { type AppContext, getToken } from "@/context";
import { env } from "@/env";
import { buildEventDetailText, formatDate, formatSlots } from "@/utils/helpers";
import { FileAttachment, Keyboard } from "@maxhub/max-bot-api";
import { backToHub, backToMyEvents, toHubNew } from "./menu";
import type { Role } from "@/types/app";

type Registration = {
    id: number;
    event_id: number;
    event_title: string;
    event_date: number;
    code: string;
    registered_at: number;
};
type OrganizerEvent = { id: number; title: string; date: number; max_slots: number | null; registered_count: number };
type ArchivedRegistration = { event_id: number; title: string; date: number; attended: boolean };

const nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

function getBackButtonForEventDetail(role: Role | undefined | null, source: "regular" | "archived" = "regular") {
    if (role === "organizer") {
        if (source === "archived") {
            return Keyboard.button.callback("🔙 Прошедшие мероприятия", "menu:my_archived");
        }
        return Keyboard.button.callback("🔙 Мои мероприятия", "menu:my_events");
    }
    if (source === "archived") {
        return Keyboard.button.callback("🔙 Прошедшие записи", "menu:my_archived");
    }
    return Keyboard.button.callback("🔙 Мои записи", "menu:my_events");
}

export function prepareRegistrationsContent(registrations: Registration[]) {
    const list = registrations.slice(0, 4);
    const lines = list.map((r, i) => `${nums[i]} ${r.event_title}\n📆 ${formatDate(r.event_date)}`).join("\n\n");
    return { list, lines };
}

export function prepareArchivedRegistrationsContent(registrations: ArchivedRegistration[]) {
    const list = registrations.slice(0, 4);
    const lines = list
        .map((r, i) => `${nums[i]} ${r.title}\n📆 ${formatDate(r.date)}\n${r.attended ? "✅ Посетил" : "❌ Не посетил"}`)
        .join("\n\n");
    return { list, lines };
}

export function prepareOrganizerEventsContent(events: OrganizerEvent[]) {
    const list = events.slice(0, 4);
    const lines = list
        .map(
            (e, i) =>
                `${nums[i]} ${e.title}\n📆 ${formatDate(e.date)}\n${formatSlots(e.max_slots, e.registered_count)}`,
        )
        .join("\n\n");
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

                const archiveButton = Keyboard.button.callback("🗄️ Прошедшие записи", "menu:my_archived");

                if (registrations.length === 0) {
                    await ctx.editMessage({
                        text: "Вы ещё не записаны ни на одно мероприятие.",
                        attachments: [Keyboard.inlineKeyboard([[archiveButton], [backToHub]])],
                    });
                    return true;
                }

                const { list, lines } = prepareRegistrationsContent(registrations);
                const registrationButtons = list.map((r, i) => [
                    Keyboard.button.callback(`${i + 1}. ${r.event_title}`, `hub_my_event:${r.event_id}`),
                ]);

                await ctx.editMessage({
                    text: `📋 Мои записи:\n\n${lines}`,
                    attachments: [Keyboard.inlineKeyboard([...registrationButtons, [archiveButton], [backToHub]])],
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
                                [Keyboard.button.callback("📤 Загрузить из CSV", "csv_upload:start")],
                                [backToHub],
                            ]),
                        ],
                    });
                    return true;
                }

                const { list, lines } = prepareOrganizerEventsContent(events);
                const eventButtons = list.map((e, i) => [
                    Keyboard.button.callback(`${i + 1}. ${e.title}`, `hub_my_event:${e.id}`),
                ]);

                await ctx.editMessage({
                    text: `📋 Мои мероприятия:\n\n${lines}`,
                    attachments: [
                        Keyboard.inlineKeyboard([
                            ...eventButtons,
                            [
                                Keyboard.button.link(
                                    "Управлять мероприятиями",
                                    `${env.CATALOG_URL}/organizer?token=${token}`,
                                ),
                            ],
                            [Keyboard.button.callback("📤 Загрузить из CSV", "csv_upload:start")],
                            [Keyboard.button.callback("🗄️ Прошедшие мероприятия", "menu:my_archived")],
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
        const isPast = event.date * 1000 < Date.now();

        const parts = payload!.split(":");
        const source = parts.length > 2 && parts[2] === "archived" ? "archived" : "regular";

        const backButton = getBackButtonForEventDetail(role, source as "regular" | "archived");

        const onlineLinkRow =
            event.format === "online" && event.content.startsWith("http")
                ? [[Keyboard.button.link("🔗 Перейти к мероприятию", event.content)]]
                : [];

        const buttons =
            role === "applicant"
                ? [
                      ...onlineLinkRow,
                      ...(isPast && event.closed
                          ? [[Keyboard.button.callback("✍️ Оставить отзыв", `review:${event.id}`)]]
                          : []),
                      ...(!isPast && event.is_registered ? [[Keyboard.button.callback("❌ Отменить запись", `cancel:${event.id}`)]] : []),
                      [backButton],
                  ]
                : [
                      ...onlineLinkRow,
                      ...(isPast ? [[Keyboard.button.callback("📊 Статистика", `event_stats:${event.id}`)]] : []),
                      ...(isPast && !event.closed
                          ? [[Keyboard.button.callback("🔒 Завершить мероприятие", `close_event:${event.id}`)]]
                          : []),
                      ...(!event.closed
                          ? [[Keyboard.button.callback("📲 QR-код посещаемости", `event_qr:${event.id}`)]]
                          : []),
                      [backButton],
                  ];
        await ctx.editMessage({
            text: buildEventDetailText(event),
            attachments: [Keyboard.inlineKeyboard(buttons)],
        });
    } catch {
        await ctx.editMessage({
            text: "Не удалось загрузить информацию о мероприятии.",
            attachments: [Keyboard.inlineKeyboard([[getBackButtonForEventDetail(ctx.user!.role)]])],
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
            text: "🔒 Мероприятие завершено. Участники теперь могут оставлять отзывы.",
            attachments: [Keyboard.inlineKeyboard([[]])],
        });
        await sendEventStats(ctx, eventId, false);
    } catch {
        await ctx.editMessage({
            text: "Не удалось завершить мероприятие.",
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

async function sendEventStats(ctx: AppContext, eventId: number, edit: boolean) {
    const token = getToken(ctx.user!.user_id) ?? "";
    try {
        const stats = await api.events.getEventStats(eventId, token);
        const ratingLine =
            stats.reviews_count > 0
                ? `⭐ Рейтинг: ${stats.average_rating.toFixed(1)} (${stats.reviews_count} отзывов)\n`
                : "⭐ Нет отзывов\n";
        const text =
            `📊 Статистика мероприятия\n\n` +
            `👥 Записалось: ${stats.total_registered}\n` +
            `✅ Пришло: ${stats.total_attended}\n` +
            `📈 Явка: ${stats.percentage.toFixed(1)}%\n` +
            ratingLine;
        const attachments = [
            Keyboard.inlineKeyboard([
                [Keyboard.button.callback("👥 Список участников", `event_attendees:${eventId}:0`)],
                [Keyboard.button.callback("🔙 Назад", `hub_my_event:${eventId}`)],
            ]),
        ];
        if (edit) {
            await ctx.editMessage({
                text: text,
                attachments: attachments,
            });
        } else {
            await ctx.reply(text, { attachments: attachments });
        }
    } catch {
        await ctx.editMessage({
            text: "Не удалось загрузить статистику.",
            attachments: [Keyboard.inlineKeyboard([[backToMyEvents]])],
        });
    }
}

export async function handleEventStatsCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (!payload?.startsWith("event_stats:")) return false;

    const eventId = parseInt(payload.replace("event_stats:", ""), 10);
    if (isNaN(eventId)) return false;

    await sendEventStats(ctx, eventId, true);
    return true;
}

const PAGE_SIZE = 10;

export async function handleAttendeesCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (!payload?.startsWith("event_attendees:")) return false;

    const parts = payload.replace("event_attendees:", "").split(":");
    const eventId = parseInt(parts[0] ?? "", 10);
    const page = parseInt(parts[1] ?? "0", 10);
    const newMessage = (parts.length == 3 && parts[2] == "new") ?? false;
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
            [Keyboard.button.callback("📥 Выгрузить CSV", `event_attendees_csv:${eventId}`)],
            [Keyboard.button.callback("🔙 К статистике", `event_stats:${eventId}`)],
        ];

        const text = `👥 Участники (${total}):\n\n${lines}`;
        const attachments = [Keyboard.inlineKeyboard(rows)];
        if (newMessage) {
            await ctx.reply(text, {
                attachments,
            });
        } else {
            await ctx.editMessage({
                text: `👥 Участники (${total}):\n\n${lines}`,
                attachments,
            });
        }
    } catch {
        await ctx.editMessage({
            text: "Не удалось загрузить список участников.",
            attachments: [
                Keyboard.inlineKeyboard([[Keyboard.button.callback("🔙 К статистике", `event_stats:${eventId}`)]]),
            ],
        });
    }
    return true;
}

export async function handleAttendeesExportCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (!payload?.startsWith("event_attendees_csv:")) return false;

    const eventId = parseInt(payload.replace("event_attendees_csv:", ""), 10);
    if (isNaN(eventId)) return false;

    const token = getToken(ctx.user!.user_id) ?? "";
    try {
        const attendees = await api.events.getEventAttendees(eventId, token);
        const csv = stringify(
            [
                ["Имя", "Зарегистрирован", "Посетил"],
                ...attendees.map((a) => [
                    a.full_name,
                    new Date(a.registered_at * 1000).toLocaleString("ru-RU"),
                    a.attended ? "Да" : "Нет",
                ]),
            ],
            { bom: true },
        );

        await ctx.api.sendAction(ctx.chatId!, "sending_file");
        const csvBuffer = Buffer.from(csv, "utf-8");
        const { url: uploadUrl } = await ctx.api.raw.uploads.getUploadUrl({ type: "file" });
        const formData = new FormData();
        formData.append("data", new Blob([csvBuffer]), `attendees_${eventId}.csv`);
        const uploadRes = await fetch(uploadUrl, { method: "POST", body: formData });
        const uploadData = (await uploadRes.json()) as { token: string };
        const file = new FileAttachment({ token: uploadData.token });
        await new Promise((r) => setTimeout(r, 3000));
        await ctx.reply("📥 Список участников:", {
            attachments: [
                file.toJson(),
                Keyboard.inlineKeyboard([
                    [Keyboard.button.callback("🔙 К списку участников", `event_attendees:${eventId}:0:new`)],
                ]),
            ],
        });
    } catch (error) {
        console.error(error);
        await ctx.reply("Не удалось выгрузить список участников.");
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

export async function handleMyArchivedCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (payload !== "menu:my_archived") return false;
    const token = getToken(ctx.user!.user_id) ?? "";
    const role = ctx.user!.role;

    try {
        if (role === "applicant") {
            const registrations = await api.events.getArchivedRegistrations(token);

            if (registrations.length === 0) {
                await ctx.editMessage({
                    text: "У вас нет прошедших записей.",
                    attachments: [Keyboard.inlineKeyboard([[backToMyEvents]])],
                });
                return true;
            }

            const { list, lines } = prepareArchivedRegistrationsContent(registrations);
            const eventButtons = list.map((r, i) => [
                Keyboard.button.callback(`${i + 1}. ${r.title}`, `hub_my_event:${r.event_id}:archived`),
            ]);

            await ctx.editMessage({
                text: `📋 Прошедшие записи:\n\n${lines}`,
                attachments: [Keyboard.inlineKeyboard([...eventButtons, [backToMyEvents]])],
            });
        } else {
            const events = await api.events.getOrganizerArchivedEvents(token);

            if (events.length === 0) {
                await ctx.editMessage({
                    text: "У вас нет прошедших мероприятий.",
                    attachments: [Keyboard.inlineKeyboard([[backToMyEvents]])],
                });
                return true;
            }

            const { list, lines } = prepareOrganizerEventsContent(events);
            const eventButtons = list.map((e, i) => [
                Keyboard.button.callback(`${i + 1}. ${e.title}`, `hub_my_event:${e.id}:archived`),
            ]);

            await ctx.editMessage({
                text: `📋 Прошедшие мероприятия:\n\n${lines}`,
                attachments: [
                    Keyboard.inlineKeyboard([
                        ...eventButtons,
                        [Keyboard.button.link("Управлять мероприятиями", `${env.CATALOG_URL}/organizer?token=${token}`)],
                        [getBackButtonForEventDetail(role, "regular")],
                    ]),
                ],
            });
        }
    } catch (error) {
        console.error(error);
        await ctx.editMessage({
            text: "Не удалось загрузить список прошедших мероприятий.",
            attachments: [Keyboard.inlineKeyboard([[backToMyEvents]])],
        });
    }

    return true;
}
