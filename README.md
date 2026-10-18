# Biblioteca de arquivos do Google Drive

O site permite colar no próprio site o link de uma pasta do Google Drive e listar os arquivos acessíveis nessa pasta. Ele pode exibir vídeos, imagens, PDFs, documentos Google e outros arquivos; para formatos não compatíveis com pré-visualização, oferece um link para abrir no Drive. Também permite entrar em subpastas.

## Importante: limites de acesso

- Isto funciona com **links de pastas do Google Drive**, não com qualquer URL da internet nem com links individuais de arquivos.
- A Google Drive API não consegue listar uma pasta privada só porque alguém tem o link. A pasta precisa permitir leitura e listagem à pessoa/serviço que consulta a API. Para a versão simples deste site estático, use pastas com acesso geral **Qualquer pessoa com o link — Leitor**.
- Algumas organizações bloqueiam o compartilhamento público. Nesses casos, o conteúdo não aparecerá.
- Não coloque pastas confidenciais. O conteúdo listado poderá ser visto por todos que usarem o site.
- Os arquivos continuam sujeitos aos limites de visualização e tráfego do Google Drive.

## Configuração da chave da API

1. No [Google Cloud Console](https://console.cloud.google.com/), ative **Google Drive API**.
2. Crie uma chave de API nova, especialmente se uma chave anterior foi exposta.
3. Nas restrições da chave, limite a **Google Drive API** e, em restrições de site, adicione `https://pedrowilker.github.io/*`.
4. Abra [config.js](https://github.com/Pedrowilker/video-especial/blob/main/config.js) e substitua `COLE_SUA_CHAVE_NOVA_RESTRITA_AQUI` pela sua nova chave.
5. Salve com **Commit changes**.

A chave fica visível ao navegador, portanto restrinja-a no Google Cloud e nunca a reutilize de um projeto sensível.

## Publicação

No GitHub, abra **Settings > Pages**, escolha **Deploy from a branch**, selecione `main` e `/(root)`, e salve. O endereço esperado é `https://pedrowilker.github.io/video-especial/`.

## Como usar

1. Abra o site.
2. Cole o link de uma pasta do Google Drive no campo **Link da pasta do Google Drive**.
3. Clique em **Exibir conteúdo**.
4. Clique em **Abrir pasta** para entrar em uma subpasta, ou em **Voltar** para retornar.
5. Atualize a página para consultar novamente os arquivos.

A configuração inicial continua apontando para a pasta de vídeos cadastrada no projeto, mas é possível trocar de pasta dentro da página sem editar o código.
