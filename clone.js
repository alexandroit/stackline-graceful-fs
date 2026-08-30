'use strict'

module.exports = clone

var getPrototypeOf = Object.getPrototypeOf || function (obj) {
  return obj.__proto__
}

// This starts with the clone algorithm shipped in graceful-fs 4.2.11.
// A mutable clone is needed when an ESM namespace is non-extensible or has
// non-configurable properties. The source object is never modified in that
// case.
function clone (obj) {
  var mutable = arguments[1]
  var includeSymbols = arguments[2]

  if (obj === null || typeof obj !== 'object')
    return obj

  var copy = Object.create(getPrototypeOf(obj))

  Object.getOwnPropertyNames(obj).forEach(function (key) {
    var descriptor = Object.getOwnPropertyDescriptor(obj, key)
    if (mutable) {
      descriptor.configurable = true
      if (Object.prototype.hasOwnProperty.call(descriptor, 'writable'))
        descriptor.writable = true
    }
    Object.defineProperty(copy, key, descriptor)
  })

  if (includeSymbols && typeof Object.getOwnPropertySymbols === 'function') {
    Object.getOwnPropertySymbols(obj).forEach(function (key) {
      var descriptor = Object.getOwnPropertyDescriptor(obj, key)
      if (mutable) {
        descriptor.configurable = true
        if (Object.prototype.hasOwnProperty.call(descriptor, 'writable'))
          descriptor.writable = true
      }
      Object.defineProperty(copy, key, descriptor)
    })
  }

  return copy
}
