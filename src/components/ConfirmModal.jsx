import { AlertTriangle, X } from "lucide-react";

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Action",
  message = "Are you sure you want to proceed?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger", // 'danger' or 'warning'
}) {
  if (!isOpen) return null;

  const confirmButtonStyle =
    variant === "danger"
      ? {
          background: "rgba(127, 29, 29, 0.55)",
          color: "#fecaca",
          borderColor: "rgba(248, 113, 113, 0.35)",
        }
      : {
          background: "rgba(120, 53, 15, 0.55)",
          color: "#fde68a",
          borderColor: "rgba(251, 191, 36, 0.35)",
        };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative app-page-panel max-w-md w-full mx-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="app-button app-button-secondary"
          style={{ position: "absolute", top: "1rem", right: "1rem", padding: "0.6rem" }}
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div
            className={`p-3 rounded-full ${
              variant === "danger" ? "bg-red-500/20" : "bg-amber-500/20"
            }`}
          >
            <AlertTriangle
              size={28}
              className={
                variant === "danger" ? "text-red-500" : "text-amber-500"
              }
            />
          </div>
        </div>

        {/* Content */}
        <h2 className="text-xl font-bold text-white text-center mb-2">
          {title}
        </h2>
        <p className="text-slate-400 text-center mb-6">{message}</p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="app-button app-button-secondary"
            style={{ flex: 1 }}
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="app-button"
            style={{ ...confirmButtonStyle, flex: 1 }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
