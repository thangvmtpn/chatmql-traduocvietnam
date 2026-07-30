import { create } from "zustand";
import { persist } from "zustand/middleware";

// Types
export interface User {
  id: string | number;
  id_acc?: string | number; // Account ID từ backend
  user_id?: string | number; // Mã nhân viên
  username: string;
  name?: string;
  email?: string;
  chuc_vu?: string; // Chức danh
  role?: string; // Deprecated - dùng chuc_vu
  role_id?: number; // Role ID: 1=Admin, 2=Manager, 3=Supervisor, 4=Employee
  department_id?: number;
  department_name?: string; // Tên phòng ban
  [key: string]: any;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
}

// Store cho authentication và user info
const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // State
      user: null,
      token: null,
      isAuthenticated: false,

      // Actions
      setUser: (user) => set({ user, isAuthenticated: !!user }),

      setToken: (token) => set({ token }),

      login: (user, token) =>
        set({
          user,
          token,
          isAuthenticated: true,
        }),

      logout: () =>
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        }),

      updateUser: (userData) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        })),
    }),
    {
      name: "auth-storage", // Key trong localStorage
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

export default useAuthStore;
