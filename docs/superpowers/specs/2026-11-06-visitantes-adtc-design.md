# Visitantes ADTC - Documento de design

Data: 2026-11-06
Responsável: João (administrador do sistema)

## Intenção e motivo

Nos cultos e eventos da igreja (ADTC Guaraciaba do Norte), os recepcionistas anotam os convidados que chegam e repassam a informação a quem apresenta, hoje por WhatsApp (em várias contas) e por papel passado de mão em mão. Isso gera confusão: informação espalhada, papel que só chega depois da oração (que vem após os 3 hinos congregacionais) e nenhuma lista única.

O sistema centraliza o registro: os recepcionistas lançam os visitantes pelo celular e o apresentador vê tudo numa lista organizada, em tempo quase real, durante o culto.

Sucesso: o apresentador tem uma lista única, atualizada e sem duplicatas na mão quando precisa apresentar, e os recepcionistas lançam um visitante em poucos segundos sem treino. João não definiu critérios de fracasso além de "simples"; a diretriz é simplicidade acima de tudo.

## Metas

- Funcionar bem no celular (todos os usuários usam celular).
- Instalável na tela inicial: iPhone (Adicionar à Tela de Início) e Android (Instalar app). Ou seja, um app web instalável (PWA).
- Muito simples de usar e de manter.
- Estruturar a conta Cloudflare para receber outros projetos futuros do João.

## Não metas

- Sem login individual por recepcionista.
- Sem histórico exibido de visitantes ao longo do tempo (os dados ficam guardados, mas não há tela de histórico nesta versão).
- Sem mais de um evento ativo ao mesmo tempo.
- Sem envio de mensagens por WhatsApp ou outras integrações.

## Usuários e acessos

Três acessos, cada um com um código (PIN):

1. **Administrador (João):** cria o evento (nome e data), encerra o evento e troca os PINs.
2. **Recepção (~10 pessoas ao mesmo tempo):** um PIN compartilhado. Na primeira entrada o app pede só o primeiro nome do recepcionista, uma vez, para registrar quem anotou cada visitante.
3. **Apresentador:** PIN próprio. Vê a lista e marca quem já foi apresentado.

Os códigos têm de 3 a 8 números (João pediu códigos curtos, por exemplo 111, 222 e 333) e não podem repetir entre acessos. PINs são trocáveis pelo administrador (por exemplo, se vazarem).

## Eventos

- Só um evento ativo por vez. João abre o evento antes do culto.
- Cada evento começa com lista vazia.
- Os dados de todos os eventos ficam guardados no banco para uso futuro (histórico), sem tela para isso agora.

## Registro de visitante (tela da recepção)

Campos:
- Cidade (um por registro)
- Igreja (um por registro)
- Pessoas: uma ou mais linhas de nome, com botão "+ Adicionar pessoa" e ✕ para remover. Cobre pessoa sozinha, família ou caravana inteira.
- Observações (opcional), por exemplo "Caravana de jovens" ou "Pastor está junto".
- Botão Enviar.

A tela também mostra o que aquele recepcionista já enviou ("Enviados").

Exemplo real: "João, Maria e Carlos da ADTC em Ipueiras" vira um registro com cidade Ipueiras, igreja ADTC, três pessoas.

## Lista do apresentador

- Blocos por cidade e, dentro de cada cidade, blocos por igreja (na ordem em que chegaram; cidade e igreja iguais por acento/caixa ficam no mesmo bloco). Dentro de cada bloco de igreja ficam os grupos, cada um com seus nomes.
- Cada grupo tem uma única caixinha, centralizada na vertical, e o cartão do grupo inteiro é a área de toque. Ao marcar, todos os nomes do grupo ficam riscados. Não há caixinha por pessoa nem botão "já apresentei". O grupo conta como apresentado quando todas as pessoas dele estão marcadas; se alguém for adicionado depois por edição, o grupo volta a ficar desmarcado. O contador mostra grupos apresentados.
- Quem foi apresentado permanece no mesmo lugar, só riscado (não vai para o fim da lista).
- Observações aparecem em destaque dentro do cartão.
- A lista atualiza sozinha quando chega gente nova.

## Duplicatas

- Dois registros com mesmo nome, cidade e igreja, dentro do mesmo evento, contam como duplicata: fica só um.
- Comparação ignora maiúsculas/minúsculas, acentos e espaços extras (palpite aceito por João).
- Se o duplicado chegar depois de o visitante já ter sido apresentado, ele não reaparece na lista.
- A verificação precisa valer também para envios feitos por recepcionistas diferentes ao mesmo tempo e para reenvios após queda de conexão.
- A comparação é pessoa por pessoa, sempre considerando nome + cidade + igreja juntos. "João de Ipueiras da Bela Vista" e "João de Ipueiras da Assembleia" são pessoas diferentes.
- Duplicata parcial: se um registro tem "Maria e João" e outro "Maria e Carlos" (mesma cidade e igreja), a Maria repetida é descartada e só Carlos entra. Se todas as pessoas do envio já existirem, o recepcionista vê um aviso ("já estava na lista") em vez de erro.
- Observação de pessoa descartada como duplicata: escolha do Claude, não perder; anexar ao registro existente da pessoa se for diferente.

## Edição e exclusão

- O recepcionista pode editar e apagar apenas os próprios envios, e só enquanto o evento estiver aberto (decisão de João).
- Alterações aparecem na lista do apresentador. Se a pessoa já estiver marcada como apresentada, a marcação é mantida.

## Segurança e acessos (escolhas do Claude)

- PINs são verificados no servidor (Cloudflare Worker); o celular nunca acessa o banco diretamente com os PINs. Após validar, o servidor emite um token de sessão por papel.
- PIN de 3 a 8 dígitos, sem limite de tentativas (decisão de João, contra a sugestão inicial do Claude; com 3 dígitos há só 1000 combinações). João define os PINs iniciais. Trocar um PIN encerra as sessões antigas daquele acesso.
- A tela de administrador fica no próprio app, protegida pelo PIN de administrador.

## Eventos: casos de borda (escolhas do Claude)

- Sem evento aberto: recepção e apresentador veem "Nenhum evento aberto".
- Envios pendentes no celular são sempre associados ao evento em que foram criados, mesmo que cheguem ao servidor depois do encerramento.
- João pode reabrir um evento encerrado.
- Marcações do apresentador também ficam guardadas offline e enviadas quando a conexão voltar; com vários aparelhos, vale a última marcação.

## Conexão instável

A internet da igreja (Wi-Fi e dados móveis) falha com frequência.
- Sem conexão, o recepcionista aperta Enviar normalmente e o visitante fica guardado no celular como "pendente".
- Quando a internet volta, os pendentes são enviados automaticamente, sem ação do recepcionista, sem criar duplicatas.
- A tela do apresentador, sem sinal, mantém a última lista carregada.

## Tela sempre acesa e modo claro/escuro (pedido de João)

- Com o app aberto, a tela do celular não apaga sozinha (Screen Wake Lock API). O bloqueio é pedido de novo quando o app volta a ficar visível. Se o aparelho não suportar, o app segue funcionando normalmente.
- Há uma opção de tema: claro, escuro ou automático (segue o aparelho). A escolha fica guardada no celular e vale para as três telas.

## Visual

- Layout elegante e moderno (referência: print enviado por João): fundo creme quente, cartões brancos com borda suave e cantos arredondados, rótulos em maiúsculas pequenas, laranja-ferrugem como cor principal, barra de ação fixa embaixo na recepção, fonte Poppins. Sem barra de título no topo: só os ícones de tema e de sair. O seletor de tema usa apenas ícones (automático, claro, escuro). Acessível: contraste AA, alvos de toque de 48 px, foco visível, rótulos para leitor de tela, respeita "reduzir movimento". Há mockups de referência em `.superpowers/brainstorm/616-1794000340/content/telas-v2.html` (rascunho de estrutura, não de acabamento).
- Identidade da igreja: logo em `Logo/images.jpg` (ADTC Guaraciaba do Norte). Paleta derivada da logo: azul do livro, vermelho e laranja da chama, verde do globo. Logo no topo do app e como ícone instalável.
- O acabamento visual final é feito na construção; João achou o rascunho "feio" e espera refinamento com a identidade da igreja.

## Decisões técnicas (escolhas do Claude, a serem conferidas por João)

- App web instalável (PWA), com modo offline para a fila de envios pendentes.
- Hospedagem na Cloudflare (já existe conta; deve ficar organizada para vários projetos). Endereço: o gratuito da Cloudflare (`*.pages.dev`), sem domínio próprio por enquanto (decisão de João). Escolher o nome do endereço e o `start_url`/`scope` do PWA com cuidado, pois mudar depois da instalação é ruim.
- Banco de dados no Supabase (projeto já criado e ligado ao repositório GitHub `joao123-sketch/visitantes_adtc`).
- Atualização em tempo real da lista do apresentador (Supabase Realtime ou equivalente).
- Escolha de framework e linguagem é do construtor, priorizando o caminho mais simples.

## Estado atual

- Contas Cloudflare e Supabase criadas, projeto Supabase criado, repositório GitHub criado e ligado ao Supabase.
- A pasta local `H:\Meu Drive\Projetos\Visitantes` ainda não é um repositório git.

## Deixado ao construtor

- Framework, estrutura de pastas, nomes de tabelas, forma de autenticar PINs com segurança, estratégia exata de deduplicação e fila offline, textos de tela, detalhes visuais dentro da paleta acima.
