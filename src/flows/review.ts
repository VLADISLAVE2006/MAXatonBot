import { Keyboard } from "@maxhub/max-bot-api";
import { getSession, setSession, setStep, mergeData, resetSession, type AppContext, getToken } from "@/context";
import { api } from "@/api";
import { backToMyEvents } from "@/commands/menu";

const ratingKeyboard = (eventId: number) =>
    Keyboard.inlineKeyboard([
        [1, 2, 3, 4, 5].map((n) => Keyboard.button.callback(`${n} ⭐`, `review_rate:${n}`)),
        [Keyboard.button.callback("Отмена", `hub_my_event:${eventId}`)],
    ]);

const commentKeyboard = Keyboard.inlineKeyboard([
    [Keyboard.button.callback("Пропустить", "review_skip")],
    [Keyboard.button.callback("Отмена", "review_cancel")],
]);

export async function handleReviewCallback(ctx: AppContext): Promise<boolean> {
    const userId = ctx.user?.user_id;
    if (!userId) return false;
    const payload = ctx.callback?.payload;

    if (payload?.startsWith("review:")) {
        const eventId = parseInt(payload.replace("review:", ""), 10);
        if (isNaN(eventId)) return false;

        setSession(userId, {
            ...getSession(userId),
            flow: "review",
            step: null,
            data: { eventId },
        });

        await ctx.editMessage({
            text: "Оцените мероприятие:",
            attachments: [ratingKeyboard(eventId)],
        });
        return true;
    }

    const session = getSession(userId);
    if (session.flow !== "review") return false;

    if (payload?.startsWith("review_rate:")) {
        const rating = parseInt(payload.replace("review_rate:", ""), 10);
        if (isNaN(rating) || rating < 1 || rating > 5) return false;

        mergeData(userId, { rating });
        setStep(userId, "review/comment");

        await ctx.editMessage({
            text: `Вы поставили ${"⭐".repeat(rating)}\n\nДобавьте комментарий или пропустите:`,
            attachments: [commentKeyboard],
        });
        return true;
    }

    if (payload === "review_skip") {
        const { eventId, rating } = session.data as { eventId: number; rating: number };
        const token = getToken(userId) ?? "";
        resetSession(userId);
        try {
            await api.events.addReview(eventId, rating, undefined, token);
            await ctx.editMessage({
                text: "✅ Спасибо за отзыв!",
                attachments: [Keyboard.inlineKeyboard([[backToMyEvents]])],
            });
        } catch {
            await ctx.editMessage({
                text: "Не удалось отправить отзыв. Попробуйте позже.",
                attachments: [Keyboard.inlineKeyboard([[backToMyEvents]])],
            });
        }
        return true;
    }

    if (payload === "review_cancel") {
        resetSession(userId);
        return false; // передаём управление hub_my_event обработчику
    }

    return false;
}

export async function handleReviewMessage(ctx: AppContext): Promise<boolean> {
    const userId = ctx.user?.user_id;
    if (!userId) return false;

    const session = getSession(userId);
    if (session.flow !== "review" || session.step !== "review/comment") return false;

    const comment = ctx.message?.body.text?.trim();
    if (!comment || comment.startsWith("/")) return false;

    const { eventId, rating } = session.data as { eventId: number; rating: number };
    const token = getToken(userId) ?? "";
    resetSession(userId);

    try {
        await api.events.addReview(eventId, rating, comment, token);
        await ctx.reply("✅ Спасибо за отзыв!", {
            attachments: [Keyboard.inlineKeyboard([[backToMyEvents]])],
        });
    } catch {
        await ctx.reply("Не удалось отправить отзыв. Попробуйте позже.", {
            attachments: [Keyboard.inlineKeyboard([[backToMyEvents]])],
        });
    }
    return true;
}
