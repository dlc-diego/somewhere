import { ChevronDown, Compass, Sparkles } from 'lucide-react'
import type { Experience } from '../lib/useExperience'

export default function ExperienceSwitcher({
  experience,
  onChange,
}: {
  experience: Experience
  onChange: (next: Experience) => void
}) {
  const Icon = experience === 'somewhere' ? Compass : Sparkles
  return (
    <div className="brand-switcher">
      <span className="brand" aria-hidden="true">
        <span className="brand-icon">
          <Icon size={23} strokeWidth={1.5} />
        </span>
        <span className="brand-word">
          some
          <span key={experience} className="brand-ending">
            {experience === 'somewhere' ? 'where' : 'thing'}.
          </span>
        </span>
        <ChevronDown className="brand-chevron" size={14} />
      </span>
      <select
        className="experience-select"
        aria-label="Choose experience"
        value={experience}
        onChange={(event) => onChange(event.target.value as Experience)}
      >
        <option value="somewhere">somewhere.</option>
        <option value="something">something.</option>
      </select>
    </div>
  )
}
