const sharp = require('sharp');
const path = require('path');

async function generateIcons() {
  const input = path.join(__dirname, 'public', 'eden-logo.png');
  const out192 = path.join(__dirname, 'public', 'icon-192.png');
  const out512 = path.join(__dirname, 'public', 'icon-512.png');

  try {
    await sharp(input)
      .resize(192, 192, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent padding
      })
      .toFile(out192);

    await sharp(input)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .toFile(out512);

    console.log('Icons generated successfully.');
  } catch (err) {
    console.error('Error generating icons:', err);
  }
}

generateIcons();
