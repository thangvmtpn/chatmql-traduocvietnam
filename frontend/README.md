# CRM TDVN - Frontend (React + Vite)

Frontend của hệ thống CRM TDVN được xây dựng với React.js và Vite, kết nối với backend FastAPI.

## 📦 Công nghệ sử dụng

- **React 18** - Thư viện UI
- **Vite** - Build tool và dev server
- **React Router DOM** - Routing
- **Axios** - HTTP client
- **Socket.IO Client** - WebSocket real-time communication

## 🚀 Cài đặt và Chạy

### 1. Cài đặt dependencies

```bash
cd frontend
npm install
```

### 2. Cấu hình môi trường

File `.env` đã được tạo với cấu hình mặc định:

```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

### 3. Chạy development server

```bash
npm run dev
```

Frontend sẽ chạy tại: `http://localhost:5173`

### 4. Build cho production

```bash
npm run build
```

## 📁 Cấu trúc thư mục

```
frontend/
├── src/
│   ├── config/          # Cấu hình (API endpoints)
│   │   └── api.js
│   ├── services/        # Services (API, auth, socket)
│   │   ├── api.js
│   │   ├── authService.js
│   │   └── socketService.js
│   ├── pages/           # Các trang
│   │   ├── Login.jsx
│   │   ├── Login.css
│   │   ├── Dashboard.jsx
│   │   └── Dashboard.css
│   ├── App.jsx
│   └── main.jsx
├── .env
└── package.json
```

## 🔌 Kết nối với Backend

### API Calls

```javascript
import api from "./services/api";

const response = await api.get("/api/users");
const response = await api.post("/api/login", data);
```

### Authentication

```javascript
import authService from "./services/authService";

await authService.login(username, password);
authService.logout();
const isLoggedIn = authService.isLoggedIn();
```

### WebSocket

```javascript
import socketService from "./services/socketService";

const socket = socketService.connect();
socketService.on("new_notification", (data) => {
  console.log(data);
});
```

## 🔐 API Endpoints

- **Auth**: `/api/login`, `/api/register`
- **Users**: `/api/users`
- **Hóa đơn**: `/api/hoa-don`
- **Thông báo**: `/api/thong-bao`
- **Sản phẩm**: `/api/san-pham`

## 🔧 Scripts

- `npm run dev` - Chạy dev server
- `npm run build` - Build production
- `npm run preview` - Preview build
