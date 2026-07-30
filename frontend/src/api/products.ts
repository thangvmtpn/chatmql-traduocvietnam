import api from "@/services/api";

export async function search_product(search_key) {
  try {
    const token = localStorage.getItem('token');
    const response = await api.get('/products/search', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        key: search_key, // 👉 truyền param vào đây
      },
    });
    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error('Error searching products:', error);
    throw error;
  }
}

export async function get_all_products() {
  try {
    const token = localStorage.getItem('token');
    const response = await api.get('/products/get_all', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error searching products:', error);
    throw error;
  }
}

export async function get_all_products_abc(filters = {}) {
  try {
    const token = localStorage.getItem('token');
    const searchParams = new URLSearchParams();

    // 1. Xử lý các mảng ID (Duyệt mảng và append cùng một key)
    if (filters.groups?.length) filters.groups.forEach((id) => searchParams.append('groups', id));
    if (filters.types?.length) filters.types.forEach((id) => searchParams.append('types', id));
    if (filters.brands?.length) filters.brands.forEach((id) => searchParams.append('brands', id));

    // 2. Xử lý giá (Phẳng hóa object price)
    if (filters.price?.min) searchParams.append('min_price', filters.price.min);
    if (filters.price?.max) searchParams.append('max_price', filters.price.max);

    // 3. Trạng thái
    if (filters.status && filters.status !== 'all') {
      searchParams.append('status', filters.status);
    }

    // 4. Từ khóa tìm kiếm
    if (filters.search && filters.search.trim()) {
      searchParams.append('search', filters.search.trim());
    }

    const response = await api.get('/products/get_all_abc', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: searchParams,
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching products:', error);
    throw error;
  }
}

export async function get_all_product_types() {
  try {
    const token = localStorage.getItem('token');
    const response = await api.get('/products/get_all_product_types', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error searching products:', error);
    throw error;
  }
}

export async function get_all_brands() {
  try {
    const token = localStorage.getItem('token');
    const response = await api.get('/products/get_all_brands', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error searching products:', error);
    throw error;
  }
}

export async function get_all_product_groups() {
  try {
    const token = localStorage.getItem('token');
    const response = await api.get('/products/get_all_product_groups', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error searching products:', error);
    throw error;
  }
}

export async function create_product(productData) {
  try {
    const token = localStorage.getItem('token');
    // Dùng phương thức POST để tạo mới dữ liệu
    const response = await api.post('/products/create', productData, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Lỗi khi tạo sản phẩm mới:', error);
    throw error;
  }
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('token') || localStorage.getItem('access_token');
  return { Authorization: `Bearer ${token}` };
};

export const updateProduct = async (id, payload) => {
  try {
    const response = await api.put(`/products/${id}`, payload, {
      headers: getAuthHeaders(),
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const deleteProduct = async (id) => {
  try {
    const response = await api.delete(`/products/${id}`, { headers: getAuthHeaders() });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const deleteBulkProducts = async (productIds) => {
  try {
    const response = await api.post(
      `/products/bulk-delete`,
      { product_ids: productIds },
      { headers: getAuthHeaders() }
    );
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getProductWarehouseInventory = async (productId) => {
  try {
    const response = await api.get(`/products/${productId}/warehouse-inventory`, {
      headers: getAuthHeaders(),
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};
