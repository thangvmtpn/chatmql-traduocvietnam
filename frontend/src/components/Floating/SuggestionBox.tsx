import { useEffect, useState, useRef, ChangeEvent, FormEvent } from "react";
import api from "@/services/api";

export default function SuggestionBox() {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  useEffect(() => {
    const handleOpenSuggestionBox = () => {
      setIsOpen(true);
    };

    window.addEventListener("open-suggestion-box", handleOpenSuggestionBox);

    return () => {
      window.removeEventListener(
        "open-suggestion-box",
        handleOpenSuggestionBox,
      );
    };
  }, []);

  // States form với Type cụ thể
  const [category, setCategory] = useState<string>("");
  const [problem, setProblem] = useState<string>("");
  const [goal, setGoal] = useState<string>("");
  const [images, setImages] = useState<File[]>([]); // Mảng các file
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // useRef cho input file cần HTMLInputElement
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Lấy token
  const getToken = (): string => {
    return (
      localStorage.getItem("token") ||
      localStorage.getItem("access_token") ||
      ""
    );
  };

  // Type cho event thay đổi file
  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      if (images.length + selectedFiles.length > 10) {
        setError("Chỉ được tải lên tối đa 10 ảnh.");
        return;
      }
      setError("");
      setImages((prev) => [...prev, ...selectedFiles]);
    }
  };

  const removeImage = (indexToRemove: number) => {
    setImages(images.filter((_, index) => index !== indexToRemove));
  };

  // Type cho event submit form
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validate
    if (!category || !problem.trim() || !goal.trim()) {
      setError("Vui lòng điền đầy đủ các thông tin bắt buộc (*).");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const token = getToken();

      const formData = new FormData();
      formData.append("category", category);
      formData.append("problem", problem);
      formData.append("goal", goal);

      images.forEach((file) => {
        formData.append("images", file);
      });

      await api.post("/api/suggestions", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
          // Lưu ý: Axios tự động set Content-Type cho FormData, không cần ghi đè
        },
      });

      alert("Cảm ơn bạn! Góp ý đã được ghi nhận.");
      setCategory("");
      setProblem("");
      setGoal("");
      setImages([]);
      setIsOpen(false);
    } catch (err: any) {
      console.error("Lỗi khi gửi góp ý:", err);
      const errorMsg =
        err.response?.data?.message ||
        "Có lỗi xảy ra khi gửi. Vui lòng thử lại.";
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end sm:bottom-8 sm:right-8">
      {isOpen && (
        <div className="mb-4 w-[calc(100vw-3rem)] sm:w-[400px] bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden transition-all origin-bottom-right animate-fade-in-up flex flex-col">
          <div className="bg-blue-600 p-4 flex justify-between items-center text-white shrink-0">
            <h3 className="font-medium">Hòm thư góp ý</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="hover:bg-blue-700 p-1.5 rounded-full transition-colors disabled:opacity-50"
              disabled={isLoading}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="p-4 overflow-y-auto max-h-[70vh]">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phân loại <span className="text-red-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={isLoading}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100"
                >
                  <option value="" disabled>
                    -- Chọn loại góp ý --
                  </option>
                  <option value="Loại 1 - Chỉnh sửa nội dung">
                    Loại 1 - Chỉnh sửa nội dung
                  </option>
                  <option value="Loại 2 - Chỉnh sửa giao diện">
                    Loại 2 - Chỉnh sửa giao diện
                  </option>
                  <option value="Loại 3 - Chỉnh sửa chức năng">
                    Loại 3 - Chỉnh sửa chức năng
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mô tả vấn đề <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  disabled={isLoading}
                  className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none disabled:bg-gray-100"
                  rows={3}
                  placeholder="Vấn đề bạn đang gặp phải là gì?"
                ></textarea>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mục tiêu mong muốn <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  disabled={isLoading}
                  className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none disabled:bg-gray-100"
                  rows={3}
                  placeholder="Bạn muốn hệ thống thay đổi/cải thiện như thế nào?"
                ></textarea>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Đính kèm ảnh (Tối đa 10 ảnh)
                </label>
                <div
                  onClick={() => !isLoading && fileInputRef.current?.click()}
                  className={`border-2 border-dashed border-gray-300 rounded-lg p-4 text-center transition-colors ${isLoading ? "cursor-not-allowed bg-gray-50" : "cursor-pointer hover:bg-gray-50"}`}
                >
                  <svg
                    className="mx-auto h-8 w-8 text-gray-400"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p className="mt-1 text-sm text-gray-500">
                    Click để chọn ảnh
                  </p>
                </div>

                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  disabled={isLoading}
                />

                {images.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {images.map((img, index) => (
                      <div
                        key={index}
                        className="relative w-16 h-16 rounded-md border border-gray-200 overflow-hidden group"
                      >
                        <img
                          src={URL.createObjectURL(img)}
                          alt="preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => !isLoading && removeImage(index)}
                          className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <svg
                            className="w-4 h-4 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <p className="text-red-500 text-sm font-medium">{error}</p>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className={`mt-4 w-full text-white py-2.5 rounded-lg transition-colors font-medium text-sm shadow-sm flex justify-center items-center ${isLoading ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}
              >
                {isLoading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Đang gửi...
                  </>
                ) : (
                  "Gửi góp ý"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg transition-all duration-300 hover:scale-110 flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-blue-300"
      >
        {isOpen ? (
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
