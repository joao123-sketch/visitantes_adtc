/** Cultos que se repetem toda semana. `weekday`: 0 = domingo ... 6 = sábado. Para mudar a rotina, edite esta lista. */
export type WeeklyService = { id: string; name: string; weekday: number }

export const WEEKLY_SERVICES: WeeklyService[] = [
  { id: 'sexta', name: 'Culto de Doutrina', weekday: 5 },
  { id: 'domingo', name: 'Culto de Domingo', weekday: 0 },
]

const pad = (n: number) => String(n).padStart(2, '0')

/** Data local no formato AAAA-MM-DD (sem passar por UTC, que no fim da noite já cai no dia seguinte). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Próxima data (hoje inclusive) em que cai o dia da semana pedido. */
export function nextOccurrence(weekday: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7))
  return isoDate(d)
}
