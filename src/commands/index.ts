import { helpCommand } from "@/commands/help";
import type { AppContext } from "@/context";
import type { Bot } from "@maxhub/max-bot-api";
import { startRegistration } from "@/flows/registration";
import { organizerRequestsCommand } from "./organizer_requests";

export function initCommands(bot: Bot<AppContext>) {
    bot.command("help", helpCommand);
    bot.command("start", startRegistration); // TODO удалить после тестов
    bot.command("organizer_requests", organizerRequestsCommand);
}
