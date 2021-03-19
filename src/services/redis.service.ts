import { createClient } from 'redis';
import { promisify } from 'util';
import Timeout = NodeJS.Timeout;

const client = createClient();

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
    await promisify(() => client.hset(USERS_GAME_PAIRS_MAP_KEY, user1.toString(), user2.toString()));
    await promisify(() => client.hset(USERS_GAME_PAIRS_MAP_KEY, user2.toString(), user1.toString()));
  }

  public static async redisEndGame(userId: number) {
    const pairedUser = await promisify(() => client.hget(USERS_GAME_PAIRS_MAP_KEY, userId.toString()));
    await client.hdel(USERS_GAME_PAIRS_MAP_KEY, userId.toString());
    if (pairedUser) {
      await client.hdel(USERS_GAME_PAIRS_MAP_KEY, pairedUser);
    }
  };

  public static async redisGetPair(userId: number): Promise<string | null> {
    return new Promise((resolve) => {
      client.hget(
        USERS_GAME_PAIRS_MAP_KEY,
        userId.toString(),
        (err, res) => resolve(err ? null : res)
      );
    });
  };

  public static async redisSetInQueue(userId: number): Promise<boolean> {
    if (await this.redisIsUserWaiting(userId)) {
      console.log(`Игрок ${userId} уже в очереди, размер очереди: ${await this.redisGetQueueSize()}`);
      return false;
    }
    await promisify(() => client.rpush(USERS_QUEUE_KEY, userId.toString()));
    await promisify(() => client.hset(USERS_MAP_KEY, userId.toString(), (+new Date()).toString()));
    timersToDelete.set(+userId, setTimeout(() => {
      promisify(() => client.hdel(USERS_MAP_KEY, userId.toString()));
      // TODO catch, then, socket event
      console.log('deleted', userId);
    }, MS_WAIT_IN_QUEUE));
    console.log(`Игрок ${userId} встал в ожидание, размер очереди: ${await this.redisGetQueueSize()}`);
    return true;
  };

  public static async redisGetQueueSize(): Promise<number> {
    return new Promise((resolve) => {
      client.llen(USERS_QUEUE_KEY, (_err, result) => resolve(result));
    });
  }

  public static async redisPopUser(): Promise<string | null> {
    let valid = false;
    let userId: string | null = null;
    while (!valid) {
      userId = await new Promise((resolve) => {
        client.lpop(USERS_QUEUE_KEY, (_err, result) => resolve(result));
      });
      if (userId !== null) {
        const time = await new Promise<string>((resolve) => {
          client.hget(USERS_MAP_KEY, userId, (_err, result) => resolve(result));
        });
        if (!time || +new Date() - +time > MS_WAIT_IN_QUEUE) {
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
    const time = await new Promise<string>((resolve) => {
      client.hget(USERS_MAP_KEY, userId.toString(), (_err, result) => resolve(result));
    });
    if (time !== null && +new Date() - +time <= MS_WAIT_IN_QUEUE) {
      return {
        start: +time,
        now: +new Date(),
      };
    }
    return null;
  };
}
