'use strict'

const nativeFs = require('node:fs')

function cloneFs (overrides) {
  const copy = Object.create(Object.getPrototypeOf(nativeFs))

  for (const key of Reflect.ownKeys(nativeFs)) {
    const descriptor = Object.getOwnPropertyDescriptor(nativeFs, key)
    descriptor.configurable = true
    if (Object.prototype.hasOwnProperty.call(descriptor, 'writable'))
      descriptor.writable = true
    Object.defineProperty(copy, key, descriptor)
  }

  for (const [key, value] of Object.entries(overrides || {})) {
    Object.defineProperty(copy, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true
    })
  }

  return copy
}

function errorWithCode (code) {
  return Object.assign(new Error(`synthetic ${code}`), { code })
}

function callbackResult (invoke) {
  return new Promise((resolve, reject) => {
    invoke((err, value) => {
      if (err)
        reject(err)
      else
        resolve(value)
    })
  })
}

function delay (milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

module.exports = {
  callbackResult,
  cloneFs,
  delay,
  errorWithCode
}
