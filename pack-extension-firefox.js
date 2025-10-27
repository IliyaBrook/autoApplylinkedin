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
	'update.xml',
	'build',
	'cheatsheet',
	'tests'
];

const srcDir = path.resolve('.');
const buildDir = path.resolve('./build');
const firefoxTempDir = path.resolve(buildDir, 'firefox_temp');
const zipFile = path.resolve(buildDir, 'autoApplylinkedin_firefox.zip');

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
	console.log('Modifying manifest.json for Firefox...');
	
	const manifest = fs.readJsonSync(manifestPath);
	
	if (manifest.background) {
		manifest.background = {
			service_worker: manifest.background.service_worker || 'background.js',
			scripts: [manifest.background.service_worker || 'background.js']
		};
		delete manifest.background.type;
	}
	
	if (manifest.content_scripts && Array.isArray(manifest.content_scripts)) {
		manifest.content_scripts.forEach(script => {
			if (script.js && Array.isArray(script.js)) {
				// Добавить browser-polyfill.js в начало, если его ещё нет
				if (!script.js.includes('browser-polyfill.js')) {
					script.js.unshift('browser-polyfill.js');
				}
			}
		});
	}
	
	if (!manifest.browser_specific_settings) {
		manifest.browser_specific_settings = {
			gecko: {
				id: 'easyapply@linkedin.extension',
				strict_min_version: '128.0'
			},
			gecko_android: {
				strict_min_version: '128.0'
			}
		};
	}
	
	fs.writeJsonSync(manifestPath, manifest, { spaces: 2 });
	console.log('✓ manifest.json modified for Firefox');
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
		
		console.log('Creating Firefox .zip file...');
		const output = fs.createWriteStream(zipFile);
		const archive = archiver('zip', {
			zlib: { level: 9 },
		});
		
		output.on('close', () => {
			console.log(`✓ Firefox .zip file created: ${zipFile} (${archive.pointer()} bytes)`);
			console.log('\n🎉 Firefox Android extension is ready!');
			console.log(`📦 Location: ${zipFile}`);
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