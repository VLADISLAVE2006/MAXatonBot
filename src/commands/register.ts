import { api } from "@/api";
import { type AppContext, getToken } from "@/context";
import { toHubNew } from "@/commands/menu";
import { Keyboard } from "@maxhub/max-bot-api";
import { formatDate } from "@/utils/helpers";

export async function handleAttendDeeplink(ctx: AppContext): Promise<boolean> {
    const payload = ctx.startPayload;
    if (!payload?.startsWith("attend_")) return false;

    const eventId = parseInt(payload.replace("attend_", ""), 10);
    if (isNaN(eventId)) return false;

    const token = getToken(ctx.user!.user_id) ?? "";
    if (!token) {
        await ctx.reply("Для отметки посещаемости необходимо зарегистрироваться в боте.");
        return true;
    }

    try {
        const registrations = await api.events.getMyRegistrations(token);
        const reg = registrations.find((r) => r.event_id === eventId);
        if (!reg) {
            await ctx.reply("Вы не записаны на это мероприятие.");
            return true;
        }
        await api.events.markAttendance(eventId, reg.code, token);
        await ctx.reply(`✅ Посещаемость подтверждена!\n\n📌 ${reg.event_title}\n📅 ${formatDate(reg.event_date)}`);
    } catch {
        await ctx.reply("Не удалось отметить посещаемость. Возможно, мероприятие ещё не началось.");
    }
    return true;
}

export async function handleRegisterDeeplink(ctx: AppContext): Promise<boolean> {
    const payload = ctx.startPayload;
    if (!payload?.startsWith("register_")) return false;

    const eventId = parseInt(payload.replace("register_", ""), 10);
    if (isNaN(eventId)) return false;

    const token = getToken(ctx.user!.user_id) ?? "";
    if (!token) return false;

    try {
        const result = await api.events.registerEvent(eventId, token);
        await ctx.reply(`✅ Вы успешно записались на мероприятие!\n\n🎫 Код записи: ${result.code}`, {
            attachments: [Keyboard.inlineKeyboard([[toHubNew]])],
        });
    } catch {
        await ctx.reply("Не удалось записаться. Возможно, вы уже записаны или нет свободных мест.");
    }
    return true;
}