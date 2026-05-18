import { Bot, Keyboard } from "@maxhub/max-bot-api";
import "dotenv/config";
import { env } from "@/env";

const bot = new Bot(env.BOT_TOKEN!);

bot.command("menu", async (ctx) => {
    return ctx.reply("test", {
        attachments: [
            Keyboard.inlineKeyboard([
                [
                    Keyboard.button.link("Откройте сайт", "https://max.ru"),
                    Keyboard.button.callback("Кнопка 1", "menu:button_1"),
                ],
            ]),
        ],
    });
});

bot.on("message_callback", async (ctx) => {
    await ctx.answerOnCallback({
        notification: "Кнопка нажата",
    });

    return ctx.reply(`Вы нажали кнопку с данными: ${ctx.callback.payload ?? ""}`);
});

bot.start();
