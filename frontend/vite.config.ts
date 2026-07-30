import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react";
// import path from "path";

// // https://vite.dev/config/
// export default defineConfig({
//   plugins: [react()],
//   resolve: {
//     alias: {
//       "@": path.resolve(__dirname, "./src"),
//     },
//   },
//   server: {
//     allowedHosts: [
//       "cf75-2001-ee0-46e7-be00-e95b-2c1e-c99a-d77b.ngrok-free.app", // Link ngrok hiện tại của bạn
//       ".ngrok-free.app" // MẸO: Thêm dòng này để bao trùm toàn bộ subdomain. Ngrok bản free mỗi lần bật lại sẽ ra một link mới, làm thế này bạn sẽ không phải sửa code liên tục.
//     ]
//   }
// });