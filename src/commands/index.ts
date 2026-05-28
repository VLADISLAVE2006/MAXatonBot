// src/commands/index.ts
import { type AppContext } from "@/context";
import { handleMenuCallback } from "./menu";
import { handleHubEventsCallback } from "./events";
import { handleHubNotificationsCallback } from "./notifications";
import { handleHubMyEventsCallback } from "./my_events";

export type CommandCallbackHandler = (ctx: AppContext) => Promise<boolean>;

const commandCallbackHandlers: CommandCallbackHandler[] = [
    handleMenuCallback,
    handleHubEventsCallback,
    handleHubNotificationsCallback,
    handleHubMyEventsCallback,
];

export function collectCommandCallbackHandlers(): CommandCallbackHandler[] {
    return commandCallbackHandlers;
}