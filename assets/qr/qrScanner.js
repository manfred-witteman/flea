// qr/qrScanner.js
const Html5Qrcode = window.Html5Qrcode;
let html5QrCodeInstance = null;

export function startQrScanIOS() {
  return new Promise((resolve, reject) => {
    if (html5QrCodeInstance) {
      try {
        html5QrCodeInstance.stop();
        html5QrCodeInstance.clear();
      } catch {}
      html5QrCodeInstance = null;
    }

    // Overlay maken
    let overlay = document.getElementById("qrModal");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "qrModal";
      overlay.style.cssText = `
        position:fixed;
        inset:0;
        background:rgba(0,0,0,0.9);
        display:flex;
        justify-content:center;
        align-items:center;
        z-index:9999;
      `;
      overlay.innerHTML = `
        <div id="reader"
             style="width:300px;height:300px;position:relative;
             border:4px solid #fff;border-radius:8px;background:#000;
             overflow:hidden;">
          <div id="scanline"></div>
        </div>
        <button id="qrCancel"
                style="position:absolute;top:20px;right:20px;padding:0.5em 1em;
                background:red;color:white;border:none;border-radius:5px;cursor:pointer;">
          Sluiten
        </button>
      `;
      document.body.appendChild(overlay);
    }

    const readerEl = overlay.querySelector("#reader");
    const scanline = overlay.querySelector("#scanline");
    const cancelBtn = overlay.querySelector("#qrCancel");
    overlay.style.display = "flex";

    // CSS
    let style = document.getElementById("qr-scan-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "qr-scan-style";
      document.head.appendChild(style);
    }
    style.textContent = `
      #reader video {
        object-fit: cover !important;
        width: 100% !important;
        height: 100% !important;
        position: absolute !important;
        top: 0; left: 0;
      }
      #scanline {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 3px;
        background: red;
        box-shadow: 0 0 20px 6px red;
        animation: scanlineMove 2s linear infinite;
        opacity: 0.9;
        z-index: 2147483647 !important; /* hoogste waarde */
        pointer-events: none;
      }
	  #scanline::before {
  content: '';
  position: absolute;
  top: 0; left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(to right, transparent, rgba(255,255,255,0.6), transparent);
  animation: glowPulse 1s linear infinite;
  pointer-events: none;
}

@keyframes glowPulse {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
}	
      @keyframes scanlineMove {
        0%   { top: 0; opacity: 0.6; }
        50%  { top: calc(100% - 3px); opacity: 1; }
        100% { top: 0; opacity: 0.6; }
      }
    `;

    let ensureScanlineOnTop = null;

    const stop = async () => {
      if (ensureScanlineOnTop) clearInterval(ensureScanlineOnTop);
      if (html5QrCodeInstance) {
        try {
          await html5QrCodeInstance.stop();
          html5QrCodeInstance.clear();
        } catch {}
        html5QrCodeInstance = null;
      }
      overlay.style.display = "none";
    };

    cancelBtn.onclick = () => {
      stop();
      reject(new Error("Scan geannuleerd"));
    };

    // Start QR scanning
    html5QrCodeInstance = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 300, height: 300 } };

    html5QrCodeInstance
      .start(
        { facingMode: "environment" },
        config,
        async (decodedText) => {
          await stop();
          resolve(decodedText);
        },
        () => {}
      )
      .then(() => {
        console.log("🟢 Scanner gestart");
        // Zorg dat de scanlijn altijd bovenaan blijft
        ensureScanlineOnTop = setInterval(() => {
          const lastChild = readerEl.lastElementChild;
          if (lastChild && lastChild.id !== "scanline") {
            readerEl.appendChild(scanline);
          }
        }, 500);
      })
      .catch(async (err) => {
        await stop();
        reject(err);
      });
  });
}
