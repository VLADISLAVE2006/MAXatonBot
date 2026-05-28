import { type AppContext } from "@/context";
import type { Role } from "@/types/app";
import { Keyboard } from "@maxhub/max-bot-api";

const HUB_TEXT = "Главное меню. Выберите раздел:";

export const hubKeyboard = (role?: Role | null) => {
    if (role === "admin") {
        return Keyboard.inlineKeyboard([
            [Keyboard.button.callback("👤 Создать организатора", "admin:create_organizer")],
            [Keyboard.button.callback("📄 Загрузить соглашение", "admin:upload_agreement")],
        ]);
    }
    const isOrganizer = role === "organizer";
    const rows = [
        [
            Keyboard.button.callback("📅 Мероприятия", "menu:events"),
            Keyboard.button.callback(isOrganizer ? "📋 Мои мероприятия" : "📋 Мои записи", "menu:my_events"),
        ],
    ];
    if (!isOrganizer) {
        rows.push([Keyboard.button.callback("🔔 Уведомления", "menu:notifications")]);
    }
    return Keyboard.inlineKeyboard(rows);
};

export const backToHub = Keyboard.button.callback("🔙 Главное меню", "menu:back");
export const toHubNew = Keyboard.button.callback("🔙 Главное меню", "menu:hub_new");
export const backToEvents = Keyboard.button.callback("🔙 Мероприятия", "menu:events");
export const backToMyEvents = Keyboard.button.callback("🔙 Мои записи", "menu:my_events");

export async function sendHub(ctx: AppContext) {
    await ctx.reply(HUB_TEXT, { attachments: [hubKeyboard(ctx.user?.role)] });
}

export async function handleMenuCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (payload === "menu:back") {
        await ctx.editMessage({ text: HUB_TEXT, attachments: [hubKeyboard(ctx.user?.role)] });
        return true;
    }
    if (payload === "menu:hub_new") {
        await ctx.reply(HUB_TEXT, { attachments: [hubKeyboard(ctx.user?.role)] });
        return true;
    }
    return false;
}
