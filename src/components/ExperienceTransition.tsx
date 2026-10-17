import { createPortal } from 'react-dom'
import { Compass } from 'lucide-react'

export default function ExperienceTransition() {
  return createPortal(
    <div className="experience-transition" aria-hidden="true">
      <div className="experience-curtain" />
      <div className="experience-orbit">
        <Compass size={46} strokeWidth={1} />
      </div>
    </div>,
    document.body,
  )
}
