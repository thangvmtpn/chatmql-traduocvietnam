import { useState, useEffect } from 'react';
import { X, Target, Gift, Box, CheckCircle2 } from 'lucide-react';
import { get_sale_channels } from '@/api/invoices';

interface ProductConfig {
  min_order: number;
  limit_deal: number;
  reward: number;
}

interface CreateDealShockModalProps {
  onClose: () => void;
  onSubmit: (payload: any) => void;
  onError?: (message: string) => void;
  products?: any[];
  initialData?: any;
}

interface FormData {
  title: string;
  frequency: string;
  channel: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  target_description: string;
  product_ids: (number | string)[];
  product_configs: Record<number | string, ProductConfig>;
}

export default function CreateDealShockModal({
  onClose,
  onSubmit,
  onError,
  products = [],
  initialData = null,
}: CreateDealShockModalProps) {
  const [channels, setChannels] = useState<any[]>([]);

  const [formData, setFormData] = useState<FormData>(() => {
    if (initialData) {
      const product_ids: (number | string)[] = initialData.config_data?.products?.map((p: any) => p.id) || [];
      const product_configs: Record<number | string, ProductConfig> = {};
      initialData.config_data?.products?.forEach((p: any) => {
        product_configs[p.id] = {
          min_order: p.min_order_quantity || 1,
          limit_deal: p.deal_limit || 0,
          reward: p.reward_per_deal || 0,
        };
      });

      return {
        title: initialData.title || '',
        frequency: initialData.frequency || 'DAY',
        channel: initialData.config_data?.channel_id || 'ALL',

        start_date: initialData.start_date
          ? new Date(initialData.start_date).toISOString().split('T')[0]
          : '',
        end_date: initialData.end_date
          ? new Date(initialData.end_date).toISOString().split('T')[0]
          : '',

        start_time: initialData.start_time ? initialData.start_time.substring(0, 5) : '',
        end_time: initialData.end_time ? initialData.end_time.substring(0, 5) : '',

        target_description: initialData.target_description || '',
        product_ids,
        product_configs,
      } as FormData;
    }

    return {
      title: '',
      frequency: 'DAY',
      channel: 'ALL',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      start_time: '',
      end_time: '',
      target_description: '',
      product_ids: [],
      product_configs: {},
    } as FormData;
  });

  const isEditMode = !!initialData;

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const res = await get_sale_channels();

        const channelData = res?.channel || [];

        setChannels(channelData);
      } catch (error) {
        console.error('Lỗi khi tải danh sách kênh:', error);
      }
    };

    fetchChannels();
  }, []);

  // --- UTILS ---
  const formatCurrency = (value: any) => {
    if (!value && value !== 0) return '';
    return new Intl.NumberFormat('vi-VN').format(value);
  };

  const parseCurrency = (value: any) => {
    return value.toString().replace(/\./g, '');
  };

  // --- HANDLERS ---
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev: FormData) => ({ ...prev, [name]: value } as FormData));
  };

  const handleProductToggle = (prodId: number | string) => {
    setFormData((prev: FormData) => {
      const currentIds = prev.product_ids;
      const currentConfigs = { ...prev.product_configs };

      if (currentIds.includes(prodId)) {
        delete currentConfigs[prodId];
        return {
          ...prev,
          product_ids: currentIds.filter((id) => id !== prodId),
          product_configs: currentConfigs,
        };
      } else {
        return {
          ...prev,
          product_ids: [...currentIds, prodId],
          product_configs: {
            ...currentConfigs,
            [prodId]: { min_order: 1, limit_deal: 0, reward: 0 } as ProductConfig,
          },
        };
      }
    });
  };

  const handleProductConfigChange = (prodId: number | string, field: keyof ProductConfig, value: any) => {
    let finalValue = value;
    if (field === 'reward') {
      const raw = parseCurrency(value);
      if (isNaN(raw)) return;
      finalValue = Number(raw);
    } else {
      finalValue = Number(value);
    }

    setFormData((prev: FormData) => ({
      ...prev,
      product_configs: {
        ...prev.product_configs,
        [prodId]: {
          ...prev.product_configs[prodId],
          [field]: finalValue,
        } as ProductConfig,
      },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emitError = onError || ((message: string) => console.warn(message));
    if (!formData.title?.trim()) return emitError('Vui lòng nhập tên chương trình!');
    if (!formData.start_date) return emitError('Vui lòng chọn ngày bắt đầu!');
    if (formData.product_ids.length === 0) return emitError('Vui lòng chọn ít nhất 1 sản phẩm!');
    if (!formData.start_time) return emitError('Vui lòng chọn giờ bắt đầu!');
    if (!formData.end_time) return emitError('Vui lòng chọn giờ kết thúc!');
    if (!formData.end_date) return emitError('Vui lòng chọn ngày kết thúc!');

    const start = new Date(formData.start_date);
    const end = new Date(formData.end_date);
    if (end < start) return emitError('Ngày kết thúc phải sau ngày bắt đầu!');
    if (
      formData.start_date === formData.end_date &&
      formData.start_time &&
      formData.end_time &&
      formData.end_time <= formData.start_time
    ) {
      return emitError('Giờ kết thúc phải lớn hơn giờ bắt đầu khi cùng ngày!');
    }

    const selectedChannelObj = channels.find(
      (c) => c.id_salechannel.toString() === formData.channel.toString()
    );
    const channelName =
      formData.channel === 'ALL'
        ? 'Tất cả các kênh'
        : selectedChannelObj
          ? selectedChannelObj.name_salechannel
          : 'Tất cả các kênh';

    const selectedProductsDetails = products
      .filter((p) => formData.product_ids.includes(p.id_product))
      .map((p) => {
        const config = formData.product_configs[p.id_product];
        return {
          id: p.id_product,
          name: p.name_product,
          code: p.code_product,
          price: p.price,
          min_order_quantity: config?.min_order || 1,
          deal_limit: config?.limit_deal || 0,
          reward_per_deal: config?.reward || 0,
        };
      });

    const payload = {
      type: 'DEAL_SHOCK',
      title: formData.title,
      frequency: formData.frequency,
      apply_date: formData.start_date,
      start_date: formData.start_date,
      end_date: formData.end_date,

      start_time: formData.start_time,
      end_time: formData.end_time,

      target_description: formData.target_description,
      config_data: {
        products: selectedProductsDetails,
        channel_id: formData.channel,
        channel_name: channelName,
      },
    };

    onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center font-sans justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden animate-fade-in border border-gray-100 flex flex-col max-h-[95vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white shrink-0">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <div className="p-1.5 bg-red-50 rounded-lg text-red-600">⚡</div>
            {isEditMode ? 'Sửa Deal Sốc' : 'Tạo Deal Sốc Mới'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <form id="deal-shock-form" onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Section 1: Thông tin cơ bản */}
          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-normal text-slate-700 mb-1.5">
                  Tên chương trình
                </label>
                <input
                  required
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm"
                  placeholder="VD: Xả kho giá gốc..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4 col-span-2">
                <div>
                  <label className="block text-sm font-normal text-slate-700 mb-1.5">
                    Kênh áp dụng
                  </label>
                  <select
                    name="channel"
                    value={formData.channel}
                    onChange={handleInputChange}
                    className="w-full p-2.5 border border-slate-200 rounded-lg outline-none bg-white text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  >
                    <option value="ALL">Tất cả các kênh</option>
                    {channels.map((c) => (
                      <option key={c.id_salechannel} value={c.id_salechannel}>
                        {c.name_salechannel}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-normal text-slate-700 mb-1.5">
                    Chu kỳ áp dụng
                  </label>
                  <select
                    name="frequency"
                    value={formData.frequency}
                    onChange={handleInputChange}
                    className="w-full p-2.5 border border-slate-200 rounded-lg outline-none bg-white text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  >
                    <option value="DAY">Theo Ngày</option>
                    <option value="WEEK">Theo Tuần</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-normal text-slate-700 mb-1.5">
                  Ngày bắt đầu
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    name="start_date"
                    value={formData.start_date}
                    onChange={handleInputChange}
                    required
                    className="w-2/3 p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm bg-white"
                  />
                  <input
                    type="time"
                    name="start_time"
                    value={formData.start_time}
                    onChange={handleInputChange}
                    title="Giờ bắt đầu"
                    className="w-1/3 p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-normal text-slate-700 mb-1.5">
                  Ngày kết thúc
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    name="end_date"
                    value={formData.end_date}
                    onChange={handleInputChange}
                    required
                    className="w-2/3 p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm bg-white"
                  />
                  <input
                    type="time"
                    name="end_time"
                    value={formData.end_time}
                    onChange={handleInputChange}
                    title="Giờ kết thúc"
                    className="w-1/3 p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm bg-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Chọn sản phẩm */}
          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-bold text-slate-800">
                1. Chọn Sản phẩm tham gia
              </label>
              <span className="text-xs font-normal bg-red-100 text-red-700 px-2 py-0.5 rounded">
                Đã chọn: {formData.product_ids.length}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-52 overflow-y-auto custom-scrollbar border border-slate-200 rounded-lg p-3 bg-white">
              {products.map((p) => {
                const pId = p.id_product;
                const isSelected = formData.product_ids.includes(pId);
                return (
                  <label
                    key={pId}
                    className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all border select-none ${isSelected ? 'bg-red-50 border-red-300 ring-1 ring-red-100' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className="shrink-0 flex items-center justify-center mt-0.5" style={{ width: '16px', height: '16px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleProductToggle(pId)}
                        className="w-full h-full m-0 p-0 rounded text-red-600 focus:ring-red-500 border-slate-300 accent-red-600 cursor-pointer"
                        style={{ margin: 0, padding: 0 }}
                      />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div
                        className={`text-sm font-bold truncate leading-tight ${isSelected ? 'text-red-700' : 'text-slate-800'}`}
                        title={p.name_product}
                      >
                        {p.name_product}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 font-medium truncate" title={p.code_product}>
                        {p.code_product}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Section 3: Cấu hình chi tiết */}
          {formData.product_ids.length > 0 && (
            <div className="bg-white p-5 rounded-xl border border-red-100 shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                <CheckCircle2 size={18} className="text-red-600" />
                <label className="block text-sm font-bold text-slate-800">
                  2. Cấu hình chi tiết ({formData.product_ids.length} sản phẩm)
                </label>
              </div>

              <div className="space-y-4">
                {formData.product_ids.map((pId) => {
                  const product = products.find((p: any) => p.id_product === pId);
                  const config = formData.product_configs[pId] || {
                    min_order: 1,
                    limit_deal: 0,
                    reward: 0,
                  } as ProductConfig;
                  if (!product) return null;

                  return (
                    <div
                      key={pId}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-md transition-all"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-bold text-sm text-slate-800">
                            {product.name_product}
                          </div>
                          <div className="text-xs text-slate-500">{product.code_product}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleProductToggle(pId)}
                          className="text-slate-400 hover:text-red-500 p-1"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 flex items-center gap-1">
                            <Target size={12} /> Đơn tối thiểu
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={config.min_order}
                            onChange={(e: any) =>
                              handleProductConfigChange(pId, 'min_order', e.target.value)
                            }
                            className="w-full p-2 text-center border border-slate-200 rounded-lg bg-white text-sm font-bold focus:border-red-500 outline-none shadow-sm"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 flex items-center gap-1">
                            <Box size={12} /> Giới hạn Deal
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={config.limit_deal}
                            onChange={(e: any) =>
                              handleProductConfigChange(pId, 'limit_deal', e.target.value)
                            }
                            className="w-full p-2 text-center border border-slate-200 rounded-lg bg-white text-sm font-bold focus:border-red-500 outline-none shadow-sm"
                            placeholder="0 = Vô hạn"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 flex items-center gap-1">
                            <Gift size={12} /> Thưởng/Deal
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              value={formatCurrency(config.reward)}
                              onChange={(e: any) =>
                                handleProductConfigChange(pId, 'reward', e.target.value)
                              }
                              className="w-full p-2 pr-7 text-right border border-slate-200 rounded-lg bg-white text-sm font-bold text-red-600 focus:border-red-500 outline-none shadow-sm"
                              placeholder="0"
                            />
                            <span className="absolute right-2 top-2 text-xs text-red-400 font-bold">
                              ₫
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 4: Ghi chú */}
          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
            <label className="block text-sm font-normal text-slate-700 mb-1.5">
              Ghi chú / Mô tả thêm
            </label>
            <textarea
              name="target_description"
              value={formData.target_description}
              onChange={handleInputChange}
              rows={3}
              className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm resize-none"
              placeholder="Nhập mô tả chi tiết..."
            />
          </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-100 bg-white shrink-0 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-normal transition-colors"
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            form="deal-shock-form"
            className="px-6 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 shadow-lg shadow-red-500/10 text-sm font-bold transition-all transform active:scale-95"
          >
            {isEditMode ? 'Lưu Thay Đổi' : 'Lưu & Khởi Động'}
          </button>
        </div>
      </div>
    </div>
  );
}
