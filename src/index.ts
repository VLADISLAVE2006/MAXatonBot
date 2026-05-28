import { Bot, Keyboard } from "@maxhub/max-bot-api";
import { AppContext, getSession, resetSession } from "./context";
import { env } from "./env";
import { initReminders } from "./reminders";
import { handleWebhook } from "./webhook";
import {
    handleStartCommand,
    handleHelpCommand,
    handleMenuCommand,
} from "./commands/menu";
import { handleHubEventsCallback } from "./commands/events";
import { handleHubNotificationsCallback } from "./commands/notifications";
import { handleMyEventsCallback } from "./commands/my_events";
import { handleRegisterDeeplink, handleAttendDeeplink } from "./commands/register";
import { initFlows } from "./flows";

async function startWebhookServer(bot: Bot<AppContext>) {
    const http = await import("node:http");
    const url = await import("url");
    
    const server = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url || "", true);
        
        if (parsedUrl.pathname === "/webhook" && req.method === "POST") {
            let body = "";
            req.on("data", chunk => {
                body += chunk.toString();
            });
            
            req.on("end", async () => {
                const request = new Request(`http://localhost${parsedUrl.pathname}`, {
                    method: req.method,
                    headers: req.headers as HeadersInit,
                    body,
                });
                
                const handler = handleWebhook(bot);
                const response = await handler(request);
                
                res.writeHead(response.status, Object.fromEntries(response.headers));
                res.end(await response.text());
            });
        } else {
            res.writeHead(404);
            res.end("Not found");
        }
    });
    
    const PORT = env.WEBHOOK_PORT || 8081;
    server.listen(PORT, () => {
        console.log(`✅ Webhook server running on port ${PORT}`);
        console.log(`   Webhook URL: http://localhost:${PORT}/webhook`);
    });
    
    return server;
}

async function main() {
    const bot = new Bot<AppContext>({
        token: env.BOT_TOKEN,
        context: AppContext,
    });

    bot.command("start", async (ctx) => {
        const session = getSession(ctx.user!.user_id);
        if (session.flow !== null && session.step !== null) {
            resetSession(ctx.user!.user_id);
        }
        
        if (await handleAttendDeeplink(ctx)) return;
        if (await handleRegisterDeeplink(ctx)) return;
        await handleStartCommand(ctx);
    });

    bot.command("help", handleHelpCommand);
    bot.command("menu", handleMenuCommand);

    initFlows(bot);

    bot.callback(/^hub:.+/, async (ctx) => {
        if (await handleHubEventsCallback(ctx)) return;
        if (await handleHubNotificationsCallback(ctx)) return;
        if (await handleMyEventsCallback(ctx)) return;
        
        await ctx.editMessage({
            text: "Неизвестное действие",
            attachments: [Keyboard.inlineKeyboard([[Keyboard.button.callback("◀️ На главную", "hub:menu")]])],
        });
    });

    initReminders(bot);
    await startWebhookServer(bot);
    await bot.start();
    console.log(`✅ Bot started`);
    console.log(`   Bot username: ${bot.botInfo?.username || "unknown"}`);
}

main().catch(console.error);