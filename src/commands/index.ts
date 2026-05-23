import { helpCommand } from "@/commands/help";
import { setRole, setToken, type AppContext } from "@/context";
import type { Bot } from "@maxhub/max-bot-api";
import { startRegistration } from "@/flows/registration";
import { api } from "@/api";
import { eventsCommand, handleEventsCallback } from "./events";
import { myEventsCommand } from "./my_events";

export type CallbackHandler = (ctx: AppContext) => boolean | Promise<boolean>;

export function initCommands(bot: Bot<AppContext>) {
    bot.command("help", helpCommand);
    bot.command("start", startRegistration); // TODO удалить после тестов
    bot.command("events", eventsCommand);
    bot.command("my_events", myEventsCommand);
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
    return [handleEventsCallback];
}
