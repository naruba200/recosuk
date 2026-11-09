/**
 * Status badge colors (§AV): one color per beatmapset status, so
 * the status reads at a glance like the per-mode pill colors.
 * The pill shape is fixed at the call site (BeatmapRow); only
 * these color classes vary. Unknown statuses (approved, wip,
 * anything the API sends) fall back to muted grey — never
 * unstyled.
 *
 * Lives in lib, not in BeatmapRow.tsx: exporting a non-component
 * from the component file trips the fast-refresh
 * `only-export-components` lint warning.
 */
export function statusBadgeClasses(status: string): string {
  switch (status.toLowerCase()) {
    case 'ranked':
      return 'bg-primary-container/60 text-primary'
    case 'loved':
      return 'bg-secondary-container/60 text-secondary'
    case 'qualified':
      return 'bg-[#FFCC22]/15 text-[#FFCC22]'
    case 'pending':
      return 'bg-[#4CC3FF]/15 text-[#4CC3FF]'
    case 'graveyard':
    default:
      return 'bg-surface-container text-on-surface-variant'
  }
}
