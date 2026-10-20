import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchPortraits, type Portrait } from '../lib/identify'
import LicensedPortrait from './LicensedPortrait'

export default function AdventurePortrait({
  personId,
  answer,
}: {
  personId: string
  answer: string | null
}) {
  const [portraits, setPortraits] = useState<Portrait[] | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    void fetchPortraits(controller.signal)
      .then(setPortraits)
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : 'The portraits could not load.')
      })
    return () => controller.abort()
  }, [attempt])
  if (error)
    return (
      <div className="portrait-image-error" role="alert">
        <p>{error} Your trial is saved; you can retry or use the clue.</p>
        <button className="text-button" onClick={() => setAttempt((n) => n + 1)}>
          Try loading portraits again <RefreshCw size={15} />
        </button>
      </div>
    )
  if (!portraits)
    return (
      <p className="something-loading" role="status">
        Loading the portrait…
      </p>
    )
  const portrait = portraits.find((p) => p.personId === personId)!
  return <LicensedPortrait key={portrait.id} portrait={portrait} answer={answer} />
}
