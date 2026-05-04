const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');

const ignoreList = [
	'.idea',
	'node_modules',
	'.gitignore',
	'.git',
	'README.md',
	'LICENSE',
	'yarn.lock',
	'extension.crx',
	'privacy_policy.md',
	'pack-extension.js',
	'pack-extension-firefox.js',
	'pack-extension-firefox-mobile.js',
	'update.xml',
	'build',
	'cheatsheet',
	'tests',
	'.yarnrc.yml',
	'package.json'
];

const srcDir = path.resolve('.');
const buildDir = path.resolve('./build');
const firefoxTempDir = path.resolve(buildDir, 'firefox_desktop_temp');
const xpiFile = path.resolve(buildDir, 'autoApplylinkedin_firefox.xpi');

async function copyPolyfill() {
	const srcPolyfill = path.join(srcDir, 'browser-polyfill.js');
	const destPolyfill = path.join(firefoxTempDir, 'browser-polyfill.js');
	
	if (!fs.existsSync(srcPolyfill)) {
		throw new Error('browser-polyfill.js not found! Please download it from https://unpkg.com/webextension-polyfill@latest/dist/browser-polyfill.min.js');
	}
	
	console.log('Copying browser-polyfill.js...');
	await fs.copy(srcPolyfill, destPolyfill);
	console.log('✓ browser-polyfill.js copied');
}

function modifyManifestForFirefox(manifestPath) {
	console.log('Modifying manifest.json for Firefox Desktop...');
	
	const manifest = fs.readJsonSync(manifestPath);
	
	// Firefox Desktop требует использования scripts вместо service_worker
	if (manifest.background) {
		const backgroundScript = manifest.background.service_worker || 'background.js';
		manifest.background = {
			scripts: [backgroundScript]
		};
	}
	
	// Добавляем browser-polyfill.js в content_scripts
	if (manifest.content_scripts && Array.isArray(manifest.content_scripts)) {
		manifest.content_scripts.forEach(script => {
			if (script.js && Array.isArray(script.js)) {
				if (!script.js.includes('browser-polyfill.js')) {
					script.js.unshift('browser-polyfill.js');
				}
			}
		});
	}
	
	// Добавляем обязательный блок browser_specific_settings для Firefox
	if (!manifest.browser_specific_settings) {
		manifest.browser_specific_settings = {
			gecko: {
				id: 'easyapply@linkedin.extension',
				strict_min_version: '109.0'
			}
		};
	}
	
	fs.writeJsonSync(manifestPath, manifest, { spaces: 2 });
	console.log('✓ manifest.json modified for Firefox Desktop');
}

async function createBackgroundWrapper() {
	console.log('Creating background wrapper for Firefox compatibility...');
	
	const wrapperPath = path.join(firefoxTempDir, 'background-wrapper.js');
	const originalBackgroundPath = path.join(firefoxTempDir, 'background.js');
	const backgroundOriginalName = 'background-original.js';
	const backgroundOriginalPath = path.join(firefoxTempDir, backgroundOriginalName);
	
	await fs.move(originalBackgroundPath, backgroundOriginalPath);
	
	const wrapperContent = `// Firefox compatibility wrapper
if (typeof browser === "undefined") {
	var browser = chrome;
}

importScripts('${backgroundOriginalName}');
`;
	
	await fs.writeFile(wrapperPath, wrapperContent);
	await fs.move(wrapperPath, originalBackgroundPath);
	
	console.log('✓ Background wrapper created');
}

async function copyFiles() {
	console.log('Copying files to temporary directory...');
	
	if (fs.existsSync(firefoxTempDir)) {
		await fs.remove(firefoxTempDir);
	}
	
	await fs.ensureDir(firefoxTempDir);
	
	const files = await fs.readdir(srcDir);
	
	for (const file of files) {
		const fullPath = path.join(srcDir, file);
		const relativePath = path.relative(srcDir, fullPath);
		
		if (
			!ignoreList.some(
				(pattern) =>
					relativePath === pattern || relativePath.startsWith(`${pattern}${path.sep}`)
			)
		) {
			const destPath = path.join(firefoxTempDir, file);
			await fs.copy(fullPath, destPath);
		}
	}
	
	console.log('✓ Files copied');
}

async function packExtension() {
	try {
		if (!fs.existsSync(buildDir)) {
			await fs.mkdir(buildDir);
		}
		
		await copyFiles();
		
		await copyPolyfill();
		
		// Изменить manifest.json
		const manifestPath = path.join(firefoxTempDir, 'manifest.json');
		modifyManifestForFirefox(manifestPath);
		
		// Создать wrapper для background script
		await createBackgroundWrapper();
		
		console.log('Creating Firefox .xpi file...');
		const output = fs.createWriteStream(xpiFile);
		const archive = archiver('zip', {
			zlib: { level: 9 },
		});
		
		output.on('close', () => {
			console.log(`✓ Firefox .xpi file created: ${xpiFile} (${archive.pointer()} bytes)`);
			console.log('\n🎉 Firefox Desktop extension is ready!');
			console.log(`📦 Location: ${xpiFile}`);
			console.log('\nInstallation instructions:');
			console.log('1. Open Firefox');
			console.log('2. Go to about:addons');
			console.log('3. Click the gear icon and select "Install Add-on From File..."');
			console.log('4. Select the .xpi file');
		});
		
		archive.on('error', (err) => {
			throw err;
		});
		
		archive.pipe(output);
		
		archive.directory(firefoxTempDir, false);
		
		await archive.finalize();
		
		console.log('Cleaning up temporary files...');
		await fs.remove(firefoxTempDir);
		console.log('✓ Cleanup complete');
		
	} catch (err) {
		console.error('❌ Error during packaging:', err);
		
		if (fs.existsSync(firefoxTempDir)) {
			await fs.remove(firefoxTempDir);
		}
	}
}

packExtension();