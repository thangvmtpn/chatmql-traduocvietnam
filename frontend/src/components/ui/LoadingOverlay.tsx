import { createPortal } from "react-dom";

export default function LoadingOverlay({ open, text }) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-xl p-6 flex flex-col items-center gap-3 shadow-2xl">
        <div className="w-10 h-10 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
        <span className="text-gray-700 font-medium">
          {text || "Đang xử lý..."}
        </span>
      </div>
    </div>,
    document.body
  );
}
