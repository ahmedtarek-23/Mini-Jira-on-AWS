import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import esbuild from 'esbuild'
import archiver from 'archiver'

const lambdas = ['image-resize', 'assignment-worker', 'daily-digest', 'post-confirmation']
const outDir = path.resolve('dist/lambdas')

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

function createZip(sourceDir: string, zipPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', () => resolve())
    archive.on('error', (err) => reject(err))
    archive.pipe(output)
    archive.directory(sourceDir, false)
    archive.finalize()
  })
}

async function main() {
  for (const name of lambdas) {
    const entry = path.resolve(`src/lambdas/${name}.ts`)
    const bundleDir = path.join(outDir, name)
    if (fs.existsSync(bundleDir)) fs.rmSync(bundleDir, { recursive: true })
    fs.mkdirSync(bundleDir, { recursive: true })

    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      target: 'node20',
      outfile: path.join(bundleDir, 'index.js'),
      format: 'esm',
      packages: 'external',
    })

    if (name === 'image-resize') {
      fs.writeFileSync(
        path.join(bundleDir, 'package.json'),
        JSON.stringify({ type: 'module', dependencies: { sharp: '^0.34.5' } }, null, 2)
      )
      execSync('npm install --arch=x64 --platform=linux --libc=glibc sharp@0.34.5', {
        cwd: bundleDir,
        stdio: 'inherit',
      })
    } else {
      fs.writeFileSync(path.join(bundleDir, 'package.json'), JSON.stringify({ type: 'module' }, null, 2))
    }

    const zipPath = path.join(outDir, `${name}.zip`)
    await createZip(bundleDir, zipPath)
    console.log(`Built ${name} -> ${zipPath}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
