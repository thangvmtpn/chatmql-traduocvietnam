import { useEffect } from "react";
import { useDeliveryHistory } from "@/hooks/useInvoices";
import "./DeliveryHistoryModal.css";

interface DeliveryHistoryModalProps {
  codeDelivery: string;
  partnerId?: number;
  onClose: () => void;
}

function DeliveryHistoryModal({
  codeDelivery,
  partnerId,
  onClose,
}: DeliveryHistoryModalProps) {
  const { data, isLoading, error, refetch } = useDeliveryHistory(
    codeDelivery,
    partnerId,
    true,
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="dh-overlay" onClick={onClose}>
      <div className="dh-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dh-header">
          <h2>
            <span className="material-symbols-outlined">local_shipping</span>
            Lịch sử giao hàng
          </h2>
          <span className="dh-tracking-code">{codeDelivery}</span>
          <button className="dh-close-btn" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="dh-body">
          {isLoading && (
            <div className="dh-loading">
              <span className="material-symbols-outlined spinning">
                progress_activity
              </span>
              <p>Đang tải lịch sử giao hàng...</p>
            </div>
          )}

          {error && (
            <div className="dh-error">
              <span className="material-symbols-outlined">error</span>
              <p>Không thể tải lịch sử giao hàng</p>
              <button className="dh-retry-btn" onClick={() => refetch()}>
                Thử lại
              </button>
            </div>
          )}

          {!isLoading && !error && (!data || data.length === 0) && (
            <div className="dh-empty">
              <span className="material-symbols-outlined">inbox</span>
              <p>Chưa có lịch sử giao hàng</p>
            </div>
          )}

          {!isLoading && !error && data && data.length > 0 && (
            <div className="dh-table-wrapper">
              <table className="dh-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Mã vận đơn</th>
                    <th>Trạng thái</th>
                    <th>Người cập nhật</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item, index) => (
                    <tr key={index}>
                      <td className="dh-time">{item.time}</td>
                      <td className="dh-code">{item.trackingCode}</td>
                      <td className="dh-status">
                        {item.detail || item.statusText}
                      </td>
                      <td className="dh-creator">{item.creator || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DeliveryHistoryModal;
