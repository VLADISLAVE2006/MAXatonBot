import { Bot } from "@maxhub/max-bot-api";
import http from "node:http";
import "dotenv/config";
import { env } from "@/env";
import { initFlows } from "@/flows";
import { api } from "@/api";
import { AppContext, getSession, setSession, setRole, setToken, setFullName, setStep, setFlow } from "@/context";
import { initCommands } from "@/commands";
import { initReminders } from "@/reminders";
import { handleWebhook } from "@/webhook";

const bot = new Bot<AppContext>(env.BOT_TOKEN!, { contextType: AppContext });

bot.use(async (ctx, next) => {
    console.log(`Received update of type ${ctx.updateType} from user ${ctx.user?.user_id}`);
    if (!["message_created", "message_callback", "bot_started"].includes(ctx.updateType)) return await next();
    if (!ctx.user) return await next();

    const session = getSession(ctx.user.user_id);

    if (session.role === undefined) {
        try {
            const userInfo = await api.user.me(ctx.user.user_id);
            setRole(ctx.user.user_id, userInfo.role);
            setToken(ctx.user.user_id, userInfo.token);
            setFullName(ctx.user.user_id, userInfo.full_name);

            if (!userInfo.full_name) {
                setFlow(ctx.user.user_id, "registration");
                setStep(ctx.user.user_id, "registration/name");
            }
        } catch (error) {
            setSession(ctx.user.user_id, {
                flow: "registration",
                step: "registration/consent",
                data: {},
                role: null,
                token: null,
            });
        }
    }

    await next();
});

initCommands(bot);
initFlows(bot);
initReminders(bot);

const webhookHandler = handleWebhook(bot);
const webhookPort = Number(process.env.WEBHOOK_PORT) || 8081;
http.createServer(async (req, res) => {
    if (req.url === "/webhook" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk.toString(); });
        req.on("end", async () => {
            const request = new Request("http://localhost/webhook", {
                method: "POST",
                headers: req.headers as HeadersInit,
                body,
            });
            const response = await webhookHandler(request);
            res.writeHead(response.status, Object.fromEntries(response.headers));
            res.end(await response.text());
        });
    } else {
        res.writeHead(404);
        res.end("Not found");
    }
}).listen(webhookPort, () => {
    console.log(`Webhook server listening on port ${webhookPort}`);
});

bot.start();
