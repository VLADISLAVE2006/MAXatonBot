import { Bot } from "@maxhub/max-bot-api";
import { AppContext } from "@/context";
import { env } from "@/env";
import { initReminders } from "@/reminders";
import { handleWebhook } from "@/webhook";
// ... другие импорты команд

async function startWebhookServer(bot: Bot<AppContext>) {
    const http = await import("node:http");
    const url = await import("url");
    
    const server = http.createServer(async (req, res) => {
        // Парсим URL запроса
        const parsedUrl = url.parse(req.url || "", true);
        
        // Обрабатываем только POST запросы к /webhook
        if (parsedUrl.pathname === "/webhook" && req.method === "POST") {
            // Собираем тело запроса
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
    
    // Регистрация команд
    // ... ваш существующий код регистрации команд ...
    
    // Инициализация напоминаний
    initReminders(bot);
    
    // Запуск webhook сервера
    await startWebhookServer(bot);
    
    // Запуск бота
    await bot.start();
    console.log("✅ Bot started");
}

main().catch(console.error);