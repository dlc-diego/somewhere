import { Sparkles } from 'lucide-react'

export default function UnderConstruction() {
  return (
    <section className="construction-page" aria-labelledby="construction-title">
      <div className="construction-orbit" aria-hidden="true">
        <span className="construction-core">
          <Sparkles size={38} strokeWidth={1.3} />
        </span>
        <i />
        <i />
        <i />
      </div>
      <h2 id="construction-title" tabIndex={-1}>
        Under construction
      </h2>
      <p className="construction-description">More little discoveries. Coming soon.</p>
    </section>
  )
}
