import { Keyboard, type Bot, type Context } from "@maxhub/max-bot-api";
import type { Update } from "@maxhub/max-bot-api/types";
import { getSession, setSession, setStep, mergeData, resetSession } from "@/context";
import { api } from "@/api";

const ConsentKeyboard = Keyboard.inlineKeyboard([
    [
        Keyboard.button.callback("✅Разрешаю", "consent:accept"),
        Keyboard.button.callback("❌Не разрешаю", "consent:decline"),
    ],
]);

export default function (bot: Bot) {
    bot.on("bot_started", startCommand);
    bot.command("start", startCommand);

    bot.on("message_callback", handleCallback);
    bot.on("message_created", handleMessage);
}

function startCommand(ctx: Context<Update>) {
    const userId = ctx.user?.user_id;
    if (!userId) return;

    resetSession(userId);
    setSession(userId, { flow: "registration", step: "registration/consent", data: {} });

    ctx.reply(
        "Привет, я бот для записи на мероприятия университета!" +
            " Я помогу тебе записаться на интересующие тебя мероприятия и" +
            " всегда буду держать тебя в курсе всех новостей.",
    );

    setTimeout(() => {
        ctx.reply("Для начала работы, пожалуйста, разреши обработку персональных данных, нажав на кнопку ниже.", {
            attachments: [ConsentKeyboard],
        });
    }, 250);
}

async function handleCallback(ctx: Context<Update>) {
    const userId = ctx.user?.user_id;
    if (!userId) return;
    const callbackPayload = ctx.callback?.payload;

    if (callbackPayload === "request_organizer") {
        try {
            await api.user.requestOrganizer(userId);
            await ctx.reply("✅ Заявка на права организатора отправлена.");
        } catch {
            await ctx.reply("Не удалось отправить заявку. Попробуйте еще раз.");
        }
        return;
    }

    const session = getSession(userId);

    if (session.flow !== "registration") return;

    switch (callbackPayload) {
        case "consent:accept":
            if (session.step !== "registration/consent") return;
            try {
                await api.user.consent(userId, true, "1.0");
                mergeData(userId, { consentGiven: true });
                setStep(userId, "registration/name");
                await ctx.reply("Как Вас зовут? Введите имя и фамилию в формате: Имя Фамилия");
            } catch (error) {
                await ctx.reply("Произошла ошибка. Попробуйте еще раз.");
            }
            break;

        case "consent:decline":
            if (session.step !== "registration/consent") return;
            resetSession(userId);
            setSession(userId, { flow: "registration", step: "registration/consent", data: {} });
            await ctx.reply(
                "К сожалению, без разрешения на обработку персональных данных я не смогу помочь вам. Если вы передумаете, нажмите /start.",
                { attachments: [ConsentKeyboard] },
            );
            break;
    }
}

async function handleMessage(ctx: Context<Update>) {
    const userId = ctx.user?.user_id;
    if (!userId) return;
    const text = ctx.message?.body.text?.trim() ?? "";
    const session = getSession(userId);

    if (!session.flow) return;

    switch (session.step) {
        case "registration/name":
            if (!text || text.split(" ").length < 2) {
                return ctx.reply("Пожалуйста, введите имя и фамилию (два слова).");
            }
            try {
                await api.user.profile(userId, text);
                mergeData(userId, { name: text });
                resetSession(userId);
                await ctx.reply(`✅ Спасибо, ${text.split(" ")[0]}! Вы успешно зарегистрированы.`, {
                    attachments: [
                        Keyboard.inlineKeyboard([[Keyboard.button.callback("Я организатор", "request_organizer")]]),
                    ],
                });
            } catch {
                await ctx.reply("Произошла ошибка. Попробуйте еще раз.");
            }
            break;
    }
}
