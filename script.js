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
  const externalPlayer = document.getElementById('external-player');
  const externalPlayerTitle = document.getElementById('external-player-title');
  const externalPlayerOpen = document.getElementById('external-player-open');
  const externalPlayerStage = document.getElementById('external-player-stage');
  const externalPlayerMessage = document.getElementById('external-player-message');
  let externalLoadSequence = 0;
  let activeHlsPlayer = null;
  const musicPlayer = document.getElementById('music-player');
  const musicAudio = document.getElementById('music-audio');
  const musicCurrentTitle = document.getElementById('music-current-title');
  const musicCurrentMeta = document.getElementById('music-current-meta');
  const musicOpenDrive = document.getElementById('music-open-drive');
  const musicError = document.getElementById('music-error');
  const musicPrevious = document.getElementById('music-previous');
  const musicToggle = document.getElementById('music-toggle');
  const musicNext = document.getElementById('music-next');
  const musicSeek = document.getElementById('music-seek');
  const musicCurrentTime = document.getElementById('music-current-time');
  const musicDuration = document.getElementById('music-duration');
  const musicAutoplay = document.getElementById('music-autoplay-toggle');
  const musicPlaylist = document.getElementById('music-playlist');
  let musicQueue = [];
  let currentTrackIndex = -1;

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
    externalPlayer.hidden = true;
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


  function isAudio(file) {
    return String(file.mimeType || '').startsWith('audio/');
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
    return minutes + ':' + remainder;
  }

  function audioUrl(track) {
    let url = 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(track.id);
    if (track.resourceKey) url += '&resourcekey=' + encodeURIComponent(track.resourceKey);
    return url;
  }

  function renderMusicPlaylist() {
    musicPlaylist.replaceChildren();
    musicQueue.forEach((track, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'music-track-item' + (index === currentTrackIndex ? ' is-current' : '');
      button.setAttribute('aria-current', index === currentTrackIndex ? 'true' : 'false');

      const number = document.createElement('span');
      number.className = 'music-track-number';
      number.textContent = index === currentTrackIndex && !musicAudio.paused ? '♫' : String(index + 1);

      const name = document.createElement('span');
      name.className = 'music-track-name';
      name.textContent = track.name || 'Música sem título';

      const type = document.createElement('span');
      type.className = 'music-track-type';
      type.textContent = index === currentTrackIndex && !musicAudio.paused ? 'Tocando' : 'Áudio';

      button.append(number, name, type);
      button.addEventListener('click', () => playTrack(index, true));
      musicPlaylist.append(button);
    });
  }

  function setMusicQueue(tracks) {
    const previousTrackId = currentTrackIndex >= 0 ? musicQueue[currentTrackIndex]?.id : null;
    musicQueue = tracks.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));
    currentTrackIndex = previousTrackId ? musicQueue.findIndex(track => track.id === previousTrackId) : -1;

    musicPlayer.hidden = musicQueue.length === 0;
    if (!musicQueue.length) {
      musicAudio.pause();
      musicAudio.removeAttribute('src');
      musicAudio.load();
      currentTrackIndex = -1;
      musicCurrentTitle.textContent = 'Selecione uma música';
      musicCurrentMeta.textContent = 'Sua playlist do Google Drive';
      musicOpenDrive.hidden = true;
      musicError.hidden = true;
      musicPlaylist.replaceChildren();
      return;
    }

    if (currentTrackIndex === -1) {
      musicAudio.pause();
      musicAudio.removeAttribute('src');
      musicAudio.load();
      musicCurrentTitle.textContent = 'Escolha uma música';
      musicCurrentMeta.textContent = musicQueue.length + (musicQueue.length === 1 ? ' faixa disponível' : ' faixas disponíveis');
      musicOpenDrive.hidden = true;
      musicError.hidden = true;
      musicToggle.textContent = '▶';
      musicToggle.setAttribute('aria-label', 'Reproduzir');
      musicSeek.value = '0';
      musicCurrentTime.textContent = '0:00';
      musicDuration.textContent = '0:00';
    }
    renderMusicPlaylist();
  }

  async function playTrack(index, startPlayback = true) {
    if (!musicQueue.length) return;
    const nextIndex = Math.max(0, Math.min(index, musicQueue.length - 1));
    const track = musicQueue[nextIndex];
    if (!track) return;

    currentTrackIndex = nextIndex;
    musicError.hidden = true;
    musicError.textContent = '';
    musicCurrentTitle.textContent = track.name || 'Música sem título';
    musicCurrentMeta.textContent = formatSize(track.size) || 'Áudio do Google Drive';
    musicOpenDrive.href = track.webViewLink || ('https://drive.google.com/file/d/' + encodeURIComponent(track.id) + '/view');
    musicOpenDrive.hidden = false;
    musicSeek.value = '0';
    musicCurrentTime.textContent = '0:00';
    musicDuration.textContent = '0:00';

    musicAudio.pause();
    musicAudio.src = audioUrl(track);
    musicAudio.load();
    renderMusicPlaylist();

    if (startPlayback) {
      try {
        await musicAudio.play();
      } catch (error) {
        if (error && error.name === 'NotAllowedError') {
          musicError.textContent = 'Clique em reproduzir para iniciar a música.';
        } else {
          musicError.textContent = 'O Google Drive não permitiu tocar este áudio diretamente. Você pode abrir o arquivo no Drive.';
        }
        musicError.hidden = false;
        musicToggle.textContent = '▶';
        musicToggle.setAttribute('aria-label', 'Reproduzir');
      }
    }
  }

  function playNextTrack() {
    if (!musicQueue.length) return;
    if (currentTrackIndex < musicQueue.length - 1) {
      playTrack(currentTrackIndex + 1, true);
    } else {
      musicAudio.pause();
      musicToggle.textContent = '▶';
      musicToggle.setAttribute('aria-label', 'Reproduzir');
      renderMusicPlaylist();
    }
  }

  musicToggle.addEventListener('click', async () => {
    if (!musicQueue.length) return;
    if (currentTrackIndex < 0) {
      await playTrack(0, true);
      return;
    }
    if (musicAudio.paused) {
      try {
        await musicAudio.play();
        musicError.hidden = true;
      } catch {
        musicError.textContent = 'Não foi possível tocar esta música diretamente. Use “Abrir no Drive”.';
        musicError.hidden = false;
      }
    } else {
      musicAudio.pause();
    }
  });

  musicPrevious.addEventListener('click', () => {
    if (!musicQueue.length) return;
    if (musicAudio.currentTime > 3) {
      musicAudio.currentTime = 0;
      return;
    }
    playTrack(currentTrackIndex <= 0 ? 0 : currentTrackIndex - 1, true);
  });

  musicNext.addEventListener('click', playNextTrack);

  musicAudio.addEventListener('play', () => {
    musicToggle.textContent = 'Ⅱ';
    musicToggle.setAttribute('aria-label', 'Pausar');
    renderMusicPlaylist();
  });

  musicAudio.addEventListener('pause', () => {
    musicToggle.textContent = '▶';
    musicToggle.setAttribute('aria-label', 'Reproduzir');
    renderMusicPlaylist();
  });

  musicAudio.addEventListener('timeupdate', () => {
    const duration = musicAudio.duration;
    musicCurrentTime.textContent = formatTime(musicAudio.currentTime);
    if (Number.isFinite(duration) && duration > 0) {
      musicDuration.textContent = formatTime(duration);
      musicSeek.value = String((musicAudio.currentTime / duration) * 100);
    }
  });

  musicAudio.addEventListener('loadedmetadata', () => {
    musicDuration.textContent = formatTime(musicAudio.duration);
  });

  musicSeek.addEventListener('input', () => {
    if (Number.isFinite(musicAudio.duration) && musicAudio.duration > 0) {
      musicAudio.currentTime = (Number(musicSeek.value) / 100) * musicAudio.duration;
    }
  });

  musicAudio.addEventListener('ended', () => {
    if (musicAutoplay.checked) playNextTrack();
    else {
      musicToggle.textContent = '▶';
      musicToggle.setAttribute('aria-label', 'Reproduzir');
      renderMusicPlaylist();
    }
  });

  musicAudio.addEventListener('error', () => {
    if (currentTrackIndex < 0 || !musicQueue[currentTrackIndex]) return;
    musicError.textContent = 'Não foi possível tocar este áudio diretamente. Tente “Abrir no Drive”.';
    musicError.hidden = false;
    musicToggle.textContent = '▶';
    musicToggle.setAttribute('aria-label', 'Reproduzir');
    renderMusicPlaylist();
  });


  function getSafeHttpUrl(rawValue) {
    try {
      const url = new URL(String(rawValue || '').trim());
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      return url;
    } catch {
      return null;
    }
  }

  function isYouTubeHost(host) {
    return host === 'youtu.be' || host.endsWith('.youtu.be') ||
      host === 'youtube.com' || host.endsWith('.youtube.com');
  }

  function getExternalEmbed(url) {
    const host = url.hostname.toLowerCase();
    const path = url.pathname;
    const pathParts = path.replace(/\/+$/, '').split('/').filter(Boolean);

    if (isYouTubeHost(host)) {
      const listId = url.searchParams.get('list');
      const shortHost = host === 'youtu.be' || host.endsWith('.youtu.be');
      let videoId = '';
      if (shortHost) videoId = pathParts[0] || '';
      else if (url.searchParams.get('v')) videoId = url.searchParams.get('v');
      else if (['embed','shorts','live','v'].includes(pathParts[0])) videoId = pathParts[1] || '';

      if (listId && (!videoId || /\/playlist\/?$/.test(path))) {
        return {kind:'frame',title:'Playlist do YouTube',src:'https://www.youtube-nocookie.com/embed/videoseries?list='+encodeURIComponent(listId)+'&autoplay=1'};
      }
      if (videoId && /^[a-zA-Z0-9_-]{6,}$/.test(videoId)) {
        const params = new URLSearchParams({autoplay:'1',rel:'0'});
        if (listId) params.set('list',listId);
        return {kind:'frame',title:'YouTube',src:'https://www.youtube-nocookie.com/embed/'+encodeURIComponent(videoId)+'?'+params.toString()};
      }
      if (listId) return {kind:'frame',title:'Playlist do YouTube',src:'https://www.youtube-nocookie.com/embed/videoseries?list='+encodeURIComponent(listId)+'&autoplay=1'};
    }

    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
      const id = pathParts[pathParts.length - 1];
      if (id && /^\d+$/.test(id)) return {kind:'frame',title:'Vimeo',src:'https://player.vimeo.com/video/'+id+'?autoplay=1'};
    }

    if (host === 'dai.ly') {
      const id = pathParts[0];
      if (id) return {kind:'frame',title:'Dailymotion',src:'https://www.dailymotion.com/embed/video/'+encodeURIComponent(id)+'?autoplay=1'};
    }
    if (host === 'dailymotion.com' || host.endsWith('.dailymotion.com')) {
      const match = path.match(/\/video\/([a-zA-Z0-9]+)/);
      if (match) return {kind:'frame',title:'Dailymotion',src:'https://www.dailymotion.com/embed/video/'+encodeURIComponent(match[1])+'?autoplay=1'};
    }

    if (host === 'open.spotify.com') {
      const match = path.match(/\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/);
      if (match) return {kind:'frame',title:'Spotify',src:'https://open.spotify.com/embed/'+match[1]+'/'+match[2]+'?utm_source=generator'};
    }

    if (host === 'soundcloud.com' || host.endsWith('.soundcloud.com')) {
      return {kind:'frame',title:'SoundCloud',src:'https://w.soundcloud.com/player/?url='+encodeURIComponent(url.href)+'&auto_play=true&visual=true'};
    }

    if (host === 'music.apple.com') {
      const embedUrl = new URL(url.href);
      embedUrl.hostname = 'embed.music.apple.com';
      return {kind:'frame',title:'Apple Music',src:embedUrl.href};
    }

    if (host === 'twitch.tv' || host.endsWith('.twitch.tv') || host === 'clips.twitch.tv') {
      const parent = location.hostname || 'pedrowilker.github.io';
      if (host === 'clips.twitch.tv' && pathParts[0]) {
        return {kind:'frame',title:'Twitch Clip',src:'https://clips.twitch.tv/embed?clip='+encodeURIComponent(pathParts[0])+'&parent='+encodeURIComponent(parent)+'&autoplay=true'};
      }
      if (pathParts[0] === 'videos' && pathParts[1]) {
        return {kind:'frame',title:'Twitch',src:'https://player.twitch.tv/?video=v'+encodeURIComponent(pathParts[1])+'&parent='+encodeURIComponent(parent)+'&autoplay=true'};
      }
      if (pathParts[0] === 'clip' && pathParts[1]) {
        return {kind:'frame',title:'Twitch Clip',src:'https://clips.twitch.tv/embed?clip='+encodeURIComponent(pathParts[1])+'&parent='+encodeURIComponent(parent)+'&autoplay=true'};
      }
      if (pathParts[0] && !['directory','downloads','settings','subscriptions'].includes(pathParts[0])) {
        return {kind:'frame',title:'Twitch',src:'https://player.twitch.tv/?channel='+encodeURIComponent(pathParts[0])+'&parent='+encodeURIComponent(parent)+'&autoplay=true'};
      }
    }

    if (host === 'drive.google.com' && /\/file\/d\/([a-zA-Z0-9_-]+)/.test(path)) {
      const match = path.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      const resourceKey = url.searchParams.get('resourcekey') || '';
      const src = 'https://drive.google.com/file/d/'+encodeURIComponent(match[1])+'/preview'+(resourceKey?'?resourcekey='+encodeURIComponent(resourceKey):'');
      return {kind:'frame',title:'Google Drive',src};
    }
    if (host === 'docs.google.com') {
      const match = path.match(/\/(document|spreadsheets|presentation|drawings)\/d\/([a-zA-Z0-9_-]+)/);
      if (match) return {kind:'frame',title:'Google Docs',src:'https://docs.google.com/'+match[1]+'/d/'+encodeURIComponent(match[2])+'/preview'};
    }

    const pathname = url.pathname.toLowerCase();
    if (/\.m3u8$/.test(pathname)) return {kind:'hls',title:'Transmissão HLS',src:url.href};
    if (/\.(mp4|m4v|webm|ogv|ogg|mov|mkv)$/.test(pathname)) return {kind:'video',title:'Vídeo',src:url.href};
    if (/\.(mp3|m4a|aac|wav|flac|opus|oga)$/.test(pathname)) return {kind:'audio',title:'Áudio',src:url.href};

    return {kind:'frame',title:host,src:url.href,generic:true};
  }

  function resetExternalPlayer() {
    externalLoadSequence += 1;
    if (activeHlsPlayer) {
      try { activeHlsPlayer.destroy(); } catch {}
      activeHlsPlayer = null;
    }
    externalPlayerStage.replaceChildren();
    externalPlayerMessage.hidden = true;
    externalPlayerMessage.textContent = '';
  }

  function showExternalNotice(text) {
    externalPlayerMessage.textContent = text;
    externalPlayerMessage.hidden = false;
  }

  function loadHlsLibrary() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (window.__nexusHlsPromise) return window.__nexusHlsPromise;
    window.__nexusHlsPromise = new Promise((resolve,reject) => {
      const scriptTag = document.createElement('script');
      scriptTag.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
      scriptTag.async = true;
      scriptTag.onload = () => window.Hls ? resolve(window.Hls) : reject(new Error('HLS indisponível'));
      scriptTag.onerror = () => reject(new Error('Falha ao carregar HLS'));
      document.head.append(scriptTag);
      setTimeout(() => reject(new Error('Tempo esgotado')), 10000);
    });
    return window.__nexusHlsPromise;
  }

  async function showExternalContent(rawValue) {
    const url = getSafeHttpUrl(rawValue);
    if (!url) {
      showMessage('Cole um link válido de vídeo, playlist, áudio ou pasta do Google Drive.');
      return;
    }

    resetExternalPlayer();
    externalPlayer.hidden = false;
    externalPlayerTitle.textContent = 'Reproduzindo: ' + url.hostname.replace(/^www\./,'');
    externalPlayerOpen.href = url.href;
    externalPlayerOpen.hidden = false;
    list.replaceChildren();
    musicPlayer.hidden = true;
    setMusicQueue([]);
    summary.hidden = true;
    empty.hidden = true;
    message.hidden = true;
    loading.hidden = true;
    backButton.hidden = true;

    const requestId = externalLoadSequence;
    const embed = getExternalEmbed(url);

    if (embed.kind === 'video' || embed.kind === 'audio' || embed.kind === 'hls') {
      const mediaElement = document.createElement(embed.kind === 'audio' ? 'audio' : 'video');
      mediaElement.className = 'external-media-element';
      mediaElement.controls = true;
      mediaElement.autoplay = true;
      mediaElement.preload = 'metadata';
      mediaElement.playsInline = true;
      if (embed.kind !== 'hls') mediaElement.src = embed.src;
      attachMediaError(mediaElement);
      externalPlayerStage.append(mediaElement);

      if (embed.kind === 'hls') {
        if (mediaElement.canPlayType('application/vnd.apple.mpegurl')) {
          mediaElement.src = embed.src;
        } else {
          showExternalNotice('Preparando a transmissão…');
          try {
            const Hls = await loadHlsLibrary();
            if (requestId !== externalLoadSequence) return;
            if (Hls.isSupported()) {
              activeHlsPlayer = new Hls();
              activeHlsPlayer.loadSource(embed.src);
              activeHlsPlayer.attachMedia(mediaElement);
              activeHlsPlayer.on(Hls.Events.ERROR, (_event,data) => {
                if (data && data.fatal) showExternalNotice('Não foi possível reproduzir a transmissão. Use “Abrir original”.');
              });
            } else {
              showExternalNotice('Este navegador não oferece suporte a esta transmissão. Use “Abrir original”.');
            }
          } catch {
            if (requestId === externalLoadSequence) showExternalNotice('Não foi possível preparar esta transmissão. Use “Abrir original”.');
          }
        }
      }
      try { await mediaElement.play(); } catch {}
      return;
    }

    const frame = document.createElement('iframe');
    frame.className = 'external-frame';
    frame.src = embed.src;
    frame.title = embed.title || 'Conteúdo externo';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write; web-share';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.loading = 'eager';
    externalPlayerStage.append(frame);
    if (embed.generic) showExternalNotice('Se esta plataforma bloquear a reprodução incorporada, use “Abrir original”.');
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


    if (isAudio(file)) {
      const actions = document.createElement('div');
      actions.className = 'music-card-actions';
      const playButton = document.createElement('button');
      playButton.type = 'button';
      playButton.className = 'music-card-play';
      playButton.textContent = '▶ Tocar música';
      playButton.addEventListener('click', () => {
        const trackIndex = musicQueue.findIndex(track => track.id === file.id);
        if (trackIndex >= 0) playTrack(trackIndex, true);
      });
      actions.append(playButton, makeOpenLink(file));
      card.append(actions);
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
    externalPlayer.hidden = true;
    message.hidden = true;
    const audioFiles = files.filter(isAudio);
    setMusicQueue(audioFiles);
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
    externalPlayer.hidden = true;
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
    const rawValue = input.value.trim();
    input.value = '';
    cancelCurrentRequest();

    const folder = normalizeFolderReference(rawValue);
    if (folder) {
      if (currentFolder && currentFolder.id !== folder.id) navigationStack.push(currentFolder);
      externalPlayer.hidden = true;
      loadFolder(folder);
      return;
    }

    navigationStack.length = 0;
    currentFolder = null;
    showExternalContent(rawValue);
  });

  backButton.addEventListener('click', () => {
    const previousFolder = navigationStack.pop();
    if (previousFolder) loadFolder(previousFolder);
    backButton.hidden = navigationStack.length === 0;
  });

  // Nunca preencher ou persistir o link pesquisado. A pesquisa começa vazia a cada abertura.
  input.value = '';
  loading.hidden = true;
})();
