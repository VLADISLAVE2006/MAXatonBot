import { Bot, Keyboard } from "@maxhub/max-bot-api";
import type { AppContext } from "@/context";
import { api } from "@/api";
import { env } from "@/env";

interface EventChangePayload {
    event_id: number;
    event_title: string;
    changed_fields: string[];
    old_data: Record<string, unknown>;
    new_data: Record<string, unknown>;
}

async function notifyRegisteredUsers(
    bot: Bot<AppContext>,
    eventId: number,
    eventTitle: string,
    changedFields: string[],
    newData: Record<string, unknown>
) {
    try {
        const userIds = await api.events.getEventRegistrations(eventId);

        if (userIds.length === 0) {
            console.log(`No registrations for event ${eventId}, skipping notifications`);
            return;
        }

        const fieldNames: Record<string, string> = {
            title: "Название",
            description: "Описание",
            content: "Место проведения",
            date: "Дата и время",
            max_slots: "Количество мест",
            format: "Формат",
            type: "Тип",
            image_url: "Изображение",
        };

        const changes = changedFields
            .map(field => {
                const newValue = newData[field];
                const fieldName = fieldNames[field] || field;

                if (field === "date" && typeof newValue === "number") {
                    return `• ${fieldName}: ${new Date(newValue * 1000).toLocaleString("ru-RU")}`;
                }

                return `• ${fieldName}: ${newValue}`;
            })
            .join("\n");

        const message =
            `📢 Мероприятие, на которое вы записаны, обновилось!\n\n` +
            `📌 ${eventTitle}\n\n` +
            `Вот что изменилось:\n${changes}`;

        const keyboard = Keyboard.inlineKeyboard([
            [Keyboard.button.callback("📋 Посмотреть мероприятие", `hub_my_event:${eventId}`)],
            [Keyboard.button.callback("🏠 Главное меню", "menu:hub_new")],
        ]);

        let sentCount = 0;
        for (const userId of userIds) {
            try {
                await bot.api.sendMessageToUser(userId, message, { attachments: [keyboard] });
                sentCount++;
            } catch (error) {
                console.error(`Failed to send notification to user ${userId}:`, error);
            }
        }

        console.log(`Sent ${sentCount} notifications for event ${eventId} (${changedFields.length} changes)`);
    } catch (error) {
        console.error("Failed to notify registered users:", error);
    }
}

export function handleWebhook(bot: Bot<AppContext>) {
    return async (req: Request): Promise<Response> => {
        if (req.method !== "POST") {
            return new Response("Method not allowed", { status: 405 });
        }
        
        const apiKey = req.headers.get("X-API-Key");
        const expectedKey = env.API_KEY;
        
        if (!apiKey || apiKey !== expectedKey) {
            console.warn("Unauthorized webhook attempt");
            return new Response("Unauthorized", { status: 401 });
        }
        
        try {
            const payload: EventChangePayload = await req.json();
            console.log(`Received webhook for event ${payload.event_id}, changes: ${payload.changed_fields.join(", ")}`);
            
            await notifyRegisteredUsers(
                bot,
                payload.event_id,
                payload.event_title,
                payload.changed_fields,
                payload.new_data
            );
            
            return new Response(JSON.stringify({ status: "ok" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        } catch (error) {
            console.error("Webhook error:", error);
            return new Response(JSON.stringify({ error: "Internal server error" }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }
    };
}