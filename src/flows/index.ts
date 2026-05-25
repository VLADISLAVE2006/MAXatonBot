import type { Bot } from "@maxhub/max-bot-api";
import { sendHub } from "@/commands/menu";
import { collectCommandCallbackHandlers } from "@/commands";
import { getSession, getToken, type AppContext } from "@/context";
import { handleRegistrationCallback, handleRegistrationMessage, startRegistration } from "./registration";
import { handleAttendDeeplink, handleRegisterDeeplink } from "@/commands/register";
import { handleReviewCallback, handleReviewMessage } from "./review";
import { handleAdminCallback, handleAdminMessage } from "./admin";

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
    {
        onMessageCreated: handleReviewMessage,
        onMessageCallback: handleReviewCallback,
    },
    {
        onMessageCreated: handleAdminMessage,
        onMessageCallback: handleAdminCallback,
    },
];

export function initFlows(bot: Bot<AppContext>) {
    bot.on("bot_started", async (ctx: AppContext) => {
        if (await handleAttendDeeplink(ctx)) return;
        if (await handleRegisterDeeplink(ctx)) return;

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

        if (text) {
            if (!userId || !getToken(userId)) {
                await startRegistration(ctx);
                return;
            }
            if (!session?.flow) {
                await sendHub(ctx);
                return;
            }
        }

        return next();
    });

    bot.on("message_callback", async (ctx, next) => {
        for (const flow of flows) {
            if (await flow.onMessageCallback?.(ctx)) {
                return;
            }
        }

        const userId = ctx.user?.user_id;
        if (!userId || !getToken(userId)) {
            await startRegistration(ctx);
            return;
        }

        for (const handler of collectCommandCallbackHandlers()) {
            if (await handler(ctx)) {
                return;
            }
        }

        return next();
    });
}
