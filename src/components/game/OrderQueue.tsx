// Order queue — shows a running list of all queued orders with descriptions.

import type { AnyOrder } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

interface OrderQueueProps {
  orders: AnyOrder[];
  theme: ThemePackage;
  onRemove: (index: number) => void;
}

function describeOrder(order: AnyOrder, theme: ThemePackage): string {
  switch (order.kind) {
    case 'move':
      return `Move unit to (${order.path[order.path.length - 1]?.col},${order.path[order.path.length - 1]?.row})`;
    case 'research': {
      const tech = theme.techTree.find((t) => t.id === order.techId);
      return `Research: ${tech?.name ?? order.techId}`;
    }
    case 'construction': {
      const bld = theme.buildings.find((b) => b.id === order.buildingDefinitionId);
      return `Build ${bld?.name ?? order.buildingDefinitionId}`;
    }
    case 'recruit': {
      const unit = theme.units.find((u) => u.id === order.unitDefinitionId);
      return `Recruit ${unit?.name ?? order.unitDefinitionId}`;
    }
    case 'diplomatic':
      return `${order.actionType.replace(/_/g, ' ')} \u2192 ${order.targetCivId}`;
    case 'event_response':
      return `Event response: ${order.choiceId}`;
    case 'resource_allocation':
      return 'Resource allocation';
  }
}

function orderKindIcon(kind: AnyOrder['kind']): string {
  switch (kind) {
    case 'move': return '\u2192';
    case 'research': return '\ud83d\udcda';
    case 'construction': return '\ud83c\udfd7\ufe0f';
    case 'recruit': return '\u2694\ufe0f';
    case 'diplomatic': return '\ud83e\udd1d';
    case 'event_response': return '\u26a1';
    case 'resource_allocation': return '\ud83d\udce6';
  }
}

export function OrderQueue({ orders, theme, onRemove }: OrderQueueProps) {
  if (orders.length === 0) {
    return (
      <p className="text-xs text-stone-500 italic py-2">
        No orders queued. Use the tabs above or click hexes on the map to add orders.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {orders.map((order, i) => (
        <div
          key={i}
          className="flex items-center gap-2 rounded bg-stone-800 px-3 py-1.5 text-sm"
        >
          <span className="text-xs">{orderKindIcon(order.kind)}</span>
          <span className="flex-1 text-stone-300 text-xs">
            {describeOrder(order, theme)}
          </span>
          <button
            onClick={() => onRemove(i)}
            className="text-stone-500 hover:text-red-400 text-xs px-1"
            title="Remove order"
          >
            \u2715
          </button>
        </div>
      ))}
    </div>
  );
}
