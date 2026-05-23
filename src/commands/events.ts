import { api } from "@/api";
import { getSession, type AppContext, getToken } from "@/context";
import { env } from "@/env";
import { Keyboard } from "@maxhub/max-bot-api";

export async function eventsCommand(ctx: AppContext) {
    if (!ctx.user) return;
    const token = getToken(ctx.user.user_id);
    try {
        await ctx.reply("Со списком мероприятий можно ознакомиться в приложении", {
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.link("Открыть приложение", `${env.CATALOG_URL}?token=${token}`)],
                ]),
            ],
        });
    } catch (error) {
        console.error(error);
        await ctx.reply("Произошла ошибка");
    }
}
