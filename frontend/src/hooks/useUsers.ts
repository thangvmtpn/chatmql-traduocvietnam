import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import api from "@/services/api";
import { API_ENDPOINTS } from "@/config/api";

// Hook để lấy danh sách users
export const useUsers = (params = {}) => {
  return useQuery({
    queryKey: ["users", params],
    queryFn: async () => {
      const response = await api.get(API_ENDPOINTS.USERS, { params });
      return response.data;
    },
  });
};

// Hook để lấy tất cả users từ account_users
export const useAllUsers = () => {
  return useQuery({
    queryKey: ["allUsers"],
    queryFn: async () => {
      const response = await api.get(API_ENDPOINTS.ALL_USERS);
      return response.data;
    },
  });
};

// Hook để lấy chi tiết 1 user
export const useUser = (userId: string | number) => {
  return useQuery({
    queryKey: ["user", userId],
    queryFn: async () => {
      const response = await api.get(API_ENDPOINTS.USER_DETAIL(userId));
      return response.data;
    },
    enabled: !!userId, // Chỉ fetch khi có userId
  });
};

// Hook để tạo user mới
export const useCreateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userData: any) => {
      const response = await api.post(API_ENDPOINTS.USERS, userData);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate và refetch users list
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Thêm người dùng thành công!");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Có lỗi xảy ra!");
    },
  });
};

// Hook để cập nhật user
export const useUpdateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      userData,
    }: {
      userId: string | number;
      userData: any;
    }) => {
      const response = await api.put(
        API_ENDPOINTS.USER_DETAIL(userId),
        userData,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      // Invalidate users list và user detail
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user", variables.userId] });
      toast.success("Cập nhật người dùng thành công!");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Có lỗi xảy ra!");
    },
  });
};

// Hook để xóa user
export const useDeleteUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string | number) => {
      const response = await api.delete(API_ENDPOINTS.USER_DETAIL(userId));
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Xóa người dùng thành công!");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Có lỗi xảy ra!");
    },
  });
};
