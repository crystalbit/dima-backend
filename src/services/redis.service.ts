import { createClient, RedisClient } from 'async-redis';
import Timeout = NodeJS.Timeout;

/**
 * Итак, у нас есть очередь ожидания соперника
 * и список ожидающих
 *
 * пользователи в них соответствуют
 */
const USERS_QUEUE_KEY = 'users_queue';
const USERS_MAP_KEY = 'users_map'; // map userId to time signed
const USERS_GAME_PAIRS_MAP_KEY = 'game_pairs_map';

const MS_WAIT_IN_QUEUE = 60 * 1000;

const timersToDelete = new Map<number, Timeout>();
//
// export const test = async () => {
//   await client.hset('eee', 'eee', '222');
//   console.log(await client.hget('eee', 'eee'));
// }

export class RedisService {
  private client: RedisClient;

  constructor() {
    this.client = createClient();
  }

  public async test() {
    await this.client.hset('eee', 'eee', '222');
    console.log(await this.client.hget('eee', 'eee'));
  }

  public async redisMakeGamePair(user1: number, user2: number) {
    await this.client.hset(USERS_GAME_PAIRS_MAP_KEY, user1.toString(), user2.toString());
    await this.client.hset(USERS_GAME_PAIRS_MAP_KEY, user2.toString(), user1.toString());
  }

  public async redisEndGame(userId: number) {
    const pairedUser = await this.client.hget(USERS_GAME_PAIRS_MAP_KEY, userId.toString());
    await this.client.hdel(USERS_GAME_PAIRS_MAP_KEY, userId.toString());
    if (pairedUser) {
      await this.client.hdel(USERS_GAME_PAIRS_MAP_KEY, pairedUser);
    }
  };

  public async redisGetPair(userId: number): Promise<string | null> {
    return this.client.hget(
      USERS_GAME_PAIRS_MAP_KEY,
      userId.toString()
    );
  };

  public async redisSetInQueue(userId: number): Promise<boolean> {
    if (await this.redisIsUserWaiting(userId)) {
      console.log(`Игрок ${userId} уже в очереди, размер очереди: ${await this.redisGetQueueSize()}`);
      return false;
    }
    await this.client.rpush(USERS_QUEUE_KEY, userId.toString());
    await this.client.hset(USERS_MAP_KEY, userId.toString(), (+new Date()).toString());
    timersToDelete.set(+userId, setTimeout(async () => {
      await this.client.hdel(USERS_MAP_KEY, userId.toString());
      console.log('deleted', userId);
    }, MS_WAIT_IN_QUEUE));
    console.log(`Игрок ${userId} встал в ожидание, размер очереди: ${await this.redisGetQueueSize()}`);
    return true;
  };

  public async redisGetQueueSize(): Promise<number> {
    return this.client.llen(USERS_QUEUE_KEY);
  }

  public async redisPopUser(): Promise<string | null> {
    let valid = false;
    let userId: string | null = null;
    while (!valid) {
      userId = await this.client.lpop(USERS_QUEUE_KEY);
      if (userId !== null) {
        const time = await this.client.hget(USERS_MAP_KEY, userId);
        if (!time || +new Date() - +time > MS_WAIT_IN_QUEUE) {
          // почему-то не удалили, мб перезапуск - берём дальше
          valid = false;
        } else {
          valid = true;
        }
        await this.client.hdel(USERS_MAP_KEY, userId);
        if (timersToDelete.has(+userId)) {
          clearTimeout(+(timersToDelete.get(+userId) || 0));
          timersToDelete.delete(+userId);
        }
      } else {
        valid = true; // null это валид, так как годится как ответ
      }
    }

    return userId;
  };

  /**
   * Находится ли юзер в очереди
   */
  public async redisIsUserWaiting(userId: number): Promise<{
    start: number;
    now: number;
  } | null> {
    const time = await this.client.hget(USERS_MAP_KEY, userId.toString());
    if (time !== null && +new Date() - +time <= MS_WAIT_IN_QUEUE) {
      return {
        start: +time,
        now: +new Date(),
      };
    }
    return null;
  };
}
