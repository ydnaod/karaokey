import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { socket } from '../socket'
import type { QueueItem, Role, NowPlaying } from '../types'

interface Props {
  queue: QueueItem[]
  nowPlaying: NowPlaying | null
  myRole: Role
  onPlay: (item: QueueItem) => void
}

interface ItemProps {
  item: QueueItem
  index: number
  isPlaying: boolean
  isHost: boolean
  onPlay: (item: QueueItem) => void
  onRemove: (id: string) => void
}

function SortableItem({ item, index, isPlaying, isHost, onPlay, onRemove }: ItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !isHost })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
        isPlaying ? 'bg-pink-950 border border-pink-700' : 'bg-gray-800 hover:bg-gray-750'
      }`}
    >
      {isHost && (
        <div
          {...attributes}
          {...listeners}
          className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing select-none px-1"
          title="Drag to reorder"
        >
          ⠿
        </div>
      )}
      {!isHost && <div className="w-5 text-center text-gray-600 text-xs">{index + 1}</div>}

      <img
        src={item.thumbnailUrl}
        alt=""
        className="w-10 h-7 object-cover rounded flex-shrink-0"
      />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {isPlaying && <span className="text-pink-400 mr-1">♪</span>}
          {item.title}
        </p>
        <p className="text-xs text-gray-400 truncate">added by {item.addedBy}</p>
      </div>

      {!item.audioReady && !item.audioFailed && (
        <span className="text-xs text-yellow-500 flex-shrink-0 animate-pulse">loading…</span>
      )}
      {item.audioFailed && (
        <span className="text-xs text-red-400 flex-shrink-0">failed</span>
      )}

      {isHost && item.audioReady && !isPlaying && (
        <button
          onClick={() => onPlay(item)}
          className="text-xs px-2 py-1 bg-pink-700 hover:bg-pink-600 rounded transition-colors flex-shrink-0"
        >
          Play
        </button>
      )}

      {isHost && (
        <button
          onClick={() => onRemove(item.id)}
          className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0 text-lg leading-none"
          title="Remove"
        >
          ×
        </button>
      )}
    </div>
  )
}

export default function Queue({ queue, nowPlaying, myRole, onPlay }: Props) {
  const isHost = myRole === 'host'

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const fromIndex = queue.findIndex((q) => q.id === active.id)
    const toIndex = queue.findIndex((q) => q.id === over.id)
    if (fromIndex === -1 || toIndex === -1) return

    socket.emit('queue:reorder', { fromIndex, toIndex })
  }

  function handleRemove(queueItemId: string) {
    socket.emit('queue:remove', { queueItemId })
  }

  if (queue.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        Queue is empty — add a song below
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={queue.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-y-auto flex flex-col gap-2 p-3">
          {queue.map((item, index) => (
            <SortableItem
              key={item.id}
              item={item}
              index={index}
              isPlaying={nowPlaying?.queueItemId === item.id}
              isHost={isHost}
              onPlay={onPlay}
              onRemove={handleRemove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
