import parseCoordinates from './coordinates';

const posts = [];
let pendingType = null;
let pendingValue = null;

const postsEl = document.getElementById('posts');
const form = document.getElementById('form');
const input = document.getElementById('input');
const audioBtn = document.getElementById('audio-btn');
const videoBtn = document.getElementById('video-btn');
const audioCancelBtn = document.getElementById('audio-cancel');
const audioStatus = document.getElementById('audio-status');
const noticeEl = document.getElementById('notice');

const coordsModal = document.getElementById('modal');
const modalHint = document.getElementById('modal-hint');
const modalInput = document.getElementById('modal-input');
const modalError = document.getElementById('modal-error');
const modalOk = document.getElementById('modal-ok');
const modalCancel = document.getElementById('modal-cancel');

const videoModal = document.getElementById('video-modal');
const videoPreview = document.getElementById('video-preview');
const videoRecordBtn = document.getElementById('video-record');
const videoCancelBtn = document.getElementById('video-cancel');

const HINT_DEFAULT =
  'Не удалось получить координаты. Укажите их вручную в формате «широта, долгота»:';

const HINTS = {
  PERMISSION_DENIED: 'Доступ к местоположению запрещён.',
  POSITION_UNAVAILABLE: 'Местоположение недоступно.',
  TIMEOUT: 'Время ожидания координат истекло.',
};

let audioRecorder = null;
let audioStream = null;
let audioChunks = [];
let audioCancelled = false;
let audioTimerId = null;

let videoRecorder = null;
let videoStream = null;
let videoChunks = [];
let videoCancelled = false;

function formatCoords({ latitude, longitude }) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function geoErrorMessage(error) {
  if (error.code === error.PERMISSION_DENIED) return HINTS.PERMISSION_DENIED;
  if (error.code === error.POSITION_UNAVAILABLE)
    return HINTS.POSITION_UNAVAILABLE;
  if (error.code === error.TIMEOUT) return HINTS.TIMEOUT;
  return 'Не удалось получить координаты.';
}

function getCoords() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation API не поддерживается'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => reject(error),
      { timeout: 10000 }
    );
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

function showNotice(message) {
  noticeEl.textContent = message;
  noticeEl.hidden = false;
  setTimeout(() => {
    noticeEl.hidden = true;
  }, 4000);
}

function render() {
  postsEl.innerHTML = '';
  [...posts].reverse().forEach((post) => {
    const item = document.createElement('div');
    item.className = 'post';
    const body = document.createElement('div');
    body.className = 'post__body';
    if (post.type === 'text') {
      body.textContent = post.data;
    } else if (post.type === 'audio') {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = post.data;
      body.appendChild(audio);
    } else if (post.type === 'video') {
      const video = document.createElement('video');
      video.controls = true;
      video.src = post.data;
      video.width = 320;
      body.appendChild(video);
    }
    const meta = document.createElement('div');
    meta.className = 'post__meta';
    meta.textContent = `[${formatCoords(
      post.coords
    )}] ${post.date.toLocaleString('ru-RU')}`;
    item.appendChild(body);
    item.appendChild(meta);
    postsEl.appendChild(item);
  });
}

function createPost(type, data, coords) {
  posts.push({ type, data, coords, date: new Date() });
  if (type === 'text') {
    input.value = '';
  }
  render();
}

function openCoordsModal(type, value, error) {
  pendingType = type;
  pendingValue = value;
  modalHint.textContent = `${geoErrorMessage(error)} ${HINT_DEFAULT}`;
  modalError.hidden = true;
  modalInput.classList.remove('invalid');
  modalInput.value = '';
  coordsModal.hidden = false;
  modalInput.focus();
}

function savePost(type, value) {
  getCoords()
    .then((coords) => createPost(type, value, coords))
    .catch((error) => openCoordsModal(type, value, error));
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  savePost('text', text);
});

modalOk.addEventListener('click', () => {
  let coords;
  try {
    coords = parseCoordinates(modalInput.value);
  } catch (e) {
    modalError.hidden = false;
    modalInput.classList.add('invalid');
    modalInput.focus();
    return;
  }
  coordsModal.hidden = true;
  createPost(pendingType, pendingValue, coords);
  pendingType = null;
  pendingValue = null;
});

modalCancel.addEventListener('click', () => {
  coordsModal.hidden = true;
  pendingType = null;
  pendingValue = null;
});

modalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    modalOk.click();
  }
  if (e.key === 'Escape') {
    coordsModal.hidden = true;
    pendingType = null;
    pendingValue = null;
  }
});

function stopAudioTimer() {
  if (audioTimerId !== null) {
    clearInterval(audioTimerId);
    audioTimerId = null;
  }
}

function updateAudioStatus(seconds) {
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');
  audioStatus.textContent = `Запись… ${mm}:${ss}`;
}

function resetAudioUi() {
  audioCancelBtn.hidden = true;
  audioStatus.hidden = true;
  audioBtn.textContent = '🎤';
  audioBtn.classList.remove('timeline__btn--recording');
  stopAudioTimer();
}

audioBtn.addEventListener('click', () => {
  if (audioRecorder && audioRecorder.state === 'recording') {
    audioRecorder.stop();
    return;
  }
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    showNotice('Запись аудио не поддерживается этим браузером.');
    return;
  }
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      audioStream = stream;
      audioCancelled = false;
      audioChunks = [];
      audioRecorder = new MediaRecorder(stream);
      audioRecorder.addEventListener('dataavailable', (e) => {
        audioChunks.push(e.data);
      });
      audioRecorder.addEventListener('stop', () => {
        resetAudioUi();
        audioStream.getTracks().forEach((track) => track.stop());
        audioStream = null;
        const mimeType = audioRecorder.mimeType || 'audio/webm';
        audioRecorder = null;
        if (audioCancelled) {
          audioCancelled = false;
          return;
        }
        const blob = new Blob(audioChunks, { type: mimeType });
        blobToDataUrl(blob).then((dataUrl) => savePost('audio', dataUrl));
      });
      audioRecorder.start();
      audioBtn.textContent = '⏹';
      audioBtn.classList.add('timeline__btn--recording');
      audioCancelBtn.hidden = false;
      audioStatus.hidden = false;
      let seconds = 0;
      updateAudioStatus(seconds);
      audioTimerId = setInterval(() => {
        seconds += 1;
        updateAudioStatus(seconds);
      }, 1000);
    })
    .catch(() => {
      showNotice('Не удалось получить доступ к микрофону.');
    });
});

audioCancelBtn.addEventListener('click', () => {
  audioCancelled = true;
  if (audioRecorder && audioRecorder.state === 'recording') {
    audioRecorder.stop();
  }
});

function closeVideoModal() {
  videoModal.hidden = true;
  videoPreview.srcObject = null;
  if (videoStream) {
    videoStream.getTracks().forEach((track) => track.stop());
    videoStream = null;
  }
  videoRecorder = null;
}

videoBtn.addEventListener('click', () => {
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    showNotice('Запись видео не поддерживается этим браузером.');
    return;
  }
  navigator.mediaDevices
    .getUserMedia({ video: true, audio: true })
    .then((stream) => {
      videoStream = stream;
      videoCancelled = false;
      videoChunks = [];
      videoPreview.srcObject = stream;
      videoRecordBtn.textContent = 'Записать';
      videoModal.hidden = false;
    })
    .catch(() => {
      showNotice('Не удалось получить доступ к камере и микрофону.');
    });
});

videoRecordBtn.addEventListener('click', () => {
  if (videoRecorder && videoRecorder.state === 'recording') {
    videoRecorder.stop();
    return;
  }
  videoRecorder = new MediaRecorder(videoStream);
  videoRecorder.addEventListener('dataavailable', (e) => {
    videoChunks.push(e.data);
  });
  videoRecorder.addEventListener('stop', () => {
    const mimeType = videoRecorder.mimeType || 'video/webm';
    const blob = new Blob(videoChunks, { type: mimeType });
    closeVideoModal();
    if (videoCancelled) {
      videoCancelled = false;
      return;
    }
    blobToDataUrl(blob).then((dataUrl) => savePost('video', dataUrl));
  });
  videoRecorder.start();
  videoRecordBtn.textContent = 'Остановить';
});

videoCancelBtn.addEventListener('click', () => {
  videoCancelled = true;
  if (videoRecorder && videoRecorder.state === 'recording') {
    videoRecorder.stop();
  } else {
    closeVideoModal();
  }
});

export default function app() {}
