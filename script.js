(() => {
  const cfg = window.APP_CONFIG || {};
  const loading = document.getElementById('loading-state');
  const empty = document.getElementById('empty-state');
  const list = document.getElementById('public-video-list');
  const message = document.getElementById('status-message');
  const ready = cfg.supabaseUrl && !cfg.supabaseUrl.startsWith('COLE_') &&
    cfg.supabaseAnonKey && !cfg.supabaseAnonKey.startsWith('COLE_');
  if (!ready || !window.supabase) {
    loading.hidden = true;
    empty.hidden = false;
    return;
  }
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  async function init() {
    try {
      const { data, error } = await client.from('videos').select('id, path, created_at').order('created_at', { ascending: false });
      if (error) throw error;
      loading.hidden = true;
      if (!data || data.length === 0) { empty.hidden = false; return; }
      empty.hidden = true;
      data.forEach(item => {
        const frame = document.createElement('section');
        frame.className = 'player-wrap';
        const video = document.createElement('video');
        video.controls = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.setAttribute('aria-label', 'Reprodutor de vídeo');
        video.src = client.storage.from(cfg.bucket || 'videos').getPublicUrl(item.path).data.publicUrl;
        video.addEventListener('error', () => {
          const error = document.createElement('p');
          error.className = 'video-error';
          error.textContent = 'Não foi possível reproduzir este vídeo.';
          frame.append(error);
        }, { once: true });
        frame.append(video);
        list.append(frame);
      });
    } catch (err) {
      console.error(err);
      loading.hidden = true;
      message.textContent = 'Não foi possível carregar os vídeos.';
      message.hidden = false;
    }
  }
  init();
})();