import { useState, useEffect } from 'react';
import { Plus, Trash2, Calendar, Tag, Gift, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from "@/components/Sidebar/Sidebar";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import useAuthStore from "@/stores/useAuthStore";
import {
  getGamificationList,
  createGamification,
  deleteGamification,
  getGamificationProducts,
} from '@/services/gamificationService';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Notification from '@/components/ui/Notification';
import CreateDealShockModal from '@/components/gamification/individual/CreateDealShockModal';

export default function DealShockPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  if (!user) return null;
  const [data, setData] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
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

  const getApiErrorMessage = (error: any, fallback = 'Lỗi không xác định') => {
    const detail = error?.response?.data?.detail;
    if (Array.isArray(detail)) {
      return detail.map((e: any) => `${e.loc?.join(' > ') || 'Trường dữ liệu'}: ${e.msg}`).join('; ');
    }
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }
    if (typeof detail === 'object' && detail) {
      try {
        return JSON.stringify(detail);
      } catch {
        return fallback;
      }
    }
    return error?.message || fallback;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [gamiRes, prodRes] = await Promise.all([
        getGamificationList('DEAL_SHOCK', page, 20),
        getGamificationProducts(),
      ]);
      setData(gamiRes.data || []);
      setProducts(prodRes || []);
    } catch (error) {
      console.error('Lỗi tải dữ liệu:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page]);

  const handleCreateDeal = async (payload: any) => {
    setLoading(true);
    try {
      await createGamification(payload);
      setShowModal(false);
      fetchData();
    } catch (error) {
      setNotification({
        message: 'Tạo deal thất bại: ' + getApiErrorMessage(error),
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
      title: 'Xóa Chiến Dịch',
      message: 'Bạn chắc chắn muốn xóa chiến dịch này?',
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
    navigate(`/gamification/deal-shock-detail/${id}`);
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      <Sidebar user={user} />
      <main style={{ flex: 1, overflowY: "auto", backgroundColor: "#f8f9fa", width: "100%" }}>
        <Breadcrumb />
        <div className="p-6 h-full flex flex-col text-slate-800 bg-gray-50/50">
          <LoadingOverlay open={loading} text="Đang xử lý..." />

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span className="text-red-500">⚡</span> Deal Sốc Doanh Số
          </h1>
          <p className="text-slate-500 text-sm mt-1 ml-9">Tạo các deal thưởng nóng theo sản phẩm</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 shadow-sm transition-all text-sm font-medium"
        >
          <Plus size={18} /> Tạo Deal Mới
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50/50 text-slate-500 font-semibold uppercase text-xs border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Thời gian áp dụng</th>
                <th className="px-6 py-4">Tên chương trình</th>
                <th className="px-6 py-4">Sản phẩm áp dụng</th>
                <th className="px-6 py-4 text-center">Chi tiết Deal</th>
                <th className="px-6 py-4 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    Chưa có dữ liệu
                  </td>
                </tr>
              ) : (
                data.map((item: any) => {
                  const startDate = item.start_date || item.apply_date;
                  const endDate = item.end_date;

                  // Lấy danh sách sản phẩm từ config mới
                  const productsList = item.config_data?.products || [];

                  return (
                    <tr
                      key={item.id}
                      onClick={() => goToDetail(item.id)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4 text-slate-500">
                        <div className="flex flex-col gap-1 text-xs">
                          <span className="flex items-center gap-1.5 font-normal text-slate-700">
                            <Calendar size={12} className="text-slate-400" />
                            {new Date(startDate).toLocaleDateString('vi-VN')}
                          </span>
                          {endDate && (
                            <span className="flex items-center gap-1.5 text-slate-400 pl-4">
                              ➝ {new Date(endDate).toLocaleDateString('vi-VN')}
                            </span>
                          )}
                          <span className="inline-flex mt-1 w-fit text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold uppercase tracking-wide">
                            {item.frequency === 'DAY' ? 'Theo Ngày' : 'Theo Tuần'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-800 group-hover:text-red-600 transition-colors">
                          {item.title}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Tạo bởi: {item.created_by_name}
                        </div>
                      </td>

                      {/* Cột sản phẩm */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {productsList.length > 0 ? (
                            productsList.slice(0, 2).map((p: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 text-xs text-slate-700"
                              >
                                <Tag size={12} className="text-red-500" />
                                <span className="truncate max-w-[180px]" title={p.name}>
                                  {p.name}
                                </span>
                              </div>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400 italic">--</span>
                          )}
                          {productsList.length > 2 && (
                            <span className="text-[10px] text-slate-400 pl-5">
                              + {productsList.length - 2} sản phẩm khác
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Cột Chi tiết Deal (Tóm tắt) */}
                      <td className="px-6 py-4 text-center">
                        <div className="text-xs text-slate-600 flex flex-col items-center gap-1">
                          {productsList.length > 0 ? (
                            <>
                              <span className="font-bold text-emerald-600">
                                ~ {Number(productsList[0].reward_per_deal).toLocaleString()} đ/deal
                              </span>
                              {productsList.length > 1 && (
                                <span className="text-[10px] text-slate-400">
                                  (Nhiều mức thưởng)
                                </span>
                              )}
                            </>
                          ) : (
                            <span>--</span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all">
                            <Eye size={18} />
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, item.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                            title="Xóa"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <CreateDealShockModal
          onClose={() => setShowModal(false)}
          onSubmit={handleCreateDeal}
          onError={(message: any) => setNotification({ message, type: 'error' })}
          products={products}
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
