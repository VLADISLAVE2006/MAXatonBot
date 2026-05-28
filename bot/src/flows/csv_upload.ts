import { Keyboard, FileAttachment } from "@maxhub/max-bot-api";
import type { FileAttachment as FileAttachmentType } from "@maxhub/max-bot-api/types";
import { stringify } from "csv-stringify/sync";
import { getSession, setSession, resetSession, type AppContext, getToken } from "@/context";
import { api } from "@/api";
import { backToMyEvents } from "@/commands/menu";

const cancelKeyboard = Keyboard.inlineKeyboard([[Keyboard.button.callback("Отмена", "menu:my_events")]]);

export async function handleCsvUploadCallback(ctx: AppContext): Promise<boolean> {
    const userId = ctx.user?.user_id;
    if (!userId) return false;
    const payload = ctx.callback?.payload;

    // Перехватываем menu:my_events пока активен flow, чтобы сбросить сессию
    if (payload === "menu:my_events" && getSession(userId).flow === "csv_upload") {
        resetSession(userId);
        return false; // передаём управление handleHubMyEventsCallback
    }

    if (payload !== "csv_upload:start") return false;

    setSession(userId, {
        ...getSession(userId),
        flow: "csv_upload",
        step: "csv_upload/waiting_file",
        data: {},
    });

    await ctx.editMessage({
        text:
            "📤 Загрузка мероприятий из CSV\n\n" +
            "Скачайте шаблон ниже, заполните и отправьте сюда.\n\n" +
            "📅 Дата — (например, 01.09.2026 10:00)\n" +
            "🌐 Формат — онлайн / оффлайн\n" +
            "✨ Тип — хакатон / олимпиада / конференция / день открытых дверей\n" +
            "📝 Макс. мест и правила отмены — необязательны",
        attachments: [cancelKeyboard],
    });

    try {
        const csv = stringify(
            [
                ["название", "описание", "место проведения", "макс. мест", "правила отмены", "дата", "формат", "тип"],
                [
                    "Хакатон Техностарт",
                    "Соревнование для разработчиков и дизайнеров",
                    "проспект Вернадского, 78",
                    "100",
                    "Отмена за 24 часа до начала",
                    "01.09.2026 10:00",
                    "оффлайн",
                    "хакатон",
                ],
                [
                    "Олимпиада по программированию",
                    "Ежегодная студенческая олимпиада по алгоритмам",
                    "https://webinar.ru/123",
                    "",
                    "",
                    "15.09.2026 11:00",
                    "онлайн",
                    "олимпиада",
                ],
            ],
            { bom: true, delimiter: ";" },
        );

        await ctx.api.sendAction(ctx.chatId!, "sending_file");
        const csvBuffer = Buffer.from(csv, "utf-8");
        const { url: uploadUrl } = await ctx.api.raw.uploads.getUploadUrl({ type: "file" });
        const formData = new FormData();
        formData.append("data", new Blob([csvBuffer]), "template_events.csv");
        const uploadRes = await fetch(uploadUrl, { method: "POST", body: formData });
        const uploadData = (await uploadRes.json()) as { token: string };
        const file = new FileAttachment({ token: uploadData.token });
        await new Promise((r) => setTimeout(r, 3000));
        await ctx.reply("📎 Шаблон CSV:", {
            attachments: [file.toJson(), Keyboard.inlineKeyboard([[backToMyEvents]])],
        });
    } catch (error) {
        console.error("Failed to send CSV template:", error);
    }

    return true;
}

export async function handleCsvUploadMessage(ctx: AppContext): Promise<boolean> {
    const userId = ctx.user?.user_id;
    if (!userId) return false;

    const session = getSession(userId);
    if (session.flow !== "csv_upload" || session.step !== "csv_upload/waiting_file") return false;

    const attachments = ctx.message?.body.attachments;
    const fileAttachment = attachments?.find((a): a is FileAttachmentType => a.type === "file");

    if (!fileAttachment) {
        await ctx.reply("Пожалуйста, отправьте CSV-файл.", { attachments: [cancelKeyboard] });
        return true;
    }

    if (!fileAttachment.filename.toLowerCase().endsWith(".csv")) {
        await ctx.reply("Файл должен иметь расширение .csv.", { attachments: [cancelKeyboard] });
        return true;
    }

    const token = getToken(userId) ?? "";
    resetSession(userId);

    try {
        const fileRes = await fetch(fileAttachment.payload.url);
        if (!fileRes.ok) throw new Error("failed to download file");
        const fileBlob = await fileRes.blob();

        const result = await api.events.uploadEventsCSV(fileBlob, fileAttachment.filename, token);

        const errorEntries = Object.entries(result.errors ?? {});
        let text = `✅ Готово! Создано мероприятий: ${result.created}`;
        if (errorEntries.length > 0) {
            const errorLines = errorEntries.map(([line, msg]) => `• Строка ${line}: ${msg}`).join("\n");
            text += `\n\n⚠️ Ошибки (${errorEntries.length}):\n${errorLines}`;
        }

        await ctx.reply(text, {
            attachments: [Keyboard.inlineKeyboard([[backToMyEvents]])],
        });
    } catch (error) {
        console.error("CSV upload error:", error);
        await ctx.reply("Не удалось загрузить файл. Проверьте формат и попробуйте снова.", {
            attachments: [Keyboard.inlineKeyboard([[backToMyEvents]])],
        });
    }
    return true;
}
