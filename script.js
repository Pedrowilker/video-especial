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

  let currentFolder = null;
  const navigationStack = [];
  let activeController = null;
  let requestSequence = 0;

  function cancelCurrentRequest() {
    requestSequence += 1;
    if (activeController) activeController.abort();
    activeController = null;
    setLoading(false);
  }

  function showMessage(text) {
    loading.hidden = true;
    empty.hidden = true;
    message.textContent = text;
    message.hidden = false;
    summary.hidden = true;
    list.replaceChildren();
    loadButton.textContent = 'Abrir';
  }

  function setLoading(isLoading) {
    loading.hidden = !isLoading;
    loadButton.textContent = isLoading ? 'Carregando…' : 'Abrir';
    // O botão e o campo continuam ativos para permitir trocar o link durante a consulta.
    if (isLoading) {
      message.hidden = true;
      empty.hidden = true;
      list.replaceChildren();
      summary.hidden = true;
    }
  }

  function normalizeFolderReference(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    if (/^[a-zA-Z0-9_-]{10,}$/.test(raw)) {
      return { id: raw, resourceKey: '' };
    }

    let urlText = raw;
    if (/^(drive\.google\.com|docs\.google\.com)\//i.test(urlText)) {
      urlText = 'https://' + urlText;
    }

    try {
      const url = new URL(urlText);
      const host = url.hostname.toLowerCase();
      if (host !== 'drive.google.com' && host !== 'docs.google.com') return null;

      const folderMatch = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      let id = folderMatch ? folderMatch[1] : '';

      // Também aceita links antigos do Drive no formato /open?id=...
      if (!id && /\/open\/?$/.test(url.pathname)) {
        id = url.searchParams.get('id') || '';
      }
      if (!id) return null;

      return {
        id,
        resourceKey: url.searchParams.get('resourcekey') || url.searchParams.get('resourceKey') || ''
      };
    } catch {
      return null;
    }
  }

  function folderUrl(folder) {
    const url = 'https://drive.google.com/drive/folders/' + encodeURIComponent(folder.id);
    return folder.resourceKey ? url + '?resourcekey=' + encodeURIComponent(folder.resourceKey) : url;
  }

  async function getFolderFiles(folder, controller) {
    const files = [];
    let pageToken = '';

    do {
      const params = new URLSearchParams({
        q: "'" + folder.id + "' in parents and trashed = false",
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink,resourceKey)',
        pageSize: '100',
        orderBy: 'folder,name',
        key: cfg.driveApiKey,
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true'
      });
      if (pageToken) params.set('pageToken', pageToken);

      const headers = {};
      if (folder.resourceKey) {
        headers['X-Goog-Drive-Resource-Keys'] = folder.id + '/' + folder.resourceKey;
      }

      let response;
      try {
        const timeoutId = setTimeout(() => controller.abort(), 18000);
        try {
          response = await fetch('https://www.googleapis.com/drive/v3/files?' + params.toString(), {
            method: 'GET',
            headers,
            signal: controller.signal
          });
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error('A consulta demorou demais. Tente novamente.');
        }
        if (error && error.name === 'TypeError') {
          throw new Error('Falha de conexão com o Google Drive.');
        }
        throw error;
      }

      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error('O Google Drive retornou uma resposta inválida.');
      }

      if (!response.ok || result.error) {
        const apiMessage = result.error?.message || '';
        if (response.status === 400) {
          throw new Error('Esse link não pôde ser consultado. Confira se é um link de pasta.');
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error('O Google Drive não autorizou o acesso a essa pasta.');
        }
        if (response.status === 404) {
          throw new Error('Pasta não encontrada ou sem permissão de leitura.');
        }
        console.error('Google Drive API:', response.status, apiMessage);
        throw new Error('Não foi possível abrir essa pasta.');
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
    if (mime === 'application/vnd.google-apps.document') return 'Documento Google';
    if (mime === 'application/vnd.google-apps.spreadsheet') return 'Planilha Google';
    if (mime === 'application/vnd.google-apps.presentation') return 'Apresentação Google';
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
    if (mime.startsWith('video/') || mime.startsWith('image/') || mime === 'application/pdf') {
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
    link.textContent = 'Abrir arquivo';
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
        if (currentFolder && currentFolder.id !== file.id) navigationStack.push(currentFolder);
        loadFolder({ id: file.id, resourceKey: file.resourceKey || '' });
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
      frameWrap.append(frame);
      card.append(frameWrap);
    }

    card.append(makeOpenLink(file));
    return card;
  }

  function renderFiles(files) {
    list.replaceChildren();
    message.hidden = true;
    empty.hidden = files.length > 0;
    if (!files.length) {
      emptyMessage.textContent = 'Nenhum arquivo encontrado.';
      summary.hidden = true;
      return;
    }

    for (const file of files) list.append(makeFileCard(file));
    summary.textContent = files.length + (files.length === 1 ? ' item' : ' itens');
    summary.hidden = false;
  }

  async function loadFolder(folder) {
    if (!folder || !folder.id) {
      showMessage('Link inválido. Use uma pasta do Google Drive.');
      return;
    }
    if (!cfg.driveApiKey || cfg.driveApiKey.startsWith('COLE_')) {
      showMessage('Biblioteca indisponível.');
      return;
    }

    if (activeController) activeController.abort();
    const controller = new AbortController();
    activeController = controller;
    const thisRequest = ++requestSequence;
    currentFolder = folder;

    input.value = '';
    backButton.hidden = navigationStack.length === 0;
    setLoading(true);

    try {
      const files = await getFolderFiles(folder, controller);
      if (thisRequest !== requestSequence) return;
      renderFiles(files);
    } catch (error) {
      if (thisRequest !== requestSequence) return;
      console.error('Falha ao consultar a pasta do Google Drive:', error);
      showMessage(error.message || 'Não foi possível abrir essa pasta.');
    } finally {
      if (thisRequest === requestSequence) {
        activeController = null;
        setLoading(false);
        backButton.hidden = navigationStack.length === 0;
      }
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const folder = normalizeFolderReference(input.value);
    input.value = '';
    if (!folder) {
      cancelCurrentRequest();
      showMessage('Link inválido. Use uma pasta do Google Drive.');
      return;
    }
    if (currentFolder && currentFolder.id !== folder.id) navigationStack.push(currentFolder);
    loadFolder(folder);
  });

  backButton.addEventListener('click', () => {
    const previousFolder = navigationStack.pop();
    if (previousFolder) loadFolder(previousFolder);
    backButton.hidden = navigationStack.length === 0;
  });

  // Nunca preencher ou persistir o link pesquisado. A pesquisa começa vazia a cada abertura.
  input.value = '';
  loading.hidden = true;
  if (!cfg.driveApiKey || cfg.driveApiKey.startsWith('COLE_')) {
    showMessage('Biblioteca indisponível.');
  }
})();
