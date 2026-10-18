# Reprodutor de vídeo + painel administrativo

Site minimalista com uma página pública de reprodução e um painel protegido para enviar e excluir vídeos. O arquivo de vídeo fica no Supabase Storage, não no GitHub.

## Antes de começar

- Conta no [Supabase](https://supabase.com/).
- Plano do armazenamento que aceite o tamanho dos seus vídeos. Um arquivo de 800 MB ultrapassa os limites padrão de upload de alguns planos gratuitos. Verifique o limite máximo de arquivo e os custos/tráfego do seu projeto antes de enviar.
- Conta na [Vercel](https://vercel.com/) ou outro host estático para publicar os arquivos deste repositório.

## 1. Configurar Supabase

1. Crie um projeto no Supabase.
2. Abra **SQL Editor**, crie uma consulta e execute todo o conteúdo de `supabase.sql`.
3. Em **Authentication > Sign In / Providers**, desative o cadastro público (Allow new users to sign up), para que visitantes não possam criar contas.
4. Em **Authentication > Users**, crie manualmente o usuário administrativo (e-mail e senha).
5. Em **Project Settings > API**, copie a Project URL e a chave pública/anon.
6. Edite `config.js` e substitua `COLE_A_URL_DO_SEU_PROJETO` e `COLE_SUA_CHAVE_PUBLICA_ANON`. A chave pública/anon é feita para uso no navegador; nunca coloque uma chave `service_role` neste arquivo.

## 2. Publicar

1. Importe o repositório `Pedrowilker/video-especial` na Vercel.
2. Use as configurações padrão para um site estático, sem build command.
3. Publique e abra o endereço fornecido pela Vercel.
4. Para administrar, abra o mesmo domínio com `/admin.html`.

## 3. Usar

- Entre em `/admin.html` com o usuário criado no Supabase.
- Escolha um arquivo de vídeo e clique em **Enviar e publicar**.
- O envio usa upload resumível para ajudar com arquivos grandes.
- A página inicial exibe o vídeo enviado mais recentemente.
- Excluir um vídeo remove o arquivo do armazenamento e o registro da biblioteca.

## Importante sobre arquivos grandes

O upload resumível não remove os limites do plano do provedor. Confira no Supabase os limites atuais de tamanho por arquivo, espaço e tráfego. O SQL configura o bucket para aceitar até 5 GB, mas o limite efetivo do projeto também precisa permitir o tamanho escolhido. Para 800 MB, pode ser necessário um plano pago.

## Segurança

- Não compartilhe a senha administrativa.
- Nunca coloque a chave secreta `service_role` no frontend.
- O bucket de vídeos é público para que qualquer pessoa com o link do site consiga reproduzir os arquivos. A página inicial mostra somente o vídeo mais recente; os arquivos antigos ficam na biblioteca administrativa até serem excluídos.
