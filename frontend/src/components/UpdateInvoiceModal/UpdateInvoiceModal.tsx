import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import api from "@/services/api";
import { useProvinces, useWards } from "@/hooks/useAddresses";
import type { InvoiceOrder } from "@/types/api";
import "./UpdateInvoiceModal.css";

interface UpdateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: InvoiceOrder | null;
}

const STATUS_OPTIONS = [
  "Chờ xử lý",
  "Đang lấy hàng",
  "Chờ lấy lại",
  "Đã lấy hàng",
  "Đang giao hàng",
  "Chờ giao lại",
  "Chờ chuyển hoàn",
  "Đang chuyển hoàn",
  "Chờ chuyển hoàn lại",
  "Đã chuyển hoàn",
  "Giao thành công",
  "Đã hủy",
];

export default function UpdateInvoiceModal({
  isOpen,
  onClose,
  invoice,
}: UpdateInvoiceModalProps) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Provinces and wards
  const { data: provinces } = useProvinces();
  const [selectedProvinceId, setSelectedProvinceId] = useState<number | null>(
    null,
  );
  const { data: wards } = useWards(selectedProvinceId);

  // Dropdown states
  const [showProvinceDropdown, setShowProvinceDropdown] = useState(false);
  const [provinceSearchQuery, setProvinceSearchQuery] = useState("");
  const [showWardDropdown, setShowWardDropdown] = useState(false);
  const [wardSearchQuery, setWardSearchQuery] = useState("");

  const [formData, setFormData] = useState({
    status_value: invoice?.status_value || "",
    description: invoice?.description || "",
    receiver: "",
    contact_number: invoice?.phone_number || "",
    address: "",
    prov: "",
    prov_id: null as number | null,
    area: "",
    area_id: null as number | null,
    note_delivery: "",
    fee_delivery: "",
  });

  // Filter provinces and wards
  const filteredProvinces = provinces?.filter((province) =>
    province.prov.toLowerCase().includes(provinceSearchQuery.toLowerCase()),
  );

  const filteredWards = wards?.filter((ward) =>
    ward.ward.toLowerCase().includes(wardSearchQuery.toLowerCase()),
  );

  // Fetch delivery info when modal opens
  useEffect(() => {
    if (isOpen && invoice) {
      const fetchDeliveryInfo = async () => {
        try {
          const response = await api.get(
            `/api/invoices/detail/${invoice.code_invoice}`,
          );

          if (response.data?.data) {
            const invoiceData = response.data.data.invoice;
            const delivery = response.data.data.delivery_info;

            setFormData((prev) => ({
              ...prev,
              status_value: invoiceData?.status_value || "",
              description: invoiceData?.description || "",
              receiver: delivery?.receiver || "",
              contact_number: delivery?.contact_number || invoice.phone_number,
              address: delivery?.address || "",
              prov: delivery?.prov || "",
              prov_id: delivery?.id_prov || null,
              area: delivery?.area || "",
              area_id: delivery?.id_ward || null,
              note_delivery: delivery?.note_delivery || "",
              fee_delivery: delivery?.fee_delivery || "",
            }));

            // Set selected province ID for ward dropdown
            if (delivery?.id_prov) {
              setSelectedProvinceId(delivery.id_prov);
            }
          }
        } catch (err) {
          console.error("Failed to fetch delivery info:", err);
        }
      };

      fetchDeliveryInfo();
    }
  }, [isOpen, invoice]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice) return;

    setIsLoading(true);
    setError(null);

    try {
      // Prepare payload - chỉ gửi các field backend cần
      const payload = {
        status_value: formData.status_value || null,
        description: formData.description || null,
        receiver: formData.receiver || null,
        contact_number: formData.contact_number || null,
        address: formData.address || null,
        prov: formData.prov || null,
        area: formData.area || null,
        note_delivery: formData.note_delivery || null,
        fee_delivery: formData.fee_delivery
          ? parseFloat(formData.fee_delivery)
          : null,
      };

      await api.put(`/api/invoices/${invoice.code_invoice}/update`, payload);

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["myOrders"] });

      // Show success toast
      toast.success("Cập nhật đơn hàng thành công!", {
        position: "top-right",
        autoClose: 3000,
      });

      onClose();
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.detail ||
        "Lỗi khi cập nhật đơn hàng. Vui lòng thử lại.";
      setError(errorMessage);

      // Show error toast
      toast.error(`❌ ${errorMessage}`, {
        position: "top-right",
        autoClose: 3000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !invoice) return null;

  return (
    <div className="update-invoice-modal-overlay" onClick={onClose}>
      <div
        className="update-invoice-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="update-invoice-modal-header">
          <h2>Cập nhật đơn hàng {invoice.code_invoice}</h2>
          <button className="update-invoice-modal-close" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="update-invoice-update-form">
          <div className="update-invoice-form-section">
            <h3>Thông tin đơn hàng</h3>
            <div className="update-invoice-form-group">
              <label>Trạng thái</label>
              <select
                name="status_value"
                value={formData.status_value}
                onChange={handleChange}
                className="update-invoice-form-control"
              >
                <option value="">Chọn trạng thái</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div className="update-invoice-form-group">
              <label>Ghi chú đơn hàng</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                className="update-invoice-form-control"
                rows={3}
                placeholder="Nhập ghi chú..."
              />
            </div>
          </div>

          <div className="update-invoice-form-section">
            <h3>Thông tin giao hàng</h3>
            <div className="update-invoice-form-row">
              <div className="update-invoice-form-group">
                <label>Người nhận</label>
                <input
                  type="text"
                  name="receiver"
                  value={formData.receiver}
                  onChange={handleChange}
                  className="update-invoice-form-control"
                  placeholder="Tên người nhận"
                />
              </div>

              <div className="update-invoice-form-group">
                <label>Số điện thoại</label>
                <input
                  type="tel"
                  name="contact_number"
                  value={formData.contact_number}
                  onChange={handleChange}
                  className="update-invoice-form-control"
                  placeholder="SĐT người nhận"
                />
              </div>
            </div>

            <div className="update-invoice-form-row">
              <div className="update-invoice-form-group">
                <label>Tỉnh/Thành phố</label>
                <div className="update-invoice-searchable-dropdown">
                  <input
                    type="text"
                    placeholder="Tìm kiếm tỉnh/thành phố..."
                    value={
                      showProvinceDropdown ? provinceSearchQuery : formData.prov
                    }
                    onChange={(e) => {
                      setProvinceSearchQuery(e.target.value);
                      setShowProvinceDropdown(true);
                    }}
                    onFocus={() => setShowProvinceDropdown(true)}
                    onBlur={() =>
                      setTimeout(() => setShowProvinceDropdown(false), 200)
                    }
                    className="update-invoice-searchable-input"
                  />
                  {showProvinceDropdown && (
                    <div className="update-invoice-dropdown-list">
                      {filteredProvinces && filteredProvinces.length > 0 ? (
                        filteredProvinces.map((province) => (
                          <div
                            key={province.id_prov}
                            className="update-invoice-dropdown-item"
                            onClick={() => {
                              setSelectedProvinceId(province.id_prov);
                              setFormData((prev) => ({
                                ...prev,
                                prov: province.prov,
                                prov_id: province.id_prov,
                                area: "",
                                area_id: null,
                              }));
                              setProvinceSearchQuery("");
                              setShowProvinceDropdown(false);
                            }}
                          >
                            {province.prov}
                          </div>
                        ))
                      ) : (
                        <div className="update-invoice-dropdown-item disabled">
                          Không tìm thấy tỉnh/thành phố
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="update-invoice-form-group">
                <label>Xã/Phường</label>
                <div className="update-invoice-searchable-dropdown">
                  <input
                    type="text"
                    placeholder="Tìm kiếm phường/xã..."
                    value={showWardDropdown ? wardSearchQuery : formData.area}
                    onChange={(e) => {
                      setWardSearchQuery(e.target.value);
                      setShowWardDropdown(true);
                    }}
                    onFocus={() =>
                      selectedProvinceId && setShowWardDropdown(true)
                    }
                    onBlur={() =>
                      setTimeout(() => setShowWardDropdown(false), 200)
                    }
                    disabled={!selectedProvinceId}
                    className="update-invoice-searchable-input"
                  />
                  {showWardDropdown && selectedProvinceId && (
                    <div className="update-invoice-dropdown-list">
                      {filteredWards && filteredWards.length > 0 ? (
                        filteredWards.map((ward) => (
                          <div
                            key={ward.id_ward}
                            className="update-invoice-dropdown-item"
                            onClick={() => {
                              setFormData((prev) => ({
                                ...prev,
                                area: ward.ward,
                                area_id: ward.id_ward,
                              }));
                              setWardSearchQuery("");
                              setShowWardDropdown(false);
                            }}
                          >
                            {ward.ward}
                          </div>
                        ))
                      ) : (
                        <div className="update-invoice-dropdown-item disabled">
                          Không tìm thấy phường/xã
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="update-invoice-form-group">
              <label>Địa chỉ chi tiết</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="update-invoice-form-control"
                placeholder="Địa chỉ chi tiết"
              />
            </div>

            <div>
              <div className="update-invoice-form-group">
                <label>Ghi chú giao hàng</label>
                <textarea
                  name="note_delivery"
                  value={formData.note_delivery}
                  onChange={handleChange}
                  className="update-invoice-form-control"
                  rows={2}
                  placeholder="Ghi chú giao hàng..."
                />
              </div>

              <div className="update-invoice-form-group">
                <label>Chi phí giao hàng</label>
                <input
                  type="number"
                  name="fee_delivery"
                  value={formData.fee_delivery}
                  onChange={handleChange}
                  className="update-invoice-form-control"
                  placeholder="Nhập chi phí giao hàng"
                  step="1000"
                  min="0"
                />
              </div>
            </div>
          </div>

          {error && <div className="update-invoice-error-message">{error}</div>}

          <div className="update-invoice-form-actions">
            <button
              type="button"
              className="update-invoice-btn-cancel"
              onClick={onClose}
              disabled={isLoading}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="update-invoice-btn-submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="material-symbols-outlined update-invoice-spinning">
                    progress_activity
                  </span>
                  Đang cập nhật...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">check</span>
                  Cập nhật
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
