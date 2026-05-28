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

// Отправка напоминаний определённого типа
async function sendReminders(bot: Bot<AppContext>, reminderType: "day_before" | "hour_before") {
    let reminders: Reminder[];
    try {
        const allReminders = await api.reminders.getPending();
        // Фильтруем по типу (если API поддерживает фильтрацию)
        reminders = allReminders.filter(r => {
            if (reminderType === "day_before") {
                // Проверяем, что до мероприятия осталось примерно 24 часа
                const eventDate = new Date(r.event_date * 1000);
                const now = new Date();
                const hoursLeft = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);
                return hoursLeft <= 26 && hoursLeft >= 22;
            } else {
                // Проверяем, что до мероприятия осталось примерно 1 час
                const eventDate = new Date(r.event_date * 1000);
                const now = new Date();
                const hoursLeft = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);
                return hoursLeft <= 1.5 && hoursLeft >= 0.5;
            }
        });
    } catch (error) {
        console.error(`Failed to fetch pending reminders (${reminderType}):`, error);
        return;
    }

    if (reminders.length === 0) return;

    const sent: number[] = [];

    for (const reminder of reminders) {
        const eventDate = new Date(reminder.event_date * 1000);
        const now = new Date();
        
        // Проверяем, что мероприятие ещё не прошло
        if (eventDate < now) continue;
        
        const timeLeftMessage = reminderType === "day_before" 
            ? "🎯 Мероприятие состоится ЗАВТРА!" 
            : `⏰ Мероприятие состоится СЕГОДНЯ в ${formatDate(reminder.event_date)}!`;
        
        try {
            // Проверяем, включены ли у пользователя уведомления
            const notificationsEnabled = await api.user.getNotificationsEnabled(reminder.user_id);
            if (!notificationsEnabled) {
                console.log(`User ${reminder.user_id} has notifications disabled, skipping`);
                continue;
            }
            
            await bot.api.sendMessageToUser(
                reminder.user_id,
                `🔔 <b>Напоминание о мероприятии!</b>\n\n` +
                    `${timeLeftMessage}\n\n` +
                    `📌 <b>${reminder.event_title}</b>\n\n` +
                    `Не пропустите! Подробности можно посмотреть в боте: /menu`,
                { parse_mode: "HTML" }
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

// Функция отправки напоминаний за день
async function sendDayBeforeReminders(bot: Bot<AppContext>) {
    await sendReminders(bot, "day_before");
}

// Функция отправки напоминаний за час
async function sendHourBeforeReminders(bot: Bot<AppContext>) {
    await sendReminders(bot, "hour_before");
}

export function initReminders(bot: Bot<AppContext>) {
    // Каждый день в 10:00 - напоминания за день
    cron.schedule("0 10 * * *", () => sendDayBeforeReminders(bot));
    
    // Каждый час в 00 минут - напоминания за час
    cron.schedule("0 * * * *", () => sendHourBeforeReminders(bot));
    
    // Также проверяем каждые 30 минут для более точных напоминаний за час
    cron.schedule("*/30 * * * *", () => sendHourBeforeReminders(bot));
    
    console.log("✅ Reminders initialized: day-before at 10:00, hour-before every hour");
}