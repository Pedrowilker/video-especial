(() => {
  const cfg = window.APP_CONFIG || {};
  const loading = document.getElementById('loading-state');
  const empty = document.getElementById('empty-state');
  const list = document.getElementById('public-video-list');
  const message = document.getElementById('status-message');

  const showMessage = (text) => {
    loading.hidden = true;
    empty.hidden = true;
    message.textContent = text;
    message.hidden = false;
  };

  // Aceita tanto o ID quanto o link completo da pasta do Google Drive.
  function normalizeFolderId(value) {
    const input = String(value || '').trim();
    if (!input) return '';
    const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : input;
  }

  const folderId = normalizeFolderId(cfg.driveFolderId);

  async function getAllVideos() {
    const videos = [];
    let pageToken = '';

    do {
      const params = new URLSearchParams({
        q: "'" + folderId + "' in parents and trashed = false",
        fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink,modifiedTime)',
        pageSize: '100',
        orderBy: 'name',
        key: cfg.driveApiKey
      });
      if (pageToken) params.set('pageToken', pageToken);

      const response = await fetch('https://www.googleapis.com/drive/v3/files?' + params.toString());
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error('O Google não retornou uma resposta válida. Confira a ativação da API.');
      }
      if (!response.ok || result.error) {
        const apiMessage = result.error?.message || 'Não foi possível acessar a pasta do Google Drive.';
        throw new Error(apiMessage);
      }

      for (const file of (result.files || [])) {
        if ((file.mimeType || '').startsWith('video/')) videos.push(file);
      }
      pageToken = result.nextPageToken || '';
    } while (pageToken);

    return videos;
  }

  function renderVideos(videos) {
    list.replaceChildren();
    loading.hidden = true;
    message.hidden = true;

    if (!videos.length) {
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    for (const file of videos) {
      const card = document.createElement('article');
      card.className = 'drive-video-card';

      const title = document.createElement('h2');
      title.className = 'drive-video-title';
      title.textContent = file.name || 'Vídeo sem título';

      const frameWrap = document.createElement('div');
      frameWrap.className = 'player-wrap drive-player-wrap';

      const frame = document.createElement('iframe');
      frame.src = 'https://drive.google.com/file/d/' + encodeURIComponent(file.id) + '/preview';
      frame.title = file.name || 'Reprodutor de vídeo';
      frame.loading = 'lazy';
      frame.allow = 'autoplay; fullscreen; picture-in-picture';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';

      const openLink = document.createElement('a');
      openLink.className = 'drive-open-link';
      openLink.href = 'https://drive.google.com/file/d/' + encodeURIComponent(file.id) + '/view';
      openLink.target = '_blank';
      openLink.rel = 'noopener noreferrer';
      openLink.textContent = 'Abrir no Google Drive';

      frameWrap.append(frame);
      card.append(title, frameWrap, openLink);
      list.append(card);
    }
  }

  async function init() {
    if (!folderId) {
      showMessage('Falta configurar o ID ou link da pasta do Google Drive em config.js.');
      return;
    }
    if (!cfg.driveApiKey || cfg.driveApiKey.startsWith('COLE_')) {
      showMessage('Falta configurar uma nova chave da Google Drive API em config.js. Veja as instruções no README.');
      return;
    }

    try {
      const videos = await getAllVideos();
      renderVideos(videos);
    } catch (error) {
      console.error('Erro ao carregar a biblioteca do Google Drive:', error);
      showMessage('Não foi possível carregar os vídeos. Erro: ' + (error.message || 'falha desconhecida') + ' Confira se a Google Drive API está ativada, se a chave está restrita à API correta e se a pasta permite acesso de leitor a qualquer pessoa com o link.');
    }
  }

  init();
})();