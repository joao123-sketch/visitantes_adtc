import type { EventInfo, GroupItem } from './api'
import type { Queue } from './queue'

export type Tick = { groupId: string; presented: boolean }
export type Cached = { event: EventInfo | null; groups: GroupItem[] }

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
