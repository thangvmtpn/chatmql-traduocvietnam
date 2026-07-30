import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useNotificationStore from "@/stores/useNotificationStore";
import useAuthStore from "@/stores/useAuthStore";
import { getMyNotifications } from "@/services/dashboardService";
import socketService from "@/services/socketService";
import ProposalModal from "@/components/ProposalModal/ProposalModal";
import "./RightSidebar.css";
import "material-symbols";

function RightSidebar() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const currentUserIdRef = useRef<string | number | null>(null); // Track current user để detect user change
  const [showProposalModal, setShowProposalModal] = useState(false);

  const handleOpenSuggestionForm = () => {
    window.dispatchEvent(new Event("open-suggestion-box"));
  };

  // Lấy notifications từ store
  const notifications = useNotificationStore((state) => state.notifications);

  // Format datetime
  const formatDateTime = (date: Date | string) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  // Filter notifications for today only
  const getTodayNotifications = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return notifications.filter((notification) => {
      const notifDate = new Date(notification.timestamp);
      notifDate.setHours(0, 0, 0, 0);
      return notifDate.getTime() === today.getTime();
    });
  };

  const todayNotifications = getTodayNotifications();

  // 🔴 Fetch API notifications on mount ONLY on first load (run once per user)
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        if (!user?.id_acc) {
          currentUserIdRef.current = null;
          return;
        }

        // ⚠️ Nếu user thay đổi → clear old notifications từ localStorage
        if (
          currentUserIdRef.current &&
          currentUserIdRef.current !== user.id_acc
        ) {
          console.log(
            `User changed (${currentUserIdRef.current} → ${user.id_acc}), clearing old notifications`,
          );
          useNotificationStore.getState().clearAll();
        }

        // Track rằng đã fetch cho user này
        if (currentUserIdRef.current === user.id_acc) {
          console.log("⏭️ Đã fetch notifications cho user này rồi, bỏ qua");
          return;
        }

        currentUserIdRef.current = user.id_acc;

        console.log("📥 Fetching notifications from API for first time...");
        const apiNotifications = await getMyNotifications();

        if (apiNotifications && Array.isArray(apiNotifications)) {
          console.log(
            `✅ Fetched ${apiNotifications.length} notifications from API`,
          );

          // Thêm vào store (tránh duplicate)
          apiNotifications.forEach((notif: any) => {
            const { notifications: storeNotifications, addNotification: add } =
              useNotificationStore.getState();

            // Check duplicate by id_tb (unique identifier từ DB)
            const exists = storeNotifications.some(
              (n) => n.id_tb === notif.id_tb,
            );

            if (!exists) {
              console.log(`Adding notification: ${notif.id_tb}`);
              add({
                id: notif.id_tb,
                message: notif.noi_dung || notif.tieu_de,
                title: notif.tieu_de,
                type: "info",
                read: notif.trang_thai === "da_doc",
                timestamp: new Date(notif.ngay_thong_bao),
                ...notif,
              });
            } else {
              console.log(`⏭️ Notification already exists: ${notif.id_tb}`);
            }
          });
        }
      } catch (error) {
        console.error("❌ Error fetching notifications:", error);
      }
    };

    fetchNotifications();
  }, [user?.id_acc]); // Only re-run when user changes

  // 🟠 Connect WebSocket & listen for realtime notifications (run once per user)
  useEffect(() => {
    if (!user?.id_acc) return;

    console.log("🔌 Connecting notification socket...");
    socketService.connectNotification();
    socketService.joinNotificationRoom(user.id_acc);

    // 🟡 Listen for realtime notifications
    const handleNewNotification = (notification: any) => {
      console.log("🔔 Nhận thông báo realtime:", notification);

      if (!notification.id_tb) {
        console.error("❌ Notification không có id_tb:", notification);
        return;
      }

      // Tránh duplicate - check bằng id_tb
      const currentNotifications =
        useNotificationStore.getState().notifications;
      const exists = currentNotifications.some(
        (n) => n.id_tb === notification.id_tb,
      );
      if (!exists) {
        console.log(`➕ Adding realtime notification: ${notification.id_tb}`);
        const { addNotification: add } = useNotificationStore.getState();
        add({
          id: notification.id_tb,
          id_tb: notification.id_tb,
          message: notification.noi_dung,
          title: notification.tieu_de,
          timestamp: new Date(notification.time_update),
          read: false,
          ...notification,
        });
      } else {
        console.log(
          `⏭️ Realtime notification already exists: ${notification.id_tb}`,
        );
      }
    };

    socketService.onNotification("new_thong_bao", handleNewNotification);

    return () => {
      socketService.offNotification("new_thong_bao");
    };
  }, [user?.id_acc]); // Only re-run when user changes

  return (
    <div className="right-sidebar">
      {/* Hướng dẫn sử dụng */}
      <div className="sidebar-section">
        <h3 className="sidebar-section-title">
          <span className="material-symbols-outlined">help</span>
          HƯỚNG DẪN SỬ DỤNG
        </h3>
        <div className="sidebar-items">
          <div className="sidebar-item">
            <span className="material-symbols-outlined">tips_and_updates</span>
            <span>Sử dụng phần mềm</span>
          </div>
          <div
            className="sidebar-item"
            role="button"
            tabIndex={0}
            onClick={() => navigate("/thuat-ngu")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate("/thuat-ngu");
              }
            }}
          >
            <span className="material-symbols-outlined">school</span>
            <span>Các thuật ngữ</span>
          </div>
          <div
            className="sidebar-item"
            role="button"
            tabIndex={0}
            onClick={handleOpenSuggestionForm}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleOpenSuggestionForm();
              }
            }}
          >
            <span className="material-symbols-outlined">assignment</span>
            <span>Đóng góp ý kiến</span>
          </div>
        </div>
      </div>

      {/* Thông báo quan trọng */}
      <div className="sidebar-section">
        <h3 className="sidebar-section-title">
          <span className="material-symbols-outlined">notifications</span>
          THÔNG BÁO QUAN TRỌNG
        </h3>
        {todayNotifications.length > 0 ? (
          <div className="notifications-list">
            {todayNotifications.map((notification) => (
              <div key={notification.id} className={`notification-item`}>
                <div className="notification-header">
                  <span className="notification-time">
                    {formatDateTime(notification.timestamp)}
                  </span>
                </div>
                <div className="notification-message">
                  {notification.message}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="notification-empty">
            <span className="material-symbols-outlined">mail</span>
            <p>Không có thông báo</p>
          </div>
        )}
      </div>

      <div className="sidebar-section">
        <button
          className="sidebar-main-btn"
          onClick={() => navigate("/cskh-schedule")}
        >
          <span className="material-symbols-outlined">call</span>
          Lịch bán hàng
        </button>
      </div>

      {/* Đề xuất */}
      <div className="sidebar-section">
        <button
          className="sidebar-main-btn"
          onClick={() => setShowProposalModal(true)}
        >
          <span className="material-symbols-outlined">person_add</span>
          Đề xuất
        </button>
      </div>

      {/* Chương trình khuyến mãi */}
      <div className="sidebar-section">
        <button className="sidebar-main-btn">
          <span className="material-symbols-outlined">percent_discount</span>
          Chương trình khuyến mãi
        </button>
      </div>

      {/* Gửi tin nhắn CSKH */}
      <div className="sidebar-section">
        <button className="sidebar-main-btn">
          <span className="material-symbols-outlined">send</span>
          Gửi tin nhắn CSKH
        </button>
      </div>

      {/* Lọc tệp khách hàng */}
      <div className="sidebar-section">
        <button className="sidebar-main-btn">
          <span className="material-symbols-outlined">filter_list</span>
          Lọc tệp khách hàng
        </button>
      </div>

      {/* Modal đề xuất */}
      {showProposalModal && (
        <ProposalModal
          onClose={() => setShowProposalModal(false)}
          onSuccess={() => {
            // Có thể refresh danh sách hoặc show notification
            console.log("Gửi đề xuất thành công!");
          }}
        />
      )}
    </div>
  );
}

export default RightSidebar;
