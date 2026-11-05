"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { API_BASE_URL } from "@/lib/api";

type RealtimeEventHandler = (data: any) => void;

class RealtimeClient {
  private static instance: RealtimeClient;
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<RealtimeEventHandler>> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private isConnecting: boolean = false;
  private connectionSubscribers: Set<(connected: boolean) => void> = new Set();
  public isConnected: boolean = false;

  private constructor() {
    if (typeof window !== "undefined") {
      this.connect();
    }
  }

  public static getInstance(): RealtimeClient {
    if (!RealtimeClient.instance) {
      RealtimeClient.instance = new RealtimeClient();
    }
    return RealtimeClient.instance;
  }

  public getWsUrl(): string {
    const customWs = process.env.NEXT_PUBLIC_WS_URL;
    if (customWs) {
      return customWs.endsWith("/ws") ? customWs : `${customWs}/ws`;
    }

    // Tự động suy ra WebSocket URL từ API_BASE_URL
    const origin = API_BASE_URL.replace(/^http(s?):\/\//i, "ws$1://").replace(/\/api\/v1\/?$/i, "");
    return `${origin}/ws`;
  }

  public connect(): void {
    if (typeof window === "undefined" || this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    const url = this.getWsUrl();

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.isConnected = true;
        this.notifyConnectionChange(true);
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          if (event.data === "pong") return;
          const message = JSON.parse(event.data);
          if (message && message.event) {
            this.emit(message.event, message.data);
            this.emit("*", message);
          }
        } catch {
          // Bỏ qua message không phải JSON
        }
      };

      this.ws.onclose = () => {
        this.cleanup();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.cleanup();
        this.scheduleReconnect();
      };
    } catch {
      this.cleanup();
      this.scheduleReconnect();
    }
  }

  private cleanup(): void {
    this.isConnecting = false;
    this.isConnected = false;
    this.notifyConnectionChange(false);
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.ws = null;
  }

  private startHeartbeat(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send("ping");
      }
    }, 15000);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  public on(event: string, handler: RealtimeEventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  private emit(event: string, data: any): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((h) => {
        try {
          h(data);
        } catch (err) {
          console.error(`[Realtime] Handler error for event '${event}':`, err);
        }
      });
    }
  }

  public subscribeConnection(callback: (connected: boolean) => void): () => void {
    this.connectionSubscribers.add(callback);
    callback(this.isConnected);
    return () => {
      this.connectionSubscribers.delete(callback);
    };
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionSubscribers.forEach((cb) => cb(connected));
  }
}

/** Hook theo dõi trạng thái kết nối WebSocket thời gian thực */
export function useRealtimeConnection(): boolean {
  const [connected, setConnected] = useState<boolean>(false);

  useEffect(() => {
    const client = RealtimeClient.getInstance();
    const unsub = client.subscribeConnection(setConnected);
    return unsub;
  }, []);

  return connected;
}

/** Hook lắng nghe sự kiện cụ thể từ Backend WebSocket */
export function useRealtimeEvent<T = any>(
  event: string,
  callback: (data: T) => void
): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    const client = RealtimeClient.getInstance();
    const unsubscribe = client.on(event, (data) => {
      savedCallback.current(data);
    });
    return unsubscribe;
  }, [event]);
}

