import { AppContext } from "@/context";

export const commands = [
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
        command: "my_events",
        description: "Показать мероприятия, которые вы создали",
        requiredRoles: ["organizer"],
    },
    {
        command: "help",
        description: "Показать список доступных команд",
        requiredRoles: ["applicant", "organizer", "admin"],
    },
];

export function helpCommand(ctx: AppContext) {
    if (!ctx.user) return;
    const userRole = ctx.user.role;
    const availableCommands = commands.filter((cmd) => userRole && cmd.requiredRoles.includes(userRole));
    const helpText = availableCommands.map((cmd) => `/${cmd.command} - ${cmd.description}`).join("\n");
    return ctx.reply(`Доступные команды:\n${helpText}`);
}
