import { useState, useEffect } from 'react';
import { Plus, Trash2, Trophy, Eye, Calendar, Flame, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from "@/components/Sidebar/Sidebar";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import useAuthStore from "@/stores/useAuthStore";
import {
  getGamificationList,
  createGamification,
  deleteGamification,
} from '@/services/gamificationService';
import { getAllDepartments, getDepartmentMembers } from '@/api/department';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Notification from '@/components/ui/Notification';
import CreateTopRaceModal from '@/components/gamification/individual/CreateTopRaceModal';

export default function TopRacePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  if (!user) return null;
  const [data, setData] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [availableMembers, setAvailableMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(1);

  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    isDangerous: false,
    onConfirm: () => {},
  });
  const [notification, setNotification] = useState<any>(null);

  // --- API ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const gamiRes = await getGamificationList('TOP_RACE', page, 20);
      setData(gamiRes.data || []);

      const deptRes = await getAllDepartments();
      const depts = deptRes.data || deptRes || [];
      setDepartments(depts);

      let allMembers: any[] = [];
      await Promise.all(
        depts.map(async (dept: any) => {
          const memRes = await getDepartmentMembers(dept.department_id || dept.id);
          const members = memRes.data || [];
          const membersWithDept = members.map((m: any) => ({
            ...m,
            department_id: dept.department_id || dept.id,
            department_name: dept.department_name || dept.name,
          }));
          allMembers = [...allMembers, ...membersWithDept];
        })
      );
      setAvailableMembers(allMembers);
    } catch (error) {
      console.error('Lỗi tải dữ liệu:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page]);

  // --- ACTIONS ---
  const handleCreateGamification = async (payload: any) => {
    setLoading(true);
    try {
      await createGamification(payload);
      setShowModal(false);
      fetchData();
    } catch (error) {
      setNotification({
        message: 'Tạo cuộc đua thất bại: ' + ((error as any)?.message || 'Lỗi không xác định'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: any, id: string | number) => {
    e.stopPropagation();
    setConfirmDialog({
      isOpen: true,
      title: 'Xóa Cuộc Đua',
      message: 'Xóa cuộc đua này?',
      isDangerous: true,
      onConfirm: async () => {
        setLoading(true);
        try {
          await deleteGamification(id);
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          fetchData();
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const goToDetail = (id: string | number) => {
    navigate(`/gamification/detail/${id}`);
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      <Sidebar user={user} />
      <main style={{ flex: 1, overflowY: "auto", backgroundColor: "#f8f9fa", width: "100%" }}>
        <Breadcrumb />
        <div className="p-6 h-full flex flex-col text-slate-800 bg-gray-50/50">
          <LoadingOverlay open={loading} text="Đang xử lý..." />

      {/* HEADER SECTION */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Trophy className="text-yellow-500 fill-yellow-500" size={28} />
            Đua Top Doanh Số
          </h1>
          <p className="text-slate-500 text-sm mt-1 ml-9 font-normal">
            Quản lý các chiến dịch thi đua và khen thưởng
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 shadow-sm transition-all text-sm font-medium"
        >
          <Plus size={18} /> Tạo Cuộc Đua Mới
        </button>
      </div>

      {/* TABLE SECTION */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50/50 text-slate-500 font-semibold uppercase text-xs border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Tên chiến dịch</th>
                <th className="px-6 py-4">Thời gian áp dụng</th>
                <th className="px-6 py-4">Hình thức đua</th>
                <th className="px-6 py-4">Thưởng / Top 1</th>
                <th className="px-6 py-4 text-center">Tham gia</th>
                <th className="px-6 py-4 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.map((item: any) => {
                const startDate = item.start_date || item.apply_date;
                const endDate = item.end_date;

                // Đọc config mới
                const config = item.config_data?.biz_config;
                const isWeekly = item.frequency === 'WEEKLY' || item.frequency === 'WEEK';
                const isDaily = item.frequency === 'DAILY' || item.frequency === 'DAY';
                const rewardMode = item.config_data?.reward_mode || (isWeekly ? 'TARGET' : 'TOP');

                // Lấy số tiền hiển thị (Ưu tiên đọc từ CSKH làm đại diện)
                let displayAmount = 0;
                if (config?.cskh) {
                  if (rewardMode === 'TARGET') {
                    displayAmount = config.cskh.target_reward || 0;
                  } else {
                    const top1 = config.cskh.rewards?.find((r: any) => r.rank === 1);
                    displayAmount = top1 ? top1.amount : 0;
                  }
                } else if (item.config_data?.rewards) {
                  // Fallback cấu trúc cũ
                  const top1 = item.config_data.rewards.find((r: any) => r.rank === 1);
                  displayAmount = top1 ? top1.amount : 0;
                }

                return (
                  <tr
                    key={item.id}
                    onClick={() => goToDetail(item.id)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-800 group-hover:text-blue-600 transition-colors mb-1.5">
                        {item.title}
                      </div>
                      {isWeekly && (
                        <span className="inline-block text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded font-bold uppercase tracking-wide border border-indigo-100">
                          Tuần
                        </span>
                      )}
                      {isDaily && (
                        <span className="inline-block text-[10px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded font-bold uppercase tracking-wide border border-rose-100">
                          Ngày
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-slate-500">
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="flex items-center gap-1.5 font-normal text-slate-700">
                          <Calendar size={12} className="text-slate-400" />
                          {startDate ? new Date(startDate).toLocaleDateString('vi-VN') : '---'}
                        </span>
                        {endDate && (
                          <span className="flex items-center gap-1.5 text-slate-400 pl-4">
                            ➝ {new Date(endDate).toLocaleDateString('vi-VN')}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* CỘT HÌNH THỨC ĐUA MỚI */}
                    <td className="px-6 py-4">
                      {rewardMode === 'TARGET' ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                          <Target size={14} /> Mục tiêu tuần
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
                          <Flame size={14} /> Xếp hạng Đua Top
                        </div>
                      )}
                    </td>

                    {/* CỘT THƯỞNG MỚI */}
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800">
                        {Number(displayAmount).toLocaleString()} ₫
                      </div>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center bg-slate-100 text-slate-600 min-w-[2rem] h-6 px-2 rounded text-xs font-bold border border-slate-200">
                        {item.config_data?.selected_members?.length ||
                          item.config_data?.selected_depts?.length ||
                          0}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all">
                          <Eye size={18} />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, item.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data.length === 0 && (
            <div className="text-center py-12 text-slate-400">Chưa có chiến dịch nào được tạo</div>
          )}
        </div>
      </div>

      {/* --- MODAL --- */}
      {showModal && (
        <CreateTopRaceModal
          onClose={() => setShowModal(false)}
          onSubmit={handleCreateGamification}
          departments={departments}
          availableMembers={availableMembers}
        />
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        isDangerous={confirmDialog.isDangerous}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />

      <Notification notification={notification} onClose={() => setNotification(null)} />
    </div>
      </main>
    </div>
  );
}
