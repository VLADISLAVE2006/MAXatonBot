import { api } from "@/api";
import { type AppContext, getToken } from "@/context";

export async function handleRegisterDeeplink(ctx: AppContext): Promise<boolean> {
    const payload = ctx.startPayload;
    if (!payload?.startsWith("register_")) return false;

    const eventId = parseInt(payload.replace("register_", ""), 10);
    if (isNaN(eventId)) return false;

    const token = getToken(ctx.user!.user_id) ?? "";
    if (!token) return false;

    try {
        const result = await api.events.registerEvent(eventId, token);
        await ctx.reply(`✅ Вы успешно записались на мероприятие!\n\n🎫 Код записи: ${result.code}`);
    } catch {
        await ctx.reply("Не удалось записаться. Возможно, вы уже записаны или нет свободных мест.");
    }
    return true;
}