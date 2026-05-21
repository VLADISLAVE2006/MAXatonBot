import type { AppContext } from "@/context";
import { Keyboard } from "@maxhub/max-bot-api";

const requests = [
    { id: 1, name: "Влад Иванов" },
    { id: 2, name: "Анна Петрова" },
    { id: 3, name: "Сергей Сидоров" },
    { id: 4, name: "Елена Кузнецова" },
    { id: 5, name: "Дмитрий Смирнов" },
    { id: 6, name: "Ольга Попова" },
    { id: 7, name: "Алексей Васильев" },
]; // TODO запрос на бэкенд

export async function organizerRequestsCommand(ctx: AppContext) {
    const userId = ctx.user?.user_id;
    if (!userId) return;

    try {
        const rows: any[] = [];
        for (let i = 0; i < requests.length; i += 3) {
            const slice = requests
                .slice(i, i + 3)
                .map((req, j) => Keyboard.button.callback(`${i + j + 1}`, `organizer_request:${req.id}`));
            rows.push(slice);
        }

        await ctx.reply(
            `Заявки на статус организатора:\n${requests.map((req, i) => `${i + 1}. ${req.name}`).join("\n")}`,
            {
                attachments: [Keyboard.inlineKeyboard(rows)],
            },
        );
    } catch {}
}

export async function handleOrganizerRequestCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (!payload?.startsWith("organizer_request:")) return false;

    const requestId = Number(payload.split(":")[1]);
    if (!Number.isFinite(requestId)) return false;

    const request = requests.find((item) => item.id === requestId);
    if (!request) {
        await ctx.reply("Заявка не найдена.");
        return true;
    }

    await ctx.reply([`Заявка #${request.id}`, request.name].join("\n"));
    return true;
}
