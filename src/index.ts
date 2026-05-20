import { Bot, Keyboard } from "@maxhub/max-bot-api";
import "dotenv/config";
import { env } from "@/env";
import { initFlows } from "@/flows";

const bot = new Bot(env.BOT_TOKEN!);

initFlows(bot);

bot.start();
