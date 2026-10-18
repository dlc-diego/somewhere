import { ChevronDown, Compass, Sparkles, UserRound, Route } from 'lucide-react'
import type { Experience } from '../lib/useExperience'

export default function ExperienceSwitcher({
  experience,
  onChange,
}: {
  experience: Experience
  onChange: (next: Experience) => void
}) {
  const Icon =
    experience === 'somewhere'
      ? Compass
      : experience === 'something'
        ? Sparkles
        : experience === 'someone'
          ? UserRound
          : Route
  return (
    <div className="brand-switcher">
      <span className="brand" aria-hidden="true">
        <span className="brand-icon">
          <Icon size={23} strokeWidth={1.5} />
        </span>
        <span className="brand-word">
          some
          <span key={experience} className="brand-ending">
            {experience.slice(4)}.
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
        <option value="someone">someone.</option>
        <option value="somehow">somehow.</option>
      </select>
    </div>
  )
}
