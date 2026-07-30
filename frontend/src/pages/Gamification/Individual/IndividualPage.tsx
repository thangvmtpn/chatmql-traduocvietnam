import { useNavigate } from 'react-router-dom';
import { Zap, Trophy, ArrowRight } from 'lucide-react';
import Sidebar from "@/components/Sidebar/Sidebar";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import useAuthStore from "@/stores/useAuthStore";
export default function IndividualPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  if (!user) return null;

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      <Sidebar user={user} />
      <main style={{ flex: 1, overflowY: "auto", backgroundColor: "#f8f9fa", width: "100%" }}>
        <Breadcrumb />
        <div className="p-8 h-full">
          <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900">Gamification</h1>
        <p className="text-gray-500 mt-2 font-normal">
          Chọn chương trình bạn muốn quản lý hoặc tham gia
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
        {/* CARD 1: DEAL SỐC */}
        <div
          onClick={() => navigate('/gamification/individual/deal-shock')}
          className="group bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200 rounded-2xl p-8 cursor-pointer hover:shadow-xl transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-1"
        >
          <div className="bg-yellow-100 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
            <Zap className="w-12 h-12 text-yellow-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Deal Sốc</h2>
          <p className="text-gray-600 mb-6 font-normal">
            Tạo các deal bán hàng chớp nhoáng theo ngày hoặc tuần để thúc đẩy doanh số ngắn hạn.
          </p>
          <button className="mt-auto flex items-center gap-2 text-yellow-700 font-bold group-hover:gap-3 transition-all">
            Truy cập ngay <ArrowRight size={20} />
          </button>
        </div>

        {/* CARD 2: ĐUA TOP */}
        <div
          onClick={() => navigate('/gamification/individual/top-race')}
          className="group bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl p-8 cursor-pointer hover:shadow-xl transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-1"
        >
          <div className="bg-purple-100 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
            <Trophy className="w-12 h-12 text-purple-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Đua Top Doanh Số</h2>
          <p className="text-gray-600 mb-6 font-normal">
            Thiết lập cuộc đua, bảng xếp hạng và phần thưởng cho các nhân viên xuất sắc nhất.
          </p>
          <button className="mt-auto flex items-center gap-2 text-purple-700 font-bold group-hover:gap-3 transition-all">
            Truy cập ngay <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </div>
      </main>
    </div>
  );
}
