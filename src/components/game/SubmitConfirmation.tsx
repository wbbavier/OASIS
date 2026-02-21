// Inline confirmation prompt before submitting orders.

interface SubmitConfirmationProps {
  orderCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SubmitConfirmation({ orderCount, onConfirm, onCancel }: SubmitConfirmationProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-700 bg-amber-950/40 px-4 py-2">
      <p className="text-sm text-amber-200 flex-1">
        Submit {orderCount} order{orderCount !== 1 ? 's' : ''}?
      </p>
      <button
        onClick={onConfirm}
        className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500"
      >
        Confirm
      </button>
      <button onClick={onCancel} className="text-xs text-stone-400 hover:text-stone-200">
        Cancel
      </button>
    </div>
  );
}
