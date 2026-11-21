# Rota Leite no Vercel

Esta cópia do projeto mantém a interface Vue, as rotas, o registro offline, o histórico, os perfis e a exportação CSV. O Vercel serve a interface e executa a API. O banco Turso preserva a compatibilidade com o esquema SQLite. O login Google substitui a identidade fornecida pela hospedagem original. O servidor continua a aplicar os perfis e as atribuições.

## Preparação

1. Importe a pasta como projeto no Vercel. O arquivo `vercel.json` define a compilação e as rotas. O projeto usa Node.js 24.
2. Crie ou conecte um banco Turso. Configure a URL e o token do banco nas variáveis do Vercel.
3. No Google Cloud, crie um cliente OAuth para aplicativo web. Use o endereço definitivo do site como origem e registre `https://SEU-DOMINIO/api/auth/callback` como URL de retorno. O gestor e os motoristas precisam usar contas Gmail ou Google Workspace e, se o app OAuth estiver em modo de teste, também devem constar como usuários de teste no Google Cloud.
4. Configure as variáveis de `.env.vercel.example` no ambiente de destino do Vercel. Use o e-mail verificado do gestor e um segredo aleatório com pelo menos 32 bytes para `ROTA_SESSION_SECRET`. Mantenha os segredos nas configurações da hospedagem. `ROTA_PUBLIC_ORIGIN` deve conter o endereço HTTPS exato usado para abrir o site.
5. O build de produção cria as tabelas quando as duas variáveis do Turso estão configuradas. Para prepará-las manualmente, rode `npm ci` e `npm run db:vercel` em um ambiente com acesso ao banco. Publique e entre primeiro com a conta do gestor. Cadastre os motoristas em **Equipe** e atribua as rotas.
6. Valide o login, a leitura como motorista, o registro de coleta e o sincronismo offline no domínio de destino antes de trocar o endereço divulgado.

O código público da interface pode ser carregado sem login em produção. A API protege os dados com sessões assinadas e controle por perfil. Se precisar restringir também a abertura da interface inteira, configure **Deployment Protection** conforme o plano do projeto. Preserve a implantação original até validar o novo ambiente.

## Dados existentes

Um banco Turso vazio recebe os registros demonstrativos. As rotas, coletas e contas da implantação anterior exigem uma migração de dados separada. Identificadores de login vinculados à hospedagem original precisam ser vinculados às novas contas verificadas. Este pacote contém o código e o esquema.

## Validar localmente

`npm test` testa as regras de negócio e a adaptação do banco. `npm run build:vercel` gera os arquivos da interface em `vercel-dist`. O comando `npm run dev` continua disponível para rodar a demonstração local.
