import api from './api';

const BASE_URL = '/api/gamification/individual';

// 1. Lấy danh sách (Phân trang & Lọc theo loại)
export const getGamificationList = async (type: string, page = 1, limit = 10) => {
  try {
    const response = await api.get(BASE_URL, {
      params: {
        type, // 'DEAL_SHOCK' hoặc 'TOP_RACE'
        page,
        limit,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Lỗi lấy danh sách Gamification:', error);
    throw error;
  }
};

// 2. Tạo mới chiến dịch
export const createGamification = async (payload: any) => {
  try {
    const response = await api.post(BASE_URL, payload);
    return response.data;
  } catch (error) {
    console.error('Lỗi tạo Gamification:', error);
    throw error;
  }
};

// 3. Cập nhật chiến dịch
export const updateGamification = async (id: number | string, payload: any) => {
  try {
    const response = await api.put(`${BASE_URL}/${id}`, payload);
    return response.data;
  } catch (error) {
    console.error('Lỗi cập nhật Gamification:', error);
    throw error;
  }
};

// 4. Xóa chiến dịch
export const deleteGamification = async (id: number | string) => {
  try {
    const response = await api.delete(`${BASE_URL}/${id}`);
    return response.data;
  } catch (error) {
    console.error('Lỗi xóa Gamification:', error);
    throw error;
  }
};

export const getGamificationDetail = async (id: number | string) => {
  try {
    const response = await api.get(`/api/gamification/detail/${id}`);
    return response.data;
  } catch (error) {
    console.error('Lỗi lấy chi tiết Gamification:', error);
    throw error;
  }
};

export const getDealShockHistory = async (id: number | string) => {
  try {
    const response = await api.get(`/api/gamification/${id}/deal-shock-stats`);
    return response.data;
  } catch (error) {
    console.error('Lỗi lấy thống kê Deal Sốc:', error);
    throw error;
  }
};

export const getTopRaceStats = async (id: number | string) => {
  try {
    const response = await api.get(`/api/gamification/${id}/top-race-stats`);
    return response.data; 
  } catch (error) {
    console.error('Lỗi lấy thống kê Đua Top:', error);
    throw error;
  }
};
export const getGamificationProducts = async () => {
  try {
    const response = await api.get(`${BASE_URL}/products`);
    return response.data;
  } catch (error) {
    console.error('Lỗi lấy danh sách sản phẩm:', error);
    throw error;
  }
};
