import { helpCommand } from "@/commands/help";
import type { AppContext } from "@/context";
import type { Bot } from "@maxhub/max-bot-api";
import { startRegistration } from "@/flows/registration";
import { handleOrganizerRequestCallback } from "./organizer_requests";
import { organizerRequestsCommand } from "./organizer_requests";

export type CallbackHandler = (ctx: AppContext) => boolean | Promise<boolean>;

export function initCommands(bot: Bot<AppContext>) {
    bot.command("help", helpCommand);
    bot.command("start", startRegistration); // TODO удалить после тестов
    bot.command("organizer_requests", organizerRequestsCommand);
}

export function collectCommandCallbackHandlers(): CallbackHandler[] {
    return [handleOrganizerRequestCallback];
}
