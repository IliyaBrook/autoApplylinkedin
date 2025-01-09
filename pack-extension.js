const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');

// List of files and folders to ignore
const ignoreList = [
	'.idea',
	'node_modules',
	'.gitignore',
	'.git',
	'README.md',
	'LICENSE',
	'yarn.lock',
	'extension.crx',
	'pack-extension.js',
	'update.xml',
	'build',
];

const srcDir = path.resolve('.'); // Source directory (project root)
const buildDir = path.resolve('.'); // Build directory
const zipFile = path.resolve(buildDir, 'extension.zip'); // Path to the resulting .zip file

async function packExtension() {
	try {
		// Clear the build directory
		if (fs.existsSync(buildDir)) {
			await fs.emptyDir(buildDir);
		} else {
			await fs.mkdir(buildDir);
		}
		
		console.log('Copying files...');
		// Copy all files to the build directory, excluding ignored ones
		await fs.copy(srcDir, buildDir, {
			filter: (src) => {
				const relativePath = path.relative(srcDir, src);
				const fullPath = path.resolve(src);
				
				// Exclude the build directory and other ignored items
				return (
					fullPath !== buildDir &&
					!ignoreList.some((pattern) => relativePath === pattern || relativePath.startsWith(`${pattern}${path.sep}`))
				);
			},
		});
		
		// Create the .zip file
		console.log('Creating .zip file...');
		const output = fs.createWriteStream(zipFile);
		const archive = archiver('zip', {
			zlib: { level: 9 },
		});
		
		// Log when the .zip file is successfully created
		output.on('close', () => {
			console.log(`.zip file created: ${zipFile} (${archive.pointer()} bytes)`);
		});
		
		// Handle errors during archiving
		archive.on('error', (err) => {
			throw err;
		});
		
		// Pipe archive data to the output file
		archive.pipe(output);
		
		// Add all files in the build directory to the .zip archive
		archive.directory(buildDir, false);
		await archive.finalize();
	} catch (err) {
		console.error('Error during packaging:', err);
	}
}

packExtension();
