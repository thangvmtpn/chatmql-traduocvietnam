import axios, { AxiosError } from "axios";
import { API_URL } from "@/config/api";
import { ApiError } from "@/types/api";

// Tạo instance axios với cấu hình mặc định
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// Request interceptor - thêm token vào header
api.interceptors.request.use(
  (config) => {
    try {
      const authStorage = localStorage.getItem("auth-storage");
      if (authStorage) {
        const { state } = JSON.parse(authStorage);
        if (state?.token) {
          config.headers.Authorization = `Bearer ${state.token}`;
        }
      }
    } catch (error) {
      console.error("Error parsing auth storage:", error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor - xử lý lỗi
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    if (error.response) {
      const { status, data } = error.response;

      switch (status) {
        case 401:
          // Unauthorized - logout và redirect
          localStorage.removeItem("auth-storage");
          if (window.location.pathname !== "/login") {
            window.location.href = "/login";
          }
          break;
        case 403:
          console.error("Bạn không có quyền truy cập tài nguyên này");
          break;
        case 404:
          console.error("Không tìm thấy tài nguyên");
          break;
        case 500:
          console.error("Lỗi máy chủ nội bộ");
          break;
        default:
          console.error(data?.message || "Có lỗi xảy ra");
      }
    } else if (error.request) {
      console.error("Không thể kết nối đến máy chủ");
    } else {
      console.error("Lỗi:", error.message);
    }

    return Promise.reject(error);
  },
);

export default api;
