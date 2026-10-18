(() => {
  const cfg = window.APP_CONFIG || {};
  const configured = cfg.supabaseUrl && !cfg.supabaseUrl.startsWith('COLE_') &&
    cfg.supabaseAnonKey && !cfg.supabaseAnonKey.startsWith('COLE_');
  const $ = id => document.getElementById(id);
  const loginView = $('login-view'), dashboard = $('dashboard-view');
  const loginForm = $('login-form'), loginNotice = $('login-notice');
  const uploadNotice = $('upload-notice'), fileInput = $('video-file'), uploadBtn = $('upload-button');
  let client = null, currentUser = null, activeUpload = null, shouldCancel = false;
  const notice = (el, text, type = '') => {
    el.textContent = text; el.className = 'notice' + (type ? ' ' + type : '');
    el.classList.remove('hidden');
  };
  const hideNotice = el => { el.classList.add('hidden'); };
  const bytes = n => n < 1024**2 ? (n/1024).toFixed(0)+' KB' : n < 1024**3 ? (n/1024**2).toFixed(1)+' MB' : (n/1024**3).toFixed(2)+' GB';
  const dateText = value => new Date(value).toLocaleString('pt-BR');
  function showDashboard(show) {
    loginView.classList.toggle('hidden', show);
    dashboard.classList.toggle('hidden', !show);
  }
  if (!configured || !window.supabase) {
    notice(loginNotice, 'Configure a URL e a chave pública do Supabase no arquivo config.js antes de entrar.', 'error');
  } else {
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    client.auth.getSession().then(({data}) => {
      if (data.session) { currentUser = data.session.user; showDashboard(true); loadVideos(); }
    });
  }
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!client) return;
    hideNotice(loginNotice);
    const button = loginForm.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = 'Entrando…';
    try {
      const {data, error} = await client.auth.signInWithPassword({email:$('email').value.trim(), password:$('password').value});
      if (error) throw error;
      currentUser = data.user; showDashboard(true); await loadVideos();
    } catch (err) { notice(loginNotice, err.message || 'Falha no login.', 'error'); }
    finally { button.disabled = false; button.textContent = 'Entrar'; }
  });
  $('logout-button').addEventListener('click', async () => {
    if (client) await client.auth.signOut();
    currentUser = null; showDashboard(false);
  });
  fileInput.addEventListener('change', () => {
    uploadBtn.disabled = !(fileInput.files && fileInput.files[0]) || !!activeUpload;
    hideNotice(uploadNotice);
  });
  $('cancel-upload').addEventListener('click', () => {
    if (activeUpload) { shouldCancel = true; activeUpload.abort(); }
  });
  uploadBtn.addEventListener('click', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file || !client || !currentUser) return;
    if (!file.type.startsWith('video/') && !/\.(mp4|m4v|mov|webm)$/i.test(file.name)) {
      notice(uploadNotice, 'Selecione um arquivo de vídeo válido.', 'error'); return;
    }
    const allowed = ['video/mp4','video/webm','video/quicktime','video/x-m4v'];
    if (file.type && !allowed.includes(file.type) && !/\.(mp4|m4v|mov|webm)$/i.test(file.name)) {
      notice(uploadNotice, 'Formato não reconhecido. Use MP4, WebM ou MOV.', 'error'); return;
    }
    const path = Date.now() + '-' + crypto.randomUUID() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const {data: sessionData} = await client.auth.getSession();
    const token = sessionData.session && sessionData.session.access_token;
    if (!token) { notice(uploadNotice, 'Sua sessão expirou. Entre novamente.', 'error'); return; }
    shouldCancel = false;
    $('progress-area').classList.remove('hidden');
    $('progress-fill').style.width = '0%';
    $('progress-text').textContent = 'Preparando envio…';
    $('progress-percent').textContent = '0%';
    hideNotice(uploadNotice);
    uploadBtn.disabled = true; fileInput.disabled = true;
    const projectUrl = cfg.supabaseUrl.replace(/\/$/,'');
    const endpoint = projectUrl.replace(/^https:\/\/([^.]+)\.supabase\.co$/, 'https://$1.storage.supabase.co') + '/storage/v1/upload/resumable';
    try {
      await new Promise((resolve,reject) => {
        activeUpload = new tus.Upload(file, {
          endpoint,
          retryDelays: [0, 1000, 3000, 5000, 10000],
          chunkSize: 6 * 1024 * 1024,
          headers: { authorization: 'Bearer ' + token, apikey: cfg.supabaseAnonKey, 'x-upsert': 'false' },
          metadata: { bucketName: cfg.bucket || 'videos', objectName: path, contentType: file.type || 'video/mp4', cacheControl: '3600' },
          onError: err => reject(err),
          onProgress: (uploaded,total) => {
            const pct = Math.min(100, Math.round(uploaded / total * 100));
            $('progress-fill').style.width = pct + '%';
            $('progress-percent').textContent = pct + '%';
            $('progress-text').textContent = bytes(uploaded) + ' de ' + bytes(total);
          },
          onSuccess: () => resolve()
        });
        activeUpload.start();
      });
      if (shouldCancel) throw new Error('Envio cancelado.');
      const {error: dbError} = await client.from('videos').insert({
        path, original_name: file.name, size_bytes: file.size, mime_type: file.type || 'video/mp4', uploaded_by: currentUser.id
      });
      if (dbError) {
        await client.storage.from(cfg.bucket || 'videos').remove([path]);
        throw dbError;
      }
      notice(uploadNotice, 'Vídeo enviado e publicado com sucesso.', 'success');
      fileInput.value = '';
      await loadVideos();
    } catch (err) {
      if (shouldCancel) notice(uploadNotice, 'Envio cancelado.', '');
      else notice(uploadNotice, 'Não foi possível enviar o vídeo: ' + (err.message || 'erro desconhecido') + '. Confira os limites de armazenamento e a conexão.', 'error');
    } finally {
      activeUpload = null; shouldCancel = false;
      uploadBtn.disabled = !fileInput.files || !fileInput.files[0];
      fileInput.disabled = false;
      $('progress-area').classList.add('hidden');
    }
  });
  async function loadVideos() {
    if (!client || !currentUser) return;
    const list = $('video-list');
    list.innerHTML = '<div class="empty-list">Carregando biblioteca…</div>';
    try {
      const {data, error} = await client.from('videos').select('*').order('created_at', {ascending:false});
      if (error) throw error;
      $('video-count').textContent = data.length;
      $('active-video').textContent = data.length ? 'Disponível' : 'Nenhum';
      if (!data.length) {
        list.innerHTML = '<div class="empty-list">Nenhum vídeo enviado ainda.</div>';
        return;
      }
      list.replaceChildren();
      data.forEach(video => {
        const row = document.createElement('div'); row.className = 'video-row';
        const thumb = document.createElement('div'); thumb.className = 'video-thumb'; thumb.textContent = '▶';
        const info = document.createElement('div'); info.className = 'video-info';
        const name = document.createElement('div'); name.className = 'video-name'; name.textContent = video.original_name || video.path;
        const meta = document.createElement('div'); meta.className = 'video-meta'; meta.textContent = bytes(video.size_bytes || 0) + ' · ' + dateText(video.created_at);
        info.append(name,meta);
        const actions = document.createElement('div'); actions.className = 'row-actions';
        const view = document.createElement('a'); view.className = 'button'; view.href = client.storage.from(cfg.bucket || 'videos').getPublicUrl(video.path).data.publicUrl; view.target='_blank'; view.rel='noopener'; view.textContent='Abrir'; view.style.textDecoration='none';
        const remove = document.createElement('button'); remove.className='button danger'; remove.type='button'; remove.textContent='Excluir';
        remove.addEventListener('click', async () => {
          if (!confirm('Excluir este vídeo permanentemente?')) return;
          remove.disabled = true;
          try {
            const {error: storageError} = await client.storage.from(cfg.bucket || 'videos').remove([video.path]);
            if (storageError) throw storageError;
            const {error: dbError} = await client.from('videos').delete().eq('id',video.id);
            if (dbError) throw dbError;
            await loadVideos();
            notice(uploadNotice, 'Vídeo excluído.', 'success');
          } catch(err) { notice(uploadNotice, 'Falha ao excluir: '+err.message, 'error'); remove.disabled=false; }
        });
        actions.append(view,remove);
        row.append(thumb,info,actions); list.append(row);
      });
    } catch (err) {
      list.innerHTML = '<div class="empty-list">Não foi possível carregar a biblioteca. Verifique se executou o SQL de configuração.</div>';
      console.error(err);
    }
  }
  $('refresh-button').addEventListener('click', loadVideos);
})();