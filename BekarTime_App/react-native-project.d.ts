declare module 'react-native-reconnecting-websocket' {
  import { WebSocket as RNWebSocket } from 'react-native';

  export default class ReconnectingWebSocket extends RNWebSocket {
    reconnectAttempts: number;
    reconnectInterval: number;
    constructor(url: string, protocols?: string | string[], options?: any);
    reconnect(): void;
    close(code?: number, reason?: string): void;
  }
}