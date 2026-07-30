import { create } from "zustand";
import { persist } from "zustand/middleware";

// Types
export interface Notification {
  id: number;
  timestamp: Date;
  message?: string;
  type?: "info" | "success" | "warning" | "error";
  read?: boolean;
  [key: string]: any;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (
    notification: Omit<Notification, "id" | "timestamp">,
  ) => void;
  removeNotification: (id: number) => void;
  clearAll: () => void;
  clearOldNotifications: () => void;
}

// Store cho notifications và real-time updates với persist
const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      // Notifications list
      notifications: [],
      unreadCount: 0,

      // Add notification
      addNotification: (notification) =>
        set((state) => {
          // Use provided id or generate new one
          const newNotification = {
            id: notification.id || notification.id_tb || Date.now(),
            timestamp: notification.timestamp || new Date(),
            ...notification,
          };

          // Check if notification already exists (avoid duplicates)
          const exists = state.notifications.some(
            (n) => n.id === newNotification.id,
          );
          if (exists) {
            console.log(
              "⚠️ Notification already exists, skipping:",
              newNotification.id,
            );
            return state;
          }
          return {
            notifications: [newNotification, ...state.notifications],
            unreadCount: state.unreadCount + 1,
          };
        }),

      // Remove notification
      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

      // Clear all notifications
      clearAll: () => set({ notifications: [], unreadCount: 0 }),

      // Clear old notifications (older than 7 days)
      clearOldNotifications: () =>
        set((state) => {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          const filtered = state.notifications.filter((n) => {
            const notifDate = new Date(n.timestamp);
            return notifDate > sevenDaysAgo;
          });

          const unreadFiltered = filtered.filter((n) => !n.read).length;

          console.log(
            `🧹 Cleared old notifications: ${state.notifications.length - filtered.length} removed`,
          );

          return {
            notifications: filtered,
            unreadCount: unreadFiltered,
          };
        }),
    }),
    {
      name: "notification-storage",
      // Custom serialization to handle Date objects
      partialize: (state) => ({
        notifications: state.notifications,
        unreadCount: state.unreadCount,
      }),
    },
  ),
);

export default useNotificationStore;
