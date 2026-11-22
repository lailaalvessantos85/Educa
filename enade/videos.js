/*
  LISTA DE VÍDEOS DA PLATAFORMA
  ------------------------------------------------------------
  Cada bloco entre { } vira um card na página.
  Para adicionar um vídeo, copie um bloco, cole no fim da lista
  (antes do colchete final "]") e troque as informações.
  Dica: a página "adicionar.html" monta o bloco pronto para você.

  Campos:
    titulo     – título curto do card
    youtube    – link do vídeo no YouTube (qualquer formato) ou só o ID
    curso      – curso do ENADE (ex.: "Administração")
    ano        – ano da prova (número)
    questao    – número da questão na prova (número)
    tipo       – "Formação Geral" ou "Componente Específico"
    tema       – assunto da questão (ex.: "Marketing")
    professor  – quem explica
    duracao    – duração do vídeo (ex.: "6:40")
    descricao  – uma ou duas frases sobre a questão (opcional)
    destaque   – true para aparecer no banner grande do topo (opcional).
                 Se nenhum vídeo tiver destaque, o banner mostra o último adicionado.
    questoes   – questões de treino que aparecem abaixo do vídeo (opcional).
                 Só ficam visíveis depois que o aluno assiste a 90% do vídeo.

  Formato das questões de treino:
    questoes: [
      {                                   // questão objetiva
        enunciado: "Texto da questão",
        alternativas: ["texto A", "texto B", "texto C", "texto D", "texto E"],
        correta: "C",                     // letra da alternativa certa
        comentario: "Por que a C está certa (aparece no gabarito)"   // opcional
      },
      {                                   // questão discursiva
        tipo: "discursiva",
        enunciado: "Texto da questão",
        resposta: "Padrão de resposta (aparece no gabarito)"
      }
    ]
  Para pular linha dentro de um texto, use \n. Para incluir uma figura,
  acrescente imagem: "link da imagem" na questão.

  Os exemplos abaixo estão sem link (youtube: "") e aparecem como
  "Vídeo em breve". Apague-os ou substitua pelos seus vídeos.
*/
window.VIDEOS = [
  {
    titulo: "Modelo de negócio e proposta de valor",
    youtube: "",
    curso: "Administração",
    ano: 2022,
    questao: 12,
    tipo: "Componente Específico",
    tema: "Estratégia",
    professor: "Profa. Laila",
    duracao: "7:15",
    descricao: "Como identificar a proposta de valor de uma empresa a partir do estudo de caso da questão."
  },
  {
    titulo: "Interpretação de gráfico sobre desigualdade",
    youtube: "",
    curso: "Administração",
    ano: 2022,
    questao: 3,
    tipo: "Formação Geral",
    tema: "Interpretação de dados",
    professor: "Prof. Exemplo",
    duracao: "5:02",
    descricao: "Leitura do gráfico, eliminação das alternativas e a resposta correta."
  },
  {
    titulo: "Marketing digital e comportamento do consumidor",
    youtube: "",
    curso: "Administração",
    ano: 2018,
    questao: 21,
    tipo: "Componente Específico",
    tema: "Marketing",
    professor: "Profa. Laila",
    duracao: "8:30",
    descricao: "Os conceitos de jornada do consumidor cobrados na questão, um por um.",
    questoes: [
      {
        enunciado: "Uma loja de roupas percebeu que muitos clientes pesquisam os produtos no Instagram, comparam preços em sites e só depois vão à loja física para comprar.\n\nEsse comportamento é melhor descrito pelo conceito de",
        alternativas: [
          "marketing de massa, pois a comunicação é a mesma para todos os clientes.",
          "jornada omnichannel, pois o consumidor transita entre canais on-line e off-line na mesma compra.",
          "marketing de guerrilha, pois a empresa usa ações de baixo custo e alto impacto.",
          "obsolescência programada, pois os produtos são trocados com frequência.",
          "venda pessoal, pois a decisão de compra acontece só com o vendedor."
        ],
        correta: "B",
        comentario: "O cliente usa vários canais (rede social, sites, loja) em etapas diferentes de uma mesma compra. Integrar esses canais é a ideia central do omnichannel."
      },
      {
        enunciado: "Na etapa de consideração da jornada do consumidor, a ação de marketing mais adequada é",
        alternativas: [
          "anunciar a marca para pessoas que ainda não sabem que têm o problema.",
          "oferecer conteúdos comparativos, avaliações de clientes e demonstrações do produto.",
          "enviar pesquisa de satisfação após a entrega.",
          "criar um programa de fidelidade para quem já comprou várias vezes.",
          "reduzir o preço de todos os produtos da loja."
        ],
        correta: "B",
        comentario: "Na consideração, o cliente já conhece o problema e compara soluções. Conteúdos que ajudam a comparar e geram confiança são os mais úteis nessa fase."
      },
      {
        tipo: "discursiva",
        enunciado: "Explique, em até 5 linhas, por que conhecer a jornada do consumidor ajuda uma empresa a investir melhor em marketing digital.",
        resposta: "Espera-se que o estudante mencione que cada etapa (descoberta, consideração, decisão e pós-compra) pede mensagens e canais diferentes. Conhecer a jornada permite direcionar o investimento para o canal e o conteúdo certos em cada etapa, evitando gastar com ações que não convertem e melhorando a experiência do cliente."
      }
    ]
  },
  {
    titulo: "Requisitos funcionais e não funcionais",
    youtube: "",
    curso: "Engenharia de Software",
    ano: 2021,
    questao: 15,
    tipo: "Componente Específico",
    tema: "Engenharia de Requisitos",
    professor: "Profa. Laila",
    duracao: "6:10",
    descricao: "Como diferenciar os dois tipos de requisito no enunciado da questão.",
    questoes: [
      {
        enunciado: "Em um sistema de matrícula on-line, qual item abaixo é um requisito NÃO funcional?",
        alternativas: [
          "O aluno deve poder escolher as disciplinas do semestre.",
          "O sistema deve emitir o comprovante de matrícula em PDF.",
          "A página de matrícula deve carregar em até 2 segundos com 5.000 usuários simultâneos.",
          "O coordenador deve poder aprovar ou recusar pedidos de quebra de pré-requisito.",
          "O aluno deve receber um e-mail quando a matrícula for confirmada."
        ],
        correta: "C",
        comentario: "Tempo de resposta sob carga é uma qualidade do sistema (desempenho), não uma função que o usuário executa. As demais alternativas descrevem o que o sistema faz."
      },
      {
        enunciado: "Considere o requisito: \"O sistema deve permitir que o usuário redefina a senha pelo e-mail cadastrado, e o link enviado deve expirar em 30 minutos.\"\n\nÉ correto afirmar que esse requisito",
        alternativas: [
          "é apenas funcional.",
          "é apenas não funcional.",
          "mistura um requisito funcional (redefinir senha) e um não funcional (expiração do link, ligada à segurança).",
          "não é um requisito, e sim uma regra de negócio sem relação com o software.",
          "deve ser descartado, pois requisitos não podem citar tempo."
        ],
        correta: "C",
        comentario: "Redefinir a senha é uma função. A expiração em 30 minutos é uma restrição de segurança. Uma boa prática é separar os dois em requisitos distintos."
      }
    ]
  },
  {
    titulo: "Metodologias ágeis: papéis no Scrum",
    youtube: "",
    curso: "Engenharia de Software",
    ano: 2021,
    questao: 27,
    tipo: "Componente Específico",
    tema: "Processos de Software",
    professor: "Prof. Exemplo",
    duracao: "4:45",
    descricao: "Product Owner, Scrum Master e time de desenvolvimento: o que cada um faz."
  },
  {
    titulo: "Ética, cidadania e tecnologia",
    youtube: "",
    curso: "Engenharia de Software",
    ano: 2019,
    questao: 6,
    tipo: "Formação Geral",
    tema: "Ética e sociedade",
    professor: "Prof. Exemplo",
    duracao: "5:50",
    descricao: "Questão discursiva de Formação Geral: estrutura de uma boa resposta."
  }
];
