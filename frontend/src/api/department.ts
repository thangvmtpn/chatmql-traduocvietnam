// src/api/department.js
import api from "@/services/api";

// Hàm lấy token an toàn
const getToken = () => {
  return localStorage.getItem('token') || localStorage.getItem('access_token') || '';
};

// ================= PHÒNG BAN (DEPARTMENTS) =================

// 1. Lấy danh sách tất cả phòng ban
export const getAllDepartments = async () => {
  const token = getToken();
  try {
    const response = await api.get('/api/department/list', {
      // Bạn cần đảm bảo Backend có API này (hoặc tự tạo)
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error('Lỗi lấy danh sách phòng ban:', error);
    throw error;
  }
};

// 2. Tạo phòng ban mới
export const createDepartment = async (name) => {
  const token = getToken();
  try {
    const response = await api.post(
      '/department/create',
      { name },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Lỗi tạo phòng ban:', error);
    throw error;
  }
};

// 3. Sửa tên phòng ban
export const updateDepartment = async (id, name) => {
  const token = getToken();
  try {
    const response = await api.put(
      `/department/update/${id}`,
      { name },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Lỗi sửa phòng ban:', error);
    throw error;
  }
};

// 4. Xóa phòng ban
export const deleteDepartment = async (id) => {
  const token = getToken();
  try {
    const response = await api.delete(`/department/delete/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error('Lỗi xóa phòng ban:', error);
    throw error;
  }
};

// ================= NHÂN SỰ (MEMBERS) =================

export const getDepartmentMembers = async (deptId) => {
  const token = getToken();
  try {
    const response = await api.get(`/api/department/${deptId}/members`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error('Lỗi lấy danh sách nhân sự:', error);
    throw error;
  }
};

export const addDepartmentMember = async (data) => {
  const token = getToken();
  try {
    const response = await api.post('/department/member/add', data, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error('Lỗi thêm nhân sự:', error);
    throw error;
  }
};

export const updateDepartmentMember = async (memberId, data) => {
  const token = getToken();
  try {
    const response = await api.put(`/department/member/update/${memberId}`, data, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error('Lỗi cập nhật nhân sự:', error);
    throw error;
  }
};

export const deleteDepartmentMember = async (memberId) => {
  const token = getToken();
  try {
    const response = await api.delete(`/department/member/delete/${memberId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error('Lỗi xóa nhân sự:', error);
    throw error;
  }
};
