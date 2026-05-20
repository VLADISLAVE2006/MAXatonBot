import type { Bot } from "@maxhub/max-bot-api";
import registration from "./registration";

export function initFlows(bot: Bot) {
    registration(bot);
}
