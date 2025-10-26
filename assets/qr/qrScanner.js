const Html5Qrcode = window.Html5Qrcode;
let html5QrCodeInstance = null;

export function startQrScanIOS() {
  return new Promise((resolve, reject) => {
    // Stop en clean oude instantie
    const cleanOldInstance = async () => {
      if (html5QrCodeInstance) {
        try {
          await html5QrCodeInstance.stop();
          html5QrCodeInstance.clear();
        } catch {}
        html5QrCodeInstance = null;
      }
    };

    cleanOldInstance().then(() => {
      // Overlay
      let overlay = document.getElementById("qrModal");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "qrModal";
        overlay.style.cssText = `
          position:fixed;
          inset:0;
          background: rgba(255, 255, 255, 0.1);
          display:flex;
          justify-content:center;
          align-items:center;
          z-index:9999;
        `;
        overlay.innerHTML = `
          <div id="reader" style="width:300px;height:300px;position:relative;
            border:2px solid rgba(255,255,255,0.7); border-radius:12px;
            overflow:hidden; box-shadow: 0 0 20px rgba(0,0,0,0.2);">
          </div>
          <button id="qrCancel" style="position:absolute;top:20px;right:20px;padding:0.4em 0.8em;
            background:rgba(255,0,0,0.8);color:white;border:none;border-radius:6px;font-weight:bold;
            cursor:pointer;">Sluiten</button>
        `;
        document.body.appendChild(overlay);
      }

      const readerEl = overlay.querySelector("#reader");
      const cancelBtn = overlay.querySelector("#qrCancel");
      overlay.style.display = "flex";

      // Leeg readerElement zodat oude scanlines weg zijn
      readerEl.innerHTML = "";

      // Voeg scanline opnieuw toe
      const scanline = document.createElement("div");
      scanline.id = "scanline";
      scanline.style.cssText = `
        position:absolute;
        top:0; left:0;
        width:100%; height:3px;
        background: rgba(255,0,0,0.9);
        box-shadow: 0 0 15px rgba(255,0,0,0.7);
        z-index: 9999;
        pointer-events:none;
        animation: scanlineMove 2s linear infinite;
      `;
      readerEl.appendChild(scanline);

      // CSS voor video en animatie
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
          z-index:1;
        }
        #scanline::before {
          content: '';
          position: absolute;
          top:0; left:0;
          width:100%; height:100%;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.5), transparent);
          animation: glowPulse 1s linear infinite;
          pointer-events:none;
        }
        @keyframes glowPulse {
          0%,100%{opacity:0;}
          50%{opacity:1;}
        }
        @keyframes scanlineMove {
          0%{top:0; opacity:0.6;}
          50%{top:calc(100% - 3px); opacity:1;}
          100%{top:0; opacity:0.6;}
        }
      `;

      let ensureScanlineOnTop = setInterval(() => {
        const lastChild = readerEl.lastElementChild;
        if (lastChild && lastChild.id !== "scanline") {
          readerEl.appendChild(scanline);
        }
      }, 500);

      const stop = async () => {
        clearInterval(ensureScanlineOnTop);
        await cleanOldInstance();
        overlay.style.display = "none";
      };

      cancelBtn.onclick = () => {
        stop();
        reject(new Error("Scan geannuleerd"));
      };

      html5QrCodeInstance = new Html5Qrcode("reader");
      const config = { fps: 10, qrbox: { width: 300, height: 300 } };

      html5QrCodeInstance
        .start({ facingMode: "environment" }, config, async (decodedText) => {
          await stop();
          resolve(decodedText);
        })
        .catch(async (err) => {
          await stop();
          reject(err);
        });
    });
  });
}
