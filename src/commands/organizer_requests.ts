import { api } from "@/api";
import { getToken, type AppContext } from "@/context";
import { Keyboard } from "@maxhub/max-bot-api";

export async function organizerRequestsCommand(ctx: AppContext) {
    const userId = ctx.user?.user_id;
    if (!userId) return;

    const token = getToken(userId);

    try {
        const requests = await api.admin.getOrganizerRequests(token!);
        const rows: any[] = [];
        for (let i = 0; i < requests.length; i += 3) {
            const slice = requests
                .slice(i, i + 3)
                .map((req, j) => Keyboard.button.callback(`${i + j + 1}`, `organizer_request:${req.id}`));
            rows.push(slice);
        }

        await ctx.reply(
            `Заявки на статус организатора:\n${requests.map((req, i) => `${i + 1}. ${req.full_name}`).join("\n")}`,
            {
                attachments: [Keyboard.inlineKeyboard(rows)],
            },
        );
    } catch {}
}

export async function handleOrganizerRequestCallback(ctx: AppContext): Promise<boolean> {
    const payload = ctx.callback?.payload;
    if (!payload?.startsWith("organizer_request:")) return false;

    const userId = ctx.user?.user_id;
    if (!userId) return false;

    const requestId = Number(payload.split(":")[1]);
    if (!Number.isFinite(requestId)) return false;

    const token = getToken(userId);

    try {
        const request = await api.admin.getOrganizerRequestById(requestId, token!);
        const file = await ctx.api.uploadFile({
            source: request.file_url,
        });
        await ctx.reply(
            [
                `Заявка #${request.id}`,
                `Имя: ${request.full_name}`,
                `Дата: ${new Date(request.created_at).toLocaleString("ru")}`,
            ].join("\n"),
            {
                attachments: [
                    {
                        type: "file",
                        payload: file,
                    },
                ],
            },
        );
    } catch {
        await ctx.reply("Заявка не найдена");
    }

    return true;
}
