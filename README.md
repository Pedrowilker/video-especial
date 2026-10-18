# Biblioteca de vídeos com Google Drive

A página inicial lista automaticamente os vídeos de uma pasta pública do Google Drive e incorpora o player do Drive para assistir no próprio site. Os vídeos ficam no seu Drive; o repositório guarda apenas os arquivos do site.

## Configuração inicial

A pasta informada para este projeto já está preenchida em `config.js`. Para a listagem automática funcionar, falta criar uma chave de API do Google Drive.

1. Abra o [Google Cloud Console](https://console.cloud.google.com/).
2. Crie um projeto (ou selecione um projeto existente).
3. Em **APIs e serviços > Biblioteca**, procure **Google Drive API** e clique em **Ativar**.
4. Vá a **APIs e serviços > Credenciais > Criar credenciais > Chave de API**.
5. Copie a chave e abra o arquivo `config.js` neste repositório.
6. Substitua `COLE_SUA_CHAVE_DA_API_DO_GOOGLE` pela chave criada.
7. Depois que souber o endereço público do site, restrinja a chave em **Credenciais** para aceitar solicitações apenas desse domínio e limite a API à Google Drive API.
8. Confirme que a pasta do Drive está compartilhada como **Qualquer pessoa com o link — Leitor**.

## Como usar

- Coloque os vídeos dentro da pasta configurada.
- A página lista os arquivos com tipo de vídeo e mostra o nome de cada um.
- Os vídeos novos aparecem quando a página é carregada novamente.
- A reprodução é feita pelo player incorporado do Google Drive.

## Limitações importantes

- A listagem automática precisa da chave da API do Google.
- Apenas arquivos que o Drive identifica como vídeos são listados; documentos e outros tipos de arquivo não aparecem na galeria de reprodução.
- O Google Drive pode impor limites de tráfego ou interromper temporariamente a reprodução de arquivos muito acessados.
- O site ainda precisa ser publicado em uma hospedagem estática, como GitHub Pages ou Vercel.
- Os arquivos `admin.html` e `admin.js` pertencem à versão anterior baseada em Supabase e não são necessários para a galeria do Drive.

## Segurança

A chave de API não é uma senha privada, mas deve ser restringida por domínio e API no Google Cloud. Não coloque senhas de conta Google nem credenciais privadas no código do site.