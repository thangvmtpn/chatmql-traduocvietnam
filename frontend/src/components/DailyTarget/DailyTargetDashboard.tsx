import "./DailyTargetDashboard.css";
import { useFNTargetData, useF0TargetData } from "@/hooks/useDashboard";

interface ChannelData {
  channel: string;
  target: number;
  trongKenh: number;
  orders: number;
  aov: number;
  targetRevenue: number;
  expectedRevenue: number;
  expectedOrders: number;
  expectedAov: number;
}

interface SalesmanData {
  name: string;
  target: number;
  ratio: number;
  orders: number;
  aov: number;
  coHoi: number;
  conversionRate: number;
  orders2: number;
  expectedRevenue: number;
}

function DailyTargetDashboard() {
  // Lấy dữ liệu FN và F0 từ API
  const {
    data: fnData,
    isLoading: fnLoading,
    error: fnError,
  } = useFNTargetData();
  const {
    data: f0Data,
    isLoading: f0Loading,
    error: f0Error,
  } = useF0TargetData();

  // doanh số mục tiêu F0
  const totalRevenueF0 = 40000000;

  // doanh số mục tiêu FN
  const totalRevenueFN_DuKien = 60000000;

  // Tính targetRevenue chia đều cho các kênh
  const channelCount = f0Data?.data.length || 1;
  const targetRevenuePerChannel = 100 / channelCount;

  // Chuyển đổi dữ liệu từ API sang format của component
  const channelDataF0: ChannelData[] =
    f0Data?.data.map((channel) => ({
      channel: channel.channel,
      target: channel.result, // Kết quả ngày hôm qua
      trongKenh: channel.ti_trong, // Tỉ trọng kênh
      orders: channel.orders, // Số đơn
      aov: channel.aov, // AOV
      targetRevenue: targetRevenuePerChannel, // Mục tiêu % chia đều
      expectedRevenue: (totalRevenueF0 * targetRevenuePerChannel) / 100, // Doanh số dự kiến
      expectedOrders: 0, // Số đơn dự kiến (có thể tính sau)
      expectedAov: 0, // AOV dự kiến (có thể tính sau)
    })) || [];

  // Chuyển đổi dữ liệu từ API sang format của component
  const salesmanDataFN: SalesmanData[] =
    fnData?.data.map((salesman) => ({
      name: salesman.name,
      target: salesman.doanh_so_yesterday, // Kết quả ngày hôm qua
      ratio: salesman.ti_trong_yesterday, // Tỉ trọng ngày hôm qua
      orders: salesman.so_don_yesterday, // Số đơn ngày hôm qua
      aov: salesman.aov_yesterday, // AOV ngày hôm qua
      coHoi: salesman.co_hoi, // Dữ liệu từ API
      conversionRate:
        salesman.co_hoi > 0
          ? (salesman.so_don_du_kien / salesman.co_hoi) * 100
          : 0, // Tỉ lệ chuyển đổi = số đơn / cơ hội × 100
      orders2: salesman.so_don_du_kien, // Số đơn dự kiến từ API
      expectedRevenue: salesman.doanh_so_du_kien, // Doanh số dự kiến từ API
    })) || [];

  // Tính tổng doanh số FN từ fnData
  const totalRevenueFN =
    fnData?.data.reduce(
      (sum, salesman) => sum + salesman.doanh_so_du_kien,
      0,
    ) || 0;

  // Tính doanh số tổng
  const totalRevenue = totalRevenueF0 + totalRevenueFN_DuKien;

  // Tính tổng chỉ số cho F0
  const f0TotalRevenue =
    f0Data?.data.reduce((sum, channel) => sum + channel.result, 0) || 0;
  const f0TotalOrders =
    f0Data?.data.reduce((sum, channel) => sum + channel.orders, 0) || 0;
  const f0Aov = f0TotalOrders > 0 ? f0TotalRevenue / f0TotalOrders : 0;

  // Tính tổng chỉ số cho FN
  const fnTotalRevenue =
    fnData?.data.reduce(
      (sum, salesman) => sum + salesman.doanh_so_yesterday,
      0,
    ) || 0;
  const fnTotalOrders =
    fnData?.data.reduce(
      (sum, salesman) => sum + salesman.so_don_yesterday,
      0,
    ) || 0;
  const fnAov = fnTotalOrders > 0 ? fnTotalRevenue / fnTotalOrders : 0;

  return (
    <div className="daily-target-dashboard">
      <h1>BẢNG MỤC TIÊU NGÀY {new Date().toLocaleDateString("vi-VN")} </h1>

      {(fnLoading || f0Loading) && (
        <div className="loading">Đang tải dữ liệu...</div>
      )}
      {(fnError || f0Error) && <div className="error">Lỗi khi tải dữ liệu</div>}

      {/* F0 Input Section */}
      <section className="target-section target-f0-section">
        <div className="target-section-header-wrapper">
          <h2 className="target-section-title red-header">F0</h2>
          <h3 className="target-section-title uppercase">
            Doanh số mục tiêu: {totalRevenueF0.toLocaleString("vi-VN")}
          </h3>
        </div>
        <div className="table-wrapper">
          <table className="target-table">
            <colgroup>
              <col span={5} className="input-group" />
              <col span={4} className="output-group" />
            </colgroup>
            <thead>
              <tr className="group-header">
                <th colSpan={5}>ĐẦU VÀO F0</th>
                <th colSpan={4}>ĐẦU RA F0</th>
              </tr>
              <tr>
                <th>KÊNH</th>
                <th>KẾT QUẢ</th>
                <th>TỈ TRỌNG KÊNH</th>
                <th>SỐ ĐƠN</th>
                <th>AOV</th>
                <th>MỤC TIÊU</th>
                <th>DOANH SỐ DỰ KIẾN</th>
                <th>SỐ ĐƠN</th>
                <th>AOV</th>
              </tr>
            </thead>
            <tbody>
              {/* F0 Summary Row */}
              <tr>
                <td className="salesman-name" style={{ fontWeight: "bold" }}>
                  TỔNG
                </td>
                <td className="value-cell" style={{ fontWeight: "bold" }}>
                  {f0TotalRevenue.toLocaleString("vi-VN")}
                </td>
                <td className="percentage-cell" style={{ fontWeight: "bold" }}>
                  -
                </td>
                <td className="value-cell" style={{ fontWeight: "bold" }}>
                  {f0TotalOrders}
                </td>
                <td className="value-cell" style={{ fontWeight: "bold" }}>
                  {Math.round(f0Aov).toLocaleString("vi-VN")}
                </td>
                <td className="value-cell"></td>
                <td className="value-cell" style={{ fontWeight: "bold" }}>
                  {totalRevenueF0.toLocaleString("vi-VN")}
                </td>
                <td className="value-cell"></td>
                <td className="value-cell"></td>
              </tr>
              {channelDataF0.map((data, idx) => (
                <tr key={idx}>
                  <td className="channel-name">{data.channel}</td>
                  <td className="value-cell">
                    {data.target.toLocaleString("vi-VN")}
                  </td>
                  <td className="percentage-cell">
                    {data.trongKenh.toFixed(2)}%
                  </td>
                  <td className="value-cell">{data.orders}</td>
                  <td className="value-cell">
                    {Math.round(data.aov).toLocaleString("vi-VN")}
                  </td>
                  <td className="percentage-cell">{data.targetRevenue}%</td>
                  <td className="value-cell">
                    {data.expectedRevenue.toLocaleString("vi-VN")}
                  </td>
                  <td className="value-cell"></td>
                  <td className="value-cell"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FN Input Section */}
      <section className="target-section target-fn-section">
        <div className="target-section-header-wrapper">
          <h2 className="target-section-title pink-header">FN</h2>
          <h3 className="target-section-title uppercase">
            Doanh số mục tiêu: {totalRevenueFN_DuKien.toLocaleString("vi-VN")}
          </h3>
        </div>
        <div className="table-wrapper">
          <table className="target-table">
            <colgroup>
              <col span={5} className="input-group" />
              <col span={4} className="output-group" />
            </colgroup>
            <thead>
              <tr className="group-header">
                <th colSpan={5}>ĐẦU VÀO FN</th>
                <th colSpan={4}>ĐẦU RA FN</th>
              </tr>
              <tr>
                <th>NHÂN SỰ</th>
                <th>KẾT QUẢ</th>
                <th>TỈ TRONG</th>
                <th>SỐ ĐƠN</th>
                <th>AOV</th>
                <th>CƠ HỘI</th>
                <th>TỈ LỆ CHUYỂN ĐỔI</th>
                <th>SỐ ĐƠN</th>
                <th>DOANH SỐ DỰ KIẾN</th>
              </tr>
            </thead>
            <tbody>
              {/* FN Summary Row */}
              <tr>
                <td className="salesman-name" style={{ fontWeight: "bold" }}>
                  TỔNG
                </td>
                <td className="value-cell" style={{ fontWeight: "bold" }}>
                  {fnTotalRevenue.toLocaleString("vi-VN")}
                </td>
                <td className="percentage-cell" style={{ fontWeight: "bold" }}>
                  -
                </td>
                <td className="value-cell" style={{ fontWeight: "bold" }}>
                  {fnTotalOrders}
                </td>
                <td className="value-cell" style={{ fontWeight: "bold" }}>
                  {Math.round(fnAov).toLocaleString("vi-VN")}
                </td>
                <td colSpan={3}></td>
                <td className="value-cell" style={{ fontWeight: "bold" }}>
                  {totalRevenueFN.toLocaleString("vi-VN")}
                </td>
              </tr>
              {salesmanDataFN.map((data, idx) => (
                <tr key={idx}>
                  <td className="salesman-name">{data.name}</td>
                  <td className="value-cell">
                    {data.target.toLocaleString("vi-VN")}
                  </td>
                  <td className="percentage-cell">{data.ratio.toFixed(2)}%</td>
                  <td className="value-cell">{data.orders}</td>
                  <td className="value-cell">
                    {data.aov.toLocaleString("vi-VN")}
                  </td>
                  <td className="value-cell">{data.coHoi}</td>
                  <td className="percentage-cell">
                    {data.conversionRate.toFixed(2)}%
                  </td>
                  <td className="value-cell">{data.orders2.toFixed(2)}</td>
                  <td className="value-cell">
                    {data.expectedRevenue.toLocaleString("vi-VN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bottom Output Section */}
      <section className="target-section bottom-output">
        <div className="output-section-wrapper">
          <div className="target-output-section">
            <div className="target-section-header-wrapper">
              <h2 className="target-section-title pink-header">
                ĐẦU RA MỤC TIÊU
              </h2>
            </div>
            <div className="output-table-wrapper">
              <table className="output-table">
                <thead>
                  <tr>
                    <th>KÊNH</th>
                    <th>KẾT QUẢ</th>
                    <th>TỈ TRONG KÊNH</th>
                    <th>SỐ ĐƠN</th>
                    <th>AOV</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>DOANH SỐ TỔNG</td>
                    <td className="value-cell">
                      {totalRevenue.toLocaleString("vi-VN")}
                    </td>
                    <td className="percentage-cell">100%</td>
                    <td className="value-cell"></td>
                    <td className="value-cell"></td>
                  </tr>
                  <tr>
                    <td>DOANH SỐ F0</td>
                    <td className="value-cell highlight-cell">
                      {totalRevenueF0.toLocaleString("vi-VN")}
                    </td>
                    <td className="percentage-cell">
                      {totalRevenue > 0
                        ? ((totalRevenueF0 / totalRevenue) * 100).toFixed(1)
                        : 0}
                      %
                    </td>
                    <td className="value-cell"></td>
                    <td className="value-cell"></td>
                  </tr>
                  <tr>
                    <td>DOANH SỐ FN</td>
                    <td className="value-cell highlight-cell">
                      {totalRevenueFN_DuKien.toLocaleString("vi-VN")}
                    </td>
                    <td className="percentage-cell">
                      {totalRevenue > 0
                        ? (
                            (totalRevenueFN_DuKien / totalRevenue) *
                            100
                          ).toFixed(1)
                        : 0}
                      %
                    </td>
                    <td className="value-cell"></td>
                    <td className="value-cell"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="target-output-section">
            <div className="target-section-header-wrapper">
              <h2 className="target-section-title pink-header">
                ĐẦU RA DEAL SỐC, THƯƠNG NGÀY
              </h2>
            </div>
            <div className="output-table-wrapper">
              <table className="output-table">
                <thead>
                  <tr>
                    <th>KÊNH</th>
                    <th>KẾT QUẢ</th>
                    <th>TỈ TRONG KÊNH</th>
                    <th>SỐ ĐƠN</th>
                    <th>AOV</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={5} className="empty-row">
                      (Sẽ thêm dữ liệu)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default DailyTargetDashboard;
