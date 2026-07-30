import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export default function Notification({ notification, onClose }) {
  useEffect(() => {
    if (!notification) return;
    const duration = Number(notification.duration) > 0 ? Number(notification.duration) : 5000;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [notification, onClose]);

  if (!notification) return null;

  const typeConfig = {
    success: {
      bgColor: 'bg-gradient-to-r from-green-50 to-emerald-50',
      borderColor: 'border-green-200',
      icon: <CheckCircle className="w-5 h-5 text-green-600" />,
      textColor: 'text-green-800',
      dotColor: 'bg-green-600',
      iconBg: 'bg-green-100',
    },
    error: {
      bgColor: 'bg-gradient-to-r from-red-50 to-rose-50',
      borderColor: 'border-red-200',
      icon: <AlertTriangle className="w-5 h-5 text-red-600" />,
      textColor: 'text-red-800',
      dotColor: 'bg-red-600',
      iconBg: 'bg-red-100',
    },
    warning: {
      bgColor: 'bg-gradient-to-r from-yellow-50 to-amber-50',
      borderColor: 'border-yellow-200',
      icon: <AlertCircle className="w-5 h-5 text-yellow-600" />,
      textColor: 'text-yellow-800',
      dotColor: 'bg-yellow-600',
      iconBg: 'bg-yellow-100',
    },
    info: {
      bgColor: 'bg-gradient-to-r from-blue-50 to-cyan-50',
      borderColor: 'border-blue-200',
      icon: <Info className="w-5 h-5 text-blue-600" />,
      textColor: 'text-blue-800',
      dotColor: 'bg-blue-600',
      iconBg: 'bg-blue-100',
    },
  };

  const config = typeConfig[notification.type] || typeConfig.info;

  const content = (
    <>
      <div className="fixed top-24 right-4 sm:right-6 z-[2147483647] animate-slideInRight pointer-events-none">
        <div
          className={`${config.bgColor} border ${config.borderColor} ${config.textColor} rounded-xl shadow-lg backdrop-blur-sm p-4 flex items-start gap-3 max-w-md transition-all duration-300 hover:shadow-xl pointer-events-auto`}
        >
          {/* Left Dot */}
          <div className={`w-1 h-full rounded-full ${config.dotColor} mt-0.5 flex-shrink-0`}></div>

          {/* Icon */}
          <div className={`${config.iconBg} p-2 rounded-full flex-shrink-0`}>{config.icon}</div>

          {/* Message */}
          <div className="flex-1 pt-0.5">
            <p className="text-sm font-semibold leading-relaxed">{notification.message}</p>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className={`p-1 rounded-lg transition-all hover:bg-black/10 flex-shrink-0`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(400px) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0) translateY(0);
          }
        }
        .animate-slideInRight {
          animation: slideInRight 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
    </>
  );

  return createPortal(content, document.body);
}
