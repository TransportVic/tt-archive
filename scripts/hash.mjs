import { createReadStream } from 'fs'
import { createHash } from 'crypto'

export default function checksumFile(hashName, path) {
  return new Promise((resolve, reject) => {
    const hash = createHash(hashName)
    const stream = createReadStream(path)
    stream.on('error', err => reject(err))
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export function hashName(hashName, name) {
  const hash = createHash(hashName)
  hash.update(name)
  return hash.digest('hex')
}