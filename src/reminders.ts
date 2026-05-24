import cron from "node-cron";
import { api } from "@/api";
import { formatDate } from "@/utils/helpers";
import type { Bot } from "@maxhub/max-bot-api";
import type { AppContext } from "@/context";

async function sendReminders(bot: Bot<AppContext>) {
    let reminders;
    try {
        reminders = await api.reminders.getPending();
    } catch (error) {
        console.error("Failed to fetch pending reminders:", error);
        return;
    }

    if (reminders.length === 0) return;

    const sent: number[] = [];

    for (const reminder of reminders) {
        try {
            await bot.api.sendMessageToUser(
                reminder.user_id,
                `🔔 Напоминание!\n\n` +
                    `Скоро состоится мероприятие, на которое вы записаны:\n\n` +
                    `📌 ${reminder.event_title}\n` +
                    `📅 ${formatDate(reminder.event_date)}`,
            );
            sent.push(reminder.registration_id);
        } catch (error) {
            console.error(`Failed to send reminder to user ${reminder.user_id}:`, error);
        }
    }

    if (sent.length === 0) return;

    try {
        await api.reminders.markSent(sent);
    } catch (error) {
        console.error("Failed to mark reminders as sent:", error);
    }
}

export function initReminders(bot: Bot<AppContext>) {
    // Каждый день в 9:00
    cron.schedule("0 9 * * *", () => sendReminders(bot));
}
