import { sendHub } from "@/commands/menu";
import { setRole, setToken, type AppContext } from "@/context";
import type { Bot } from "@maxhub/max-bot-api";
import { startRegistration } from "@/flows/registration";
import { api } from "@/api";
import { handleMenuCallback } from "./menu";
import { handleHubEventsCallback, handleRegisterCallback } from "./events";
import { handleHubMyEventsCallback, handleCancelRegistrationCallback, handleEventStatsCallback, handleQrCallback, handleCloseEventCallback, handleAttendeesCallback } from "./my_events";
import { handleHubNotificationsCallback } from "./notifications";

export type CallbackHandler = (ctx: AppContext) => boolean | Promise<boolean>;

export function initCommands(bot: Bot<AppContext>) {
    bot.command("help", sendHub);
    bot.command("start", startRegistration); // TODO удалить после тестов
    // TODO удалить после тестов
    bot.command("refresh", async (ctx) => {
        try {
            const userInfo = await api.user.me(ctx.message.sender?.user_id!);
            setRole(ctx.message.sender?.user_id!, userInfo.role);
            setToken(ctx.message.sender?.user_id!, userInfo.token);
            ctx.reply("Обновлено");
        } catch (error) {
            console.error(error);
            ctx.reply("Произошла ошибка");
        }
    });
}

export function collectCommandCallbackHandlers(): CallbackHandler[] {
    return [handleMenuCallback, handleHubEventsCallback, handleRegisterCallback, handleHubMyEventsCallback, handleCancelRegistrationCallback, handleEventStatsCallback, handleAttendeesCallback, handleQrCallback, handleCloseEventCallback, handleHubNotificationsCallback];
}
