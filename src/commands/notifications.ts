import { api } from "@/api";
import { type AppContext, getToken } from "@/context";
import { Keyboard } from "@maxhub/max-bot-api";
import { backToHub } from "./menu";

function notificationsText(enabled: boolean) {
    return enabled
        ? "🔔 Уведомления включены\n\nВы будете получать напоминания о мероприятиях за день до их проведения."
        : "🔕 Уведомления отключены\n\nВы не будете получать напоминания о мероприятиях.";
}

function notificationsKeyboard(enabled: boolean) {
    return Keyboard.inlineKeyboard([
        [Keyboard.button.callback(enabled ? "Отключить уведомления" : "Включить уведомления", "toggle:notifications")],
        [backToHub],
    ]);
}

export async function handleHubNotificationsCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (payload !== "menu:notifications" && payload !== "toggle:notifications") return false;

    const token = getToken(ctx.user!.user_id) ?? "";

    if (payload === "menu:notifications") {
        try {
            const { enabled } = await api.notifications.get(token);
            await ctx.editMessage({
                text: notificationsText(enabled),
                attachments: [notificationsKeyboard(enabled)],
            });
        } catch (error) {
            await ctx.editMessage({
                text: "Не удалось загрузить настройки уведомлений.",
                attachments: [Keyboard.inlineKeyboard([[backToHub]])],
            });
            console.error(error);
        }
        return true;
    }

    // toggle:notifications
    try {
        const { enabled } = await api.notifications.get(token);
        await api.notifications.update(!enabled, token);
        await ctx.editMessage({
            text: notificationsText(!enabled),
            attachments: [notificationsKeyboard(!enabled)],
        });
    } catch {
        await ctx.editMessage({
            text: "Не удалось изменить настройки уведомлений.",
            attachments: [Keyboard.inlineKeyboard([[backToHub]])],
        });
    }
    return true;
}
