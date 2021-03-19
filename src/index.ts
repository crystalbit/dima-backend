import { RedisService } from './services/redis.service';
import { WebsocketService } from "./services/websocket.service";

export const redis = new RedisService();
export const sockets = new WebsocketService();
