import React, { useState, useEffect } from 'react';
import {
  X,
  Trophy,
  ChevronRight,
  Crown,
  Users,
  Target,
  Video,
  Store,
  HeadphonesIcon,
  CalendarDays,
  Flame,
  CheckCircle2,
  Trash2,
} from 'lucide-react';

// DANH SÁCH CÁC CHU KỲ ÁP DỤNG
const FREQUENCIES = [
  { id: 'DAILY', label: 'Ngày', icon: Flame },
  { id: 'WEEKLY', label: 'Tuần', icon: CalendarDays },
  { id: 'MONTHLY', label: 'Tháng', icon: Target },
  { id: 'QUARTERLY', label: 'Quý', icon: Crown },
  { id: 'YEARLY', label: 'Năm', icon: Trophy },
  { id: 'PERIOD', label: 'Kỳ', icon: CalendarDays },
];

// HÀM HELPER TỰ ĐỘNG TÍNH TOÁN NGÀY THÁNG VÀ TÊN DỰA VÀO CHU KỲ
const getFrequencyDefaults = (freqId) => {
  const today = new Date();
  let start_date = '';
  let end_date = '';
  let title = '';

  const formatDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDisplayDate = (d) => {
    return formatDate(d).split('-').reverse().join('/');
  };

  if (freqId === 'DAILY') {
    start_date = formatDate(today);
    end_date = formatDate(today);
    title = `THI ĐUA NGÀY ${formatDisplayDate(today)}`;
  } else if (freqId === 'WEEKLY') {
    const d = new Date(today);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Lùi về thứ 2
    const start = new Date(d.setDate(diff));
    const end = new Date(start);
    end.setDate(start.getDate() + 6); // Cộng 6 ngày ra Chủ nhật
    start_date = formatDate(start);
    end_date = formatDate(end);
    title = `THI ĐUA TUẦN - THÁNG ${today.getMonth() + 1}/${today.getFullYear()}`;
  } else if (freqId === 'MONTHLY') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0); // Ngày cuối cùng của tháng
    start_date = formatDate(start);
    end_date = formatDate(end);
    title = `THI ĐUA THÁNG ${today.getMonth() + 1}/${today.getFullYear()}`;
  } else if (freqId === 'QUARTERLY') {
    const quarter = Math.floor(today.getMonth() / 3); // 0, 1, 2, 3
    const start = new Date(today.getFullYear(), quarter * 3, 1);
    const end = new Date(today.getFullYear(), quarter * 3 + 3, 0);
    start_date = formatDate(start);
    end_date = formatDate(end);
    title = `THI ĐUA QUÝ ${quarter + 1}/${today.getFullYear()}`;
  } else if (freqId === 'YEARLY') {
    const start = new Date(today.getFullYear(), 0, 1);
    const end = new Date(today.getFullYear(), 11, 31);
    start_date = formatDate(start);
    end_date = formatDate(end);
    title = `THI ĐUA NĂM ${today.getFullYear()}`;
  } else if (freqId === 'PERIOD') {
    start_date = '';
    end_date = '';
    title = `THI ĐUA THEO KỲ TÙY CHỌN`;
  }

  return { start_date, end_date, title };
};

const InputGroup = ({ label, value, onChange, placeholder, suffix, type = 'text' }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
      {label}
    </label>
    <div className="relative flex items-center">
      <input
        type={type}
        className="w-full px-3 py-2 text-sm font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-all"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      {suffix && (
        <span className="absolute right-3 text-xs font-bold text-slate-400">{suffix}</span>
      )}
    </div>
  </div>
);

export default function CreateTopRaceModal(props: any) {
  const initialDefaults = getFrequencyDefaults('WEEKLY');

  // ĐÃ SỬA: Thêm 2 field vào state
  const [formData, setFormData] = useState({
    title: initialDefaults.title,
    frequency: 'WEEKLY',
    reward_mode: 'TARGET',
    start_date: initialDefaults.start_date,
    end_date: initialDefaults.end_date,
    selected_depts: [],
    selected_members: [],

    biz_config: {
      global_note: '', // <-- Ghi chú đua Team
      daily_input_percent: '70',
      cskh: {
        condition_type: 'CUSTOM_OR',
        min_orders: '',
        min_aov: '',
        min_revenue: '',
        target_reward: '',
        cond1_orders: '',
        cond2_aov: '',
        cond2_min_orders: '',
        base_reward: '',
        flash_pct: '',
        flash_time: '',
        flash_reward_text: '', // <-- Cấu hình giờ vàng
        rewards: [
          { rank: 1, amount: '', note: '' },
          { rank: 2, amount: '', note: '' },
          { rank: 3, amount: '', note: '' },
        ],
      },
      live: {
        condition_type: 'CUSTOM_OR',
        min_orders: '',
        min_aov: '',
        min_revenue: '',
        target_reward: '',
        cond1_orders: '',
        cond2_aov: '',
        cond2_min_orders: '',
        base_reward: '',
        flash_pct: '',
        flash_time: '',
        flash_reward_text: '', // <-- Cấu hình giờ vàng
        rewards: [
          { rank: 1, amount: '', note: '' },
          { rank: 2, amount: '', note: '' },
        ],
      },
      san: {
        condition_type: 'CUSTOM_OR',
        min_orders: '',
        min_aov: '',
        min_revenue: '',
        max_cpbh: '',
        target_reward: '',
        cond1_orders: '',
        cond2_cpbh: '',
        cond2_min_orders: '',
        base_reward: '',
        flash_pct: '',
        flash_time: '',
        flash_reward_text: '', // <-- Cấu hình giờ vàng
        rewards: [
          { rank: 1, amount: '', note: '' },
          { rank: 2, amount: '', note: '' },
        ],
      },
      chung: {
        daily_input_percent: '80',
        condition_type: 'REVENUE',
        target_revenue: '',
        target_orders: '',
        team_target_orders: '',
        team_target_aov: '',
        team_reward: '',
        tier1: { max_cpbh: '', reward: '', direct_pct: '', support_pct: '' },
        tier2: { max_cpbh: '', reward: '', direct_pct: '', support_pct: '' },
      },
    },
  });

  useEffect(() => {
    if (initialData) {
      const config = initialData.config_data || {};

      const formatBizConfig = (oldConfig) => {
        if (!oldConfig) return formData.biz_config;
        const newConfig = { ...oldConfig };

        // Nạp giá trị % nếu đã có, nếu không lấy mặc định
        newConfig.daily_input_percent = newConfig.daily_input_percent ?? '70';

        ['cskh', 'live', 'san'].forEach((channel) => {
          if (newConfig[channel]) {
            newConfig[channel].condition_type = newConfig[channel].condition_type || 'AOV';
            newConfig[channel].min_revenue = newConfig[channel].min_revenue ?? '';
          }
        });

        if (newConfig.chung) {
          newConfig.chung.condition_type = newConfig.chung.condition_type || 'REVENUE';
          newConfig.chung.target_orders = newConfig.chung.target_orders ?? '';
          newConfig.chung.daily_input_percent = newConfig.chung.daily_input_percent ?? '80'; // Nạp % chung
        }

        return newConfig;
      };

      setFormData({
        title: initialData.title,
        frequency: initialData.frequency || 'WEEKLY',
        reward_mode: config.reward_mode || 'TARGET',
        start_date: initialData.start_date || initialData.apply_date || '',
        end_date: initialData.end_date || '',
        selected_depts: config.selected_depts || [],
        selected_members: config.selected_members || [],
        biz_config: formatBizConfig(config.biz_config),
      });
    } else {
      if (departments.length > 0 && formData.selected_depts.length === 0) {
        const bizDept = departments.find(
          (d) =>
            d.department_name?.toLowerCase().includes('kinh doanh') ||
            d.name?.toLowerCase().includes('kinh doanh')
        );
        if (bizDept)
          setFormData((prev) => ({
            ...prev,
            selected_depts: [bizDept.id || bizDept.department_id],
          }));
      }
    }
  }, [initialData, departments]);

  const handleFrequencyChange = (freqId, freqLabel) => {
    const newDefaults = getFrequencyDefaults(freqId);
    setFormData((prev) => ({
      ...prev,
      frequency: freqId,
      title: newDefaults.title,
      start_date: newDefaults.start_date,
      end_date: newDefaults.end_date,
    }));
  };

  const handleBizInputChange = (group, field, value) => {
    let val = parseFloat(value.replace(/\./g, ''));
    if (value === '' || isNaN(val)) {
      val = '';
    }
    setFormData((prev) => ({
      ...prev,
      biz_config: { ...prev.biz_config, [group]: { ...prev.biz_config[group], [field]: val } },
    }));
  };

  const handleConditionTypeChange = (group, type) => {
    setFormData((prev) => ({
      ...prev,
      biz_config: {
        ...prev.biz_config,
        [group]: {
          ...prev.biz_config[group],
          condition_type: type,
        },
      },
    }));
  };

  const handleChungTierChange = (tier, field, value) => {
    let val = parseFloat(value.replace(/\./g, ''));
    if (value === '' || isNaN(val)) {
      val = '';
    }
    setFormData((prev) => ({
      ...prev,
      biz_config: {
        ...prev.biz_config,
        chung: {
          ...prev.biz_config.chung,
          [tier]: { ...prev.biz_config.chung[tier], [field]: val },
        },
      },
    }));
  };

  const handleAddRank = (group) => {
    const currentRewards = formData.biz_config[group].rewards;
    const newReward = { rank: currentRewards.length + 1, amount: '', note: '' }; // Set amount = ''
    setFormData((prev) => ({
      ...prev,
      biz_config: {
        ...prev.biz_config,
        [group]: { ...prev.biz_config[group], rewards: [...currentRewards, newReward] },
      },
    }));
  };

  const handleRemoveRank = (group, index) => {
    const currentRewards = formData.biz_config[group].rewards;
    if (currentRewards.length <= 1) return;
    const newRewards = currentRewards
      .filter((_, i) => i !== index)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    setFormData((prev) => ({
      ...prev,
      biz_config: {
        ...prev.biz_config,
        [group]: { ...prev.biz_config[group], rewards: newRewards },
      },
    }));
  };

  const handleRankRewardChange = (group, index, field, value) => {
    const currentRewards = [...formData.biz_config[group].rewards];

    if (field === 'amount') {
      let val = parseFloat(value.replace(/\./g, ''));
      currentRewards[index][field] = value === '' || isNaN(val) ? '' : val;
    } else {
      currentRewards[index][field] = value;
    }

    setFormData((prev) => ({
      ...prev,
      biz_config: {
        ...prev.biz_config,
        [group]: { ...prev.biz_config[group], rewards: currentRewards },
      },
    }));
  };

  const formatVND = (v) => {
    if (v === undefined || v === null || v === '') return '';
    if (v === 0) return '0';
    return new Intl.NumberFormat('vi-VN').format(v);
  };

  const handleSubmit = () => {
    if (!formData.title) return alert('Vui lòng nhập tên chương trình');

    if (formData.frequency !== 'PERIOD' && (!formData.start_date || !formData.end_date)) {
      return alert('Vui lòng chọn ngày bắt đầu và ngày kết thúc');
    }

    const submitData = {
      title: formData.title,
      type: 'TOP_RACE',
      frequency: formData.frequency,
      start_date: formData.start_date,
      end_date: formData.end_date || null,
      apply_date: formData.start_date,
      config_data: {
        selected_depts: formData.selected_depts,
        selected_members: [],
        is_biz_campaign: true,
        reward_mode: formData.reward_mode,
        biz_config: formData.biz_config,
      },
    };

    console.log('Payload gửi đi:', submitData);
    onSubmit(submitData);
  };

  const renderConditionInputs = (groupKey) => {
    const conditionType = formData.biz_config[groupKey].condition_type || 'AOV';
    const data = formData.biz_config[groupKey];

    return (
      <div className="space-y-4">
        {/* TAB CHỌN ĐIỀU KIỆN */}
        <div className="flex bg-slate-100 p-1 rounded-lg flex-wrap gap-1">
          <button
            type="button"
            onClick={() => handleConditionTypeChange(groupKey, 'AOV')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all min-w-[30%] ${
              conditionType === 'AOV'
                ? 'bg-white shadow-sm text-slate-800'
                : 'text-slate-500 hover:bg-slate-200'
            }`}
          >
            TB Đơn
          </button>
          <button
            type="button"
            onClick={() => handleConditionTypeChange(groupKey, 'REVENUE')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all min-w-[30%] ${
              conditionType === 'REVENUE'
                ? 'bg-white shadow-sm text-slate-800'
                : 'text-slate-500 hover:bg-slate-200'
            }`}
          >
            Doanh số
          </button>
          <button
            type="button"
            onClick={() => handleConditionTypeChange(groupKey, 'CUSTOM_OR')}
            className={`flex-1 py-1.5 text-[11px] font-bold rounded-md transition-all min-w-[30%] ${
              conditionType === 'CUSTOM_OR'
                ? 'bg-indigo-600 shadow-sm text-white'
                : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
            }`}
          >
            Kép (Hoặc 1-2)
          </button>
        </div>

        {/* CÁC Ô NHẬP LIỆU TÙY THEO TAB */}
        {conditionType === 'CUSTOM_OR' ? (
          <div className="space-y-3 p-3 bg-slate-50 border border-indigo-100 rounded-xl">
            <div className="text-xs font-bold text-indigo-700 uppercase tracking-wide border-b border-indigo-100 pb-1">
              (1) Điều kiện Đơn
            </div>
            <InputGroup
              label="Số đơn hàng"
              placeholder="VD: 8"
              suffix="Đơn"
              value={formatVND(data.cond1_orders)}
              onChange={(e: any) => handleBizInputChange(groupKey, 'cond1_orders', e.target.value)}
            />

            <div className="text-xs font-bold text-indigo-700 uppercase tracking-wide border-b border-indigo-100 pb-1 mt-4">
              (2) Điều kiện Phụ
            </div>
            {groupKey === 'san' ? (
              <InputGroup
                label="CPBH tối đa"
                placeholder="VD: 35"
                suffix="%"
                value={data.cond2_cpbh || ''}
                onChange={(e: any) => handleBizInputChange(groupKey, 'cond2_cpbh', e.target.value)}
              />
            ) : (
              <InputGroup
                label="AOV tối thiểu"
                placeholder="VD: 650.000"
                suffix="VNĐ"
                value={formatVND(data.cond2_aov)}
                onChange={(e: any) => handleBizInputChange(groupKey, 'cond2_aov', e.target.value)}
              />
            )}
            <InputGroup
              label="Nhưng phải đạt Tối thiểu"
              placeholder="VD: 5"
              suffix="Đơn"
              value={formatVND(data.cond2_min_orders)}
              onChange={(e: any) => handleBizInputChange(groupKey, 'cond2_min_orders', e.target.value)}
            />
          </div>
        ) : conditionType === 'AOV' ? (
          <>
            <InputGroup
              label="Số đơn tối thiểu"
              placeholder="VD: 55"
              suffix="Đơn"
              value={formatVND(data.min_orders)}
              onChange={(e: any) => handleBizInputChange(groupKey, 'min_orders', e.target.value)}
            />
            <InputGroup
              label="Trung bình đơn"
              placeholder="VD: 650.000"
              suffix="VNĐ"
              value={formatVND(data.min_aov)}
              onChange={(e: any) => handleBizInputChange(groupKey, 'min_aov', e.target.value)}
            />
          </>
        ) : (
          <>
            <InputGroup 
              label="Số đơn tối thiểu (Tùy chọn)" 
              placeholder="VD: 55" 
              suffix="Đơn" 
              value={formatVND(data.min_orders)} 
              onChange={(e: any) => handleBizInputChange(groupKey, 'min_orders', e.target.value)} 
            />
            
            <InputGroup 
              label="Tổng doanh số tối thiểu" 
              placeholder="VD: 50.000.000" 
              suffix="VNĐ" 
              value={formatVND(data.min_revenue)} 
              onChange={(e: any) => handleBizInputChange(groupKey, 'min_revenue', e.target.value)} 
            />
            
            {groupKey === 'cskh' && (
              <InputGroup 
                label="AOV tối thiểu (Tùy chọn)" 
                placeholder="VD: 650.000" 
                suffix="VNĐ" 
                value={formatVND(data.min_aov)} 
                onChange={(e: any) => handleBizInputChange(groupKey, 'min_aov', e.target.value)} 
              />
            )}
          </>
        )}

        {groupKey === 'san' && isDaily && conditionType !== 'CUSTOM_OR' && (
          <InputGroup
            label="Chi phí bán hàng tối đa"
            placeholder="VD: 35"
            suffix="%"
            value={formData.biz_config.san.max_cpbh || ''}
            onChange={(e: any) => handleBizInputChange('san', 'max_cpbh', e.target.value)}
          />
        )}

        {/* ---> KHỐI "THƯỞNG NHANH" DÙNG CHUNG CHO TẤT CẢ CÁC TAB <--- */}
        <div className="mt-4 pt-4 border-t border-dashed border-rose-200">
          <div className="text-[10px] font-black text-rose-500 uppercase tracking-wide mb-2 flex items-center gap-1">
            <Flame size={14} /> Thưởng Nhanh Giờ Vàng (Tuỳ chọn)
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <InputGroup
              label="Hoàn thành (%)"
              placeholder="VD: 70"
              suffix="%"
              value={data.flash_pct || ''}
              onChange={(e: any) => handleBizInputChange(groupKey, 'flash_pct', e.target.value)}
            />
            <InputGroup
              type="time"
              label="Trước Giờ"
              value={data.flash_time || ''}
              onChange={(e: any) =>
                setFormData((prev) => ({
                  ...prev,
                  biz_config: {
                    ...prev.biz_config,
                    [groupKey]: { ...prev.biz_config[groupKey], flash_time: e.target.value },
                  },
                }))
              }
            />
          </div>
          <InputGroup
            label="Quà tặng (Text)"
            placeholder="VD: 1 Bánh/Kẹo..."
            value={data.flash_reward_text || ''}
            onChange={(e: any) =>
              setFormData((prev) => ({
                ...prev,
                biz_config: {
                  ...prev.biz_config,
                  [groupKey]: { ...prev.biz_config[groupKey], flash_reward_text: e.target.value },
                },
              }))
            }
          />
        </div>
      </div>
    );
  };

  const renderRewards = (groupKey, themeColor) => {
    const colorMap = {
      blue: 'text-blue-600 focus:ring-blue-100',
      rose: 'text-rose-600 focus:ring-rose-100',
      amber: 'text-amber-600 focus:ring-amber-100',
    };

    const conditionType = formData.biz_config[groupKey].condition_type;

    // --- NẾU CHỌN "MỤC TIÊU ĐỒNG GIÁ" ---
    if (formData.reward_mode === 'TARGET') {
      return (
        <div className="mt-5 pt-4 border-t border-slate-100">
          {conditionType === 'CUSTOM_OR' && (
            <div className="mb-4 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
              <InputGroup
                label="Thưởng đạt (1) HOẶC (2)"
                placeholder="VD: 50.000"
                suffix="VNĐ"
                value={formatVND(formData.biz_config[groupKey].base_reward)}
                onChange={(e: any) => handleBizInputChange(groupKey, 'base_reward', e.target.value)}
              />
            </div>
          )}
          <InputGroup
            label={
              conditionType === 'CUSTOM_OR'
                ? 'Mức thưởng đạt CẢ (1) VÀ (2)'
                : 'Mức thưởng đạt chỉ tiêu'
            }
            placeholder="VD: 1.000.000"
            suffix="VNĐ"
            value={formatVND(formData.biz_config[groupKey].target_reward)}
            onChange={(e: any) => handleBizInputChange(groupKey, 'target_reward', e.target.value)}
          />
        </div>
      );
    }

    // --- NẾU CHỌN "XẾP HẠNG ĐUA TOP" ---
    return (
      <div className="mt-5 pt-4 border-t border-slate-100">
        {/* Thưởng cơ bản nếu là chế độ Kép */}
        {conditionType === 'CUSTOM_OR' && (
          <div className="mb-4 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
            <InputGroup
              label="Thưởng đạt (1) HOẶC (2)"
              placeholder="VD: 50.000"
              suffix="VNĐ"
              value={formatVND(formData.biz_config[groupKey].base_reward)}
              onChange={(e: any) => handleBizInputChange(groupKey, 'base_reward', e.target.value)}
            />
          </div>
        )}

        <div className="flex justify-between items-center mb-3">
          <label className="text-[11px] font-bold text-slate-600 uppercase flex items-center gap-1.5">
            <Crown size={14} className="text-amber-400" /> Giải Top (VNĐ)
          </label>
          <button
            onClick={() => handleAddRank(groupKey)}
            className="text-[10px] font-semibold text-slate-500 hover:text-indigo-600"
          >
            + Thêm Top
          </button>
        </div>

        <div className="space-y-2">
          {formData.biz_config[groupKey].rewards.map((reward: any, idx: number) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="w-6 h-6 rounded flex items-center justify-center text-[11px] font-bold bg-slate-100 text-slate-500 shrink-0">
                #{reward.rank}
              </div>
              <input
                className={`flex-1 px-3 py-1.5 text-sm font-bold border rounded-md outline-none transition-all ${colorMap[themeColor]}`}
                placeholder="Số tiền..."
                value={formatVND(reward.amount)}
                onChange={(e: any) => handleRankRewardChange(groupKey, idx, 'amount', e.target.value)}
              />
              {formData.biz_config[groupKey].rewards.length > 1 && (
                <button
                  onClick={() => handleRemoveRank(groupKey, idx)}
                  className="text-slate-300 hover:text-red-500 p-1"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const isDaily = formData.frequency === 'DAILY';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6 font-sans">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[95vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div
              className={`p-3 text-white rounded-2xl shadow-md ${isDaily ? 'bg-rose-600 shadow-rose-200' : 'bg-indigo-600 shadow-indigo-200'}`}
            >
              <Trophy size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800 tracking-tight">
                {initialData ? 'Cập Nhật thời gian thi đua' : 'Thời gian thi đua'}
              </h3>
              <p className="text-sm text-slate-500 font-medium">Cấu hình KPI & Cơ chế doanh số</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar bg-slate-50/50">
          <div className="flex justify-center -mt-2">
            <div className="bg-white p-1.5 rounded-2xl flex flex-wrap justify-center gap-1 border border-slate-200 shadow-sm max-w-4xl mx-auto">
              {FREQUENCIES.map((freq) => {
                const isSelected = formData.frequency === freq.id;
                const Icon = freq.icon;
                return (
                  <button
                    key={freq.id}
                    type="button"
                    onClick={() => handleFrequencyChange(freq.id, freq.label)}
                    className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
                      isSelected
                        ? isDaily
                          ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-sm'
                          : 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon size={16} /> {freq.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-center animate-in fade-in slide-in-from-top-2 -mt-4">
            <div className="bg-white p-1 rounded-xl flex gap-1 border border-slate-200 shadow-sm">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, reward_mode: 'TARGET' })}
                className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  formData.reward_mode === 'TARGET'
                    ? 'bg-slate-800 text-white shadow-md'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                Mục tiêu đồng giá
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, reward_mode: 'TOP' })}
                className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  formData.reward_mode === 'TOP'
                    ? 'bg-slate-800 text-white shadow-md'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                Xếp hạng Đua Top
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 space-y-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4 uppercase tracking-wider">
                <span
                  className={`w-2 h-5 rounded-full ${!isDaily ? 'bg-indigo-500' : 'bg-rose-500'}`}
                ></span>{' '}
                Thông tin chung
              </h4>
              <InputGroup
                label="Tên chương trình"
                placeholder="VD: Đua Top Cuối Tháng..."
                value={formData.title}
                onChange={(e: any) => setFormData({ ...formData, title: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-4">
                <InputGroup
                  type="date"
                  label="Ngày bắt đầu"
                  value={formData.start_date}
                  onChange={(e: any) => setFormData({ ...formData, start_date: e.target.value })}
                />
                <InputGroup
                  type="date"
                  label="Ngày kết thúc"
                  value={formData.end_date}
                  onChange={(e: any) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center bg-gradient-to-br from-indigo-50/50 to-white relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 text-indigo-100/40 group-hover:scale-110 transition-transform duration-500">
                <Users size={160} />
              </div>
              <div className="w-14 h-14 bg-white text-indigo-600 rounded-full flex items-center justify-center mb-3 shadow-md z-10 border border-indigo-100">
                <CheckCircle2 size={28} />
              </div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide z-10 mb-1">
                Đối tượng áp dụng
              </h4>
              <p className="text-3xl font-black text-indigo-800 z-10 text-center">
                Phòng Kinh Doanh
              </p>
              <p className="text-xs text-slate-500 mt-3 text-center max-w-[280px] z-10 bg-white/60 p-2 rounded-lg border border-indigo-50">
                Chiến dịch này được khóa mặc định cho toàn bộ nhân sự Khối Kinh Doanh.
              </p>
            </div>
          </div>

          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-200 pb-3 uppercase tracking-wider">
              <Target size={20} className={!isDaily ? 'text-indigo-600' : 'text-rose-600'} />
              Cấu hình Chỉ tiêu & Phần thưởng
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:border-blue-300 transition-colors">
                <div className="bg-blue-50/80 px-5 py-4 border-b border-blue-100 flex items-center gap-2">
                  <div className="p-1.5 bg-blue-600 text-white rounded-lg">
                    <HeadphonesIcon size={18} />
                  </div>
                  <span className="font-black text-blue-900 text-sm uppercase tracking-wide">
                    Data FN (CSKH)
                  </span>
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between">
                  {renderConditionInputs('cskh')}
                  {renderRewards('cskh', 'blue')}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:border-rose-300 transition-colors">
                <div className="bg-rose-50/80 px-5 py-4 border-b border-rose-100 flex items-center gap-2">
                  <div className="p-1.5 bg-rose-600 text-white rounded-lg">
                    <Video size={18} />
                  </div>
                  <span className="font-black text-rose-900 text-sm uppercase tracking-wide">
                    Kênh Livestream
                  </span>
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between">
                  {renderConditionInputs('live')}
                  {renderRewards('live', 'rose')}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:border-amber-300 transition-colors">
                <div className="bg-amber-50/80 px-5 py-4 border-b border-amber-100 flex items-center gap-2">
                  <div className="p-1.5 bg-amber-500 text-white rounded-lg">
                    <Store size={18} />
                  </div>
                  <span className="font-black text-amber-900 text-sm uppercase tracking-wide">
                    Kênh Sàn / Shop
                  </span>
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between">
                  {renderConditionInputs('san')}
                  {renderRewards('san', 'amber')}
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-slate-100/50 px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                <div className="p-1.5 bg-slate-700 text-white rounded-lg">
                  <Users size={18} />
                </div>
                <span className="font-black text-slate-800 text-sm uppercase tracking-wide">
                  Phòng Ban Chung - Thưởng Doanh Số
                </span>
              </div>

              <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 flex flex-col justify-center gap-4">
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => handleConditionTypeChange('chung', 'REVENUE')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                        formData.biz_config.chung.condition_type !== 'ORDERS'
                          ? 'bg-white shadow-sm text-slate-800'
                          : 'text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      Tổng Doanh Số
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConditionTypeChange('chung', 'ORDERS')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                        formData.biz_config.chung.condition_type === 'ORDERS'
                          ? 'bg-white shadow-sm text-slate-800'
                          : 'text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      Tổng Đơn Hàng
                    </button>
                  </div>

                  {formData.biz_config.chung.condition_type === 'ORDERS' ? (
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide block">
                        Điều kiện Tổng Đơn {'>'}
                      </label>
                      <div className="relative">
                        <input
                          className={`w-full text-3xl font-black p-4 bg-slate-50 border-2 rounded-xl outline-none focus:bg-white transition-all ${
                            !isDaily
                              ? 'text-indigo-600 border-indigo-100 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50'
                              : 'text-rose-600 border-rose-100 focus:border-rose-400 focus:ring-4 focus:ring-rose-50'
                          }`}
                          value={formatVND(formData.biz_config.chung.target_orders)}
                          onChange={(e: any) =>
                            handleBizInputChange('chung', 'target_orders', e.target.value)
                          }
                        />
                        <span
                          className={`absolute right-5 top-5 font-bold ${!isDaily ? 'text-indigo-300' : 'text-rose-300'}`}
                        >
                          ĐƠN
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide block">
                        Điều kiện Doanh số {'>'}
                      </label>
                      <div className="relative">
                        <input
                          className={`w-full text-3xl font-black p-4 bg-slate-50 border-2 rounded-xl outline-none focus:bg-white transition-all ${
                            !isDaily
                              ? 'text-indigo-600 border-indigo-100 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50'
                              : 'text-rose-600 border-rose-100 focus:border-rose-400 focus:ring-4 focus:ring-rose-50'
                          }`}
                          value={formatVND(formData.biz_config.chung.target_revenue)}
                          onChange={(e: any) =>
                            handleBizInputChange('chung', 'target_revenue', e.target.value)
                          }
                        />
                        <span
                          className={`absolute right-5 top-5 font-bold ${!isDaily ? 'text-indigo-300' : 'text-rose-300'}`}
                        >
                          VNĐ
                        </span>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-1 font-medium">
                    Mức điều kiện chung bắt buộc để kích hoạt quỹ thưởng cho toàn bộ nhân sự.
                  </p>

                  {/* THÊM 2 Ô NHẬP % CHO CHẾ ĐỘ NGÀY VÀO ĐÂY */}
                  {isDaily && (
                    <div className="flex gap-4 mt-2 pt-4 border-t border-slate-100">
                      <div className="flex-1">
                        <InputGroup
                          label="% Điều kiện cá nhân"
                          placeholder="VD: 70"
                          suffix="%"
                          value={formData.biz_config.daily_input_percent}
                          onChange={(e: any) =>
                            setFormData((prev) => ({
                              ...prev,
                              biz_config: {
                                ...prev.biz_config,
                                daily_input_percent: e.target.value.replace(/[^0-9]/g, ''),
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="flex-1">
                        <InputGroup
                          label="% Phòng ban chung"
                          placeholder="VD: 80"
                          suffix="%"
                          value={formData.biz_config.chung.daily_input_percent}
                          onChange={(e: any) =>
                            setFormData((prev) => ({
                              ...prev,
                              biz_config: {
                                ...prev.biz_config,
                                chung: {
                                  ...prev.biz_config.chung,
                                  daily_input_percent: e.target.value.replace(/[^0-9]/g, ''),
                                },
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-5 pt-4 border-t border-slate-200">
                    <div className="text-xs font-bold text-indigo-600 uppercase mb-4 flex items-center gap-2 bg-indigo-50 p-2.5 rounded-lg border border-indigo-100">
                      <Trophy size={16} /> Cấu hình Thi đua Team (Chỉ hiển thị Poster)
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <InputGroup
                        label="Mục tiêu (Đơn)"
                        placeholder="VD: 16"
                        suffix="Đơn"
                        value={formatVND(formData.biz_config.chung.team_target_orders)}
                        onChange={(e: any) =>
                          handleBizInputChange('chung', 'team_target_orders', e.target.value)
                        }
                      />
                      <InputGroup
                        label="AOV Kèm theo"
                        placeholder="VD: 650.000"
                        suffix="VNĐ"
                        value={formatVND(formData.biz_config.chung.team_target_aov)}
                        onChange={(e: any) =>
                          handleBizInputChange('chung', 'team_target_aov', e.target.value)
                        }
                      />

                      <div className="sm:col-span-2">
                        <InputGroup
                          label="Thưởng Nhanh Nhất"
                          placeholder="VD: 200.000"
                          suffix="VNĐ"
                          value={formatVND(formData.biz_config.chung.team_reward)}
                          onChange={(e: any) =>
                            handleBizInputChange('chung', 'team_reward', e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {['tier1', 'tier2'].map((tierKey, index) => (
                    <div
                      key={tierKey}
                      className={`rounded-2xl p-5 border-2 relative transition-all hover:shadow-md ${index === 1 && !formData.biz_config.chung.tier2.reward ? 'bg-slate-50/50 border-dashed border-slate-200 opacity-70 hover:opacity-100' : 'bg-white border-slate-100'}`}
                    >
                      <div className="absolute top-0 right-0 bg-slate-800 text-white text-[10px] font-bold px-3 py-1.5 rounded-bl-xl rounded-tr-xl uppercase tracking-wider">
                        {index === 0 ? 'Mốc 1' : 'Mốc 2 (Tuỳ chọn)'}
                      </div>

                      <div className="mb-5 mt-2">
                        <label className="text-xs font-bold text-slate-500 flex items-center gap-2 mb-1.5 uppercase tracking-wide">
                          Nếu CPBH {'<'}
                        </label>
                        <div className="relative w-28">
                          <input
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-base font-black text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                            placeholder="%"
                            value={formData.biz_config.chung[tierKey].max_cpbh || ''}
                            onChange={(e: any) =>
                              handleChungTierChange(tierKey, 'max_cpbh', e.target.value)
                            }
                          />
                          <span className="absolute right-3 top-2.5 text-sm text-slate-400 font-bold">
                            %
                          </span>
                        </div>
                      </div>

                      <div className="mb-5">
                        <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wide">
                          Mức thưởng (VNĐ)
                        </label>
                        <input
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-black text-emerald-600 outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-50 transition-all"
                          placeholder="Để trống nếu không dùng"
                          value={formatVND(formData.biz_config.chung[tierKey].reward)}
                          onChange={(e: any) => handleChungTierChange(tierKey, 'reward', e.target.value)}
                        />
                      </div>

                      <div className="flex gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex-1">
                          <label className="text-[10px] text-slate-500 font-bold block mb-1 uppercase tracking-wide">
                            Trực tiếp (%)
                          </label>
                          <input
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-center outline-none focus:border-indigo-500 transition-colors"
                            value={formData.biz_config.chung[tierKey].direct_pct || ''}
                            onChange={(e: any) =>
                              handleChungTierChange(tierKey, 'direct_pct', e.target.value)
                            }
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] text-slate-500 font-bold block mb-1 uppercase tracking-wide">
                            Hỗ trợ (%)
                          </label>
                          <input
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-center outline-none focus:border-indigo-500 transition-colors"
                            value={formData.biz_config.chung[tierKey].support_pct || ''}
                            onChange={(e: any) =>
                              handleChungTierChange(tierKey, 'support_pct', e.target.value)
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-white border-t border-slate-100 flex justify-end gap-3 shrink-0 rounded-b-3xl">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          >
            Hủy bỏ
          </button>
          <button
            onClick={handleSubmit}
            className={`px-8 py-3 rounded-xl text-sm font-black text-white shadow-lg transition-all hover:-translate-y-0.5 flex items-center gap-2 ${!isDaily ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'}`}
          >
            {initialData ? 'Cập nhật thay đổi' : `Tạo Chiến Dịch Mới`} <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
