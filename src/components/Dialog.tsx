import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export default function Dialog({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const node = dialog.current!
    const previous = document.activeElement as HTMLElement | null
    node.showModal()
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      node.close()
      document.body.style.overflow = oldOverflow
      previous?.focus()
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className={`dialog ${className}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        close.current()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close.current()
      }}
    >
      <div className="dialog-inner">
        <button className="icon-button dialog-close" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
        {children}
      </div>
    </dialog>
  )
}
