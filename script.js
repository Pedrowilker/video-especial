(() => {
  const config = window.PAGE_CONFIG || {};
  const video = document.getElementById("video");
  const placeholder = document.getElementById("video-placeholder");
  const title = document.getElementById("page-title");
  const message = document.getElementById("intro-message");
  const caption = document.getElementById("video-caption");

  if (config.title) {
    document.title = config.title.replace(/\.$/, "");
    title.textContent = config.title;
  }
  if (config.message) message.textContent = config.message;
  if (config.caption) caption.textContent = config.caption;

  const url = (config.videoUrl || "").trim();
  if (url) {
    video.src = url;
    if (config.posterUrl) video.poster = config.posterUrl;
    video.addEventListener("loadedmetadata", () => { placeholder.hidden = true; });
    video.addEventListener("canplay", () => { placeholder.hidden = true; });
    video.addEventListener("error", () => {
      placeholder.hidden = false;
      placeholder.querySelector("strong").textContent = "Não foi possível carregar o vídeo";
      placeholder.querySelector("span").textContent = "Confira o endereço do vídeo em config.js";
    });
  }
})();