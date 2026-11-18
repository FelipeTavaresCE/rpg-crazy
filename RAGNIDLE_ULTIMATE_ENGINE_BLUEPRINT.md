# RAGNIDLE: CRÔNICAS DA AURORA — ULTIMATE ENGINE & GAME DESIGN BLUEPRINT (v3.0)

> **INSTRUÇÃO DIRETA PARA O AGENTE DE IA / ARQUITETO DE SOFTWARE:**
> Você está assumindo a engenharia de **Ragnidle: Crônicas da Aurora**, um MMORPG Idle de navegador (*browser-first*, 100% responsivo para Mobile e Desktop) inspirado nos pilares clássicos de **Tibia**, **Ragnarok Online**, **Path of Exile**, **Albion Online**, **MU Online** e **Lineage II**.
>
> **REGRAS DE OURO DE EXECUÇÃO:**
> 1. **Zero Código Incompleto:** Nunca entregue funções vazias (`TODO`), *placeholders* quebrados ou sistemas simulados sem lógica real.
> 2. **Arquitetura 100% Data-Driven:** Separe rigorosamente o **Motor (`src/engine/`)** e os **Sistemas (`src/systems/`)** dos **Dados (`src/data/*.json`)**. Adicionar uma nova cidade, 50 monstros ou 200 cartas no futuro deve exigir apenas novos registros nos arquivos JSON, sem alterar o código-fonte do motor.
> 3. **Anti-Planilha:** O campo de batalha vivo (mapa 2D em grade) é o centro da tela. O jogador deve *ver* o personagem se movendo, desviando, disparando projéteis, ativando posturas e coletando saque no chão.

---

## 1. DIREÇÃO DE ARTE & RENDERIZAÇÃO GRÁFICA (PADRÃO TIBIA / POKÉTIBIA)

Para garantir leitura espacial imediata e identidade visual clássica em qualquer tela:

* **Projeção e Câmera:** Perspectiva oblíqua de 45° (*Top-Down Oblique / Cavalier Projection*). O chão é uma grade ortogonal perfeita (`SQM`), enquanto paredes, árvores, monstros e personagens projetam-se inclinados para o topo/esquerda.
* **Grid Base (SQM):** `32x32 pixels` por tile padrão. Chefes e criaturas colossais ocupam `64x64 px` ou `96x96 px`, sempre ancorados pela base dos pés no centro do SQM alvo.
* **Pixel-Perfect Rendering:**
  * Configurar `imageSmoothingEnabled = false` no Canvas / `pixelArt: true` e `roundPixels: true` no Phaser 3.
  * Todos os sprites devem possuir **contorno (outline) de `1px`** em tom escuro e iluminação vinda do **canto superior esquerdo**, mantendo o terreno dessaturado para destacar personagens, projéteis e saques.
* **Ordenação de Profundidade (Y-Sorting):** Renderizar entidades dinamicamente ordenadas por `depth = entity.y + (entity.z * 16)` para que personagens passem corretamente atrás de copas de árvores e telhados.
* **Iluminação Dinâmica & Atmosfera:** Camada de iluminação multiplicativa (`Multiply Blend Mode`) para suportar tochas, brilhos de itens raros no chão, auras de *Portadores* e a transição visual do **Ciclo do Eclipse**.

---

## 2. ARQUITETURA DE PASTAS & ESCALABILIDADE

```text
/
├── RAGNIDLE_ULTIMATE_ENGINE_BLUEPRINT.md  # Este documento mestre
├── ROADMAP.md                             # Checklist incremental de Sprints
├── index.html                             # Viewport mobile-first sem zoom acidental
├── src/
│   ├── main.ts                            # Inicialização do motor e loop de tempo real
│   ├── engine/
│   │   ├── GridSystem.ts                  # Pathfinding A*, colisão por SQM e ocupação
│   │   ├── CombatEngine.ts                # Cálculo determinístico de dano, ticks e estados
│   │   ├── OfflineSimulator.ts            # Simulação matemática de até 8h offline
│   │   └── LightingSystem.ts              # Controle visual Aurora vs. Eclipse
│   ├── systems/
│   │   ├── GambitAI.ts                    # Motor de Eco Tático (regras condicionais)
│   │   ├── MasterySystem.ts               # Progressão por família de arma (Albion)
│   │   ├── PassiveTreeSystem.ts           # Árvore passiva compartilhada e Gemas (PoE)
│   │   ├── CardAndRelicSystem.ts          # Encaixe de cartas (Ragnarok) e Relíquias
│   │   ├── RefineSystem.ts                # Aprimoramento +1 a +10 e Cicatriz (MU)
│   │   └── LootAndEconomy.ts              # Drops hardcore, Portadores e Auto-Reciclagem
│   ├── ui/
│   │   ├── ClassicHUD.ts                  # Janelas acopláveis/retráteis estilo Tibia
│   │   └── OfflineReportModal.ts          # Resumo de retorno (4 pilares)
│   └── data/
│       ├── regions.json                   # Porto Âmbar, Bosque Musgo, Cripta, Ilha, Fronteira
│       ├── monsters.json                  # Atributos, comportamento, loot table e cartas
│       ├── items.json                     # Armas, armaduras, gemas, relíquias e consumíveis
│       └── skills.json                    # Técnicas vinculadas às armas e modificadores
```

---

## 3. FÓRMULAS MATEMÁTICAS DE COMBATE (DETERMINÍSTICAS)

O combate opera em ticks fixos de `100ms` (10 ticks/segundo) sincronizados com `Date.now()` para que abas minimizadas no navegador não congelem a progressão.

### 3.1. Cálculo de Dano Final
$$\text{DanoBase} = (\text{AtaqueArma} + \text{AtributoPrincipal} \times 1.5) \times (1 + \text{BonusMaestria})$$

$$\text{Multiplicadores} = (1 + \sum \text{BonusCartas}) \times (1 + \sum \text{BonusArvorePassiva}) \times \text{ModificadorPostura}$$

$$\text{Mitigacao} = \frac{\text{DefesaAlvo}}{\text{DefesaAlvo} + 100 + (10 \times \text{NivelAtacante})}$$

$$\text{DanoFinal} = \max\left(1, \lfloor \text{DanoBase} \times \text{Multiplicadores} \times (1 - \text{Mitigacao}) \times \text{Critico} \rfloor\right)$$

* **Posturas de Combate (Alternáveis em tempo real ou via Gambit):**
  * **Equilíbrio:** `1.0x` Dano | `1.0x` Defesa | `1.0x` Velocidade de Ataque.
  * **Avanço:** `1.25x` Dano | `0.80x` Defesa | `1.15x` Velocidade de Ataque.
  * **Guarda:** `0.75x` Dano | `1.40x` Defesa | `+5%` Regeneração de HP por segundo.

---

## 4. PILARES DE JOGABILIDADE (FUSÃO DOS CLÁSSICOS)

### 4.1. Liberdade de Build (Albion Online + Path of Exile)
* **Sem Classes Travadas:** O personagem é definido pela **Arma Equipada**. Trocar de *Espada Larga* para *Cajado Rúnico* ou *Arco Longo* muda imediatamente a habilidade principal, o alcance (1 SQM corpo-a-corpo vs. 5 SQMs à distância) e a animação no mapa.
* **Maestria por Uso:** Cada família de arma acumula XP próprio (`Nível 1 a 100`), concedendo `+0.5%` de eficiência por nível e desbloqueando técnicas passivas.
* **Árvore Passiva Compartilhada & Gemas:** Pontos de nível são investidos em uma constelação única compartilhada entre todas as armas. Cada arma possui até **3 engastes de Gemas de Habilidade** que alteram o comportamento da técnica no campo (ex.: *Gema de Bifurcação* dispara 2 projéteis; *Gema Vampírica* converte 8% do dano em HP).

### 4.2. Eco Tático — Programação de Gambits (Final Fantasy XII)
Para evitar que o modo *idle* seja apenas assistir passivamente, o jogador configura até **5 regras condicionais priorizadas** (de cima para baixo):
1. `SE HP_JOGADOR < 35% -> USAR Poção de Vida / Habilidade de Cura`
2. `SE HP_JOGADOR < 50% -> ALTERNAR Postura para Guarda`
3. `SE ALVO == PORTADOR ou CHEFE -> USAR Habilidade Suprema`
4. `SE INIMIGOS_ADJACENTES >= 3 -> USAR Técnica em Área (AoE)`
5. `SEMPRE -> ATACAR Alvo mais próximo`

### 4.3. Economia Hardcore & Cartas (Ragnarok Online)
Taxas calibradas para evitar inflação em sessões longas (8 horas ≈ 10.000 a 12.800 abates) e valorizar o comércio entre jogadores:
* **Portadores (1 a cada 100 abates na região):** Ao atingir 100 abates, o próximo monstro nasce como um **Portador** (escala `1.3x`, aura dourada/carmesim, alerta sonoro e visual). Garante **1 a 3 Fragmentos de Relíquia** e `2%` de chance de Relíquia completa.
* **Tabela de Drop Global:**
  * **Moedas & Materiais Comuns:** `35% a 60%` (base para profissões de forja e consumíveis).
  * **Equipamentos Comuns/Incomuns:** `1.5%` (alvo principal do filtro de auto-reciclagem).
  * **Relíquia Completa (55 tipos no Ato I):** `0.02%` em monstros comuns (`1 em 5.000`) | `2.0%` em Portadores.
  * **Carta de Monstro:** `0.01%` (`1 em 10.000` abates). Cada criatura possui uma carta exclusiva que pode ser encaixada em slots de equipamentos para conceder efeitos únicos (ex.: *Carta de Lobo Musgoso: +12% Dano contra monstros tipo Fera*).
  * **Item Lendário:** `0.0002%` (`1 em 500.000` abates). Anunciado no log global do servidor.
* **Auto-Reciclagem Inteligente:** O jogador marca raridades/tipos para conversão automática no momento do saque em **Pó Arcano** e **Fragmentos de Têmpera**, mantendo o inventário limpo durante caçadas de 8 horas.

### 4.4. Refino com Cicatriz (MU Online)
* Equipamentos podem ser refinados de `+1` até `+10` usando **Joias da Aurora** e **Fragmentos de Têmpera**.
* **Segurança +1 a +4:** `100%` de sucesso.
* **Risco +5 a +10:** Chances decrescentes (`75%`, `60%`, `45%`, `30%`, `20%`, `10%`).
* **Mecânica de Cicatriz:** Em caso de falha acima de `+4`, o item **não é destruído** (evitando abandono do jogo), mas recua 1 nível e recebe uma **Cicatriz de Refino**. Um item cicatrizado não pode tentar novo refino até ser restaurado por um artesão usando **Relíquias Purificadas** — criando demanda eterna entre guerreiros e colecionadores.

### 4.5. Ciclo Dinâmico Aurora / Eclipse & Territórios (Lineage II)
* **Ciclo Global do Mundo:** A cada **4 horas de Aurora** (foco em coleta, comércio e exploração segura), o mundo entra em **2 horas de Eclipse**.
* **Efeito do Eclipse:** A iluminação do mapa escurece, tochas se acendem, monstros ganham variantes sombrias (`+30% HP/Dano`) e passam a dropar **Essências do Eclipse**, necessárias para entrar em masmorras de alto nível e fabricar chaves de cerco.
* **Guerras de Território:** Guildas disputam postos avançados na *Fronteira do Eclipse* em horários agendados. A guilda controladora recebe taxa reduzida no mercado e acesso a veios de minério/caça exclusivos.

---

## 5. SIMULAÇÃO OFFLINE & RELATÓRIO DE RETORNO (ATÉ 8 HORAS)

Quando o jogador fecha o jogo e retorna após $\Delta t$ segundos (limitado a `28.800s` = 8h):
1. O motor calcula o **Tempo Médio por Abate ($T_{abate}$)** com base no DPS real da build atual, deslocamento médio (`2.5s`) e tempo de regeneração/gambits.
2. $\text{AbatesOffline} = \lfloor \frac{\min(\Delta t, 28800)}{T_{abate}} \rfloor$.
3. Executa a rolagem determinística de XP, moedas, materiais, **Portadores (`Abates / 100`)**, Relíquias, Cartas e itens auto-reciclados.
4. Exibe o **Modal de Retorno** estruturado em 4 blocos claros:
   * **O que aconteceu:** Tempo caçado, total de monstros derrotados, Portadores abatidos e XP/Níveis ganhos.
   * **O que guardar:** Destaques raros obtidos (Cartas, Relíquias, Equipamentos superiores ao atual).
   * **O que melhorar:** Sugestão automática baseada na eficiência da sessão (ex.: *"Sua sobrevivência caiu 3 vezes; considere equipar uma Gema Vampírica ou ativar Postura de Guarda nos Gambits"*).
   * **Próxima oportunidade:** Alerta se o mundo está em **Ciclo do Eclipse** ou se um chefe regional está disponível.

---

## 6. MAPA INICIAL (ATO I — EXPANSÍVEL VIA JSON)

1. **Porto Âmbar (Cidade Segura):** Praça central, Forja/Refino, Mercado entre Jogadores, Mural de Contratos, Banco/Depósito e Doca de Navegação.
2. **Bosque Musgo (Nível 1–15):** Trilhas de terra, árvores oblíquas 45°, Slimes de Seiva, Lobos Musgosos e o Chefe *Ancião Raiz-Podre*.
3. **Cripta da Névoa (Nível 15–30):** Catacumbas úmidas, Esqueletos Guardiões, Aparições e o Chefe *Lorde Cinzento*.
4. **Ilha da Vigília (Nível 30–45):** Costa rochosa acessível pelo porto, Corsários Espectrais e Golens de Coral.
5. **Fronteira do Eclipse (Nível 45+ / Endgame):** Entreposto avançado, Pântano Sombrio, Desfiladeiro, Floresta Gelada, duas Masmorras em Trio e a Fortaleza Disputada por Guildas.

---

## 7. ARQUITETURA DE PRODUÇÃO & SEGURANÇA ONLINE

* **Fase Atual (Cliente Autoritativo Local):** Persistência estruturada em `localStorage` com versionamento de schema (`save_v1`) e assinatura de integridade.
* **Migração Backend (Cloudflare Workers + D1 / Node.js + PostgreSQL):** Toda a lógica de `CombatEngine.ts`, `OfflineSimulator.ts` e `LootAndEconomy.ts` deve ser escrita em **TypeScript puro (sem dependência direta de DOM/Phaser)** para rodar exatamente o mesmo código no servidor autoritativo quando o Mercado entre Jogadores e as Guildas forem ativados.
