import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import socketService from "@/services/socketService";
import useNotificationStore from "@/stores/useNotificationStore";
import useAuthStore from "@/stores/useAuthStore";
import api from "@/services/api";

// Hook để lấy danh sách thông báo từ API
export const useNotifications = () => {
  const user = useAuthStore((state) => state.user);

  return useQuery({
    queryKey: ["notifications", user?.id_acc],
    queryFn: async () => {
      if (!user?.id_acc) return [];
      const response = await api.get("/api/thong_bao", {
        params: {
          id_acc_list: user.id_acc,
        },
      });
      return response.data;
    },
    enabled: !!user?.id_acc,
    refetchInterval: 60000, // Refetch mỗi 1 phút
  });
};

// Hook để lắng nghe thông báo realtime qua socket
export const useRealtimeNotifications = () => {
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification,
  );
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    // Kiểm tra user có id_acc hoặc id
    const userId = user?.id_acc || user?.id;

    if (!userId) {
      console.log(
        "❌ User không có id_acc hoặc id, bỏ qua setup socket. User:",
        user,
      );
      return;
    }

    console.log("🎯 Setup useRealtimeNotifications cho user:", userId);

    // Kết nối notification socket
    const notificationSocket = socketService.connectNotification();

    // ✅ SETUP LISTENER TRƯỚC - để không bỏ lỡ thông báo
    const handleNewNotification = (data: any) => {
      console.log("📢 [REALTIME] Nhận thông báo MỚI từ socket:", data);
      console.log(
        "📢 [REALTIME] Store hiện tại có:",
        useNotificationStore.getState().notifications.length,
        "notifications",
      );

      // Lưu timestamp thông báo mới nhất
      localStorage.setItem(
        "last_realtime_notif_time",
        new Date().toISOString(),
      );

      // Thêm vào store với ID từ backend
      addNotification({
        id: data.id_tb,
        message: data.noi_dung || data.tieu_de,
        type: "info",
        read: false,
        timestamp: new Date(data.time_update || Date.now()),
        ...data,
      });

      console.log("✅ Đã thêm notification mới vào store");
      console.log(
        "✅ Store sau khi thêm có:",
        useNotificationStore.getState().notifications.length,
        "notifications",
      );

      // Invalidate query để refetch danh sách
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };

    // Register listener NGAY LẬP TỨC
    socketService.onNotification("new_thong_bao", handleNewNotification);

    // Hàm để join room
    const joinRoom = () => {
      if (notificationSocket.connected) {
        console.log(
          "✅ Socket đã connected, join room ngay với userId:",
          userId,
        );
        socketService.joinNotificationRoom(userId);
      }
    };

    // Hàm để fetch notifications mới nhất từ API (optimization)
    const fetchMissedNotifications = async () => {
      try {
        const lastNotifTime = localStorage.getItem("last_realtime_notif_time");
        const timeSinceLastNotif = lastNotifTime
          ? Date.now() - new Date(lastNotifTime).getTime()
          : Infinity;

        console.log(`🔍 Time since last notification: ${timeSinceLastNotif}ms`);

        // Chỉ fetch nếu disconnect > 1 phút hoặc không có record
        if (timeSinceLastNotif > 60000 || !lastNotifTime) {
          console.log(
            "🔄 [RECOVER] Fetching missed notifications từ API (disconnect > 1 min)...",
          );
          const response = await api.get("/api/thong_bao", {
            params: {
              id_acc_list: userId,
            },
          });

          if (response.data && response.data.length > 0) {
            console.log(
              `📥 [RECOVER] Nhận ${response.data.length} thông báo từ API`,
            );
            // Thêm các thông báo vào store với ID từ backend
            response.data.forEach((notif: any) => {
              addNotification({
                id: notif.id_tb,
                message: notif.noi_dung || notif.tieu_de,
                type: "info",
                read: false,
                timestamp: new Date(notif.time_update || Date.now()),
                ...notif,
              });
            });
            // Invalidate query để refetch danh sách
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
          }
          // Update timestamp
          localStorage.setItem(
            "last_realtime_notif_time",
            new Date().toISOString(),
          );
        } else {
          console.log(
            "⏭️  [RECOVER] Bỏ qua fetch (disconnect < 1 min), sẽ dùng refetchInterval",
          );
        }
      } catch (error) {
        console.error("❌ Lỗi khi fetch missed notifications:", error);
      }
    };

    // Join room khi connect
    if (notificationSocket.connected) {
      joinRoom();
    } else {
      console.log("⏳ Socket chưa connected, đợi connect event");
      notificationSocket.once("connect", () => {
        console.log("✅ Socket connect, đang join room...");
        joinRoom();
      });
    }

    // Lắng nghe reconnect event - fetch thông báo từ API (nếu cần)
    notificationSocket.on("connect", () => {
      console.log(
        "🔄 [RECONNECT] Socket reconnected, checking for missed notifications...",
      );
      fetchMissedNotifications();
    });

    console.log("✅ Setup useRealtimeNotifications xong");

    // Cleanup khi unmount - CHỈ OFF LISTENERS, không disconnect socket
    return () => {
      console.log("🧹 Cleanup useRealtimeNotifications - tắt listeners");
      socketService.offNotification("new_thong_bao");
      // ⚠️ KHÔNG gọi disconnect() - giữ socket sống để nhận thông báo ở trang khác
    };
  }, [user?.id_acc, user?.id, addNotification, queryClient]);
};
