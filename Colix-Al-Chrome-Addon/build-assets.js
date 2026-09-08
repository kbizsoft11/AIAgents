const fs = require('fs');
const path = require('path');
const { minify: minifyHtml } = require('html-minifier-terser');
const CleanCSS = require('clean-css');

const sourceRoot = path.resolve(__dirname, 'src');
const outputRoot = path.resolve(__dirname, 'dist');

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const sourcePath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(sourcePath) : [sourcePath];
  });
}

async function build() {
  let assetCount = 0;

  for (const sourcePath of collectFiles(sourceRoot)) {
    if (sourcePath.endsWith('.js')) continue;

    const relativePath = path.relative(sourceRoot, sourcePath);
    const outputPath = path.join(outputRoot, relativePath);
    const extension = path.extname(sourcePath).toLowerCase();
    let output;

    if (extension === '.html') {
      output = await minifyHtml(fs.readFileSync(sourcePath, 'utf8'), {
        collapseWhitespace: true,
        removeComments: true,
      });
    } else if (extension === '.css') {
      output = new CleanCSS().minify(fs.readFileSync(sourcePath, 'utf8')).styles;
    } else {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.copyFileSync(sourcePath, outputPath);
      assetCount += 1;
      continue;
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${output}\n`);
    assetCount += 1;
  }

  console.log(`Built ${assetCount} HTML, CSS, and static assets.`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
