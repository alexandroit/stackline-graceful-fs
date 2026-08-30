import gracefulFs = require('@stackline/graceful-fs')
import * as fsNamespace from 'fs'

const patched = gracefulFs.gracefulify(fsNamespace)
patched.readFile('file.txt', (error, data) => {
  if (error) throw error
  data.byteLength
})

const stream: import('fs').WriteStream = gracefulFs.createWriteStream('out.txt')
stream.end('typed')

gracefulFs.promises.readFile('file.txt').then(buffer => buffer.byteLength)
