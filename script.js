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

  const escapeText = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  async function getAllVideos() {
    const videos = [];
    let pageToken = '';

    do {
      const params = new URLSearchParams({
        q: "'" + cfg.driveFolderId + "' in parents and trashed = false",
        fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink,modifiedTime)',
        pageSize: '100',
        orderBy: 'name',
        key: cfg.driveApiKey
      });
      if (pageToken) params.set('pageToken', pageToken);

      const response = await fetch('https://www.googleapis.com/drive/v3/files?' + params.toString());
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error?.message || 'Não foi possível acessar a pasta do Google Drive.');
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
    if (!cfg.driveFolderId || !cfg.driveApiKey ||
        cfg.driveApiKey.startsWith('COLE_')) {
      showMessage('Falta configurar a chave gratuita da API do Google Drive. Consulte o README do projeto.');
      return;
    }

    try {
      const videos = await getAllVideos();
      renderVideos(videos);
    } catch (error) {
      console.error(error);
      showMessage('Não foi possível carregar os vídeos. Verifique a chave da API e se a pasta está compartilhada com “Qualquer pessoa com o link”.');
    }
  }

  init();
})();