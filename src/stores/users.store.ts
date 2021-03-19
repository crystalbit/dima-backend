import { Socket } from 'socket.io';

const UserToSocket = new Map<number, Socket>();

export const setSocket = (user: number, socket: Socket) => {
  UserToSocket.set(user, socket);
};

export const clearSocket = (user: number) => {
  UserToSocket.delete(user);
};

export const getSocket = (user: number): Socket => {
  return UserToSocket.get(user);
};
