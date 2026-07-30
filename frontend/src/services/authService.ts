import api from "./api";
import { API_ENDPOINTS } from "@/config/api";
import { LoginResponse } from "@/types/api";

class AuthService {
  // Đăng nhập
  async login(username: string, password: string): Promise<LoginResponse> {
    try {
      const formData = new FormData();
      formData.append("username", username);
      formData.append("password", password);

      const response = await api.post<LoginResponse>(
        API_ENDPOINTS.LOGIN,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      return response.data;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.detail ||
        "Đăng nhập thất bại";
      throw new Error(errorMessage);
    }
  }

  // Lấy thông tin user hiện tại (bao gồm department_name)
  async fetchUserInfo(): Promise<any> {
    try {
      const response = await api.get("/api/users/me");
      return response.data;
    } catch (error) {
      console.error("Error fetching user info:", error);
      return null;
    }
  }

  // Đăng xuất
  async logout(): Promise<void> {
    try {
      await api.post(API_ENDPOINTS.LOGOUT);
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      // Clear local storage regardless of API call result
      localStorage.removeItem("access_token");
      localStorage.removeItem("auth-storage");
    }
  }

  // Lấy token từ localStorage
  getToken(): string | null {
    try {
      const authStorage = localStorage.getItem("auth-storage");
      if (authStorage) {
        const { state } = JSON.parse(authStorage);
        return state?.token || null;
      }
    } catch (error) {
      console.error("Error getting token:", error);
    }
    return null;
  }
}

export default new AuthService();
