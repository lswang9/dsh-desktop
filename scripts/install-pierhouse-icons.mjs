import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const assetsRoot = path.join(
  process.env.USERPROFILE ?? '',
  '.cursor',
  'projects',
  'c-Users-10521-Desktop-dev-dsh-desktop',
  'assets'
)
const buildDirectory = path.join(projectRoot, 'build')
const docsImages = path.join(projectRoot, 'docs', 'images')

const sourceIcon = path.join(assetsRoot, 'pierhouse-app-icon.png')
const sourceLogoLight = path.join(assetsRoot, 'pierhouse-logo-light.png')
const sourceLogoDark = path.join(assetsRoot, 'pierhouse-logo-dark.png')

await mkdir(buildDirectory, { recursive: true })
await mkdir(docsImages, { recursive: true })

const appIcon = path.join(buildDirectory, 'app-icon.png')
await sharp(sourceIcon)
  .resize(1024, 1024, { fit: 'cover' })
  .png()
  .toFile(appIcon)

await sharp(appIcon).resize(512, 512).png().toFile(path.join(buildDirectory, 'icon.png'))
await copyFile(appIcon, path.join(docsImages, 'readme-logo-black-v020.png'))

// Sidebar wordmarks: trim near-white/near-black canvas edges and keep alpha.
async function prepareWordmark(source, destination, { invertLuma = false } = {}) {
  let pipeline = sharp(source).ensureAlpha()
  if (invertLuma) {
    pipeline = pipeline.negate({ alpha: false })
  }
  // Normalize to a wide mark used by install-brand-assets / sidebar.
  await pipeline
    .resize(1030, 590, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(destination)
}

await prepareWordmark(sourceLogoLight, path.join(buildDirectory, 'logo-light.png'))
await prepareWordmark(sourceLogoDark, path.join(buildDirectory, 'logo-dark.png'))

const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const icoImages = []
for (const size of icoSizes) {
  icoImages.push(await sharp(appIcon).resize(size, size).png().toBuffer())
}

const header = Buffer.alloc(6 + icoImages.length * 16)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(icoImages.length, 4)

let offset = header.length
for (let index = 0; index < icoImages.length; index += 1) {
  const size = icoSizes[index]
  const entry = 6 + index * 16
  header.writeUInt8(size === 256 ? 0 : size, entry)
  header.writeUInt8(size === 256 ? 0 : size, entry + 1)
  header.writeUInt8(0, entry + 2)
  header.writeUInt8(0, entry + 3)
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(icoImages[index].length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += icoImages[index].length
}

await writeFile(path.join(buildDirectory, 'icon.ico'), Buffer.concat([header, ...icoImages]))

// Keep a macOS placeholder note: icns still needs macOS iconutil; Windows builds use .ico.
console.log('Installed Pierhouse icons:', {
  appIcon: path.relative(projectRoot, appIcon),
  iconPng: 'build/icon.png',
  iconIco: 'build/icon.ico',
  logoLight: 'build/logo-light.png',
  logoDark: 'build/logo-dark.png'
})
