import { Keyboard } from "@maxhub/max-bot-api";
import type { FileAttachment as FileAttachmentType } from "@maxhub/max-bot-api/types";
import { getSession, setFlow, setStep, mergeData, resetSession, type AppContext, getToken } from "@/context";
import { api } from "@/api";
import { sendHub, backToHub } from "@/commands/menu";

const cancelKeyboard = Keyboard.inlineKeyboard([[backToHub]]);

export async function handleAdminCallback(ctx: AppContext): Promise<boolean> {
    const userId = ctx.user?.user_id;
    if (!userId) return false;

    const payload = ctx.callback?.payload;
    const session = getSession(userId);

    if (payload === "menu:back" && session.flow === "admin") {
        resetSession(userId);
        return false;
    }

    if (ctx.user?.role !== "admin") return false;

    if (payload === "admin:create_organizer") {
        setFlow(userId, "admin");
        setStep(userId, "admin/create_organizer_id");
        await ctx.reply("Введите User ID пользователя:", { attachments: [cancelKeyboard] });
        return true;
    }

    if (payload === "admin:upload_agreement") {
        setFlow(userId, "admin");
        setStep(userId, "admin/upload_agreement_version");
        await ctx.reply("Введите версию соглашения (например, 1.1):", { attachments: [cancelKeyboard] });
        return true;
    }

    return false;
}

export async function handleAdminMessage(ctx: AppContext): Promise<boolean> {
    const userId = ctx.user?.user_id;
    if (!userId) return false;

    const session = getSession(userId);
    if (session.flow !== "admin") return false;

    if (session.step === "admin/upload_agreement_file") {
        const attachments = ctx.message?.body.attachments;
        const fileAttachment = attachments?.find((a): a is FileAttachmentType => a.type === "file");

        if (!fileAttachment) {
            await ctx.reply("Пожалуйста, отправьте PDF-файл.", { attachments: [cancelKeyboard] });
            return true;
        }

        if (!fileAttachment.filename.toLowerCase().endsWith(".pdf")) {
            await ctx.reply("Файл должен иметь расширение .pdf.", { attachments: [cancelKeyboard] });
            return true;
        }

        const { agreementVersion } = session.data as { agreementVersion: string };
        const token = getToken(userId) ?? "";
        resetSession(userId);

        try {
            const fileRes = await fetch(fileAttachment.payload.url);
            if (!fileRes.ok) throw new Error("failed to download file");
            const fileBlob = await fileRes.blob();

            await api.admin.uploadAgreement(agreementVersion, fileBlob, fileAttachment.filename, token);
            await ctx.reply(`✅ Соглашение версии ${agreementVersion} успешно загружено.`);
            await sendHub(ctx);
        } catch (error) {
            console.error("Agreement upload error:", error);
            await ctx.reply("Не удалось загрузить соглашение. Проверьте файл и попробуйте снова.");
            await sendHub(ctx);
        }
        return true;
    }

    const text = ctx.message?.body.text?.trim() ?? "";
    if (!text || text.startsWith("/")) return false;

    if (session.step === "admin/upload_agreement_version") {
        mergeData(userId, { agreementVersion: text });
        setStep(userId, "admin/upload_agreement_file");
        await ctx.reply("Отправьте PDF-файл соглашения:", { attachments: [cancelKeyboard] });
        return true;
    }

    if (session.step === "admin/create_organizer_id") {
        const targetUserId = parseInt(text, 10);
        if (isNaN(targetUserId) || targetUserId <= 0) {
            await ctx.reply("Некорректный User ID. Введите числовой идентификатор пользователя:", {
                attachments: [cancelKeyboard],
            });
            return true;
        }
        mergeData(userId, { targetUserId });
        setStep(userId, "admin/create_organizer_name");
        await ctx.reply("Введите имя и фамилию организатора (формат: Имя Фамилия):", {
            attachments: [cancelKeyboard],
        });
        return true;
    }

    if (session.step === "admin/create_organizer_name") {
        if (text.split(" ").length < 2) {
            await ctx.reply("Пожалуйста, введите имя и фамилию (два слова):", { attachments: [cancelKeyboard] });
            return true;
        }
        const { targetUserId } = session.data as { targetUserId: number };
        const token = getToken(userId) ?? "";
        resetSession(userId);
        try {
            await api.admin.createOrganizer(targetUserId, text, token);
            await ctx.reply(`✅ Организатор успешно создан!\n\n👤 ${text}\n🆔 User ID: ${targetUserId}`);
            await sendHub(ctx);
        } catch {
            await ctx.reply("Не удалось создать организатора. Проверьте данные и попробуйте снова.");
            await sendHub(ctx);
        }
        return true;
    }

    return false;
}
