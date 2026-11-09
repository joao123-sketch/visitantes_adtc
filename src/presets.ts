/** Atalhos de um toque na recepção. Para incluir outro, basta acrescentar o texto à lista. */
export const PRESET_CHURCHES = ['ADTC', 'Bela Vista', 'MF', 'El-Betel']
export const PRESET_CITIES = ['GBA', 'Ipu', 'São Benedito', 'Ipueiras', 'Croatá', 'Ibiapina', 'Reriutaba', 'Ubajara', 'Tianguá']
export const PRESET_TITLES = ['Pastor', 'Presbítero', 'Diácono', 'Obreiro', 'Evangelista', 'Amigo do Evangelho']

/** Nome completo enviado ao servidor: o cargo vai na frente do nome ("Pastor João"). */
export const fullName = (role: string, name: string) => [role.trim(), name.trim()].filter(Boolean).join(' ')

/** Ao editar, separa o cargo conhecido que vem na frente do nome salvo. */
export function splitRole(full: string): { role: string; name: string } {
  const low = full.toLowerCase()
  const role = [...PRESET_TITLES].sort((x, y) => y.length - x.length).find((r) => low.startsWith(`${r.toLowerCase()} `))
  return role ? { role, name: full.slice(role.length).trim() } : { role: '', name: full }
}

/** Departamentos para o evento. "Geral" não acrescenta nada ao nome. */
export const DEPARTMENTS = ['Geral', 'Umadeg', 'Usadeg', 'Depin', 'Varões', 'Missões', 'Defam']

/** "Culto de Doutrina" + "Umadeg" -> "Culto de Doutrina · Umadeg". */
export function eventName(name: string, dept: string): string {
  const n = name.trim()
  return dept && dept !== 'Geral' ? `${n} · ${dept}` : n
}

/** Departamentos com estilo próprio; Geral, Missões e Defam usam o estilo padrão. */
const STYLED: Record<string, string> = { umadeg: 'umadeg', usadeg: 'usadeg', depin: 'depin', varoes: 'varoes' }

/** Descobre o estilo pelo fim do nome do evento ("Culto · Umadeg"). Vazio = estilo Geral. */
export function deptKey(name: string | null | undefined): string {
  const last = (name ?? '').split(' · ').pop() ?? ''
  const norm = last.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return (name ?? '').includes(' · ') ? (STYLED[norm] ?? '') : ''
}

/** Quem é "Amigo do Evangelho" não tem igreja; com um deles no envio, a igreja é opcional (o servidor confere a mesma regra). */
export const isFriendName = (full: string) => /^amigo(\(a\))? do evangelho\b/i.test(full.trim())
