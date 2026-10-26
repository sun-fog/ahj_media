import parseCoordinates from './coordinates';

// --- DOM элементы ---
const postsEl = document.getElementById('posts');
const form = document.getElementById('form');
const input = document.getElementById('input');
const micBtn = document.getElementById('mic-btn');
const videoBtn = document.getElementById('video-btn');

const notice = document.getElementById('notice');

const modal = document.getElementById('modal');
const modalHint = document.getElementById('modal-hint');
const modalInput = document.getElementById('modal-input');
const modalError = document.getElementById('modal-error');
const modalOk = document.getElementById('modal-ok');
const modalCancel = document.getElementById('modal-cancel');

const videoModal = document.getElementById('video-modal');
const videoPreview = document.getElementById('video-preview');
const videoRecordBtn = document.getElementById('video-record');
const videoCancelBtn = document.getElementById('video-cancel');

const micTimerEl = document.getElementById('mic-timer');

// --- состояние ---
const posts = [];
let pendingText = null;

let micRecorder = null;
let micChunks = [];
let micActive = false;
let micTimerId = null;
let micStart = 0;

let videoStream = null;
let videoRecorder = null;
let videoChunks = [];
let videoActive = false;

const HINT_DEFAULT =
  'Не удалось получить координаты. Укажите их вручную в формате «широта, долгота»:';

// ============================================================
// ВСЕ ФУНКЦИИ — ПЕРВЫМИ (каждая вызывает только то, что выше)
// ============================================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatCoords({ latitude, longitude }) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function pickMime(candidates) {
  if (!window.MediaRecorder) return '';
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

function showNotice(message) {
  notice.textContent = message;
  notice.hidden = false;
  setTimeout(() => {
    notice.hidden = true;
  }, 4000);
}

function geoErrorMessage(error) {
  if (error && error.code) {
    if (error.code === error.PERMISSION_DENIED) {
      return 'Доступ к местоположению запрещён.';
    }
    if (error.code === error.POSITION_UNAVAILABLE) {
      return 'Местоположение недоступно.';
    }
    if (error.code === error.TIMEOUT) {
      return 'Время ожидания координат истекло.';
    }
  }
  return 'Не удалось получить координаты.';
}

function render() {
  postsEl.innerHTML = '';
  [...posts].reverse().forEach(({ text, coords, date, audio, video }) => {
    const item = document.createElement('div');
    item.className = 'post';

    let mediaHtml = '';
    if (audio) {
      mediaHtml += `<audio controls src="${audio}"></audio>`;
    }
    if (video) {
      mediaHtml += `<video controls playsinline src="${video}"></video>`;
    }

    item.innerHTML = `
      <div class="post__text">${escapeHtml(text)}</div>
      ${mediaHtml}
      <div class="post__meta">[${formatCoords(coords)}] ${date.toLocaleString(
      'ru-RU'
    )}</div>
    `;
    postsEl.appendChild(item);
  });
}

function addPost(text, coords, media = {}) {
  posts.push({ text, coords, date: new Date(), ...media });
  render();
}

function getCoords() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Геолокация не поддерживается'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      (error) => reject(error),
      { timeout: 10000 }
    );
  });
}

function openModal(hint) {
  pendingText = input.value.trim() || '';
  modalHint.textContent = hint;
  modalError.hidden = true;
  modalInput.classList.remove('invalid');
  modalInput.value = '';
  modal.hidden = false;
  modalInput.focus();
}

function closeModal() {
  modal.hidden = true;
  pendingText = null;
}

function savePost(text, media = {}) {
  getCoords()
    .then((coords) => {
      addPost(text, coords, media);
    })
    .catch((error) => {
      const reason = geoErrorMessage(error);
      openModal(`${reason} ${HINT_DEFAULT}`);
    });
}

// --- микрофон ---

function updateMicTimer() {
  const seconds = Math.floor((Date.now() - micStart) / 1000);
  micTimerEl.textContent = `Запись… 0:${String(seconds).padStart(2, '0')}`;
}

function stopMicRecording(save) {
  micActive = save;
  if (micRecorder && micRecorder.state !== 'inactive') {
    micRecorder.stop();
  }
  micBtn.textContent = '🎤';
  micBtn.classList.remove('timeline__btn--recording');
  clearInterval(micTimerId);
  micTimerEl.hidden = true;
}

function startMicRecording() {
  if (!window.MediaRecorder) {
    showNotice('Запись аудио не поддерживается вашим браузером.');
    return;
  }
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      const mimeType = pickMime([
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
      ]);
      micRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      micChunks = [];
      micRecorder.addEventListener('dataavailable', (e) => {
        if (e.data.size > 0) micChunks.push(e.data);
      });
      micRecorder.addEventListener('stop', () => {
        stream.getTracks().forEach((t) => t.stop());
        if (!micActive) return; // запись отменена
        const blob = new Blob(micChunks, { type: micRecorder.mimeType });
        const url = URL.createObjectURL(blob);
        savePost('Аудиозапись', { audio: url });
      });
      micRecorder.start();
      micActive = true;
      micBtn.textContent = '⏹';
      micBtn.classList.add('timeline__btn--recording');
      micTimerEl.hidden = false;
      micStart = Date.now();
      micTimerId = setInterval(updateMicTimer, 500);
    })
    .catch(() => showNotice('Доступ к микрофону запрещён или недоступен.'));
}

// --- видео ---

function closeVideoModal() {
  videoModal.hidden = true;
  videoActive = false;
  if (videoRecorder && videoRecorder.state !== 'inactive') {
    videoRecorder.stop();
  }
  if (videoStream) {
    videoStream.getTracks().forEach((t) => t.stop());
    videoStream = null;
  }
  videoPreview.srcObject = null;
}

function openVideoModal() {
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    showNotice('Запись видео не поддерживается вашим браузером.');
    return;
  }
  navigator.mediaDevices
    .getUserMedia({ video: true, audio: true })
    .then((stream) => {
      videoStream = stream;
      videoPreview.srcObject = stream;
      videoRecordBtn.textContent = 'Записать';
      videoRecordBtn.disabled = false;
      videoRecordBtn.classList.remove('timeline__btn--recording');
      videoActive = false;
      videoModal.hidden = false;
    })
    .catch(() =>
      showNotice('Доступ к камере или микрофону запрещён или недоступен.')
    );
}

// ============================================================
// ОБРАБОТЧИКИ СОБЫТИЙ — ПОСЛЕ ВСЕХ ФУНКЦИЙ, КОТОРЫЕ ОНИ ВЫЗЫВАЮТ
// ============================================================

function handleFormSubmit(e) {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  if (!navigator.geolocation) {
    openModal(HINT_DEFAULT);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      addPost(text, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      input.value = '';
    },
    (error) => {
      pendingText = text;
      openModal(`${geoErrorMessage(error)} ${HINT_DEFAULT}`);
    },
    { timeout: 10000 }
  );
}

function handleModalOkClick() {
  try {
    const coords = parseCoordinates(modalInput.value);
    addPost(pendingText, coords);
    input.value = '';
    closeModal();
  } catch (err) {
    modalError.hidden = false;
    modalInput.classList.add('invalid');
    modalInput.focus();
  }
}

function handleModalInputKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    modalOk.click();
  }
  if (e.key === 'Escape') closeModal();
}

function handleMicBtnClick() {
  if (micActive) {
    stopMicRecording(true);
  } else {
    startMicRecording();
  }
}

function handleVideoBtnClick() {
  openVideoModal();
}

function handleVideoRecordBtnClick() {
  if (videoActive) {
    videoActive = false;
    if (videoRecorder && videoRecorder.state !== 'inactive') {
      videoRecorder.stop();
    }
    return;
  }
  const mimeType = pickMime([
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]);
  videoRecorder = mimeType
    ? new MediaRecorder(videoStream, { mimeType })
    : new MediaRecorder(videoStream);
  videoChunks = [];
  videoRecorder.addEventListener('dataavailable', (e) => {
    if (e.data.size > 0) videoChunks.push(e.data);
  });
  videoRecorder.addEventListener('stop', () => {
    if (videoModal.hidden) return; // запись отменена
    const blob = new Blob(videoChunks, { type: videoRecorder.mimeType });
    const url = URL.createObjectURL(blob);
    savePost('Видеозапись', { video: url });
    closeVideoModal();
  });
  videoRecorder.start();
  videoActive = true;
  videoRecordBtn.textContent = 'Остановить';
  videoRecordBtn.classList.add('timeline__btn--recording');
}

function handleVideoCancelBtnClick() {
  videoActive = false;
  if (videoRecorder && videoRecorder.state !== 'inactive') {
    videoRecorder.stop();
  }
  closeVideoModal();
}

// ============================================================
// ПОДКЛЮЧЕНИЕ СОБЫТИЙ — САМОЕ ПОСЛЕДНЕЕ
// ============================================================

form.addEventListener('submit', handleFormSubmit);

modalOk.addEventListener('click', handleModalOkClick);
modalCancel.addEventListener('click', closeModal);
modalInput.addEventListener('keydown', handleModalInputKeydown);

micBtn.addEventListener('click', handleMicBtnClick);

const micCancelBtn = document.getElementById('mic-cancel');
if (micCancelBtn) {
  micCancelBtn.addEventListener('click', () => stopMicRecording(false));
}

videoBtn.addEventListener('click', handleVideoBtnClick);
videoRecordBtn.addEventListener('click', handleVideoRecordBtnClick);
videoCancelBtn.addEventListener('click', handleVideoCancelBtnClick);

export default function app() {}
