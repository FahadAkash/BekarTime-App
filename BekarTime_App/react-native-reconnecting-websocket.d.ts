declare module 'react-native-reconnecting-websocket' {
  class ReconnectingWebSocket {
    constructor(url: string, protocols?: string | string[], options?: {
      maxReconnectionDelay?: number;
      minReconnectionDelay?: number;
      reconnectionDelayGrowFactor?: number;
      connectionTimeout?: number;
      maxRetries?: number;
      debug?: boolean;
    });

    onopen: (event: any) => void;
    onmessage: (event: any) => void;
    onerror: (event: any) => void;
    onclose: (event: any) => void;
    
    readyState: number;
    url: string;
    protocols: string | string[];
    
    send(data: string | ArrayBuffer | Blob): void;
    close(code?: number, reason?: string): void;
    reconnect(code?: number, reason?: string): void;
  }

  export = ReconnectingWebSocket;
}