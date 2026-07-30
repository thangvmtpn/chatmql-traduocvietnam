import { useEffect } from 'react';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  onConfirm?: () => void;
  onCancel?: () => void;
  isDangerous?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  isDangerous = false,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel?.();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn"
      onClick={() => onCancel?.()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-slideIn"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Icon Header */}
        <div
          className={`p-6 flex justify-center ${isDangerous ? 'bg-gradient-to-br from-red-50 to-red-100/50' : 'bg-gradient-to-br from-blue-50 to-blue-100/50'}`}
        >
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center ${isDangerous ? 'bg-red-200/30' : 'bg-blue-200/30'}`}
          >
            {isDangerous ? (
              <AlertTriangle className="w-8 h-8 text-red-600" />
            ) : (
              <CheckCircle className="w-8 h-8 text-blue-600" />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pt-6 pb-4">
          <h2
            className={`text-xl font-bold text-center mb-3 ${isDangerous ? 'text-red-900' : 'text-blue-900'}`}
          >
            {title}
          </h2>
          <p className="text-gray-600 text-center text-sm leading-relaxed">{message}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 p-6 pt-4 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-all duration-200 hover:border-gray-400"
          >
            Hủy
          </button>
          <button
            onClick={() => {
              onConfirm?.();
              onCancel?.();
            }}
            className={`flex-1 px-4 py-2.5 rounded-xl text-white font-semibold transition-all duration-200 transform hover:scale-105 active:scale-95 ${
              isDangerous
                ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-lg shadow-red-200'
                : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-200'
            }`}
          >
            Xác nhận
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-slideIn {
          animation: slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
    </div>
  );
}
