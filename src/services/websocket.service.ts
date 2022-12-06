import { createServer, Server } from 'http';
import express = require('express');
import { Server as SocketServer } from 'socket.io';
import { clearSocket, getSocket, setSocket } from "../stores/users.store";
import { RedisService } from "./redis.service";

const redis = new RedisService();

export class WebsocketService {
  private io: SocketServer;
  private httpServer: Server;

  public constructor() {
    const app = express();
    const server = createServer(app);

    this.io = new SocketServer(server, {
      cors: {
        origin: '*',
        methods: ['GET'],
      },
    });

    this.httpServer = server.listen(process.env.WS_PORT ?? 6000, () => {
      console.log('WS Started');
    });

    this.io.on('connect', (socket) => {
      const { userId } = socket.handshake.query;

      setSocket(+userId, socket);

      socket.on('disconnect', async () => {
        const pair = await redis.redisGetPair(+userId);
        clearSocket(+userId);
        await redis.redisEndGame(+userId);
        await this.sendEnemyLeft(+pair);
        console.log('Client disconnected');
      });
    });
  }

  public async sendMessageFrom(fromUser: number, text: string): Promise<boolean> {
    const pair = await redis.redisGetPair(fromUser);
    if (!pair) {
      // TODO error message
      return false;
    }
    const socket = getSocket(+pair);
    if (!socket || text === '') {
      return false;
    }
    socket.emit('text', text);
    return true;
  };

  public async sendWerePaired(user1: number, user2: number) {
    const socket1 = getSocket(user1);
    const socket2 = getSocket(user2);
    socket1?.emit('paired', user2);
    socket2?.emit('paired', user1); // TODO assert
  };

  public async sendEnemyLeft(userId: number) {
    const socket = getSocket(userId);
    socket?.emit('enemy_left');
  };

  public async sendEnemyFinished(userId: number) {
    console.log('enemy finished', userId);
    const pair = await redis.redisGetPair(userId);
    if (!pair) {
      // TODO error message
      return false;
    }
    const socket = getSocket(+pair);
    if (!socket) {
      return false;
    }
    socket.emit('enemy_finished');
    return true;
  };

  public async sendWin(userId: number, combination: any) {
    const socket = getSocket(+userId);
    if (!socket) {
      return false;
    }
    socket.emit('win', combination);
    return true;
  };

  public async sendLose(userId: number, combination: any) {
    const socket = getSocket(+userId);
    if (!socket) {
      return false;
    }
    socket.emit('lose', combination);
    return true;
  };

  public async sendNeutral(userId: number, combination: any) {
    const socket = getSocket(+userId);
    if (!socket) {
      return false;
    }
    socket.emit('neutral', combination);
    return true;
  };

  public stopService() {
    this.httpServer.close();
    redis.stopService();
  }
}
