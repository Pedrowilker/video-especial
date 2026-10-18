(() => {
  const cfg = window.APP_CONFIG || {};
  const loading = document.getElementById('loading-state');
  const empty = document.getElementById('empty-state');
  const emptyMessage = document.getElementById('empty-message');
  const list = document.getElementById('public-video-list');
  const message = document.getElementById('status-message');
  const form = document.getElementById('folder-form');
  const input = document.getElementById('folder-input');
  const loadButton = document.getElementById('load-folder-button');
  const backButton = document.getElementById('back-folder-button');
  const summary = document.getElementById('folder-summary');

  let currentFolderId = '';
  const navigationStack = [];

  function showMessage(text) {
    loading.hidden = true;
    empty.hidden = true;
    message.textContent = text;
    message.hidden = false;
    summary.hidden = true;
  }

  function setLoading(isLoading) {
    loading.hidden = !isLoading;
    loadButton.disabled = isLoading;
    loadButton.textContent = isLoading ? 'Carregando…' : 'Exibir conteúdo';
    if (isLoading) {
      message.hidden = true;
      empty.hidden = true;
      list.replaceChildren();
      summary.hidden = true;
    }
  }

  // Aceita URL normal, URL com /u/0/ e ID da pasta.
  function normalizeFolderId(value) {
    const inputValue = String(value || '').trim();
    if (!inputValue) return '';

    const directId = inputValue.match(/^[a-zA-Z0-9_-]{10,}$/);
    if (directId) return directId[0];

    try {
      const url = new URL(inputValue);
      const host = url.hostname.toLowerCase();
      if (host !== 'drive.google.com' && host !== 'docs.google.com') return '';
      const match = url.pathname.match(/folders\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : '';
    } catch {
      return '';
    }
  }

  async function getFolderFiles(folderId) {
    const files = [];
    let pageToken = '';

    do {
      const params = new URLSearchParams({
        q: "'" + folderId + "' in parents and trashed = false",
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink)',
        pageSize: '100',
        orderBy: 'folder,name',
        key: cfg.driveApiKey,
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true'
      });
      if (pageToken) params.set('pageToken', pageToken);

      const response = await fetch('https://www.googleapis.com/drive/v3/files?' + params.toString());
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error('O Google não retornou uma resposta válida. Confira a Google Drive API.');
      }

      if (!response.ok || result.error) {
        const apiError = result.error || {};
        if (response.status === 403) {
          throw new Error('O Google recusou a consulta. Confira se a Google Drive API está ativada e se a chave está restrita às APIs e ao site corretos.');
        }
        if (response.status === 404) {
          throw new Error('A pasta não foi encontrada ou você não tem permissão para listá-la. Confira o link e o compartilhamento.');
        }
        throw new Error(apiError.message || 'Não foi possível listar o conteúdo desta pasta.');
      }

      files.push(...(result.files || []));
      pageToken = result.nextPageToken || '';
    } while (pageToken);

    return files;
  }

  function formatSize(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0) return '';
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
    if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + ' MB';
    return (value / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function fileType(file) {
    const mime = file.mimeType || '';
    if (mime === 'application/vnd.google-apps.folder') return 'Pasta';
    if (mime.startsWith('video/')) return 'Vídeo';
    if (mime.startsWith('image/')) return 'Imagem';
    if (mime === 'application/pdf') return 'PDF';
    if (mime.startsWith('audio/')) return 'Áudio';
    if (mime.startsWith('text/')) return 'Texto';
    if (mime.startsWith('application/vnd.google-apps.document')) return 'Documento Google';
    if (mime.startsWith('application/vnd.google-apps.spreadsheet')) return 'Planilha Google';
    if (mime.startsWith('application/vnd.google-apps.presentation')) return 'Apresentação Google';
    if (mime.startsWith('application/vnd.google-apps')) return 'Arquivo Google';
    return 'Arquivo';
  }

  function previewUrl(file) {
    const mime = file.mimeType || '';
    const id = encodeURIComponent(file.id);
    if (mime === 'application/vnd.google-apps.document') return 'https://docs.google.com/document/d/' + id + '/preview';
    if (mime === 'application/vnd.google-apps.spreadsheet') return 'https://docs.google.com/spreadsheets/d/' + id + '/preview';
    if (mime === 'application/vnd.google-apps.presentation') return 'https://docs.google.com/presentation/d/' + id + '/preview';
    if (mime === 'application/vnd.google-apps.drawing') return 'https://docs.google.com/drawings/d/' + id + '/preview';
    if (mime.startsWith('video/') || mime.startsWith('image/') || mime === 'application/pdf' ||
        mime.startsWith('application/vnd.google-apps')) {
      return 'https://drive.google.com/file/d/' + id + '/preview';
    }
    return '';
  }

  function makeOpenLink(file) {
    const link = document.createElement('a');
    link.className = 'drive-open-link';
    link.href = file.webViewLink || ('https://drive.google.com/file/d/' + encodeURIComponent(file.id) + '/view');
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Abrir no Google Drive';
    return link;
  }

  function makeFileCard(file) {
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
    const card = document.createElement('article');
    card.className = isFolder ? 'drive-file-card drive-folder-card' : 'drive-file-card';

    const title = document.createElement('h2');
    title.className = 'drive-video-title';
    title.textContent = file.name || 'Arquivo sem nome';

    const meta = document.createElement('p');
    meta.className = 'drive-file-meta';
    const parts = [fileType(file)];
    const size = formatSize(file.size);
    if (size) parts.push(size);
    if (file.modifiedTime) {
      const date = new Date(file.modifiedTime);
      if (!Number.isNaN(date.getTime())) parts.push(date.toLocaleDateString('pt-BR'));
    }
    meta.textContent = parts.join(' · ');

    card.append(title, meta);

    if (isFolder) {
      const openFolder = document.createElement('button');
      openFolder.type = 'button';
      openFolder.className = 'folder-open-button';
      openFolder.textContent = 'Abrir pasta';
      openFolder.addEventListener('click', () => {
        if (currentFolderId && currentFolderId !== file.id) navigationStack.push(currentFolderId);
        loadFolder(file.id, false);
      });
      card.append(openFolder);
      return card;
    }

    const preview = previewUrl(file);
    if (preview) {
      const frameWrap = document.createElement('div');
      frameWrap.className = 'player-wrap drive-player-wrap';
      const frame = document.createElement('iframe');
      frame.src = preview;
      frame.title = file.name || 'Pré-visualização do arquivo';
      frame.loading = 'lazy';
      frame.allow = 'autoplay; fullscreen; picture-in-picture';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-forms');
      frameWrap.append(frame);
      card.append(frameWrap);
    } else {
      const note = document.createElement('p');
      note.className = 'drive-file-note';
      note.textContent = 'Este tipo de arquivo não tem pré-visualização incorporada. Use o botão abaixo para abrir.';
      card.append(note);
    }

    card.append(makeOpenLink(file));
    return card;
  }

  function renderFiles(files) {
    list.replaceChildren();
    loading.hidden = true;
    message.hidden = true;
    empty.hidden = files.length > 0;

    if (!files.length) {
      emptyMessage.textContent = 'Esta pasta está vazia ou não contém arquivos que possam ser listados.';
      summary.hidden = true;
      return;
    }

    for (const file of files) list.append(makeFileCard(file));
    summary.textContent = files.length + (files.length === 1 ? ' item encontrado' : ' itens encontrados');
    summary.hidden = false;
  }

  async function loadFolder(folderId, updateInput = true) {
    if (!folderId) {
      showMessage('Cole um link válido de uma pasta do Google Drive.');
      return;
    }
    if (!cfg.driveApiKey || cfg.driveApiKey.startsWith('COLE_')) {
      showMessage('A chave da Google Drive API não está configurada. Confira config.js.');
      return;
    }

    currentFolderId = folderId;
    if (updateInput) input.value = 'https://drive.google.com/drive/folders/' + folderId;
    backButton.hidden = navigationStack.length === 0;
    setLoading(true);

    try {
      const files = await getFolderFiles(folderId);
      renderFiles(files);
      backButton.hidden = navigationStack.length === 0;
    } catch (error) {
      console.error('Falha ao carregar pasta do Google Drive:', error);
      showMessage(error.message || 'Não foi possível carregar esta pasta.');
      backButton.hidden = navigationStack.length === 0;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const folderId = normalizeFolderId(input.value);
    if (!folderId) {
      showMessage('Esse link não parece ser uma pasta do Google Drive. Cole o link de compartilhamento da pasta, não de um arquivo individual.');
      return;
    }
    if (currentFolderId && currentFolderId !== folderId) navigationStack.push(currentFolderId);
    loadFolder(folderId, true);
  });

  backButton.addEventListener('click', () => {
    const previousFolderId = navigationStack.pop();
    if (previousFolderId) loadFolder(previousFolderId, true);
    backButton.hidden = navigationStack.length === 0;
  });

  if (!cfg.driveApiKey || cfg.driveApiKey.startsWith('COLE_')) {
    showMessage('A chave da Google Drive API não está configurada. Confira config.js.');
  } else {
    const initialFolderId = normalizeFolderId(cfg.driveFolderId);
    if (initialFolderId) {
      input.value = 'https://drive.google.com/drive/folders/' + initialFolderId;
      loadFolder(initialFolderId, false);
    } else {
      loading.hidden = true;
    }
  }
})();
