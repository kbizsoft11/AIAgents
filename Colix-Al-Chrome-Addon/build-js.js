const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const sourceRoot = path.resolve(__dirname, 'src');
const outputRoot = path.resolve(__dirname, 'dist');

function collectJavaScript(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const sourcePath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectJavaScript(sourcePath) : entry.name.endsWith('.js') ? [sourcePath] : [];
  });
}

async function build() {
  for (const sourcePath of collectJavaScript(sourceRoot)) {
    const relativePath = path.relative(sourceRoot, sourcePath);
    const outputPath = path.join(outputRoot, relativePath);
    const result = await minify(fs.readFileSync(sourcePath, 'utf8'), {
      compress: true,
      mangle: true,
      format: { comments: false },
    });
    if (!result.code) throw new Error(`Terser produced no output for ${relativePath}`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${result.code}\n`);
  }
  console.log(`Minified ${collectJavaScript(sourceRoot).length} JavaScript files with Terser.`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
