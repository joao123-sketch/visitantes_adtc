/** "2026-11-08" -> "domingo, 8 de novembro de 2026". Usa meio-dia para o fuso não mudar o dia. */
export function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
