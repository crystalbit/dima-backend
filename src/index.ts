import { RedisService } from './services/redis.service';
import { WebsocketService } from './services/websocket.service';
import { QueueService } from './services/queue.service';

export const redis = new RedisService();
export const sockets = new WebsocketService();
export const queues = new QueueService(redis, sockets);
