import { ShardingManager } from "discord.js";
import AutoPoster from "topgg-autoposter";
import { getLogger } from "./clients/logger";
export const manager = new ShardingManager("./bot.ts", {
  token: process.env.DISCORD_TOKEN,
});

const logger = getLogger("ShardManager");

const ap = AutoPoster(process.env.TOPGG_KEY, manager);

ap.on("posted", () => {
  logger.info("Posted stats to Top.gg!");
});

manager.on("shardCreate", (shard) => logger.info(`Launching shard ${shard.id}`));

manager
  .spawn({ amount: 'auto' })
  .then((shards) => {
    shards.forEach((shard) => {
      shard.on("message", (message) => {
        logger.debug(
          `Shard[${shard.id}] : ${message._eval} : ${message._result}`
        );
      });
    });
  })
  .catch(console.error);
