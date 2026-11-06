import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * Destructive actions use the same editorial dark palette as the admin shell
 * instead of the browser's native confirm() prompt.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  busyLabel = "Working...",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-md gap-0 rounded-none border-white/15 bg-[#111214] p-0 text-white shadow-2xl"
      >
        <div className="border-b border-white/10 px-6 py-5">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-[#ff5a36]">
            <AlertTriangle size={14} />
            Confirm action
          </p>
          <DialogTitle className="mt-3 font-display text-4xl uppercase leading-[.9] tracking-[-.02em] text-white">
            {title}
          </DialogTitle>
        </div>
        <div className="px-6 py-5">
          <DialogDescription className="text-sm leading-6 text-white/55">
            {description}
          </DialogDescription>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="border border-white/20 px-4 py-2.5 text-xs font-bold text-white/65 transition hover:border-white/50 hover:text-white disabled:opacity-40"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="bg-[#ff5a36] px-4 py-2.5 text-xs font-bold text-black transition hover:bg-[#ff6f4f] disabled:opacity-50"
            >
              {busy ? busyLabel : confirmLabel}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
