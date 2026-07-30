import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Users,
  Briefcase,
  ShoppingCart,
  Percent,
  TrendingUp,
  CircleDollarSign,
  BadgeCent,
  Download,
  Trophy,
  RefreshCw,
  Gift,
  Medal,
  Flame,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import Sidebar from "@/components/Sidebar/Sidebar";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import useAuthStore from "@/stores/useAuthStore";
import {
  getGamificationDetail,
  updateGamification,
  getTopRaceStats,
} from '@/services/gamificationService';
import { getAllDepartments, getDepartmentMembers } from '@/api/department';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import Notification from '@/components/ui/Notification';
import CreateTopRaceModal from '@/components/gamification/individual/CreateTopRaceModal';
import * as htmlToImage from 'html-to-image';

export default function GamificationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  if (!user) return null;
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);

  const [statsData, setStatsData] = useState<any[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [notification, setNotification] = useState<any>(null);

  const posterRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const gamiData = await getGamificationDetail(id as string);

      const deptRes = await getAllDepartments();
      const depts = deptRes.data || deptRes || [];
      setDepartments(depts);

      setDetail(gamiData);

      if (gamiData) fetchRealStats();
    } catch (error) {
      console.error('Lỗi tải chi tiết chiến dịch:', error);
      setNotification({
        message: 'Không thể tải chi tiết chiến dịch. Vui lòng thử lại.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchRealStats = async () => {
    setLoadingStats(true);
    try {
      const res = await getTopRaceStats(id as string);
      if (res && res.status === 'success') {
        setStatsData(res.data || []);
      } else {
        setStatsData([]);
      }
    } catch (error) {
      console.error('Lỗi lấy thống kê Đua Top:', error);
      setNotification({
        message: 'Không thể tải bảng xếp hạng. Vui lòng thử lại.',
        type: 'error',
      });
      setStatsData([]);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleUpdateGamification = async (payload: any) => {
    setLoading(true);
    try {
      await updateGamification(id as string, payload);
      setIsEditing(false);
      fetchData();
    } catch (error) {
      setNotification({
        message: 'Lỗi khi cập nhật chiến dịch: ' + ((error as any)?.message || 'Lỗi không xác định'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadImage = async () => {
    const node = posterRef.current;
    if (!node) return;

    setLoading(true);
    try {
      await document.fonts.ready;

      const dataUrl = await htmlToImage.toPng(node, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        width: node.offsetWidth,
        height: node.offsetHeight,
        style: {
          margin: '0',
        },
      });

      const link = document.createElement('a');
      link.download = `Poster_${detail?.title || 'Gamification'}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Lỗi chụp ảnh:', error);
      setNotification({
        message: 'Có lỗi xảy ra khi chụp ảnh. Vui lòng thử lại.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading && !detail) return <LoadingOverlay open={true} text="Đang tải dữ liệu..." />;
  if (!detail) return <div className="p-6 text-center text-gray-500">Không tìm thấy dữ liệu.</div>;

  const config = detail.config_data?.biz_config;
  if (!config)
    return <div className="p-6 text-center text-red-500">Chưa có cấu hình KPI chi tiết.</div>;

  const isWeekly =
    detail.frequency === 'WEEKLY' ||
    detail.frequency === 'MONTHLY' ||
    detail.frequency === 'QUARTERLY' ||
    detail.frequency === 'YEARLY' ||
    detail.frequency === 'PERIOD';
  const rewardMode = detail.config_data?.reward_mode || (isWeekly ? 'TARGET' : 'TOP');

  const hasValue = (v: any) => {
    if (v === undefined || v === null || v === '') return false;
    const num = Number(v);
    if (!isNaN(num) && num === 0) return false;
    return true;
  };

  const formatVND = (v: any) => {
    if (!hasValue(v)) return '';
    if (Number(v) >= 1000000) return new Intl.NumberFormat('vi-VN').format(Number(v));
    if (Number(v) >= 1000) return `${Number(v) / 1000}K`;
    return v.toString();
  };

  const formatVNDFull = (v: any) => {
    if (!hasValue(v)) return '';
    return new Intl.NumberFormat('vi-VN').format(Number(v));
  };

  const isChannelActive = (dataKey: string) => {
    const data = config[dataKey];
    if (!data) return false;

    // Kiểm tra xem có bất kỳ trường nào có dữ liệu HỢP LỆ (lớn hơn 0) không
    const hasRewardTarget = rewardMode === 'TARGET' && hasValue(data.target_reward);
    const hasRewardTop =
      rewardMode === 'TOP' && data.rewards && data.rewards.some((r: any) => hasValue(r.amount));

    const hasAnyCondition =
      hasValue(data.min_orders) || hasValue(data.min_aov) || hasValue(data.min_revenue);

    // Chỉ cần 1 trong các điều kiện này TRUE thì thẻ mới hiện
    return hasRewardTarget || hasRewardTop || hasAnyCondition;
  };

  const isChungActive = () => {
    const c = config.chung;
    if (!c) return false;

    const hasAnyCondition = hasValue(c.target_revenue) || hasValue(c.target_orders);
    const hasAnyReward =
      (c.tier1 && hasValue(c.tier1.reward)) || (c.tier2 && hasValue(c.tier2.reward));

    return hasAnyCondition || hasAnyReward;
  };

  const activeCardsCount = [
    isChannelActive('cskh'),
    isChungActive(),
    isChannelActive('live'),
    isChannelActive('san'),
  ].filter(Boolean).length;

  const gridColsClass =
    {
      0: 'hidden',
      1: 'lg:grid-cols-1 max-w-sm mx-auto',
      2: 'lg:grid-cols-2 max-w-3xl mx-auto',
      3: 'lg:grid-cols-3 max-w-5xl mx-auto',
      4: 'lg:grid-cols-4',
    }[activeCardsCount] || 'lg:grid-cols-4';

  const renderChannelCard = (title: string, dataKey: string) => {
    if (!isChannelActive(dataKey)) return null;

    const data = config[dataKey];
    if (!data) return null;

    return (
      <div className="flex flex-col border-[3px] border-red-600 rounded-xl overflow-hidden bg-white shadow-lg h-full">
        <div className="bg-red-600 text-white text-center py-2 shrink-0">
          <h3 className="font-black text-lg uppercase tracking-wider">{title}</h3>
        </div>

        <div className="flex-1 py-2 flex flex-col justify-center items-center">
          {rewardMode === 'TARGET' ? (
            <div className="text-center w-full">
              <div className="text-red-600 font-black text-2xl lg:text-2xl uppercase tracking-tighter mb-0.5">
                Thưởng
              </div>
              <div className="text-red-600 font-black text-3xl lg:text-3xl tracking-tighter">
                {formatVNDFull(data.target_reward)}
              </div>
            </div>
          ) : (
            <div className="w-full space-y-2">
              {data.rewards?.map((reward: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-center lg:justify-start lg:pl-2"
                >
                  <div className="relative w-20 h-11 shrink-0 flex items-center justify-center">
                    <img
                      src="/images/iconTop.svg"
                      alt={`Top ${reward.rank}`}
                      className="absolute inset-0 w-full h-full object-contain z-0"
                    />
                    <span className="text-white font-black text-lg z-10 relative pb-3 pl-0.5">
                      {reward.rank}
                    </span>
                  </div>
                  <div className="flex flex-col justify-center">
                    <div className="text-red-600 font-black text-base lg:text-lg leading-none uppercase mb-1">
                      Top {reward.rank}
                    </div>
                    <div className="text-red-600 font-black text-lg lg:text-xl leading-none">
                      Thưởng {formatVND(reward.amount)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-red-600 text-white text-center py-1 border-t-[3px] border-b-[3px] border-white shrink-0">
          <span className="font-bold text-sm uppercase">Điều kiện</span>
        </div>

        <div className="p-2 min-h-[105px] flex flex-col justify-center space-y-2.5 shrink-0 bg-white">
          {/* CÁC ĐIỀU KIỆN THEO LOẠI */}
          {data.condition_type === 'CUSTOM_OR' ? (
            /* --- GIAO DIỆN MỚI CHO ĐIỀU KIỆN 1 HOẶC 2 --- */
            <div className="flex flex-col w-full h-full justify-center">
              <div className="flex justify-between items-center border-b border-red-100 pb-1">
                <span className="text-[13px] font-bold text-red-500 whitespace-nowrap">
                  (1) {data.cond1_orders} Đơn
                </span>
                <span className="text-[18px] text-slate-400 font-bold uppercase mx-1">+</span>
                <span className="text-[13px] font-bold text-red-500 text-right whitespace-nowrap">
                  (2){' '}
                  {dataKey === 'san'
                    ? `CPBH: ${data.cond2_cpbh}%`
                    : `AOV: ${formatVNDFull(data.cond2_aov)}`}{' '}
                  <span className="text-[12px] font-medium italic text-slate-500">
                    (&ge; {data.cond2_min_orders} đơn)
                  </span>
                </span>
              </div>
              {hasValue(data.base_reward) && (
                <div className="text-center mt-1 bg-red-50 rounded py-1">
                  <span className="text-[15px] font-bold text-red-600 uppercase">
                    Đạt (1) hoặc (2): Thưởng {formatVNDFull(data.base_reward)}
                  </span>
                </div>
              )}
            </div>
          ) : !data.condition_type || data.condition_type === 'AOV' ? (
            /* --- GIAO DIỆN AOV --- */
            <>
              {hasValue(data.min_orders) && (
                <div className="flex items-center gap-2 justify-center">
                  <div className="text-red-600 relative shrink-0">
                    <ShoppingCart size={28} strokeWidth={2.5} />
                    <div className="absolute -top-1 -right-1 bg-white rounded-full">
                      <BadgeCent size={14} fill="#dc2626" className="text-white" />
                    </div>
                  </div>
                  <div className="flex flex-col justify-center">
                    <div className="text-red-600 font-bold text-[11px] leading-tight uppercase">
                      Số đơn hàng
                    </div>
                    <div className="text-red-600 font-black text-2xl leading-none">
                      &gt;{formatVNDFull(data.min_orders)}
                    </div>
                  </div>
                </div>
              )}

              {dataKey === 'san' && hasValue(data.max_cpbh) ? (
                <div className="flex items-center gap-2 justify-center">
                  <div className="text-red-600 relative shrink-0">
                    <CircleDollarSign size={28} strokeWidth={2.5} />
                    <div className="absolute -bottom-1 -right-1 bg-red-600 rounded-full w-4 h-4 flex items-center justify-center">
                      <Percent size={10} className="text-white" strokeWidth={4} />
                    </div>
                  </div>
                  <div className="flex flex-col justify-center">
                    <div className="text-red-600 font-bold text-[11px] leading-tight uppercase">
                      Chi phí bán hàng
                    </div>
                    <div className="text-red-600 font-black text-2xl leading-none">
                      &lt;{data.max_cpbh}%
                    </div>
                  </div>
                </div>
              ) : hasValue(data.min_aov) ? (
                <div className="flex items-center gap-2 justify-center">
                  <div className="text-red-600 relative shrink-0">
                    <CircleDollarSign size={28} strokeWidth={2.5} />
                  </div>
                  <div className="flex flex-col justify-center">
                    <div className="text-red-600 font-bold text-[11px] leading-tight uppercase">
                      Trung bình đơn
                    </div>
                    <div className="text-red-600 font-black text-2xl leading-none">
                      &gt;{formatVNDFull(data.min_aov)}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            /* --- GIAO DIỆN REVENUE --- */
            <>
              {dataKey === 'cskh' && hasValue(data.min_orders) && (
                <div className="flex items-center gap-2 justify-center">
                  <div className="text-red-600 relative shrink-0">
                    <ShoppingCart size={28} strokeWidth={2.5} />
                    <div className="absolute -top-1 -right-1 bg-white rounded-full">
                      <BadgeCent size={14} fill="#dc2626" className="text-white" />
                    </div>
                  </div>
                  <div className="flex flex-col justify-center">
                    <div className="text-red-600 font-bold text-[11px] leading-tight uppercase">
                      Số đơn hàng
                    </div>
                    <div className="text-red-600 font-black text-2xl leading-none">
                      &ge;{formatVNDFull(data.min_orders)}
                    </div>
                  </div>
                </div>
              )}

              {dataKey === 'cskh' && hasValue(data.min_aov) && (
                <div className="flex items-center gap-2 justify-center">
                  <div className="text-red-600 relative shrink-0">
                    <CircleDollarSign size={28} strokeWidth={2.5} />
                  </div>
                  <div className="flex flex-col justify-center">
                    <div className="text-red-600 font-bold text-[11px] leading-tight uppercase">
                      Trung bình đơn
                    </div>
                    <div className="text-red-600 font-black text-2xl leading-none">
                      &ge;{formatVNDFull(data.min_aov)}
                    </div>
                  </div>
                </div>
              )}

              {hasValue(data.min_revenue) && (
                <div className="flex items-center gap-2 justify-center">
                  <div className="text-red-600 relative shrink-0">
                    <TrendingUp size={28} strokeWidth={2.5} />
                    <div className="absolute -top-1 -right-1 bg-white rounded-full">
                      <CircleDollarSign size={14} fill="#dc2626" className="text-white" />
                    </div>
                  </div>
                  <div className="flex flex-col justify-center">
                    <div className="text-red-600 font-bold text-[11px] leading-tight uppercase">
                      Tổng doanh số
                    </div>
                    <div className="text-red-600 font-black text-2xl leading-none">
                      &gt;{formatVNDFull(data.min_revenue)}
                    </div>
                  </div>
                </div>
              )}

              {dataKey === 'san' && hasValue(data.max_cpbh) && (
                <div className="flex items-center gap-2 justify-center mt-1">
                  <div className="text-red-600 font-bold text-[11px] leading-tight uppercase">
                    Chi phí bán hàng:
                  </div>
                  <div className="text-red-600 font-black text-sm leading-none ml-1">
                    &lt;{data.max_cpbh}%
                  </div>
                </div>
              )}
            </>
          )}

          {data.flash_pct && data.flash_time && (
            <div className="text-center mt-1 border-t border-dashed border-red-200 pt-1 w-full">
              <span className="text-[13px] font-bold text-rose-600 uppercase flex items-center justify-center gap-1">
                <Flame size={12} /> Đạt {data.flash_pct}% trước {data.flash_time} tặng{' '}
                {data.flash_reward_text}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // --- HÀM VẼ TỪNG BẢNG XẾP HẠNG ---
  const cskhData = statsData.filter((d: any) => d.dept_name === 'Kênh FN / CSKH');
  const liveData = statsData.filter((d: any) => d.dept_name === 'Kênh Livestream');
  const sanData = statsData.filter((d: any) => d.dept_name === 'Kênh Sàn/Shop');

  const renderLeaderboardTable = (title: string, data: any[], headerClass: string, channelKey: string) => {
    const channelConfig = config[channelKey] || {};
    const isCustomOr = config[channelKey]?.condition_type === 'CUSTOM_OR';

    const sortedData = [...data].sort((a: any, b: any) => {
      const passedPrevA = a.passed_prev_period !== false;
      const passedPrevB = b.passed_prev_period !== false;

      const isTopA = a.is_qualified_top && passedPrevA;
      const isTopB = b.is_qualified_top && passedPrevB;

      const isBaseA = a.is_qualified && !a.is_qualified_top && passedPrevA;
      const isBaseB = b.is_qualified && !b.is_qualified_top && passedPrevB;

      const getWeight = (isTop: boolean, isBase: boolean, isQual: boolean) => {
        if (isTop) return 1;
        if (isBase) return 2;
        if (isQual) return 3;
        return 4;
      };

      const weightA = getWeight(isTopA, isBaseA, a.is_qualified);
      const weightB = getWeight(isTopB, isBaseB, b.is_qualified);

      if (weightA !== weightB) return weightA - weightB;

      return (b.revenue || 0) - (a.revenue || 0);
    });

    return (
      <div className="bg-white shadow-md rounded-xl border border-gray-200 overflow-hidden transition-all hover:shadow-lg">
        <div className={`${headerClass} text-white px-5 py-3 flex items-center gap-2`}>
          <Medal size={20} />
          <h2 className="font-bold uppercase tracking-wider">{title}</h2>
        </div>

        {sortedData.length === 0 ? (
          <div className="p-6 text-center text-slate-400 italic">
            Chưa có dữ liệu đơn hàng cho kênh này.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-center w-16">Hạng</th>
                  <th className="px-4 py-3">Nhân Viên</th>
                  <th className="px-4 py-3 text-center text-indigo-500">Nguồn</th>
                  <th className="px-4 py-3 text-right">Doanh Số</th>
                  <th className="px-4 py-3 text-center">Số Đơn</th>
                  <th className="px-4 py-3 text-right text-indigo-500">AOV</th>
                  <th className="px-4 py-3 text-right">Thưởng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedData.map((stat: any) => {
                  const passedPrev = stat.passed_prev_period !== false;
                  const displayRank = stat.rank ? stat.rank : '-';

                  const isTopWinner = stat.rank > 0;
                  const isBaseWinner = stat.is_qualified && !stat.is_qualified_top && passedPrev;
                  const aov = stat.orders > 0 ? Math.round(stat.revenue / stat.orders) : 0;

                  return (
                    <tr
                      key={`${stat.user_id}-${stat.channel_display}`}
                      className={`transition-colors ${
                        isTopWinner
                          ? 'bg-amber-50/20 hover:bg-amber-100/30'
                          : isBaseWinner
                            ? 'hover:bg-slate-50/50'
                            : 'bg-slate-50/30 opacity-75'
                      }`}
                    >
                      <td className="px-4 py-3 text-center font-black">
                        {displayRank === 1 ? (
                          <span className="text-yellow-500 text-2xl drop-shadow-sm">1</span>
                        ) : displayRank === 2 ? (
                          <span className="text-slate-400 text-xl drop-shadow-sm">2</span>
                        ) : displayRank === 3 ? (
                          <span className="text-amber-600 text-lg drop-shadow-sm">3</span>
                        ) : (
                          <span className="text-slate-400">{displayRank}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-800 text-sm md:text-base">
                        {stat.user_name}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-1 rounded text-[10px] font-bold uppercase whitespace-nowrap">
                          {stat.channel_display || stat.dept_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-indigo-700 md:text-base">
                        {stat.revenue > 0 ? stat.revenue.toLocaleString('vi-VN') : '-'}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-slate-600 md:text-base">
                        {stat.orders > 0 ? stat.orders : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-indigo-600 md:text-sm">
                        {aov > 0 ? aov.toLocaleString('vi-VN') : '-'}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {!stat.is_qualified ? (
                          <div className="flex justify-end">
                            <span className="bg-slate-50 text-slate-500 border border-slate-200 px-2 py-1 rounded text-[11px] font-bold whitespace-nowrap">
                              Chưa đạt KPI
                            </span>
                          </div>
                        ) : !passedPrev ? (
                          <div className="flex justify-end">
                            <span className="bg-orange-50 text-orange-600 border border-orange-200 px-2 py-1 rounded text-[11px] font-bold whitespace-nowrap">
                              Chưa đạt kỳ trước
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end justify-center">
                            {stat.reward > 0 && (
                              <div className="flex items-center gap-1 font-black text-emerald-600 text-base">
                                <Gift size={16} /> {stat.reward.toLocaleString('vi-VN')} đ
                              </div>
                            )}

                            {stat.has_flash_reward && (
                              <div className="text-[10px] font-black text-rose-600 uppercase mt-0.5 bg-rose-50 px-1.5 rounded">
                                + {stat.flash_reward_text}
                              </div>
                            )}

                            <div className="text-[9px] font-bold mt-0.5 uppercase tracking-wide flex items-center gap-1">
                              {isCustomOr ? (
                                <>
                                  {isBaseWinner ? (
                                    <span className="text-slate-400">Đạt kpi</span>
                                  ) : stat.is_qualified_top ? (
                                    <span className="text-indigo-500 flex flex-col items-end">
                                      <span>Đạt kpi</span>
                                      {stat.completion_time !== '23:59:59' && (
                                        <span className="text-[8px] text-indigo-400 lowercase mt-[1px]">
                                          Cán đích: {stat.completion_time.substring(0, 5)}
                                        </span>
                                      )}
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                <>
                                  {stat.is_qualified &&
                                    stat.completion_time &&
                                    stat.completion_time !== '23:59:59' && (
                                      <span className="text-indigo-500 flex flex-col items-end">
                                        <span className="text-[8px] text-indigo-400 lowercase mt-[1px]">
                                          Cán đích: {stat.completion_time.substring(0, 5)}
                                        </span>
                                      </span>
                                    )}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const eligibleParticipants = statsData.reduce((acc: any[], current: any) => {
    // Chỉ lấy những người passed_prev_period === true
    if (current.passed_prev_period) {
      // Vì 1 người có thể xuất hiện ở nhiều kênh (FN, Sàn...), nên mình cần lọc trùng lặp ID
      const isExist = acc.find((item: any) => item.user_id === current.user_id);
      if (!isExist) {
        acc.push(current);
      }
    }
    return acc;
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      <Sidebar user={user} />
      <main style={{ flex: 1, overflowY: "auto", backgroundColor: "#f8f9fa", width: "100%" }}>
        <Breadcrumb />
        <div className="h-full flex flex-col bg-gray-100 overflow-y-auto font-sans relative">
      {loading && detail && <LoadingOverlay open={true} text="Đang xử lý..." />}
      {isEditing && (
        <div className="absolute inset-0 z-50">
          <CreateTopRaceModal
            onClose={() => setIsEditing(false)}
            onSubmit={handleUpdateGamification}
            departments={departments}
            initialData={detail}
          />
        </div>
      )}

      <div className="p-4 flex items-center justify-between bg-white shadow-sm shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(location.state?.from || '/gamification/individual')}
            className="p-2 hover:bg-gray-100 rounded-full transition"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-bold text-gray-800">Bảng Tin Chiến Dịch</h1>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleDownloadImage}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 shadow-sm transition-all"
          >
            <Download size={16} /> Tải Ảnh
          </button>

          <button
            onClick={() => setIsEditing(true)}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 shadow-sm transition-all"
          >
            Sửa chiến dịch
          </button>
        </div>
      </div>

      <div className="p-4 md:p-6 lg:p-8">
        <div
          ref={posterRef}
          className="max-w-[1200px] mx-auto bg-white shadow-2xl overflow-hidden border border-gray-200"
        >
          <div className="flex flex-col md:flex-row items-center justify-center p-4 pb-2 border-b-2 border-transparent gap-4">
            <div className="flex flex-col items-center shrink-0">
              <img
                src="/images/Logo_TDVN_251125.png"
                alt="Deal Sốc Logo"
                className="w-24 h-24 md:w-32 md:h-32 object-contain"
              />
              <span className="relative bottom-4 md:bottom-6 font-bold text-[9px] md:text-[11px] text-slate-500">
                Phước lành cho sức khoẻ
              </span>
            </div>
            <div className="text-center">
              <h1 className="text-red-600 font-black text-2xl md:text-2xl lg:text-3xl uppercase tracking-tight leading-tight">
                PHÒNG KINH DOANH & PHÁT TRIỂN THỊ TRƯỜNG
              </h1>
              <h2 className="text-red-600 font-black text-2xl md:text-3xl lg:text-3xl uppercase tracking-tight leading-tight mt-1">
                {detail.title}
              </h2>
            </div>
          </div>

          <div className={`p-4 pt-2 grid grid-cols-1 md:grid-cols-2 ${gridColsClass} gap-4`}>
            {renderChannelCard('Kênh FN', 'cskh')}

            {renderChannelCard('Kênh Livestream', 'live')}

            {renderChannelCard('Kênh Sàn/Shop', 'san')}

            {isChungActive() &&
              (() => {
                // 1. Kiểm tra xem có mốc thưởng nào được nhập không
                const activeTiers = ['tier1', 'tier2'].filter((tierKey: string) => {
                  const t = config.chung?.[tierKey];
                  return (
                    t && (hasValue(t.reward) || hasValue(t.direct_pct) || hasValue(t.support_pct))
                  );
                });

                return (
                  <div className="flex flex-col border-[3px] border-[#da251c] rounded-xl overflow-hidden bg-white shadow-lg h-full">
                    {/* HEADER PHÒNG BAN CHUNG */}
                    <div className="bg-[#da251c] text-white text-center py-2.5 shrink-0">
                      <h3 className="font-black text-xl uppercase tracking-wider">
                        Phòng Ban Chung
                      </h3>
                    </div>

                    {/* KHỐI ĐIỀU KIỆN CHUNG */}
                    <div className="flex-1 p-4 flex flex-col items-center justify-center bg-white relative">
                      <div className="text-[#da251c] font-black text-base uppercase mb-3 text-center">
                        Điều kiện chung
                      </div>

                      {config.chung?.condition_type === 'ORDERS'
                        ? hasValue(config.chung?.target_orders) && (
                            <div className="flex items-center gap-3 justify-center w-full">
                              <div className="relative text-[#da251c]">
                                <ShoppingCart size={40} strokeWidth={3} />
                                <div className="absolute -top-2 -right-2 bg-white rounded-full">
                                  <BadgeCent size={20} fill="#da251c" className="text-white" />
                                </div>
                              </div>
                              <div className="flex flex-col justify-center items-start">
                                <div className="text-[#da251c] font-bold text-xs uppercase leading-tight">
                                  Tổng đơn
                                </div>
                                <div className="text-[#da251c] font-black text-3xl lg:text-4xl leading-none">
                                  &gt;{formatVNDFull(config.chung?.target_orders)}
                                </div>
                              </div>
                            </div>
                          )
                        : hasValue(config.chung?.target_revenue) && (
                            <div className="flex items-center gap-3 justify-center w-full">
                              <div className="relative text-[#da251c]">
                                <TrendingUp size={40} strokeWidth={3} />
                                <div className="absolute -top-2 -right-2 bg-white rounded-full">
                                  <CircleDollarSign
                                    size={20}
                                    fill="#da251c"
                                    className="text-white"
                                  />
                                </div>
                              </div>
                              <div className="flex flex-col justify-center items-start">
                                <div className="text-[#da251c] font-bold text-xs uppercase leading-tight">
                                  Doanh số
                                </div>
                                <div className="text-[#da251c] font-black text-3xl lg:text-4xl leading-none">
                                  &gt;
                                  {config.chung?.target_revenue >= 1000000
                                    ? `${config.chung.target_revenue / 1000000}M`
                                    : formatVNDFull(config.chung?.target_revenue)}
                                </div>
                              </div>
                            </div>
                          )}
                    </div>

                    {/* KHỐI MỐC THƯỞNG */}
                    {/* KHỐI MỐC THƯỞNG */}
                    {activeTiers.length > 0 && (
                      <div className="bg-white flex flex-col w-full relative">
                        {activeTiers.map((tierKey: string, index: number) => {
                          const tier = config.chung[tierKey];
                          const hasReward = hasValue(tier.reward);
                          const hasDirect = hasValue(tier.direct_pct);
                          const hasSupport = hasValue(tier.support_pct);
                          const hasCpbh = hasValue(tier.max_cpbh);

                          return (
                            <div
                              key={tierKey}
                              className={`flex flex-col w-full p-4 ${index > 0 ? 'border-t border-dashed border-red-200' : 'border-t-[3px] border-[#da251c]'}`}
                            >
                              {hasCpbh && (
                                <div className="-ml-4 mb-1 self-start">
                                  <div className="bg-[#da251c] text-white inline-block px-3 py-[6px] rounded-r-xl font-bold text-[11px] uppercase tracking-wide shadow-sm">
                                    NẾU CPBH &lt;{tier.max_cpbh}%
                                  </div>
                                </div>
                              )}

                              <div className="flex flex-col items-center justify-center w-full gap-2">
                                {hasReward && (
                                  <div className="text-[#da251c] font-black text-2xl lg:text-2xl uppercase leading-none text-center">
                                    THƯỞNG {formatVNDFull(tier.reward)}
                                  </div>
                                )}

                                {(hasDirect || hasSupport) && (
                                  <div className="inline-flex items-center border-[1.5px] border-[#da251c] rounded-3xl text-[#da251c] overflow-hidden bg-red-50/30 shadow-sm ">
                                    {hasDirect && (
                                      <div
                                        className={`flex items-center gap-2 px-2 py-1 ${hasSupport ? 'border-r-[1.5px] border-[#da251c]' : ''}`}
                                      >
                                        <div className="flex flex-col text-right text-[10px] font-bold uppercase leading-none shrink-0 gap-[2px]">
                                          <span>Trực</span>
                                          <span>Tiếp</span>
                                        </div>
                                        <div className="text-2xl font-black leading-none">
                                          {tier.direct_pct}
                                          <span className="text-sm font-bold align-top">%</span>
                                        </div>
                                      </div>
                                    )}
                                    {hasSupport && (
                                      <div className="flex items-center gap-2 px-2 py-1">
                                        <div className="flex flex-col text-right text-[10px] font-bold uppercase leading-none shrink-0 gap-[2px]">
                                          <span>Hỗ</span>
                                          <span>Trợ</span>
                                        </div>
                                        <div className="text-2xl font-black leading-none">
                                          {tier.support_pct}
                                          <span className="text-sm font-bold align-top">%</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {hasValue(config.chung?.team_reward) && (
                      <div className=" w-full flex flex-col relative overflow-hidden border-t-[3px] border-[#da251c]">
                        <div className="bg-[#da251c] w-full text-white text-center py-1 border-b-[3px] border-white shrink-0">
                          <span className="font-bold text-sm uppercase">Thi đua team</span>
                        </div>

                        <div className="flex flex-col items-center p-3 w-full">
                          <div className="text-[#b8860b] font-bold text-[13px] text-center leading-relaxed">
                            Đội nhóm hoàn thành <br />
                            <span className="text-[#da251c] font-black text-[17px] mx-1">
                              {formatVNDFull(config.chung.team_target_orders)} ĐƠN
                            </span>
                            {hasValue(config.chung.team_target_aov) && (
                              <span>
                                {' '}
                                + AOV{' '}
                                <span className="text-[#da251c] font-black text-[15px]">
                                  {formatVNDFull(config.chung.team_target_aov)}
                                </span>
                              </span>
                            )}
                          </div>

                          {/* Khung Thưởng Nhanh Nhất (Chỉnh giống ảnh) */}
                          <div className="mt-3 mb-2 flex items-center justify-center bg-white px-6 py-2.5 rounded-full border border-yellow-200 shadow-[0_2px_8px_rgba(234,179,8,0.15)] mx-auto w-fit gap-4">
                            <div className="text-[#c69200] font-black text-[15px] uppercase tracking-wide">
                              NHANH NHẤT
                            </div>

                            <span className="text-red-300 font-black text-lg">➔</span>

                            <div className="flex flex-col items-center leading-none">
                              <span className="text-[#da251c] font-black text-sm uppercase mb-[3px]">
                                THƯỞNG
                              </span>
                              <span className="text-[#da251c] font-black text-[22px]">
                                {formatVNDFull(config.chung.team_reward)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {!isWeekly && (
                      <div className="bg-[#da251c] text-white text-center py-2.5 shrink-0 border-t-[3px] border-white flex flex-col items-center justify-center">
                        <div className="text-[10px] font-bold uppercase leading-tight tracking-wide mb-0.5">
                          Đầu vào hàng ngày
                        </div>
                        <div className="text-base font-black uppercase leading-tight">
                          {config.chung?.daily_input_percent || '80'}% mục tiêu
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
          </div>

          <div className="bg-red-600 text-white text-center py-2.5 md:py-3 mt-1">
            <p className="font-bold md:font-black text-base md:text-xl tracking-wide px-4">
              {isWeekly
                ? `Đối soát từ 00h ngày thứ 2 -> 24h00 ngày Chủ nhật (${detail.apply_date ? new Date(detail.apply_date).toLocaleDateString('vi-VN') : ''} - ${detail.end_date ? new Date(detail.end_date).toLocaleDateString('vi-VN') : ''})`
                : // THAY ĐỔI Ở ĐÂY LẤY THEO CONFIG KÊNH LẺ
                  `Thời gian: Từ 00h đến 24h - Đầu vào hàng ngày ${config.daily_input_percent || '70'}% mục tiêu`}
            </p>
          </div>
        </div>

        <div className="max-w-[1200px] mx-auto mt-10 mb-10">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3 text-slate-800">
              <Trophy className="text-yellow-500" size={32} />
              <h2 className="text-2xl font-black uppercase">Bảng Xếp Hạng Đua Top</h2>
            </div>
            <button
              onClick={fetchRealStats}
              className="flex items-center gap-2 text-sm bg-slate-800 text-white hover:bg-slate-700 px-4 py-2 rounded-lg transition-all shadow-sm"
            >
              <RefreshCw size={16} /> Làm mới
            </button>
          </div>

          {loadingStats ? (
            <div className="p-10 text-center text-slate-500 font-medium animate-pulse bg-white rounded-xl border border-gray-200">
              Đang quét hóa đơn và cập nhật bảng xếp hạng...
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {renderLeaderboardTable('Kênh FN / CSKH', cskhData, 'bg-blue-600', 'cskh')}
              {renderLeaderboardTable('Kênh Sàn / Shop', sanData, 'bg-orange-500', 'san')}
              {renderLeaderboardTable('Kênh Livestream', liveData, 'bg-rose-500', 'live')}
            </div>
          )}
        </div>

        <div className="max-w-[1200px] mx-auto mt-6 bg-white p-5 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-3">
            <Users className="text-red-600" size={20} /> Danh sách đủ điều kiện tham gia (
            {eligibleParticipants.length} nhân sự)
          </h3>

          {eligibleParticipants.length === 0 ? (
            <div className="text-center py-6 text-slate-400 font-medium italic">
              Hôm nay chưa có nhân sự nào đủ điều kiện tham gia (hoặc chưa phát sinh doanh số).
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {eligibleParticipants.map((user: any) => (
                <div
                  key={user.user_id}
                  className="flex items-center gap-3 p-2.5 bg-indigo-50/50 rounded-lg border border-indigo-100 hover:shadow-sm transition-all"
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm shrink-0">
                    {(user.user_name || 'U').charAt(0)}
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-sm font-bold text-slate-800 truncate">
                      {user.user_name}
                    </div>
                    <div className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 mt-0.5 truncate uppercase tracking-wide">
                      <Briefcase size={10} /> Đủ điều kiện
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Notification notification={notification} onClose={() => setNotification(null)} />
    </div>
      </main>
    </div>
  );
}
