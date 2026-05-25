import { Bot } from "@maxhub/max-bot-api";
import "dotenv/config";
import { env } from "@/env";
import { initFlows } from "@/flows";
import { api } from "@/api";
import { AppContext, getSession, setSession, setRole, setToken, setFullName, setStep, setFlow } from "@/context";
import { initCommands } from "@/commands";
import { initReminders } from "@/reminders";

const bot = new Bot<AppContext>(env.BOT_TOKEN!, { contextType: AppContext });

bot.use(async (ctx, next) => {
    console.log(`Received update of type ${ctx.updateType} from user ${ctx.user?.user_id}`);
    if (!["message_created", "message_callback", "bot_started"].includes(ctx.updateType)) return await next();
    if (!ctx.user) return await next();

    const session = getSession(ctx.user.user_id);

    if (session.role === undefined) {
        try {
            const userInfo = await api.user.me(ctx.user.user_id);
            setRole(ctx.user.user_id, userInfo.role);
            setToken(ctx.user.user_id, userInfo.token);
            setFullName(ctx.user.user_id, userInfo.full_name);

            if (!userInfo.full_name) {
                setFlow(ctx.user.user_id, "registration");
                setStep(ctx.user.user_id, "registration/name");
            }
        } catch (error) {
            setSession(ctx.user.user_id, {
                flow: "registration",
                step: "registration/consent",
                data: {},
                role: null,
                token: null,
            });
        }
    }

    await next();
});

initCommands(bot);
initFlows(bot);
initReminders(bot);

bot.start();
