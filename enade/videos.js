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
    descricao: "Os conceitos de jornada do consumidor cobrados na questão, um por um."
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
    descricao: "Como diferenciar os dois tipos de requisito no enunciado da questão."
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
