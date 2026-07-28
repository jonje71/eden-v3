import QRCode from 'qrcode';

export async function generateQrDataUrl(serialNumber) {
  try {
    const payload = JSON.stringify({
      app: 'EDEN_v3',
      serial: serialNumber,
      timestamp: Date.now()
    });
    return await QRCode.toDataURL(payload, {
      margin: 1,
      color: {
        dark: '#080e1a',
        light: '#ffffff'
      },
      width: 240
    });
  } catch (err) {
    console.error('QR Generation failed:', err);
    return null;
  }
}
