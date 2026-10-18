(() => {
  const cfg = window.APP_CONFIG || {};
  const loading = document.getElementById('loading-state');
  const empty = document.getElementById('empty-state');
  const player = document.getElementById('video-player');
  const message = document.getElementById('status-message');
  const ready = cfg.supabaseUrl && !cfg.supabaseUrl.startsWith('COLE_') &&
    cfg.supabaseAnonKey && !cfg.supabaseAnonKey.startsWith('COLE_');
  const showEmpty = (text) => {
    loading.hidden = true; player.hidden = true; empty.hidden = false;
    if (text) { message.textContent = text; message.hidden = false; }
  };
  if (!ready || !window.supabase) { showEmpty(); return; }
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  async function init() {
    try {
      const { data, error } = await client.from('videos').select('id, path, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!data) { showEmpty(); return; }
      const { data: urlData } = client.storage.from(cfg.bucket || 'videos').getPublicUrl(data.path);
      player.src = urlData.publicUrl;
      player.hidden = false; loading.hidden = true; empty.hidden = true;
      player.addEventListener('error', () => {
        message.textContent = 'Não foi possível reproduzir este vídeo.';
        message.hidden = false;
      }, { once: true });
    } catch (err) { console.error(err); showEmpty('Não foi possível carregar o vídeo.'); }
  }
  init();
})();