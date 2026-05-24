import { type AppContext } from "@/context";
import type { Role } from "@/types/app";
import { Keyboard } from "@maxhub/max-bot-api";

const HUB_TEXT = "Главное меню. Выберите раздел:";

export const hubKeyboard = (role?: Role | null) => {
    const isOrganizer = role === "organizer" || role === "admin";
    const rows = [
        [
            Keyboard.button.callback("📅 Мероприятия", "menu:events"),
            Keyboard.button.callback(
                isOrganizer ? "📋 Мои мероприятия" : "📋 Мои записи",
                "menu:my_events",
            ),
        ],
    ];
    if (!isOrganizer) {
        rows.push([Keyboard.button.callback("🔔 Уведомления", "menu:notifications")]);
    }
    return Keyboard.inlineKeyboard(rows);
};

export const backToHub = Keyboard.button.callback("🔙 Главное меню", "menu:back");
export const backToEvents = Keyboard.button.callback("🔙 Мероприятия", "menu:events");
export const backToMyEvents = Keyboard.button.callback("🔙 Мои записи", "menu:my_events");

export async function sendHub(ctx: AppContext) {
    await ctx.reply(HUB_TEXT, { attachments: [hubKeyboard(ctx.user?.role)] });
}

export async function handleMenuCallback(ctx: AppContext): Promise<boolean> {
    if (ctx.callback?.payload !== "menu:back") return false;
    await ctx.editMessage({ text: HUB_TEXT, attachments: [hubKeyboard(ctx.user?.role)] });
    return true;
}
