import { useState, useEffect } from "react";

/**
 * Hook debounce - trì hoãn việc cập nhật value cho đến khi user dừng gõ
 * @param value - Giá trị cần debounce
 * @param delay - Thời gian chờ (ms), mặc định 300ms
 * @returns Giá trị debounced
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Thiết lập timeout
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup function - hủy timeout nếu value thay đổi trước khi delay kết thúc
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
