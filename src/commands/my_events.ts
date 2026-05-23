import { AppContext, getToken } from "@/context";
import { env } from "@/env";
import { Keyboard } from "@maxhub/max-bot-api";

export function myEventsCommand(ctx: AppContext) {
    if (!ctx.user) return;
    const role = ctx.user.role;

    switch (role) {
        case "applicant":
            return ctx.reply("Для просмотра мероприятий перейдите в приложение", {
                attachments: [
                    Keyboard.inlineKeyboard([
                        [
                            Keyboard.button.link(
                                "Открыть приложение",
                                `${env.CATALOG_URL}/organizer?token=${getToken(ctx.user.user_id)}`,
                            ),
                        ],
                    ]),
                ],
            });
        case "organizer":
            return ctx.reply("Для просмотра мероприятий перейдите в приложение", {
                attachments: [
                    Keyboard.inlineKeyboard([
                        [
                            Keyboard.button.link(
                                "Открыть приложение",
                                `${env.CATALOG_URL}?token=${getToken(ctx.user.user_id)}`,
                            ),
                        ],
                    ]),
                ],
            });
        default:
            return ctx.reply("У вас нет доступа к этой команде");
    }
}
