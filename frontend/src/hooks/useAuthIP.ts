import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import authIPService, { CreateIPPayload } from "@/services/auth_IP"; // Nhớ trỏ đúng đường dẫn

export const useAuthIP = () => {
  const queryClient = useQueryClient();

  // 1. Lấy danh sách IP
  const queryDanhSach = useQuery({
    queryKey: ["danhSachIPHopLe"],
    queryFn: authIPService.getValidIPs,
  });

  // 2. Thêm IP mới
  const mutationThem = useMutation({
    mutationFn: (payload: CreateIPPayload) => authIPService.addValidIP(payload),
    onSuccess: () => {
      // Báo cho React Query biết data cũ đã lỗi thời, tự động fetch lại data mới
      queryClient.invalidateQueries({ queryKey: ["danhSachIPHopLe"] });
    },
  });

  // 3. Xóa IP
  const mutationXoa = useMutation({
    mutationFn: (id: number) => authIPService.deleteValidIP(id),
    onSuccess: () => {
      // Fetch lại danh sách sau khi xóa
      queryClient.invalidateQueries({ queryKey: ["danhSachIPHopLe"] });
    },
  });

  // Trả về một object chứa toàn bộ data và các hàm thao tác
  return {
    danhSachIP: queryDanhSach.data || [],
    dangTai: queryDanhSach.isLoading || queryDanhSach.isFetching,
    loiTaiDuLieu: queryDanhSach.error,
    
    themIP: mutationThem.mutateAsync,
    dangThem: mutationThem.isPending, // Nếu dùng react-query v4 thì đổi thành isLoading nhé
    loiThemIP: mutationThem.error,

    xoaIP: mutationXoa.mutateAsync,
    dangXoa: mutationXoa.isPending,
  };
};

export default useAuthIP;