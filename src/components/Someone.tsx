import { Construction, UserRound } from 'lucide-react'

export default function Someone() {
  return (
    <section
      className="coming-soon"
      id="someone-content"
      tabIndex={-1}
      aria-labelledby="someone-title"
    >
      <div className="coming-soon-icon" aria-hidden="true">
        <UserRound size={42} strokeWidth={1.3} />
        <span>
          <Construction size={19} />
        </span>
      </div>
      <h2 id="someone-title">Under construction</h2>
      <p>We’re making room for someone new. Check back soon.</p>
    </section>
  )
}
