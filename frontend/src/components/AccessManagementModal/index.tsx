import { useState } from "react";
import useAuthIP from "@/hooks/useAuthIP"; // Import cái hook vừa tạo

interface AccessManagementModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export default function AccessManagementModal({
  onClose,
  onSuccess,
}: AccessManagementModalProps) {
  // Bưng toàn bộ logic từ custom hook ra xài
  const { danhSachIP, dangTai, themIP, dangThem, xoaIP, dangXoa } = useAuthIP();

// State cho form
const [loaiIP, setLoaiIP] = useState<"ipv4" | "ipv6">("ipv4"); // Thêm state chọn loại IP
const [ipMoi, setIpMoi] = useState("");
const [ghiChuMoi, setGhiChuMoi] = useState("");

const xuLyThemIP = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!ipMoi.trim()) {
    alert("Vui lòng nhập địa chỉ IP!");
    return;
  }

  let ipHoanChinh = ipMoi.trim();

  // Tự động format IP theo đúng chuẩn CIDR trước khi gửi xuống Backend
  if (loaiIP === "ipv6") {
    // Nếu user gõ thừa dấu : ở cuối thì cắt đi
    ipHoanChinh = ipHoanChinh.replace(/:+$/, "");
    // Nếu chưa có chuẩn ::/64 thì tự động nối vào
    if (!ipHoanChinh.includes("::/")) {
      ipHoanChinh = `${ipHoanChinh}::/64`;
    }
  } else {
    // Với IPv4, tự động thêm /32 nếu user chỉ nhập 14.166.x.x
    if (!ipHoanChinh.includes("/")) {
      ipHoanChinh = `${ipHoanChinh}/32`;
    }
  }

  try {
    await themIP({ dia_chi_ip: ipHoanChinh, ghi_chu: ghiChuMoi });
    alert("Đã thêm IP thành công!");
    setIpMoi("");
    setGhiChuMoi("");
    if (onSuccess) onSuccess();
  } catch (error) {
    console.error("Lỗi thêm IP:", error);
    alert("Có lỗi xảy ra khi thêm IP (có thể IP đã tồn tại hoặc sai định dạng).");
  }
};

  const xuLyXoaIP = async (id: number, ip: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa IP ${ip} khỏi danh sách?`)) return;

    try {
      await xoaIP(id);
      alert("Đã xóa IP thành công!");
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Lỗi xóa IP:", error);
      alert("Không thể xóa IP này.");
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-white rounded-xl shadow-2xl flex flex-col max-h-[90vh] mx-4 animate-in fade-in zoom-in duration-200">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-600">shield_person</span>
            Quản lý truy cập mạng (IP)
          </h2>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-red-500 transition-colors rounded-full p-1 hover:bg-red-50"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Nội dung Modal */}
        <div className="p-5 overflow-y-auto flex-1">
          
          {/* Form thêm mới */}
          <form onSubmit={xuLyThemIP} className="mb-6 p-4 bg-blue-50/50 rounded-lg border border-blue-100">
            <h3 className="text-sm font-semibold text-blue-800 mb-3">Thêm địa chỉ IP mới</h3>
            
            <div className="flex flex-col gap-3">
              {/* Dòng 1: Chọn loại IP và Nhập IP */}
              <div className="flex flex-col md:flex-row gap-3">
                <select
                  className="w-full md:w-1/3 p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white font-medium cursor-pointer"
                  value={loaiIP}
                  onChange={(e) => {
                    setLoaiIP(e.target.value as "ipv4" | "ipv6");
                    setIpMoi(""); // Đổi loại thì xóa trắng ô nhập
                  }}
                  disabled={dangThem}
                >
                  <option value="ipv4">IPv4 (IP Cá nhân/Tĩnh)</option>
                  <option value="ipv6">IPv6 (Dải mạng công ty)</option>
                </select>

                <input
                  type="text"
                  className="w-full md:w-2/3 p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                  placeholder={loaiIP === "ipv4" ? "VD: 14.166.80.120" : "Nhập 4 cụm đầu. VD: 2001:ee0:46e7:be00"}
                  value={ipMoi}
                  onChange={(e) => setIpMoi(e.target.value)}
                  disabled={dangThem}
                />
              </div>

              {/* Dòng 2: Ghi chú và Nút Submit */}
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  type="text"
                  className="flex-1 p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="Ghi chú (vd: Mạng văn phòng HN, Nhà sếp...)"
                  value={ghiChuMoi}
                  onChange={(e) => setGhiChuMoi(e.target.value)}
                  disabled={dangThem}
                />
                <button 
                  type="submit" 
                  disabled={dangThem}
                  className={`flex items-center justify-center gap-1 px-8 py-2.5 text-white rounded-lg font-medium text-sm whitespace-nowrap transition-colors w-full md:w-auto
                    ${dangThem ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  {dangThem ? (
                    <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[20px]">add</span>
                  )}
                  {dangThem ? 'Đang thêm...' : 'Thêm IP'}
                </button>
              </div>
            </div>
          </form>

          {/* Bảng danh sách */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-sm text-gray-600">
                  <th className="p-3 font-semibold">Địa chỉ IP / Subnet</th>
                  <th className="p-3 font-semibold">Ghi chú</th>
                  <th className="p-3 font-semibold text-center w-28">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {dangTai ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-gray-500">
                      <span className="material-symbols-outlined animate-spin text-3xl text-blue-500">progress_activity</span>
                      <p className="mt-2 text-sm">Đang tải dữ liệu...</p>
                    </td>
                  </tr>
                ) : danhSachIP.length > 0 ? (
                  danhSachIP.map((muc) => (
                    <tr key={muc.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors last:border-0">
                      <td className="p-3">
                        <span className="font-mono text-sm text-gray-800 bg-gray-100 px-2 py-1 rounded">
                          {muc.dia_chi_ip}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-gray-600">
                        {muc.ghi_chu || <span className="italic text-gray-400">Không có ghi chú</span>}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => xuLyXoaIP(muc.id, muc.dia_chi_ip)}
                          className="text-red-500 hover:text-red-700 p-1.5 rounded-md hover:bg-red-50 transition-colors"
                          title="Xóa IP"
                        >
                          <span className="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-gray-500 italic text-sm">
                      Chưa có IP nào được thêm vào hệ thống.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Footer Modal */}
        <div className="p-4 border-t border-gray-100 flex justify-end bg-gray-50/50 rounded-b-xl">
          <button 
            onClick={onClose} 
            className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}