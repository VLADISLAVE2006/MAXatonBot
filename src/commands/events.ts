import { api } from "@/api";
import { getSession, type AppContext, getToken } from "@/context";
import { env } from "@/env";
import { Keyboard } from "@maxhub/max-bot-api";

export async function eventsCommand(ctx: AppContext) {
    if (!ctx.user) return;
    const token = getToken(ctx.user.user_id);
    try {
        const events = await api.events.getEvents(token!);
        console.log(env.CATALOG_URL);
        await ctx.reply(
            `Список мероприятий:\n${events.map((e) => `- ${e.title} (${new Date(e.date).toLocaleDateString("ru")})`).join("\n")}`,
            {
                attachments: [Keyboard.inlineKeyboard([[Keyboard.button.link("Каталог", env.CATALOG_URL)]])],
            },
        );
    } catch (error) {
        console.error(error);
        await ctx.reply("Произошла ошибка");
    }
}
