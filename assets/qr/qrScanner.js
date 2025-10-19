// qr/qrScanner.js
// html5-qrcode is loaded globally in inkoop.html
const Html5Qrcode = window.Html5Qrcode;

let html5QrCodeInstance = null;

/**
 * Start een QR-scan in een tijdelijke modale overlay
 * Werkt hetzelfde als je standalone voorbeeld
 */
export function startQrScanIOS() {
  return new Promise((resolve, reject) => {
    // Recycle eventuele oude scanner
    if (html5QrCodeInstance) {
      try {
        html5QrCodeInstance.stop();
        html5QrCodeInstance.clear();
      } catch { }
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
             style="width:300px;height:300px;border:4px solid #fff;
             border-radius:8px;background:#000;">
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
    const cancelBtn = overlay.querySelector("#qrCancel");
    overlay.style.display = "flex";

    const stop = async () => {
      if (html5QrCodeInstance) {
        try {
          await html5QrCodeInstance.stop();
          html5QrCodeInstance.clear();
        } catch { }
        html5QrCodeInstance = null;
      }
      overlay.style.display = "none";
    };

    cancelBtn.onclick = () => {
      stop();
      reject(new Error("Scan geannuleerd"));
    };

    // Start scanning
    html5QrCodeInstance = new Html5Qrcode("reader"); // ✅ pass the ID string, not the element
    const config = { fps: 10, qrbox: { width: 300, height: 300 } };

    html5QrCodeInstance.start(
      { facingMode: "environment" },
      config,
      async (decodedText) => {
        await stop();
        resolve(decodedText);
      },
      (err) => {
        // ignore scan noise
      }
    ).catch(async (err) => {
      await stop();
      reject(err);
    });
  });
}
