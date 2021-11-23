import { runEvent } from "..";
import { GLOBAL_COOLDOWN } from "../../../clients/cache";
import { getCurrentTime } from "../../../utils";

export async function run(e:runEvent) {

  GLOBAL_COOLDOWN.set(e.message.guild.id, getCurrentTime());

  const ping = Date.now() - e.message.createdTimestamp;
  await e.message.reply(`Pong! ${ping} ms.`);
}

export const names = ["ping"];
