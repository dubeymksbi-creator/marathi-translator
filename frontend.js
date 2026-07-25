// Set to your deployed Render URL if you host the frontend separately (e.g. 'https://your-app.onrender.com')
// Otherwise, leave empty to automatically use the current server origin.
const PRODUCTION_BACKEND_URL = ''; 
const BACKEND_URL = PRODUCTION_BACKEND_URL || window.location.origin;
let selectedFile = null;

// Register Service Worker for PWA installation
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registered successfully'))
      .catch(err => console.warn('Service Worker registration skipped:', err));
  });
}

// Generate QR Code connection for Mobile on load
window.addEventListener('DOMContentLoaded', async () => {
  const currentOrigin = window.location.origin;
  
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '') {
    try {
      const res = await fetch(`${BACKEND_URL}/api/get-ip`);
      const data = await res.json();
      if (data.ip && data.ip !== '127.0.0.1') {
        const qrUrl = `http://${data.ip}:5000`;
        document.getElementById('qr-image').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrUrl)}`;
        document.getElementById('qr-url-text').innerText = qrUrl;
        document.getElementById('qr-card').style.display = 'flex';
      } else {
        document.getElementById('qr-url-text').innerText = "Running locally (No external Wi-Fi IP found)";
      }
    } catch (e) {
      console.log("Could not load QR code connecting info:", e);
      document.getElementById('qr-url-text').innerText = "Backend server offline (run python app.py)";
    }
  } else {
    // If accessing via tunnel or IP, use current address
    document.getElementById('qr-image').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentOrigin)}`;
    document.getElementById('qr-url-text').innerText = currentOrigin;
    document.getElementById('qr-card').style.display = 'flex';
  }
});

// Tab switcher
function switchTab(tab) {
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
  
  if (tab === 'text') {
    document.getElementById('tab-btn-text').classList.add('active');
    document.getElementById('sec-text').classList.add('active');
  } else if (tab === 'video') {
    document.getElementById('tab-btn-video').classList.add('active');
    document.getElementById('sec-video').classList.add('active');
  }
}

// Clipboard Paste
async function pasteFromClipboard(targetId) {
  try {
    const text = await navigator.clipboard.readText();
    document.getElementById(targetId).value = text;
  } catch (err) {
    alert('Please paste manually; clipboard access was denied.');
  }
}

// Clipboard Copy
async function copyToClipboard(sourceId) {
  const text = document.getElementById(sourceId).innerText;
  try {
    await navigator.clipboard.writeText(text);
    alert('Translation copied to clipboard!');
  } catch (err) {
    console.error('Failed to copy', err);
  }
}

// Text Translation API Call
async function handleTextTranslation() {
  const text = document.getElementById('text-input').value.trim();
  const target = document.getElementById('text-target-lang').value;
  const outputCard = document.getElementById('text-output-card');
  const outputText = document.getElementById('text-output');
  const outputLangTag = document.getElementById('text-output-lang');

  if (!text) {
    alert('Please enter some Marathi text to translate.');
    return;
  }

  outputText.innerText = 'Translating...';
  outputCard.style.display = 'block';
  outputLangTag.innerText = target === 'hi' ? 'Hindi (हिन्दी)' : 'English';

  try {
    const response = await fetch(`${BACKEND_URL}/api/translate-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text, target })
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`Parse error: ${parseError.message}`);
    }

    if (response.ok) {
      outputText.innerText = data.translated_text;
    } else {
      throw new Error(data.error || 'Translation failed');
    }
  } catch (error) {
    console.warn("Backend unavailable, falling back to client-side translation:", error);
    try {
      // Laptop is closed/offline - Fallback to client-side translation via a free CORS proxy
      const googleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(googleUrl)}`;
      
      const proxyResponse = await fetch(proxyUrl);
      if (!proxyResponse.ok) {
        throw new Error("CORS Proxy unreachable");
      }
      
      const proxyData = await proxyResponse.json();
      const googleData = JSON.parse(proxyData.contents);
      
      if (googleData && googleData[0]) {
        const translatedText = googleData[0].map(sentence => sentence[0] || '').join('');
        outputText.innerHTML = `${translatedText}<br><small style="color:var(--text-muted); font-size:0.75rem; display:block; margin-top:0.5rem;">⚡ Powered by client-side fallback (laptop offline)</small>`;
      } else {
        throw new Error("Invalid response format from Google Translate");
      }
    } catch (fallbackError) {
      outputText.innerText = `Error: Both backend and fallback translation failed. (${fallbackError.message})`;
    }
  }
}

// File Selection Handler
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    selectedFile = file;
    document.getElementById('selected-file-name').innerText = file.name;
    document.getElementById('selected-file-size').innerText = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    
    document.getElementById('drop-zone').style.display = 'none';
    document.getElementById('selected-file-container').style.display = 'flex';
  }
}

// Clear selected file
function clearSelectedFile() {
  selectedFile = null;
  document.getElementById('media-file-input').value = '';
  document.getElementById('drop-zone').style.display = 'flex';
  document.getElementById('selected-file-container').style.display = 'none';
  document.getElementById('media-result-container').style.display = 'none';
}

// Media Translation API Call
async function handleMediaTranslation() {
  if (!selectedFile) {
    alert('Please select or upload a video/audio file first.');
    return;
  }

  const target = document.getElementById('media-target-lang').value;
  const progressContainer = document.getElementById('progress-container');
  const progressStatus = document.getElementById('progress-status');
  const resultContainer = document.getElementById('media-result-container');
  const timelineContainer = document.getElementById('transcript-timeline-container');
  
  progressContainer.style.display = 'flex';
  resultContainer.style.display = 'none';
  document.getElementById('video-control-row').style.display = 'none';

  // Setup media preview player locally
  const mediaUrl = URL.createObjectURL(selectedFile);
  const videoPlayer = document.getElementById('preview-player');
  const audioPlayer = document.getElementById('preview-audio');

  if (selectedFile.type.startsWith('video/')) {
    videoPlayer.src = mediaUrl;
    videoPlayer.style.display = 'block';
    audioPlayer.style.display = 'none';
  } else {
    audioPlayer.src = mediaUrl;
    audioPlayer.style.display = 'block';
    videoPlayer.style.display = 'none';
  }

  try {
    progressStatus.innerText = 'Extracting and decoding audio track...';
    
    // Decode audio track in the browser via Web Audio API
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await selectedFile.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    progressStatus.innerText = 'Converting audio to WAV...';
    const wavBlob = bufferToWav(audioBuffer);
    
    progressStatus.innerText = 'Transcribing and translating...';

    const formData = new FormData();
    formData.append('file', wavBlob, 'audio.wav');
    formData.append('target', target);

    const response = await fetch(`${BACKEND_URL}/api/translate-media`, {
      method: 'POST',
      body: formData
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      alert(`Response Parse Error: ${parseError.message}. Raw response: ${responseText.substring(0, 200)}`);
      return;
    }

    if (response.ok) {
      // Clear previous timeline
      timelineContainer.innerHTML = '';

      if (data.segments && data.segments.length > 0) {
        data.segments.forEach(seg => {
          const item = document.createElement('div');
          item.className = 'timeline-item';
          
          item.innerHTML = `
            <div class="time-stamp" style="color: var(--color-primary); font-weight: 700; min-width: 45px;">Audio</div>
            <div class="bubble-content">
              <span class="mr-text">${seg.marathi}</span>
              <span class="trans-text">${seg.translated}</span>
            </div>
          `;
          timelineContainer.appendChild(item);
        });
      } else {
        timelineContainer.innerHTML = '<div style="color:var(--text-muted);">No translatable speech detected.</div>';
      }
      
      resultContainer.style.display = 'block';
    } else {
      alert(`Error: ${data.error || 'Failed to process media.'}`);
    }
  } catch (error) {
    alert(`Error processing media: ${error.message}`);
  } finally {
    progressContainer.style.display = 'none';
    document.getElementById('video-control-row').style.display = 'flex';
  }
}

// Convert AudioBuffer to WAV blob
function bufferToWav(buffer) {
  let numOfChan = buffer.numberOfChannels,
      length = buffer.length * numOfChan * 2 + 44,
      bufferArr = new ArrayBuffer(length),
      view = new DataView(bufferArr),
      channels = [], i, sample,
      offset = 0,
      pos = 0;

  // write HEADERS
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16);         // chunk length
  setUint16(1);          // sample format (raw)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2); // block align
  setUint16(16);         // bits per sample
  setUint32(0x61746164); // "data" chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved channels
  for(i=0; i<buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  while(pos < length) {
    for(i=0; i<numOfChan; i++) {             // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF); // scale to 16-bit signed int
      view.setInt16(pos, sample, true);          // write 16-bit sample
      pos += 2;
    }
    offset++;                               // next sample
  }

  return new Blob([view], { type: 'audio/wav' });

  function setUint16(data) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}

// Drag & Drop Setup
const dropZone = document.getElementById('drop-zone');
if (dropZone) {
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--color-primary)';
      dropZone.style.background = 'rgba(0, 242, 254, 0.05)';
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border-color)';
      dropZone.style.background = 'rgba(30, 41, 59, 0.4)';
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    if (file) {
      selectedFile = file;
      document.getElementById('selected-file-name').innerText = file.name;
      document.getElementById('selected-file-size').innerText = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
      dropZone.style.display = 'none';
      document.getElementById('selected-file-container').style.display = 'flex';
    }
  });
}
