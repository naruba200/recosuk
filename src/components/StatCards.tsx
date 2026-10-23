import type { StatInterpretation } from '../lib/interpretations'

/**
 * Interpretation cards (PLAN-v2 §4.3) in the Stitch "Stats explained"
 * bento style: icon + chip, big metric value, title, the "why" text
 * derived from the user's own numbers, and a meter footer. Shared by
 * the onboarding stats reveal and the full Stats page.
 */

const CARD_STYLE: Record<
  StatInterpretation['id'],
  { icon: string; accent: string; text: string; strip: string }
> = {
  comfort: { icon: 'bedtime', accent: 'text-primary', text: 'text-primary', strip: 'from-primary' },
  ceiling: { icon: 'trending_down', accent: 'text-secondary', text: 'text-secondary', strip: 'from-secondary' },
  bpm: { icon: 'speed', accent: 'text-tertiary', text: 'text-tertiary', strip: 'from-tertiary' },
  keys: { icon: 'keyboard', accent: 'text-primary-container', text: 'text-primary-container', strip: 'from-primary-container' },
  accuracy: { icon: 'adjust', accent: 'text-tertiary', text: 'text-tertiary', strip: 'from-tertiary' },
  pp: { icon: 'bolt', accent: 'text-primary', text: 'text-primary', strip: 'from-primary' },
}

export function StatCard({ card }: { card: StatInterpretation }) {
  const style = CARD_STYLE[card.id]
  return (
    <div className="group relative rounded-lg bg-surface-container p-6 shadow-md hover:shadow-xl hover:bg-surface-container-high transition-all duration-300 flex flex-col justify-between">
      <div
        className={`absolute top-0 left-6 right-6 h-1 rounded-full bg-gradient-to-r ${style.strip} to-transparent opacity-80`}
      ></div>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div
            className={`w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center ${style.accent}`}
          >
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
              {style.icon}
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-lowest text-on-surface-variant font-label-sm text-label-sm shadow-sm">
            <span className={`w-1.5 h-1.5 rounded-full bg-current ${style.accent}`}></span>
            {card.chip}
          </span>
        </div>
        <div className="flex items-baseline gap-1 mb-1">
          <span className="font-metric-display text-metric-display text-on-surface font-black tabular-nums tracking-tight">
            {card.value}
          </span>
        </div>
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold mb-2">
          {card.title}
        </h2>
        <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">{card.why}</p>
        <p className="font-body-sm text-body-sm text-outline mt-2">{card.what}</p>
      </div>
      {typeof card.meterPct === 'number' && (
        <div className="mt-5 pt-4 bg-surface-container-low/60 rounded-DEFAULT p-3">
          <div className="flex justify-between items-center text-label-sm font-label-sm text-on-surface-variant mb-1.5">
            <span>{card.title}</span>
            <span className={`${style.text} font-semibold`}>{card.value}</span>
          </div>
          <div className="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, Math.max(0, card.meterPct))}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function StatCards({ cards }: { cards: StatInterpretation[] }) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full" data-purpose="stat-explanation-grid">
      {cards.map((card) => (
        <StatCard key={card.id} card={card} />
      ))}
    </section>
  )
}
