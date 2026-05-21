import { AppContext } from "@/context";

export const commands = [
    {
        command: "start",
        description: "Начать регистрацию в боте",
        requiredRoles: ["applicant", "organizer", "admin"],
    }, // TODO удалить после тестов
    {
        command: "events",
        description: "Показать список ближайших мероприятий",
        requiredRoles: ["applicant"],
    },
    {
        command: "my_events",
        description: "Показать мероприятия, на которые вы записаны",
        requiredRoles: ["applicant"],
    },
    {
        command: "help",
        description: "Показать список доступных команд",
        requiredRoles: ["applicant", "organizer", "admin"],
    },
    {
        command: "organizer_requests",
        description: "Показать список заявок на статус организатора",
        requiredRoles: ["admin"],
    },
];

export function helpCommand(ctx: AppContext) {
    if (!ctx.user) return;
    const userRole = ctx.user.role;
    const availableCommands = commands.filter((cmd) => userRole && cmd.requiredRoles.includes(userRole));
    const helpText = availableCommands.map((cmd) => `/${cmd.command} - ${cmd.description}`).join("\n");
    return ctx.reply(`Доступные команды:\n${helpText}`);
}
