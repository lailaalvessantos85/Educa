# ENADE Explicado

Plataforma estática com vídeos curtos em que professores explicam questões do ENADE.
Os vídeos ficam no YouTube; a página mostra os cards, filtra e abre o player na própria tela.

Visual no estilo das plataformas de streaming: tema escuro, banner grande com um vídeo em destaque
e fileiras de cards que rolam para o lado (por curso, tema, ano ou professor, à escolha do aluno).
Vídeos já assistidos ganham uma barrinha coral embaixo da miniatura (fica salvo só no navegador do aluno).

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | A plataforma (cards, busca, filtros e player). |
| `videos.js` | **A lista de vídeos.** É o único arquivo que você edita no dia a dia. |
| `adicionar.html` | Gerador de cards: preencha o formulário e copie o bloco pronto para o `videos.js`. |
| `treino.js` | Acompanha o vídeo e mostra as questões de treino com gabarito. |
| `comum.js`, `estilo.css` | Código e visual compartilhados pelas duas páginas. |

## Como adicionar um vídeo

1. Suba o vídeo no YouTube (pode ser **não listado**: não aparece na busca do YouTube, mas toca na plataforma).
2. Abra `adicionar.html`, cole o link do vídeo e preencha os campos.
3. Clique em **Copiar bloco** e cole no `videos.js`, antes do `];` final.
4. Salve e envie o arquivo para o GitHub. Pronto: o card aparece na plataforma.

Escreva curso, tema e professor **sempre do mesmo jeito** (ex.: sempre "Administração", com acento),
porque os filtros agrupam pelo texto exato. O gerador sugere os nomes que já existem.

## Questões de treino

Cada vídeo pode ter questões de treino (campo `questoes` no `videos.js`, ou o botão
**+ Questão objetiva / + Questão discursiva** no gerador). Elas aparecem abaixo do vídeo e funcionam assim:

- **Ficam bloqueadas até o aluno assistir a 90% do vídeo.** A página acompanha o player do YouTube e
  conta só os trechos realmente reproduzidos: pular para o fim não libera. Assistir em 1,5x ou 2x conta normalmente.
- Enquanto está bloqueado, o aluno vê quanto já assistiu. Ao liberar, aparece o aviso "Questões liberadas!".
- O botão **Ver gabarito** só ativa depois que todas as objetivas foram respondidas. O gabarito mostra
  acerto/erro, a alternativa certa, o seu comentário, o padrão de resposta das discursivas e a nota.
- Depois de liberado, fica liberado naquele navegador. A barrinha nos cards mostra quanto do vídeo já foi visto.

Observações:
- O progresso fica salvo só no navegador do aluno. Em outro aparelho, ele precisa assistir de novo.
- Como é uma página sem servidor, um aluno com conhecimento técnico consegue ver o gabarito no código-fonte.
  Para treino isso não é problema; para avaliação valendo nota, seria preciso um sistema com login.
- Se o navegador bloquear o YouTube (alguns bloqueadores de anúncio), o vídeo pode não ser acompanhado e
  as questões continuam bloqueadas. A página avisa o aluno.

## Vídeo em destaque

Marque `destaque: true` no vídeo (ou a caixinha no gerador). Se vários estiverem marcados, a página
sorteia um a cada visita. Se nenhum estiver, o banner mostra o último vídeo adicionado.

## Filtros

Ficam no botão **Filtros** no topo. Ao buscar ou filtrar, as fileiras dão lugar a uma grade com os resultados.


- Busca por palavra (ignora acentos e maiúsculas): procura no título, descrição, tema, curso e professor.
- Listas de Curso, Ano, Tipo de questão (Formação Geral / Componente Específico), Tema e Professor.
  Cada lista mostra só as opções que ainda têm vídeos, com a quantidade entre parênteses.
- Ordenação por prova mais recente, mais antiga, número da questão ou título.
- Os filtros ficam no endereço da página. Exemplo: `index.html?curso=Administração&ano=2022`
  abre já filtrado, então dá para mandar esse link para uma turma.

## Como publicar

Não precisa de servidor nem banco de dados. Funciona em GitHub Pages, Vercel ou Netlify.
No GitHub Pages: Settings → Pages → Branch `main` / pasta raiz. A plataforma fica em
`https://<seu-usuario>.github.io/Educa/enade/`.
