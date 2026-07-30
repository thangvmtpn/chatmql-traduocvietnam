import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import useAuthStore from "@/stores/useAuthStore";
import authService from "@/services/authService";
import "material-symbols";
import "./Login.css";

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({ username: "", password: "" });
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const validateForm = (): boolean => {
    const newErrors = { username: "", password: "" };
    let isValid = true;

    if (!username) {
      newErrors.username = "Vui lòng nhập tên đăng nhập!";
      isValid = false;
    } else if (username.length < 3) {
      newErrors.username = "Tên đăng nhập phải có ít nhất 3 ký tự!";
      isValid = false;
    }

    if (!password) {
      newErrors.password = "Vui lòng nhập mật khẩu!";
      isValid = false;
    } else if (password.length < 6) {
      newErrors.password = "Mật khẩu phải có ít nhất 6 ký tự!";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const response = await authService.login(username, password);
      login(response.user, response.access_token);

      // Fetch full user info kèm department_name
      const userInfo = await authService.fetchUserInfo();
      if (userInfo) {
        const updateUser = useAuthStore.getState().updateUser;
        updateUser(userInfo);
      }

      toast.success("Đăng nhập thành công!");
      navigate("/dashboard");
    } catch (err: any) {
      console.error("Login error:", err);
      const errorMsg =
        err.response?.data?.detail ||
        "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.";
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1 className="login-logo">CRM TDVN</h1>
          <p className="login-subtitle">Hệ thống quản trị khách hàng</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <div className={`input-wrapper ${errors.username ? "error" : ""}`}>
              <span className="material-symbols-outlined">person</span>
              <input
                type="text"
                placeholder="Tên đăng nhập"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrors({ ...errors, username: "" });
                }}
                autoFocus
              />
            </div>
            {errors.username && (
              <span className="error-message">{errors.username}</span>
            )}
          </div>

          <div className="form-group">
            <div className={`input-wrapper ${errors.password ? "error" : ""}`}>
              <span className="material-symbols-outlined">lock</span>
              <input
                type="password"
                placeholder="Mật khẩu"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors({ ...errors, password: "" });
                }}
              />
            </div>
            {errors.password && (
              <span className="error-message">{errors.password}</span>
            )}
          </div>

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? (
              <>
                <span className="material-symbols-outlined spinning">
                  progress_activity
                </span>
                Đang đăng nhập...
              </>
            ) : (
              "Đăng nhập"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
