import { defineConfig } from 'vite'

// Cấu hình tối giản có chủ đích: bản mẫu là vanilla JS nên app cũng vanilla —
// không React/Vue. Vite chỉ đóng vai trò dev server + đóng gói production.
export default defineConfig({
  // Đợt 5 sẽ deploy dưới /m/ trên site dev; đặt base ngay từ đầu để đường dẫn
  // asset không phải sửa lại lúc đó.
  base: '/m/',
  server: {
    port: 5180,
    // Gọi thẳng backend local, không cần proxy — backend local không đặt
    // CORS_ORIGIN nên cho phép mọi origin khi dev.
  },
  build: { outDir: 'dist', sourcemap: true },
  // Cổng DEMO cho điện thoại cùng Wi-Fi: preview mở ra LAN và proxy /api,
  // /socket.io, /uploads về backend local — mô phỏng đúng kiến trúc nginx
  // trên dev site (cùng origin), nên demo phone chạy y hệt bản deploy.
  preview: {
    host: true,
    port: 5182,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:4520', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4520', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4520', changeOrigin: true, ws: true },
    },
  },
})
