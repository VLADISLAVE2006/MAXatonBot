import type { Bot } from "@maxhub/max-bot-api";
import { helpCommand } from "@/commands/help";
import { getSession, type AppContext } from "@/context";
import { handleRegistrationCallback, handleRegistrationMessage, startRegistration } from "./registration";

type FlowRouter = {
    onBotStarted?: (ctx: AppContext) => void | Promise<void>;
    onMessageCreated?: (ctx: AppContext) => boolean | Promise<boolean>;
    onMessageCallback?: (ctx: AppContext) => boolean | Promise<boolean>;
};

const flows: FlowRouter[] = [
    {
        onBotStarted: startRegistration,
        onMessageCreated: handleRegistrationMessage,
        onMessageCallback: handleRegistrationCallback,
    },
];

export function initFlows(bot: Bot<AppContext>) {
    bot.on("bot_started", async (ctx: AppContext) => {
        for (const flow of flows) {
            await flow.onBotStarted?.(ctx);
        }
    });

    bot.on("message_created", async (ctx: AppContext, next) => {
        const userId = ctx.user?.user_id;
        const session = userId ? getSession(userId) : undefined;
        const text = ctx.message?.body.text?.trim() ?? "";

        for (const flow of flows) {
            if (await flow.onMessageCreated?.(ctx)) {
                return;
            }
        }

        if (text && !session?.flow) {
            await helpCommand(ctx);
            return;
        }

        return next();
    });

    bot.on("message_callback", async (ctx, next) => {
        for (const flow of flows) {
            if (await flow.onMessageCallback?.(ctx)) {
                return;
            }
        }

        return next();
    });
}
