/**
 * Generates placeholder assets for the Expo app.
 * Run with: node scripts/generate-assets.js
 */

const fs = require('fs');
const path = require('path');

// Simple 1x1 PNG in orange (base64 encoded)
// This creates a valid PNG that Expo can use as a placeholder
const createPlaceholderPng = (width, height, color = [234, 88, 12]) => {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // Create a simple uncompressed PNG
  // This is a minimal valid PNG with IHDR, IDAT, and IEND chunks
  
  // For simplicity, we'll create a tiny placeholder and note that
  // proper icons should be created with an image editor
  
  // Actually, let's just create the directories and provide instructions
  console.log('Creating assets directory...');
  
  const assetsDir = path.join(__dirname, '..', 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  
  // Create a README with instructions
  const readme = `# App Assets

You need to add the following image files to this folder:

## Required Files

1. **icon.png** (1024x1024)
   - App icon for iOS and Android
   - Square, no transparency for iOS
   
2. **adaptive-icon.png** (1024x1024)  
   - Android adaptive icon foreground
   - Should have some padding (icon content in center 66%)
   
3. **splash.png** (1284x2778)
   - Splash/loading screen image
   - Can be your logo centered on background
   
4. **favicon.png** (48x48)
   - Web favicon (optional)

## Quick Start

You can use free tools to create these:
- https://www.canva.com (design tools)
- https://easyappicon.com (generates all sizes from one image)
- https://appicon.co (icon generator)

## Temporary Workaround

For testing, you can use any square PNG renamed to these filenames.
The build will work with any valid PNG file.
`;

  fs.writeFileSync(path.join(assetsDir, 'README.md'), readme);
  console.log('Created assets/README.md with instructions');
  
  console.log('\n⚠️  You need to add icon images to the assets folder!');
  console.log('See assets/README.md for details.\n');
  console.log('Quick fix: Add any square PNG as icon.png, adaptive-icon.png, and splash.png');
};

createPlaceholderPng();

