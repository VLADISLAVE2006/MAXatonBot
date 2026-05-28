import cron from "node-cron";
import { api } from "@/api";
import { formatDate } from "@/utils/helpers";
import type { Bot } from "@maxhub/max-bot-api";
import type { AppContext } from "@/context";

interface Reminder {
    registration_id: number;
    user_id: number;
    event_id: number;
    event_title: string;
    event_date: number;
    reminder_type: "day_before" | "hour_before";
}

async function sendReminders(bot: Bot<AppContext>, reminderType: "day_before" | "hour_before") {
    let allReminders: Reminder[];
    try {
        allReminders = await api.reminders.getPending();
    } catch (error) {
        console.error(`Failed to fetch pending reminders (${reminderType}):`, error);
        return;
    }

    if (allReminders.length === 0) return;

    const reminders = allReminders.filter(r => r.reminder_type === reminderType);

    if (reminders.length === 0) return;

    const sent: number[] = [];

    for (const reminder of reminders) {
        const eventDate = new Date(reminder.event_date * 1000);
        const now = new Date();
        
        if (eventDate < now) continue;
        
        const timeLeftMessage = reminderType === "day_before" 
            ? "🎯 Мероприятие состоится ЗАВТРА!" 
            : `⏰ Мероприятие состоится СЕГОДНЯ в ${formatDate(reminder.event_date)}!`;
        
        try {
            const notificationsEnabled = await api.user.getNotificationsEnabled(reminder.user_id);
            if (!notificationsEnabled) {
                continue;
            }
            
            await bot.api.sendMessageToUser(
                reminder.user_id,
                `🔔 Напоминание о мероприятии!\n\n${timeLeftMessage}\n\n📌 ${reminder.event_title}\n\nНе пропустите! Подробности можно посмотреть в боте: /menu`
            );
            sent.push(reminder.registration_id);
        } catch (error) {
            console.error(`Failed to send reminder to user ${reminder.user_id}:`, error);
        }
    }

    if (sent.length === 0) return;

    try {
        await api.reminders.markSent(sent);
        console.log(`Marked ${sent.length} reminders as sent (${reminderType})`);
    } catch (error) {
        console.error("Failed to mark reminders as sent:", error);
    }
}

async function sendDayBeforeReminders(bot: Bot<AppContext>) {
    await sendReminders(bot, "day_before");
}

async function sendHourBeforeReminders(bot: Bot<AppContext>) {
    await sendReminders(bot, "hour_before");
}

export function initReminders(bot: Bot<AppContext>) {
    cron.schedule("0 10 * * *", () => sendDayBeforeReminders(bot));
    cron.schedule("0 * * * *", () => sendHourBeforeReminders(bot));
    cron.schedule("*/30 * * * *", () => sendHourBeforeReminders(bot));
    
    console.log("✅ Reminders initialized: day-before at 10:00, hour-before every hour");
}