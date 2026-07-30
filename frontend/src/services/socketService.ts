import { io, Socket } from "socket.io-client";
import { WS_URL } from "@/config/api";
import authService from "./authService";

type SocketCallback = (...args: any[]) => void;

class SocketService {
  private socket: Socket | null = null;
  private notificationSocket: Socket | null = null;

  // Kết nối socket
  connect(): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    const token = authService.getToken();

    this.socket = io(WS_URL, {
      auth: {
        token,
      },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    this.socket.on("connect", () => {
      console.log("Socket connected:", this.socket?.id);
    });

    this.socket.on("disconnect", () => {
      console.log("Socket disconnected");
    });

    this.socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });

    return this.socket;
  }

  // Kết nối notification socket với namespace
  connectNotification(): Socket {
    if (this.notificationSocket?.connected) {
      console.log("📌 Notification socket đã kết nối");
      return this.notificationSocket;
    }

    const token = authService.getToken();
    console.log(
      "🔌 Đang kết nối notification socket với token:",
      token?.substring(0, 20) + "...",
    );

    this.notificationSocket = io(`${WS_URL}/thong_bao`, {
      auth: {
        token,
      },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    this.notificationSocket.on("connect", () => {
      console.log(
        "✅ Notification socket connected:",
        this.notificationSocket?.id,
      );
    });

    this.notificationSocket.on("disconnect", () => {
      console.log("⚠️ Notification socket disconnected - sẽ auto reconnect");
    });

    this.notificationSocket.on("connect_error", (error) => {
      console.error("❌ Notification socket connection error:", error);
    });

    // 🔍 Debug: Listen to ALL events
    this.notificationSocket.onAny((eventName, ...args) => {
      console.log(`🔔 [Socket Event] ${eventName}:`, args);
    });

    return this.notificationSocket;
  }

  // Không disconnect notification socket, chỉ off listeners
  offNotificationListeners(): void {
    if (this.notificationSocket) {
      this.notificationSocket.off("new_thong_bao");
      console.log("🔕 Đã turn off notification listeners");
    }
  }

  // Ngắt kết nối
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (this.notificationSocket) {
      this.notificationSocket.disconnect();
      this.notificationSocket = null;
    }
  }

  // Lắng nghe sự kiện (default socket)
  on(event: string, callback: SocketCallback): void {
    this.socket?.on(event, callback);
  }

  // Lắng nghe sự kiện notification
  onNotification(event: string, callback: SocketCallback): void {
    this.notificationSocket?.on(event, callback);
  }

  // Join room trong notification socket (với retry nếu chưa connected)
  joinNotificationRoom(roomId: string | number): void {
    console.log("🚪 Đang join room:", roomId);

    const attemptJoin = () => {
      if (this.notificationSocket?.connected) {
        this.notificationSocket.emit("join_room", { room: roomId.toString() });
        console.log(`✅ Emit join_room với room: ${roomId}`);
      } else {
        // Nếu chưa connected, chờ 500ms rồi retry
        console.log("⏳ Socket chưa connected, sẽ retry sau 500ms...");
        setTimeout(attemptJoin, 500);
      }
    };

    attemptJoin();
  }

  // Xóa listener
  off(event: string, callback?: SocketCallback): void {
    this.socket?.off(event, callback);
  }

  // Xóa notification listener
  offNotification(event: string, callback?: SocketCallback): void {
    this.notificationSocket?.off(event, callback);
  }

  // Gửi sự kiện
  emit(event: string, data?: any): void {
    this.socket?.emit(event, data);
  }

  // Lấy socket instance
  getSocket(): Socket | null {
    return this.socket;
  }

  // Lấy notification socket instance
  getNotificationSocket(): Socket | null {
    return this.notificationSocket;
  }

  // Check connection status
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // Check notification connection status
  isNotificationConnected(): boolean {
    return this.notificationSocket?.connected ?? false;
  }
}

export default new SocketService();
