import { io } from 'socket.io-client';

// Singleton socket — connects lazily
export const socket = io({ autoConnect: false, transports: ['websocket'] });
