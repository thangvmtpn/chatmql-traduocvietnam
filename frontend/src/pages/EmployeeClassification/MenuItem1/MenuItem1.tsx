import { useState } from "react";
import "./MenuItem1.css";

interface MenuItem1Props {
  userId?: number;
}

function MenuItem1({ userId }: MenuItem1Props) {
  const [data] = useState([
    {
      id: 1,
      customerName: "Nguyễn Văn A",
      phone: "0901234567",
      status: "Đang xử lý",
      priority: "Cao",
      createdDate: "2026-03-10",
    },
    {
      id: 2,
      customerName: "Trần Thị B",
      phone: "0912345678",
      status: "Chờ phân loại",
      priority: "Trung bình",
      createdDate: "2026-03-11",
    },
    {
      id: 3,
      customerName: "Lê Văn C",
      phone: "0923456789",
      status: "Hoàn thành",
      priority: "Thấp",
      createdDate: "2026-03-12",
    },
  ]);

  return (
    <div className="menu-item-1">
      <div className="page-header">
        <h2>Menu Item 1 - Danh sách phân loại</h2>
        <p className="subtitle">Quản lý và phân loại khách hàng</p>
      </div>

      <div className="content-card">
        <div className="card-header">
          <h3>Danh sách khách hàng cần phân loại</h3>
          <button className="btn-primary">
            <span className="material-symbols-outlined">add</span>
            Thêm mới
          </button>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tên khách hàng</th>
                <th>Số điện thoại</th>
                <th>Trạng thái</th>
                <th>Độ ưu tiên</th>
                <th>Ngày tạo</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.customerName}</td>
                  <td>{item.phone}</td>
                  <td>
                    <span
                      className={`status-badge status-${item.status === "Hoàn thành" ? "completed" : item.status === "Đang xử lý" ? "processing" : "pending"}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`priority-badge priority-${item.priority === "Cao" ? "high" : item.priority === "Trung bình" ? "medium" : "low"}`}
                    >
                      {item.priority}
                    </span>
                  </td>
                  <td>{item.createdDate}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-icon" title="Xem chi tiết">
                        <span className="material-symbols-outlined">
                          visibility
                        </span>
                      </button>
                      <button className="btn-icon" title="Chỉnh sửa">
                        <span className="material-symbols-outlined">edit</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default MenuItem1;
