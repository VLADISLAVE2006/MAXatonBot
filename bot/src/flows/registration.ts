import { FileAttachment, Keyboard } from "@maxhub/max-bot-api";
import {
    getSession,
    setSession,
    setStep,
    mergeData,
    resetSession,
    type AppContext,
    getToken,
    setToken,
    setRole,
    setFlow,
} from "@/context";
import { api } from "@/api";
import { env } from "@/env";
import { sendHub, hubKeyboard } from "@/commands/menu";

const ConsentKeyboard = Keyboard.inlineKeyboard([
    [
        Keyboard.button.callback("✅Разрешаю", "consent:accept"),
        Keyboard.button.callback("❌Не разрешаю", "consent:decline"),
    ],
]);

export async function startRegistration(ctx: AppContext) {
    const userId = ctx.user?.user_id;
    if (!userId) return;

    if (getToken(userId)) {
        await sendHub(ctx);
        return;
    }

    let agreementVersion = "1.0";
    let agreementFile: ReturnType<InstanceType<typeof FileAttachment>["toJson"]> | null = null;

    try {
        const agreement = await api.agreement.getCurrent();
        agreementVersion = agreement.version;

        const fileRes = await fetch(`${env.API_URL}${agreement.file_url}`);
        if (fileRes.ok) {
            const fileBlob = await fileRes.blob();
            const { url: uploadUrl } = await ctx.api.raw.uploads.getUploadUrl({ type: "file" });
            const formData = new FormData();
            formData.append("data", fileBlob, `agreement_${agreementVersion}.pdf`);
            const uploadRes = await fetch(uploadUrl, { method: "POST", body: formData });
            const uploadData = (await uploadRes.json()) as { token: string };
            agreementFile = new FileAttachment({ token: uploadData.token }).toJson();
        }
    } catch (error) {
        console.error("Failed to fetch agreement:", error);
    }

    resetSession(userId);
    setSession(userId, {
        flow: "registration",
        step: "registration/consent",
        data: { agreementVersion },
        role: null,
        token: null,
    });

    await ctx.reply(
        "👋 Привет! Я помогу вам записаться на мероприятия МИРЭА.\n\n" +
        "📅 Просматривайте ближайшие мероприятия\n" +
        "✅ Записывайтесь в пару нажатий\n" +
        "🔔 Получайте напоминания заранее\n\n" +
        "ℹ️ Неофициальный студенческий проект, не аффилирован с университетом."
    );

    await ctx.reply(
        "Для работы мне понадобится ваше имя — оно будет отображаться в списке участников.\n\n" +
        "Разрешаете обработку персональных данных?",
        { attachments: [...(agreementFile ? [agreementFile] : []), ConsentKeyboard] },
    );
}

export async function handleRegistrationCallback(ctx: AppContext): Promise<boolean> {
    const userId = ctx.user?.user_id;
    if (!userId) return false;
    const callbackPayload = ctx.callback?.payload;

    if (callbackPayload === "request_organizer") {
        try {
            setFlow(userId, "registration");
            setStep(userId, "registration/organizer_request");
            await ctx.reply("Для подтверждения статуса организатора укажите ваш ИНН");
            return true;
        } catch {
            await ctx.reply("Не удалось отправить заявку. Попробуйте еще раз.");
            return true;
        }
    }

    const session = getSession(userId);

    if (session.flow !== "registration") return false;

    switch (callbackPayload) {
        case "consent:accept":
            if (session.step !== "registration/consent") return false;
            try {
                const { agreementVersion } = session.data as { agreementVersion?: string };
                await api.user.consent(userId, true, agreementVersion ?? "1.0");
                const userInfo = await api.user.me(userId);
                setRole(userId, userInfo.role);
                setToken(userId, userInfo.token);

                mergeData(userId, { consentGiven: true });
                setStep(userId, "registration/name");
                await ctx.reply("Как Вас зовут? Введите имя и фамилию в формате: Имя Фамилия");
                return true;
            } catch (error) {
                await ctx.reply("Произошла ошибка. Попробуйте еще раз.");
                return true;
            }

        case "consent:decline":
            if (session.step !== "registration/consent") return false;
            resetSession(userId);
            setSession(userId, {
                flow: "registration",
                step: "registration/consent",
                data: {},
                role: ctx.user.role,
                token: getToken(userId),
            });
            await ctx.reply(
                "Без согласия бот не сможет записать вас на мероприятия — имя нужно для списков участников.\n\n" +
                "Если передумаете — нажмите кнопку ниже.",
                { attachments: [ConsentKeyboard] },
            );
            return true;

        default:
            return false;
    }
}

export async function handleRegistrationMessage(ctx: AppContext): Promise<boolean> {
    const userId = ctx.user?.user_id;
    if (!userId) return false;
    const text = ctx.message?.body.text?.trim() ?? "";
    const session = getSession(userId);

    if (text.startsWith("/")) return false;

    if (session.flow !== "registration") return false;

    switch (session.step) {
        case "registration/name":
            if (!text || text.split(" ").length < 2) {
                await ctx.reply("Пожалуйста, введите имя и фамилию (два слова).");
                return true;
            }
            try {
                const token = getToken(userId);
                await api.user.profile(text, token!);
                mergeData(userId, { name: text });
                resetSession(userId);
                await ctx.reply(`✅ Спасибо, ${text.split(" ")[0]}! Вы успешно зарегистрированы.`, {
                    attachments: [hubKeyboard(ctx.user?.role)],
                });
                return true;
            } catch (error) {
                await ctx.reply("Произошла ошибка. Попробуйте еще раз.");
                return true;
            }

        default:
            return false;
    }
}
