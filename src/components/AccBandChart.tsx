import type { AccuracyBand, SkillProfile } from '../lib/skillProfile'

/**
 * Accuracy-by-SR-band bar chart, generated from a real SkillProfile.
 * Geometry mirrors the Stitch Dashboard chart (same viewBox, gridlines,
 * bar slots and label positions) — only the numbers are live. At most
 * six bands are drawn (the slots the design has); when a player has
 * more bands we keep the six around their comfort/ceiling range.
 */

const SLOT_X = [75, 180, 285, 390, 495, 600]
const BASELINE_Y = 180
const TOP_Y = 30

function barHeight(avgAccuracy: number): number {
  // Map 82%→~14px … 100%→150px, clamped to the plot area.
  const h = ((avgAccuracy - 82) / 18) * 148 + 8
  return Math.max(10, Math.min(150, h))
}

function bandStatus(band: AccuracyBand, profile: SkillProfile): { word: string; fill: string } {
  if (band.min >= profile.srCeiling - 0.01 && profile.ceilingAccuracy !== null) {
    return { word: 'COLLAPSE', fill: '#a476ff' }
  }
  if (band.avgAccuracy >= profile.comfortAccuracy - 0.5) {
    return { word: 'Comfort', fill: '#7EE787' }
  }
  if (band.avgAccuracy >= profile.comfortAccuracy - 3) {
    return { word: 'Drift', fill: '#ffd9e4' }
  }
  return { word: 'Heavy lock', fill: '#713bd0' }
}

export function pickChartBands(profile: SkillProfile): AccuracyBand[] {
  const bands = profile.accuracyBands
  if (bands.length <= 6) return bands
  // Keep a window of 6 that includes the ceiling band.
  const ceilingIdx = Math.max(
    0,
    bands.findIndex((b) => b.min >= profile.srCeiling - 0.01),
  )
  const start = Math.min(Math.max(0, ceilingIdx - 3), bands.length - 6)
  return bands.slice(start, start + 6)
}

export default function AccBandChart({ profile }: { profile: SkillProfile }) {
  const bands = pickChartBands(profile)
  if (bands.length === 0) {
    return (
      <div className="w-full bg-surface-container rounded-DEFAULT p-space-md">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          No accuracy bands yet — play some {profile.mode === 'fruits' ? 'Catch' : profile.mode} maps
          and your accuracy-by-difficulty chart will appear here.
        </p>
      </div>
    )
  }
  return (
    <div className="w-full bg-surface-container rounded-DEFAULT p-space-md relative">
      <div className="absolute right-4 top-3 flex items-center gap-space-md font-label-sm text-[10px] text-on-surface-variant z-10">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#7EE787]"></span>
          <span>{profile.comfortAccuracy.toFixed(1)}% Comfort baseline</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 border-t border-dashed border-primary"></span>
          <span>95.0% Pass target</span>
        </div>
      </div>
      <div className="w-full overflow-x-auto pb-1">
        <svg className="w-full h-56 select-none" preserveAspectRatio="none" viewBox="0 0 720 230">
          <line opacity="0.6" stroke="#393243" strokeDasharray="2 3" strokeWidth="1" x1="45" x2="695" y1="30" y2="30"></line>
          <text fill="#958d9f" fontFamily="Inter" fontSize="10" textAnchor="end" x="38" y="34">100%</text>
          <line opacity="0.45" stroke="#7EE787" strokeDasharray="4 3" strokeWidth="1.2" x1="45" x2="695" y1="52" y2="52"></line>
          <text fill="#7EE787" fontFamily="Inter" fontSize="10" textAnchor="end" x="38" y="55">97%</text>
          <line opacity="0.4" stroke="#d2bbff" strokeDasharray="3 3" strokeWidth="1.2" x1="45" x2="695" y1="72" y2="72"></line>
          <text fill="#d2bbff" fontFamily="Inter" fontSize="10" textAnchor="end" x="38" y="75">95%</text>
          <line opacity="0.6" stroke="#393243" strokeDasharray="2 3" strokeWidth="1" x1="45" x2="695" y1="120" y2="120"></line>
          <text fill="#958d9f" fontFamily="Inter" fontSize="10" textAnchor="end" x="38" y="124">90%</text>
          <line opacity="0.6" stroke="#393243" strokeDasharray="2 3" strokeWidth="1" x1="45" x2="695" y1="170" y2="170"></line>
          <text fill="#958d9f" fontFamily="Inter" fontSize="10" textAnchor="end" x="38" y="174">85%</text>
          {bands.map((band, i) => {
            const x = SLOT_X[i]
            const h = barHeight(band.avgAccuracy)
            const y = BASELINE_Y - h
            const { word, fill } = bandStatus(band, profile)
            const isCeiling = Math.abs(band.min - profile.srCeiling) < 0.01
            return (
              <g key={band.min} className="transition-all hover:opacity-90">
                <rect fill={fill} fillOpacity={isCeiling ? 0.95 : 0.85} height={h} rx="8" width="62" x={x} y={y}></rect>
                {isCeiling && (
                  <rect fill="none" height={h + 4} opacity="0.8" rx="10" stroke="#d2bbff" strokeWidth="2" width="66" x={x - 2} y={y - 2}></rect>
                )}
                <text fill={isCeiling ? '#ffb0cc' : '#eadef5'} fontFamily="Inter" fontSize="11" fontWeight="700" textAnchor="middle" x={x + 31} y={y - 10}>
                  {band.avgAccuracy.toFixed(1)}%
                </text>
                <text fill="#ccc3d6" fontFamily="Outfit" fontSize="11" fontWeight="600" textAnchor="middle" x={x + 31} y="198">
                  {band.min.toFixed(1)}–{band.max.toFixed(1)}★
                </text>
                <text fill="#958d9f" fontFamily="Inter" fontSize="9" textAnchor="middle" x={x + 31} y="212">
                  {word} · {band.count} plays
                </text>
              </g>
            )
          })}
          {/* keep TOP_Y referenced for layout parity with the export */}
          <text fill="transparent" fontSize="1" x="0" y={TOP_Y}>.</text>
        </svg>
      </div>
    </div>
  )
}
