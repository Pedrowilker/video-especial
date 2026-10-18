# Biblioteca de vídeos com Google Drive

O site exibe automaticamente os vídeos de uma pasta do Google Drive e incorpora o player do próprio Drive. Os vídeos continuam armazenados na sua conta; o repositório contém somente os arquivos do site.

## 1. Configurar a Google Drive API

1. Abra o [Google Cloud Console](https://console.cloud.google.com/).
2. Selecione o projeto usado pelo site.
3. Em **APIs e serviços > Biblioteca**, procure **Google Drive API** e clique em **Ativar**.
4. Em **APIs e serviços > Credenciais**, crie uma **nova chave de API**. Não reutilize uma chave que já foi compartilhada ou publicada.
5. Abra a configuração da chave e em **Restrições de API** selecione **Restringir chave** e marque somente **Google Drive API**.
6. Em **Restrições do aplicativo**, escolha **Sites** e cadastre `https://pedrowilker.github.io/*` como referência permitida para o site.
7. Salve as restrições e aguarde alguns minutos para serem aplicadas.

## 2. Configurar o site

1. Abra o arquivo [config.js](https://github.com/Pedrowilker/video-especial/blob/main/config.js).
2. Clique no lápis para editar.
3. Substitua `COLE_SUA_CHAVE_NOVA_RESTRITA_AQUI` pela chave nova, mantendo as aspas.
4. Clique em **Commit changes** para salvar.

A pasta já está configurada em `config.js`. O código aceita tanto o ID da pasta quanto o link completo da pasta.

## 3. Compartilhar a pasta

No Google Drive, abra a pasta de vídeos, clique em **Compartilhar** e defina o acesso geral como **Qualquer pessoa com o link — Leitor**. Se a pasta ou os vídeos não permitirem acesso público de leitura, a listagem ou reprodução poderá falhar.

## 4. Publicar com GitHub Pages

1. Abra **Settings** deste repositório no GitHub.
2. Acesse **Pages** no menu lateral.
3. Em **Build and deployment**, selecione **Deploy from a branch**.
4. Escolha a branch `main` e a pasta `/(root)`, depois clique em **Save**.
5. Aguarde a conclusão do deploy e use o link mostrado na tela **Settings > Pages**. O endereço esperado é `https://pedrowilker.github.io/video-especial/`.

O GitHub informa que a publicação pode demorar alguns minutos. Se o endereço não abrir, confira em **Actions** se houve erro no fluxo de publicação.

## Como funciona

- Coloque os vídeos dentro da pasta do Drive configurada.
- O site lista arquivos identificados pelo Drive como vídeos.
- Vídeos novos aparecem ao atualizar a página.
- A reprodução é feita pelo player incorporado do Google Drive.

## Limitações

- A listagem automática depende de uma chave válida da API e da pasta estar acessível publicamente para leitura.
- O Drive pode impor limites de tráfego ou interromper temporariamente a reprodução de arquivos muito acessados.
- `admin.html` e `admin.js` pertencem à versão anterior baseada em Supabase e não são necessários para a galeria do Drive.

## Segurança

A chave de API ficará visível no código enviado ao navegador, por isso as restrições de API e de site são importantes. Nunca coloque senhas da conta Google no código.

**Importante:** se uma chave já foi publicada no histórico do repositório, removê-la do arquivo atual não apaga os commits antigos. Revogue essa chave em **Google Cloud Console > APIs e serviços > Credenciais** e use uma nova, restrita conforme descrito acima.