import fs from 'fs/promises'
import path from 'path'
import url from 'url'
import { exec } from 'child_process'
import checksumFile, { hashName } from './hash.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const indexTemplate = (await fs.readFile(path.join(__dirname, 'index.html'))).toString()
const rowTemplate = (await fs.readFile(path.join(__dirname, 'row.html'))).toString()

let buildNumber = await new Promise(resolve => {
  exec('git describe --always', {
    cwd: __dirname
  }, (err, stdout, stderr) => {
    resolve(stdout.toString().trim())
  })
})

const publicPath = path.join(__dirname, '..', 'public')
const assetsPath = path.join(publicPath, 'assets')

try {
  await fs.rm(publicPath, {
    recursive: true
  })
} catch (e) { }

await fs.mkdir(publicPath)
await fs.mkdir(assetsPath)

async function walkDir(dir) {
  async function walk(dir) {
    let results = []
    let list = await fs.readdir(dir)

    for (let file of list) {
      let filePath = path.resolve(dir, file)
      let stat = await fs.stat(filePath)
      results.push({ dir, file, path: filePath, isDir: stat.isDirectory() })

      if (stat.isDirectory()) {
        results.push(...await walk(filePath))
      }
    }

    return results
  }

  return (await walk(dir)).map(file => {
    file.dir = file.dir.replace(dir, '').slice(1)
    return file
  })
}

let bannedFolders = [
  '.git', 'scripts', 'public', 'node_modules'
]

let files = (await walkDir(path.join(__dirname, '..'))).filter(file => {
  if (bannedFolders.some(dir => file.dir.startsWith(dir))) return false
  if (bannedFolders.includes(file.file)) return false

  if (file.file === '.gitignore') return false
  if (file.file === '.DS_Store') return false
  if (file.file.endsWith('.mjs')) return false
  if (file.file.endsWith('.json')) return false
  
  return true
})

let dirs = ['/']

for (let file of files) {
  let dirName = file.dir.length ? '/' + file.dir + '/' + file.file : '/' + file.file
  if (file.isDir && !dirs.includes(dirName)) {
    dirs.push(dirName)

    if (dirName === '/fonts') continue
    await fs.mkdir(path.join(publicPath, dirName))
  }
  file.dir = '/' + file.dir
}

function getSize(size) {
  if (size < 1000) return `${size.toFixed(1)} B`
  size /= 1000
  if (size < 1000) return `${size.toFixed(1)} KB`
  size /= 1000
  if (size < 1000) return `${size.toFixed(1)} MB`
}

for (let dir of dirs) {
  let subfiles = files.filter(file => file.dir === dir)
  let outputRows = []

  for (let file of subfiles) {
    let hash = file.isDir ? null : await checksumFile('sha1', file.path)
    let fileExtension = '.' + file.file.split('.').pop()
    let assetName = file.isDir ? null : hash + fileExtension

    let dirName = file.dir.length > 1 ? file.dir + '/' + file.file : '/' + file.file
    let filePath = file.isDir ? dirName : '/assets/' + assetName
    
    if (filePath === '/fonts') continue

    let stat = await fs.stat(file.path)
    let size = stat.size
    outputRows.push(
      rowTemplate.replaceAll('{0}', filePath)
      .replaceAll('{1}', file.file)
      .replaceAll('{2}', file.isDir ? '' : getSize(size))
    )

    if (!file.isDir) await fs.copyFile(file.path, path.join(assetsPath, assetName))
  }

  if (dir === '/fonts') continue

  await fs.writeFile(
    path.join(publicPath, dir, 'index.html'),
    indexTemplate.replaceAll('{0}', dir).replaceAll('{1}', outputRows.join(''))
    .replaceAll('{2}', buildNumber).replace(/^.*<!-- .+ -->$\n/gm, '')
  )
}

const staticAssetPath = path.join(__dirname, 'assets')

await fs.copyFile(path.join(staticAssetPath, '404.html'), path.join(publicPath, '404.html'))
await fs.copyFile(path.join(staticAssetPath, 'style.css'), path.join(publicPath, 'style.css'))

process.exit(0)