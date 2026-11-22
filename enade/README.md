# ENADE Explicado

Plataforma estática com vídeos curtos em que professores explicam questões do ENADE.
Os vídeos ficam no YouTube; a página mostra os cards, filtra e abre o player na própria tela.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | A plataforma (cards, busca, filtros e player). |
| `videos.js` | **A lista de vídeos.** É o único arquivo que você edita no dia a dia. |
| `adicionar.html` | Gerador de cards: preencha o formulário e copie o bloco pronto para o `videos.js`. |
| `comum.js`, `estilo.css` | Código e visual compartilhados pelas duas páginas. |

## Como adicionar um vídeo

1. Suba o vídeo no YouTube (pode ser **não listado**: não aparece na busca do YouTube, mas toca na plataforma).
2. Abra `adicionar.html`, cole o link do vídeo e preencha os campos.
3. Clique em **Copiar bloco** e cole no `videos.js`, antes do `];` final.
4. Salve e envie o arquivo para o GitHub. Pronto: o card aparece na plataforma.

Escreva curso, tema e professor **sempre do mesmo jeito** (ex.: sempre "Administração", com acento),
porque os filtros agrupam pelo texto exato. O gerador sugere os nomes que já existem.

## Filtros

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
