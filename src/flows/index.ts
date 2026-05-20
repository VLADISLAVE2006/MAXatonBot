import type { Bot } from "@maxhub/max-bot-api";
import type { AppContext } from "@/context";
import registration from "./registration";

export function initFlows(bot: Bot<AppContext>) {
    registration(bot);
}
