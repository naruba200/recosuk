import { useNavigate } from 'react-router-dom'

/**
 * Account-only page, locked for guests (batch AS): replaces the old
 * demo stand-in. Visible locked state + a button to /auth, the same
 * pattern as the guest Profile lock. Never sample data.
 */
export default function LockedPage({
  title,
  description,
}: {
  title: string
  description: string
}) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center gap-space-md py-space-xl text-center">
      <span className="material-symbols-outlined text-on-surface-variant text-[40px]">lock</span>
      <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">{title}</h1>
      <p className="font-body-md text-body-md text-on-surface-variant max-w-md">{description}</p>
      <button
        className="px-space-lg py-3 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md"
        type="button"
        onClick={() => navigate('/auth')}
      >
        Create a free account
      </button>
    </div>
  )
}
