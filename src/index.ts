import { Bot, Keyboard } from "@maxhub/max-bot-api";
import "dotenv/config";
import { env } from "@/env";
import { initFlows } from "@/flows";
import { api } from "@/api";
import { AppContext, getSession, setSession, setRole } from "@/context";

const bot = new Bot<AppContext>(env.BOT_TOKEN!, { contextType: AppContext });

bot.use(async (ctx, next) => {
    if (ctx.updateType !== "message_created") return await next();
    if (!ctx.user) return await next();

    const session = getSession(ctx.user.user_id);

    if (session.role === undefined) {
        try {
            const userInfo = await api.user.role(ctx.user.user_id);
            setRole(ctx.user.user_id, userInfo.role);
        } catch (error) {
            setSession(ctx.user.user_id, {
                flow: "registration",
                step: "registration/consent",
                data: {},
                role: null,
            });
        }
    }

    await next();
});

initFlows(bot);

bot.start();
