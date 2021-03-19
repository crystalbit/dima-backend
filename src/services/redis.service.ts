import * as redis from 'promise-redis';
import Timeout = NodeJS.Timeout;

const client = redis().createClient();

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

export class RedisService {
  public static async redisMakeGamePair(user1: number, user2: number) {
    await client.hset(USERS_GAME_PAIRS_MAP_KEY, user1.toString(), user2.toString());
    await client.hset(USERS_GAME_PAIRS_MAP_KEY, user2.toString(), user1.toString());
  }

  public static async redisEndGame(userId: number) {
    const pairedUser = await client.hget(USERS_GAME_PAIRS_MAP_KEY, userId.toString());
    await client.hdel(USERS_GAME_PAIRS_MAP_KEY, userId.toString());
    if (pairedUser) {
      await client.hdel(USERS_GAME_PAIRS_MAP_KEY, pairedUser);
    }
  };

  public static async redisGetPair(userId: number): Promise<string | null> {
    return client.hget(USERS_GAME_PAIRS_MAP_KEY, userId.toString());
  };

  public static async redisSetInQueue(userId: number): Promise<boolean> {
    if (await this.redisIsUserWaiting(userId)) {
      console.log(`Игрок ${userId} уже в очереди, размер очереди: ${await this.redisGetQueueSize()}`);
      return false;
    }
    await client.rpush(USERS_QUEUE_KEY, userId.toString());
    await client.hset(USERS_MAP_KEY, userId.toString(), (+new Date()).toString());
    timersToDelete.set(+userId, setTimeout(() => {
      client.hdel(USERS_MAP_KEY, userId.toString());
      // TODO catch, then, socket event
      console.log('deleted', userId);
    }, MS_WAIT_IN_QUEUE));
    console.log(`Игрок ${userId} встал в ожидание, размер очереди: ${await this.redisGetQueueSize()}`);
    return true;
  };

  public static async redisGetQueueSize(): Promise<number> {
    return client.llen(USERS_QUEUE_KEY);
  };

  public static async redisPopUser(): Promise<string | null> {
    let valid = false;
    let userId: string | null = null;
    while (!valid) {
      userId = await client.lpop(USERS_QUEUE_KEY);
      if (userId !== null) {
        const time = await client.hget(USERS_MAP_KEY, userId);
        if (!time || +new Date() - time > MS_WAIT_IN_QUEUE) {
          // почему-то не удалили, мб перезапуск - берём дальше
          valid = false;
        } else {
          valid = true;
        }
        await client.hdel(USERS_MAP_KEY, userId);
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
  public static async redisIsUserWaiting(userId: number): Promise<{
    start: number;
    now: number;
  } | null> {
    const time = await client.hget(USERS_MAP_KEY, userId.toString());
    if (time !== null && +new Date() - time <= MS_WAIT_IN_QUEUE) {
      return {
        start: time,
        now: +new Date(),
      };
    }
    return null;
  };
}
