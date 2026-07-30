import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Edit, Download, Trophy, Target, Gift, RefreshCw } from 'lucide-react';
import Sidebar from "@/components/Sidebar/Sidebar";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import useAuthStore from "@/stores/useAuthStore";import {
  getGamificationDetail,
  updateGamification,
  getDealShockHistory,
  getGamificationProducts,
} from '@/services/gamificationService';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import Notification from '@/components/ui/Notification';
import CreateDealShockModal from '@/components/gamification/individual/CreateDealShockModal';
import * as htmlToImage from 'html-to-image';

export default function DealShockDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  if (!user) return null;
  const location = useLocation();
  const [detail, setDetail] = useState<any>(null);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<any>(null);

  const showNotification = (message: any, type = 'error') => {
    setNotification({ message, type });
  };

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

  // STATE: Thống kê Deal Sốc
  const [statsData, setStatsData] = useState<any[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);

  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [gamiData, prodData] = await Promise.all([
          getGamificationDetail(id as string),
          getGamificationProducts(),
        ]);
        setDetail(gamiData);
        setAllProducts(prodData || []);

        // Gọi API thống kê thực tế
        if (gamiData) {
          fetchRealStats();
        }
      } catch (error) {
        console.error('Lỗi tải chi tiết:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const fetchRealStats = async () => {
    setLoadingStats(true);
    try {
      // BẮT API TỪ BACKEND
      const res = await getDealShockHistory(id as string);

      if (res && res.status === 'success' && res.data) {
        // Lấy kết quả từ Backend
        const backendData = res.data;

        // Map lại mã sản phẩm (product_code) thành tên sản phẩm (name) để hiển thị cho đẹp
        const mappedData = backendData.map((userStat: any) => {
          const mappedDetails = userStat.details.map((d: any) => {
            const foundProd = allProducts.find((p: any) => p.code === d.product_code);
            return {
              ...d,
              name: foundProd ? foundProd.name : d.product_code, // Có tên thì hiện, ko có hiện Mã SP
            };
          });

          return {
            ...userStat,
            details: mappedDetails,
          };
        });

        setStatsData(mappedData);
      } else {
        setStatsData([]);
      }
    } catch (error) {
      console.error('Lỗi tải dữ liệu bảng thống kê Deal Sốc:', error);
      setStatsData([]);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleUpdateDeal = async (payload: any) => {
    setLoading(true);
    try {
      await updateGamification(id as string, payload);
      setShowEditModal(false);
      const newData = await getGamificationDetail(id as string);
      setDetail(newData);
      fetchRealStats(); // Load lại bảng xếp hạng
    } catch (error) {
      showNotification('Cập nhật thất bại: ' + getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!tableRef.current) return;
    setLoading(true);
    try {
      await document.fonts.ready;
      const dataUrl = await htmlToImage.toPng(tableRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        width: tableRef.current.offsetWidth,
        height: tableRef.current.offsetHeight,
        style: { margin: '0' },
      });
      const link = document.createElement('a');
      link.download = `Poster_${detail?.title || 'Gamification'}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Lỗi chụp ảnh:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !detail) return <LoadingOverlay open={true} text="Đang tải dữ liệu..." />;
  if (!detail) return <div className="p-6 text-center text-gray-500">Không tìm thấy dữ liệu.</div>;

  const products = detail.config_data?.products || [];

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      <Sidebar user={user} />
      <main style={{ flex: 1, overflowY: "auto", backgroundColor: "#f8f9fa", width: "100%" }}>
        <Breadcrumb />
        <div className="p-6 h-full flex flex-col bg-gray-50 overflow-y-auto font-sans">
          <div className="shrink-0 mb-6 flex justify-between items-center">
        <button
          onClick={() => navigate(location.state?.from || '/gamification/individual/deal-shock')}
          className="p-2 hover:bg-slate-200 rounded-xl transition-all shadow-sm bg-white border border-slate-200 text-slate-500"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex gap-2">
          <button
            onClick={handleDownloadImage}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl transition-all shadow-sm text-sm font-medium"
          >
            <Download size={16} /> Tải Ảnh Poster
          </button>

          <button
            onClick={() => setShowEditModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl transition-all shadow-sm text-sm font-medium"
          >
            <Edit size={16} /> Sửa cấu hình
          </button>
        </div>
      </div>

      <div
        ref={tableRef}
        className="w-full max-w-[1200px] mx-auto border-2 border-transparent bg-white shadow-xl mb-10"
      >
        <div className="flex flex-col md:flex-row justify-center gap-32 items-center px-2">
          <div className="flex flex-col items-center mb-4 md:mb-0">
            <img
              src="/images/Logo_TDVN_251125.png"
              alt="Deal Sốc Logo"
              className="w-36 h-36 mb-2 object-contain"
            />
            <span className="relative bottom-8 text-[11px] text-slate-500">
              Phước lành cho sức khoẻ
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl font-black text-[#E3182D] tracking-tight text-center">
            {detail.title || 'BẢNG DEAL SỐC'}
          </h1>
        </div>

        <div className="w-full overflow-x-auto border-2 border-[#E3182D] bg-white">
          <table className="w-full min-w-[800px] border-collapse">
            <thead className="bg-[#E3182D] text-white">
              <tr>
                <th className="border-r border-b border-white p-3 text-center font-bold text-sm w-16">
                  STT
                </th>
                <th className="border-r border-b border-white p-3 text-center font-bold text-sm">
                  MÃ DEAL
                </th>
                <th className="border-r border-b border-white p-3 text-center font-bold text-sm w-1/4">
                  SẢN PHẨM
                </th>
                <th className="border-r border-b border-white p-3 text-center font-bold text-sm">
                  ĐƠN GIÁ
                </th>
                <th className="border-r border-b border-white p-3 text-center font-bold text-sm">
                  SỐ LƯỢNG
                  <br />
                  DEAL
                </th>
                <th className="border-r border-b border-white p-3 text-center font-bold text-sm">
                  THƯỞNG/DEAL
                </th>
                <th className="border-r border-b border-white p-3 text-center font-bold text-sm">
                  THÀNH TIỀN
                </th>
                <th className="border-b border-white p-3 text-center font-bold text-sm">
                  DOANH SỐ
                  <br />
                  DỰ KIẾN
                </th>
              </tr>
            </thead>
            <tbody className="text-[#E3182D] font-medium">
              {products.length > 0 ? (
                products.map((p: any, idx: number) => {
                  const dealLimit = Number(p.deal_limit || 0);
                  const rewardPerDeal = Number(p.reward_per_deal || 0);
                  const unitPrice = Number(p.price);
                  const thanhTien =
                    dealLimit > 0 && rewardPerDeal > 0 ? dealLimit * rewardPerDeal : 0;
                  const doanhSoDuKien = unitPrice > 0 && dealLimit > 0 ? unitPrice * dealLimit : 0;

                  const rawName = p.name || '';
                  const nameParts = rawName.split('-');
                  const mainName = nameParts[0].trim().toUpperCase();
                  const unitName =
                    nameParts.length > 1
                      ? nameParts.slice(1).join('-').trim().toUpperCase()
                      : 'SẢN PHẨM';

                  return (
                    <tr key={idx} className="hover:bg-red-50/50 transition-colors">
                      <td className="border border-[#f8b2b6] p-4 text-center font-bold text-lg">
                        {idx + 1}
                      </td>
                      <td className="border border-[#f8b2b6] p-4 text-center">{p.code || ''}</td>
                      <td className="border border-[#f8b2b6] p-4 text-center font-bold">
                        <div className="flex flex-col items-center justify-center">
                          {Number(p.min_order_quantity) >= 2 ? (
                            <>
                              <span>{mainName}</span>
                              <span className="font-bold text-[13px] mt-0.5">
                                ({p.min_order_quantity} {unitName}/ĐƠN)
                              </span>
                            </>
                          ) : (
                            <span>{rawName.toUpperCase()}</span>
                          )}
                        </div>
                      </td>
                      <td className="border border-[#f8b2b6] p-4 text-center">
                        {unitPrice > 0 ? unitPrice.toLocaleString('vi-VN') : ''}
                      </td>
                      <td className="border border-[#f8b2b6] p-4 text-center">
                        {dealLimit > 0 ? dealLimit : ''}
                      </td>
                      <td className="border border-[#f8b2b6] p-4 text-center">
                        {rewardPerDeal > 0 ? rewardPerDeal.toLocaleString('vi-VN') : ''}
                      </td>
                      <td className="border border-[#f8b2b6] p-4 text-center">
                        {thanhTien > 0 ? thanhTien.toLocaleString('vi-VN') : ''}
                      </td>
                      <td className="border border-[#f8b2b6] p-4 text-center">
                        {doanhSoDuKien > 0 ? doanhSoDuKien.toLocaleString('vi-VN') : ''}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="border border-[#f8b2b6] p-8 text-center text-slate-400"
                  >
                    Chưa có sản phẩm nào trong cấu hình
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {(() => {
            const formatTime = (t: string) => (t ? t.substring(0, 5).replace(':', 'h') : null);
            const startTimeDisplay = formatTime(detail?.start_time) || '00h';
            const endTimeDisplay = formatTime(detail?.end_time) || '24h';
            const channelDisplay = detail?.config_data?.channel_name || 'Tất cả các kênh';

            return (
              <div className="bg-[#E3182D] w-full text-white text-center py-2 px-4 text-sm md:text-lg font-bold">
                Thời gian: Từ {startTimeDisplay} đến {endTimeDisplay}{' '}
                {detail?.frequency === 'WEEK' ? 'hàng tuần' : 'hàng ngày'} - Kênh áp dụng:{' '}
                {channelDisplay}
              </div>
            );
          })()}
        </div>
      </div>

      <div className="w-full max-w-[1200px] mx-auto bg-white shadow-lg rounded-xl border border-gray-200 overflow-hidden mb-10">
        <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Trophy className="text-yellow-400" size={24} />
            <h2 className="text-lg font-bold">Bảng Tổng Kết & Xếp Hạng</h2>
          </div>
          <button
            onClick={fetchRealStats}
            className="flex items-center gap-2 text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw size={14} /> Làm mới số liệu
          </button>
        </div>

        {loadingStats ? (
          <div className="p-10 text-center text-slate-500 font-medium animate-pulse">
            Đang quét dữ liệu từ hệ thống...
          </div>
        ) : statsData.length === 0 ? (
          <div className="p-10 text-center text-slate-400 italic">
            Hệ thống chưa ghi nhận lượt bán Deal Sốc nào trong thời gian này.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[11px] border-b border-slate-200 tracking-wider">
                <tr>
                  <th className="px-6 py-4 w-16 text-center">Top</th>
                  <th className="px-6 py-4 w-1/4">Nhân Viên</th>
                  <th className="px-6 py-4 w-2/4">Chi Tiết Deal Nhận Được</th>
                  <th className="px-6 py-4 text-right">Tổng Thưởng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statsData.map((stat: any, idx: number) => (
                  <tr key={stat.user_id} className="hover:bg-rose-50/30 transition-colors">
                    <td className="px-6 py-4 text-center font-black text-slate-400">
                      {idx === 0 ? (
                        <span className="text-yellow-500 text-2xl">1</span>
                      ) : idx === 1 ? (
                        <span className="text-slate-400 text-2xl">2</span>
                      ) : idx === 2 ? (
                        <span className="text-amber-600 text-2xl">3</span>
                      ) : (
                        idx + 1
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-800 text-base">
                      {stat.user_name}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-col gap-2">
                        {stat.details.map((d: any, dIdx: number) => (
                          <div
                            key={dIdx}
                            className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm"
                          >
                            <div className="flex items-center gap-2 pr-4">
                              <Target size={14} className="text-rose-500 shrink-0" />
                              <span className="font-semibold text-slate-700 leading-tight">
                                {d.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-bold shrink-0">
                              <span className="bg-rose-100 text-rose-700 px-2 py-1 rounded whitespace-nowrap">
                                x{d.deals} Deal
                              </span>
                              <span className="text-emerald-600 w-24 text-right whitespace-nowrap">
                                +{d.reward.toLocaleString('vi-VN')} đ
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 text-xl font-black text-rose-600">
                        <Gift size={20} />
                        {stat.total_reward.toLocaleString('vi-VN')} đ
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showEditModal && (
        <CreateDealShockModal
          onClose={() => setShowEditModal(false)}
          onSubmit={handleUpdateDeal}
          onError={(message: any) => showNotification(message, 'error')}
          products={allProducts}
          initialData={detail}
        />
      )}

      <Notification notification={notification} onClose={() => setNotification(null)} />
    </div>
      </main>
    </div>
  );
}
