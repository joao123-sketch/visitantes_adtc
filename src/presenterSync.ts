import type { EventInfo, GroupItem } from './api'
import type { Queue } from './queue'

export type Tick = { groupId: string; presented: boolean }
export type Cached = { event: EventInfo | null; groups: GroupItem[] }

/**
 * Acrescenta um toque às pendências visíveis na tela. Mantém os toques anteriores, inclusive os que já
 * foram enviados mas ainda não apareceram na lista do servidor; só um ciclo completo (envio + lista nova)
 * pode substituí-los. Um novo toque no mesmo grupo troca o anterior (a última escrita vale).
 */
export function addTick(pending: Tick[], tick: Tick): Tick[] {
  return [...pending.filter((t) => t.groupId !== tick.groupId), tick]
}

/**
 * Um ciclo de sincronização do apresentador: primeiro envia os toques pendentes, depois busca a lista.
 * Os toques que continuam pendentes são lidos DEPOIS da busca, para a tela atualizar lista e pendências
 * juntas (senão a caixinha volta ao valor antigo por um instante).
 */
export async function syncPresenter(deps: {
  ticks: Queue<Tick>
  sendTick: (t: Tick) => Promise<void>
  fetchList: () => Promise<Cached>
}): Promise<{ data: Cached; pending: Tick[] }> {
  await deps.ticks.flush(deps.sendTick)
  const data = await deps.fetchList()
  return { data, pending: deps.ticks.items() }
}
