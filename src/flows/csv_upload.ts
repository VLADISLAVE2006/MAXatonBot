import { Keyboard } from "@maxhub/max-bot-api";
import type { FileAttachment as FileAttachmentType } from "@maxhub/max-bot-api/types";
import { getSession, setSession, resetSession, type AppContext, getToken } from "@/context";
import { api } from "@/api";
import { backToMyEvents } from "@/commands/menu";

const cancelKeyboard = Keyboard.inlineKeyboard([
    [Keyboard.button.callback("Отмена", "menu:my_events")],
]);

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
            "Отправьте CSV-файл со следующими столбцами (первая строка — заголовки):\n\n" +
            "title, description, content, max_slots, cancellation_rules, date, format, type\n\n" +
            "• date — unix timestamp (целое число)\n" +
            "• format — online или offline\n" +
            "• max_slots — можно оставить пустым (без ограничений)\n" +
            "• cancellation_rules — можно оставить пустым",
        attachments: [cancelKeyboard],
    });
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
