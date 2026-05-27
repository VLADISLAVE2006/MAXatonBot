import { Keyboard } from "@maxhub/max-bot-api";
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

    resetSession(userId);
    setSession(userId, {
        flow: "registration",
        step: "registration/consent",
        data: {},
        role: null,
        token: null,
    });

    await ctx.reply(
        "Привет! Это учебный проект команды хакатона — бот для записи на мероприятия.\n\n" +
            "⚠️ Сервис не является официальной функцией платформы и не аффилирован с университетом. " +
            "Разработан студенческой командой в рамках хакатона. " +
            "Актуальные сведения о разработчике и политика обработки данных доступны у команды проекта.\n\n" +
            "Что умеет бот:\n" +
            "• Просматривать мероприятия и записываться на них\n" +
            "• Отслеживать свои записи и получать уведомления\n\n" +
            "Для работы потребуется доступ к данным профиля:\n" +
            "• Отображаемое фамилия и имя — для списков участников\n\n" +
            "Разрешаете обработку этих данных?",
        { attachments: [ConsentKeyboard] },
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
                await api.user.consent(userId, true, "1.0");
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
                "Без согласия на обработку данных бот не может работать — фамилия и имя необходимы для записи на мероприятия.\n\n" +
                    "Если передумаете, нажмите кнопку ниже.",
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
