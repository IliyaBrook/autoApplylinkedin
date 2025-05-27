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
	'update.xml',
	'build',
	'cheatsheet',
	'tests'
];

const srcDir = path.resolve('.');
const buildDir = path.resolve('./build');
const zipFile = path.resolve(buildDir, 'autoApplylinkedin.zip');

async function packExtension() {
	try {
		if (!fs.existsSync(buildDir)) {
			await fs.mkdir(buildDir);
		}
		console.log('Creating .zip file...');
		const output = fs.createWriteStream(zipFile);
		const archive = archiver('zip', {
			zlib: { level: 9 },
		});
		
		output.on('close', () => {
			console.log(`.zip file created: ${zipFile} (${archive.pointer()} bytes)`);
		});
		
		archive.on('error', (err) => {
			throw err;
		});
		
		archive.pipe(output);
		
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
				const stats = await fs.stat(fullPath);
				if (stats.isFile()) {
					archive.file(fullPath, { name: file });
				} else if (stats.isDirectory()) {
					archive.directory(fullPath, file);
				}
			}
		}
		
		await archive.finalize();
	} catch (err) {
		console.error('Error during packaging:', err);
	}
}

packExtension();
