import { Bot, Keyboard } from "@maxhub/max-bot-api";
import "dotenv/config";
import { env } from "@/env";
import { initFlows } from "@/flows";
import { api } from "@/api";
import { AppContext, getSession, setRole } from "@/context";

const bot = new Bot<AppContext>(env.BOT_TOKEN!, { contextType: AppContext });

bot.use(async (ctx, next) => {
    if (ctx.updateType !== "message_created") return;
    if (!ctx.user) return;

    const session = getSession(ctx.user.user_id);

    if (session.role === undefined) {
        try {
            const userInfo = await api.user.role(ctx.user.user_id);
            setRole(ctx.user.user_id, userInfo.role);
        } catch {}
    }

    await next();
});

bot.on("message_created", (ctx) => {
    ctx.reply(`attachments: ${JSON.stringify(ctx.message?.body.attachments)}`);
});

initFlows(bot);

bot.start();
