import { RedisService } from "./redis.service";
import { WebsocketService } from "./websocket.service";

export class QueueService {
  public constructor(
    private readonly redis: RedisService,
    private readonly ws: WebsocketService,
  ) { }

  public async uqMakePair(user1: number, user2: number) {
    await this.redis.redisMakeGamePair(user1, user2);
    await this.ws.sendWerePaired(user1, user2);
  };

  public stop() {
    this.ws.stopService();
    this.redis.stopService();
  }
}
