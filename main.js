// Unificado: lógica Whisper (Código1) + lógica IHC (Código2)
// Mantener API_BASE tal como pediste:
const API_BASE = "http://98.94.143.63:5500/api"; // igual que en el Código 2

document.addEventListener('DOMContentLoaded', () => {
  // === DOM ELEMENTS (voz) ===
  const recordButton = document.getElementById('recordButton');
  const statusSpan = document.getElementById('status');
  const recognizedTextP = document.getElementById('recognizedText');
  const commandTextP = document.getElementById('commandText');

  // === DOM ELEMENTS (IHC) ===
  const statusIHC = document.getElementById('statusIHC');
  const tsEl = document.getElementById('timestamp');
  const toastEl = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  const toast = new bootstrap.Toast(toastEl, { delay: 2200 });

  // === Variables y config ===
  let OPENAI_API_KEY = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  const KEYWORD = 'cosmo';

  // Catálogo (Código 2)
  const CATALOGO = {
    1: "Adelante",
    2: "Atrás", // <- con acento
    3: "Detener",
    4: "Vuelta adelante derecha",
    5: "Vuelta adelante izquierda",
    6: "Vuelta atrás derecha", // <- con acento
    7: "Vuelta atrás izquierda", // <- con acento
    8: "Giro 90° derecha",
    9: "Giro 90° izquierda",
    10: "Giro 360° derecha",
    11: "Giro 360° izquierda",
  };

  // Aliases de comandos CORREGIDOS
  const COMANDO_ALIASES = {
    'adelante': 'adelante', 'avanza': 'adelante',
    'atras': 'atrás', 'retrocede': 'atrás', // <- mapear a "atrás" (con acento)
    'detener': 'detener', 'detente': 'detener', 'para': 'detener',
    'vuelta derecha': 'vuelta adelante derecha', 'adelante derecha': 'vuelta adelante derecha', 'vuelta adelante derecha': 'vuelta adelante derecha',
    'vuelta izquierda': 'vuelta adelante izquierda', 'adelante izquierda': 'vuelta adelante izquierda', 'vuelta adelante izquierda': 'vuelta adelante izquierda',
    'vuelta atras derecha': 'vuelta atrás derecha', 'atras derecha': 'vuelta atrás derecha', // <- mapear a "vuelta atrás derecha"
    'vuelta atras izquierda': 'vuelta atrás izquierda', 'atras izquierda': 'vuelta atrás izquierda', // <- mapear a "vuelta atrás izquierda"
    'giro 90 derecha': 'giro 90° derecha', 'gira 90 derecha': 'giro 90° derecha',
    'giro 90 izquierda': 'giro 90° izquierda', 'gira 90 izquierda': 'giro 90° izquierda',
    'giro 360 derecha': 'giro 360° derecha', 'giro completo derecha': 'giro 360° derecha',
    'giro 360 izquierda': 'giro 360° izquierda', 'giro completo izquierda': 'giro 360° izquierda'
  };

  // --- Obtener API Key desde MockAPI ---
  async function obtenerApiKey() {
    try {
      const response = await fetch("https://68e538728e116898997ee561.mockapi.io/apikey");
      if (!response.ok) throw new Error("Error al obtener la API Key desde MockAPI");
      const data = await response.json();
      OPENAI_API_KEY = data[0].api_key;
      console.log("✅ API Key obtenida desde MockAPI");
    } catch (error) {
      console.error("❌ Error al obtener la API key:", error);
      showToast("No se pudo obtener la API key (MockAPI).");
    }
  }
  obtenerApiKey();

  // ===== LÓGICA DE GRABACIÓN / WHISPER ===
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
      mediaRecorder.onstop = sendAudioToOpenAI;
      audioChunks = [];
      mediaRecorder.start();
      isRecording = true;
      statusSpan.textContent = 'Grabando...';
      recordButton.classList.add('recording');
      recordButton.setAttribute('aria-pressed', 'true');
    } catch (error) {
      console.error("Error al acceder al micrófono:", error);
      statusSpan.textContent = 'Error de micrófono';
      showToast("No se pudo acceder al micrófono. Verifica permisos.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      isRecording = false;
      statusSpan.textContent = 'Procesando...';
      recordButton.classList.remove('recording');
      recordButton.setAttribute('aria-pressed', 'false');
    }
  };

  const sendAudioToOpenAI = async () => {
    if (!OPENAI_API_KEY) {
      showToast("Aún no se ha cargado la API Key de OpenAI.");
      statusSpan.textContent = 'API Key ausente';
      return;
    }
    if (audioChunks.length === 0) {
      statusSpan.textContent = 'Grabación vacía.';
      return;
    }

    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const audioFile = new File([audioBlob], "recording.webm", { type: "audio/webm" });
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('model', 'whisper-1');
    formData.append('language', 'es');

    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Error HTTP ${response.status}`);
      }

      const data = await response.json();
      const transcriptRaw = (data.text || '').trim();
      const transcript = transcriptRaw.toLowerCase();
      recognizedTextP.textContent = transcriptRaw || '-';
      statusSpan.textContent = 'Listo';
      processCommand(transcript);
    } catch (error) {
      console.error("Error al enviar audio a OpenAI:", error);
      statusSpan.textContent = 'Error en la API';
      recognizedTextP.textContent = error.message;
      showToast("Error al transcribir audio: " + error.message);
    }
  };

  // Normalizar texto (quitar acentos, puntuación)
  const normalizeText = (text) => {
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()°ºª]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  // Procesar comando de voz - FUNCIÓN MEJORADA
  const processCommand = (transcript) => {
    if (!transcript || !transcript.startsWith(KEYWORD)) {
      commandTextP.textContent = `La orden debe iniciar con "${KEYWORD}"`;
      return;
    }

    const potentialCommand = transcript.substring(KEYWORD.length);
    const normalized = normalizeText(potentialCommand).toLowerCase();

    console.log("Comando normalizado:", normalized); // Para debug

    // Primero buscar en aliases
    const found = COMANDO_ALIASES[normalized];
    if (found) {
      commandTextP.textContent = found.toUpperCase();
      console.log(`Comando detectado (alias): ${found}`);

      // Buscar el ID en CATALOGO
      const idMov = Object.keys(CATALOGO).find(
        k => normalizeText(CATALOGO[k]).toLowerCase() === normalizeText(found).toLowerCase()
      );
      
      if (idMov) {
        enviarMovimiento(Number(idMov));
      } else {
        console.error(`Comando no encontrado en catálogo: ${found}`);
        showToast("Comando reconocido, pero no está mapeado a un movimiento.");
      }

    } else {
      // Si no está en aliases, buscar directamente en CATALOGO
      const matchKey = Object.keys(CATALOGO).find(k =>
        normalizeText(CATALOGO[k]).toLowerCase() === normalized
      );
      
      if (matchKey) {
        const movimiento = CATALOGO[matchKey];
        commandTextP.textContent = movimiento.toUpperCase();
        enviarMovimiento(Number(matchKey));
      } else {
        commandTextP.textContent = "Comando no reconocido";
        showToast("Comando no reconocido");
        console.log("Comandos disponibles:", Object.values(CATALOGO).map(v => normalizeText(v).toLowerCase()));
      }
    }
  };

  // === LÓGICA IHC / API CALLS ===
  function showToast(msg) {
    toastMsg.textContent = msg;
    toast.show();
  }

  // 🔹 Ajuste para mostrar el nombre del movimiento en lugar del número
  function setStatusIHC(texto, fecha = null) {
    const txt =
      typeof texto === "number"
        ? (CATALOGO[texto] || `Movimiento ${texto}`)
        : texto;

    statusIHC.textContent = (txt || "—").toUpperCase();
    tsEl.textContent = fecha ? new Date(fecha).toLocaleString() : "";
    localStorage.setItem(
      "ultimoEstado",
      JSON.stringify({ texto: txt, fecha: fecha || new Date().toISOString() })
    );
  }

  async function postMovimiento(id_movimiento) {
    const res = await fetch(`${API_BASE}/movimientos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_movimiento }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Error HTTP ${res.status}`);
    }
    return res.json();
  }

  async function getUltimoMovimiento() {
    const res = await fetch(`${API_BASE}/movimientos/ultimo`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Error HTTP ${res.status}`);
    }
    return res.json();
  }

  async function getUltimosMovimientos(limit = 5) {
    const res = await fetch(`${API_BASE}/movimientos/ultimos?limit=${limit}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Error HTTP ${res.status}`);
    }
    return res.json();
  }

  // 🔹 Ajuste para usar el nombre del movimiento al actualizar el estatus
  async function enviarMovimiento(idMov) {
    try {
      setStatusIHC(idMov);
      await postMovimiento(idMov);
      showToast(`Enviado: ${CATALOGO[idMov] || `Movimiento ${idMov}`}`);
      await refrescarUltimo();
    } catch (e) {
      showToast(`Error: ${e.message}`);
      console.error(e);
    }
  }

  async function refrescarUltimo() {
    try {
      const { data } = await getUltimoMovimiento();
      if (data) setStatusIHC(data.movimiento, data.fecha_hora);
    } catch (e) {
      console.error("Error refrescando último:", e);
    }
  }

  function restaurarUltimoLocal() {
    const guardado = localStorage.getItem("ultimoEstado");
    if (guardado) {
      try {
        const { texto, fecha } = JSON.parse(guardado);
        setStatusIHC(texto, fecha);
      } catch {
        localStorage.removeItem("ultimoEstado");
      }
    }
  }

  async function mostrarMonitoreo() {
    const tbody = document.getElementById("tablaMonitoreo");
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Cargando...</td></tr>`;
    try {
      const { data } = await getUltimosMovimientos(5);
      if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Sin registros recientes</td></tr>`;
        return;
      }
      tbody.innerHTML = data.map((item, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${item.movimiento}</td>
          <td>${new Date(item.fecha_hora).toLocaleString()}</td>
        </tr>
      `).join("");
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="3" class="text-danger text-center">Error: ${e.message}</td></tr>`;
    }
  }

  // === Eventos UI ===
  document.querySelectorAll("[data-mov]").forEach((btn) =>
    btn.addEventListener("click", () => enviarMovimiento(Number(btn.dataset.mov)))
  );

  document.getElementById("btn-monitoreo").addEventListener("click", async () => {
    const modal = new bootstrap.Modal(document.getElementById("modalMonitoreo"));
    modal.show();
    await mostrarMonitoreo();
  });

  // Teclas rápidas
  document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (key === "w") enviarMovimiento(1);
    if (key === "s") enviarMovimiento(2);
    if (key === " ") { e.preventDefault(); enviarMovimiento(3); }
    if (key === "e") enviarMovimiento(4);
    if (key === "q") enviarMovimiento(5);
    if (key === "c") enviarMovimiento(6);
    if (key === "z") enviarMovimiento(7);
    if (key === "d") enviarMovimiento(8);
    if (key === "a") enviarMovimiento(9);
    if (key === "x") enviarMovimiento(10);
    if (key === "y") enviarMovimiento(11);
  });

  // === Restaurar estado al cargar ===
  window.addEventListener("DOMContentLoaded", () => {
    restaurarUltimoLocal();
    (async () => {
      try { await refrescarUltimo(); } catch (e) { console.error(e); }
    })();
  });

  // === Grabación: toggle con botón ===
  recordButton.addEventListener('click', () => {
    if (isRecording) stopRecording(); else startRecording();
  });
});
