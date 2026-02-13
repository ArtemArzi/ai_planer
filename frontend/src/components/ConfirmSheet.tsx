import { Drawer } from "vaul";

type ConfirmSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
};

export function ConfirmSheet({
  open,
  onOpenChange,
  onConfirm,
  title = "Удалить задачу?",
  description = "Это действие нельзя отменить.",
  confirmText = "Удалить",
  cancelText = "Отмена",
}: ConfirmSheetProps) {
  return (
    <Drawer.Root fixed open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-tg-secondary-bg p-4">
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-tg-hint/40" />
          <Drawer.Title className="text-lg font-semibold text-tg-text">{title}</Drawer.Title>
          <Drawer.Description className="mt-2 text-sm text-tg-hint">{description}</Drawer.Description>

          <div className="mt-5 grid gap-2">
            <button
              type="button"
              className="h-11 rounded-xl bg-red-500 px-4 text-sm font-medium text-white"
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmText}
            </button>

            <button
              type="button"
              className="h-11 rounded-xl bg-white/80 px-4 text-sm font-medium text-tg-text"
              onClick={() => onOpenChange(false)}
            >
              {cancelText}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
