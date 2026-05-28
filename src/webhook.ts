import { Bot } from "@maxhub/max-bot-api";
import type { AppContext } from "@/context";
import { api } from "@/api";

interface EventChangePayload {
    event_id: number;
    changed_fields: string[];
    old_data: Record<string, unknown>;
    new_data: Record<string, unknown>;
}

interface Attendee {
    user_id: number;
    full_name: string;
    registered_at: number;
    attended: boolean;
}

async function notifyRegisteredUsers(
    bot: Bot<AppContext>,
    eventId: number,
    changedFields: string[],
    oldData: Record<string, unknown>,
    newData: Record<string, unknown>
) {
    try {
        const attendees = await api.events.getEventAttendees(eventId);
        
        if (attendees.length === 0) {
            console.log(`No attendees for event ${eventId}, skipping notifications`);
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
                const oldValue = oldData[field];
                const newValue = newData[field];
                const fieldName = fieldNames[field] || field;
                
                if (field === "date" && typeof oldValue === "number" && typeof newValue === "number") {
                    const oldDate = new Date(oldValue * 1000).toLocaleString("ru-RU");
                    const newDate = new Date(newValue * 1000).toLocaleString("ru-RU");
                    return `• ${fieldName}: ${oldDate} → ${newDate}`;
                }
                
                return `• ${fieldName}: ${oldValue} → ${newValue}`;
            })
            .join("\n");

        const eventTitle = (newData.title as string) || (oldData.title as string) || "Мероприятие";
        
        const message = `⚠️ <b>Изменения в мероприятии, на которое вы записаны!</b>\n\n` +
            `📌 ${eventTitle}\n\n` +
            `<b>Что изменилось:</b>\n${changes}\n\n` +
            `Актуальную информацию можно посмотреть в боте: /menu`;

        let sentCount = 0;
        for (const attendee of attendees) {
            try {
                const notificationsEnabled = await api.user.getNotificationsEnabled(attendee.user_id);
                if (!notificationsEnabled) {
                    continue;
                }
                
                await bot.api.sendMessageToUser(attendee.user_id, message);
                sentCount++;
            } catch (error) {
                console.error(`Failed to send notification to user ${attendee.user_id}:`, error);
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
        const expectedKey = process.env.API_KEY;
        
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
                payload.changed_fields,
                payload.old_data,
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