import fs from 'fs';
import pkg from './package.json' assert { type: 'json' };

const manifest = JSON.parse(fs.readFileSync('./manifest.json', 'utf8').replace(/\/\/.*$/gm, ''));

manifest.name = pkg.friendlyName;
manifest.version = pkg.version;
manifest.description = pkg.description;
manifest.author = pkg.author;

// Handle matches in content_scripts and web_accessible_resources
manifest.content_scripts?.forEach(cs => cs.matches = pkg.matches);
manifest.web_accessible_resources?.forEach(war => war.matches = pkg.matches);

fs.writeFileSync('./dist/extension/manifest.json', JSON.stringify(manifest, null, 2));
console.log('Successfully generated dist/extension/manifest.json from package.json');
