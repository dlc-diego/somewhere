import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Brain,
  ChevronDown,
  CircleHelp,
  Compass,
  Crown,
  Flag,
  Gift,
  Globe2,
  Heart,
  Image as ImageIcon,
  MapPin,
  Route,
  Scan,
  ShoppingBag,
  TentTree,
  UserRound,
  Zap,
  Coins,
} from 'lucide-react'
import {
  availableNodes,
  connected,
  NODE_LABELS,
  type AdventureNode,
  type AdventureRun,
} from '../lib/adventure'
import { currentRouteSection, ROUTE_SECTIONS, trialPreview } from '../lib/adventurePresentation'
import { prefersReducedMotion } from '../lib/motion'

export const nodeIcons = {
  trivia: Brain,
  mystery: CircleHelp,
  who: UserRound,
  identify: ImageIcon,
  countries: Globe2,
  capitals: MapPin,
  flags: Flag,
  shapes: Scan,
  journey: Route,
  elite: Zap,
  boss: Crown,
  rest: TentTree,
  shop: ShoppingBag,
  event: Gift,
}

export default function AdventureMap({
  run,
  onChoose,
}: {
  run: AdventureRun
  onChoose: (node: AdventureNode) => void
}) {
  const available = availableNodes(run).map((node) => node.id)
  const active = currentRouteSection(run)
  const [selected, setSelected] = useState<AdventureNode | null>(null)
  const preview = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const details = selected ? trialPreview(selected.kind) : null
  useEffect(() => {
    if (!selected) return
    preview.current?.focus({ preventScroll: true })
    preview.current?.scrollIntoView({
      block: 'nearest',
      behavior: prefersReducedMotion() ? 'instant' : 'smooth',
    })
  }, [selected])
  function cancel() {
    setSelected(null)
    trigger.current?.focus()
  }
  return (
    <div className="somex-route-sections" aria-label="Branching adventure route">
      {ROUTE_SECTIONS.map((section, index) => {
        const nodes = run.map.filter(
          (node) => node.row >= section.first && node.row <= section.last,
        )
        const cleared = nodes.filter((node) => run.outcomes[node.id]).length
        const total = section.last - section.first + 1
        const status =
          cleared === total
            ? 'Completed'
            : index === active
              ? 'Current section'
              : index < active
                ? 'Past section'
                : 'Ahead'
        return (
          <details
            key={`${run.id}:${active}:${index}`}
            className="somex-route-section"
            open={index === active}
          >
            <summary>
              <span>
                <strong>
                  Section {index + 1} · {section.title}
                </strong>
                <small>
                  Stops {section.first + 1}–{section.last + 1} · {cleared}/{total} completed
                </small>
              </span>
              <span className={`somex-section-state ${index === active ? 'is-current' : ''}`}>
                {status}
                <ChevronDown size={16} aria-hidden="true" />
              </span>
            </summary>
            <div className="somex-route-map">
              <svg viewBox={`0 0 300 ${total * 96}`} preserveAspectRatio="none" aria-hidden="true">
                {nodes.flatMap((from) =>
                  nodes
                    .filter((to) => connected(from, to))
                    .map((to) => (
                      <path
                        key={`${from.id}:${to.id}`}
                        className={
                          run.path.includes(from.id) && run.path.includes(to.id) ? 'traveled' : ''
                        }
                        d={`M${from.lane * 100 + 50},${(from.row - section.first) * 96 + 48} C${from.lane * 100 + 50},${(from.row - section.first) * 96 + 96} ${to.lane * 100 + 50},${(to.row - section.first) * 96} ${to.lane * 100 + 50},${(to.row - section.first) * 96 + 48}`}
                      />
                    )),
                )}
              </svg>
              {nodes.map((node) => {
                const Icon = nodeIcons[node.kind],
                  result = run.outcomes[node.id],
                  reachable = available.includes(node.id)
                return (
                  <button
                    key={node.id}
                    className={`somex-route-node ${reachable ? 'reachable' : ''} ${result || ''} ${run.encounter?.nodeId === node.id ? 'current' : ''} ${selected?.id === node.id ? 'is-previewed' : ''}`}
                    style={{ gridRow: node.row - section.first + 1, gridColumn: node.lane + 1 }}
                    disabled={!reachable}
                    aria-pressed={reachable ? selected?.id === node.id : undefined}
                    aria-label={`${NODE_LABELS[node.kind]}, stop ${node.row + 1}${reachable ? ', available' : result ? `, ${result}` : ''}`}
                    onClick={(event) => {
                      trigger.current = event.currentTarget
                      setSelected(node)
                    }}
                  >
                    <Icon size={21} aria-hidden="true" />
                    <span>{NODE_LABELS[node.kind]}</span>
                    {reachable && (
                      <span className="somex-node-budget">{trialPreview(node.kind).budget}</span>
                    )}
                    {result && <small>{result === 'cleared' ? '✓' : '×'}</small>}
                  </button>
                )
              })}
            </div>
            {selected &&
              details &&
              selected.row >= section.first &&
              selected.row <= section.last && (
                <div
                  className="somex-choice-preview"
                  ref={preview}
                  tabIndex={-1}
                  role="region"
                  aria-label={`Preview ${NODE_LABELS[selected.kind]}`}
                >
                  <p className="eyebrow">
                    <Compass size={15} aria-hidden="true" /> Before you go
                  </p>
                  <h4>{NODE_LABELS[selected.kind]}</h4>
                  <p>{details.goal}</p>
                  <dl>
                    <div>
                      <dt>Budget</dt>
                      <dd>{details.budget}</dd>
                    </div>
                    <div>
                      <dt>
                        <Heart size={15} aria-hidden="true" /> Heart risk
                      </dt>
                      <dd>{details.risk}</dd>
                    </div>
                    <div>
                      <dt>
                        <Coins size={15} aria-hidden="true" /> Reward
                      </dt>
                      <dd>{details.reward}</dd>
                    </div>
                  </dl>
                  <div className="somex-choice-actions">
                    <button className="text-button" onClick={cancel}>
                      Keep choosing
                    </button>
                    <button className="primary" onClick={() => onChoose(selected)}>
                      Begin{' '}
                      {selected.kind === 'shop' ||
                      selected.kind === 'rest' ||
                      selected.kind === 'event'
                        ? 'stop'
                        : 'trial'}{' '}
                      <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
          </details>
        )
      })}
    </div>
  )
}
