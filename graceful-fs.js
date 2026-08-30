'use strict'

var coreFs = require('fs')
var polyfills = require('./polyfills.js')
var clone = require('./clone.js')
var util = require('util')

var gracefulQueue = typeof Symbol === 'function' && typeof Symbol.for === 'function'
  ? Symbol.for('graceful-fs.queue')
  : '___graceful-fs.queue'
var previousSymbol = typeof Symbol === 'function' && typeof Symbol.for === 'function'
  ? Symbol.for('graceful-fs.previous')
  : '___graceful-fs.previous'

function noop () {}

var debug = util.debuglog ? util.debuglog('gfs4') : noop

function readPublishedQueue (context) {
  try {
    return context && context[gracefulQueue]
  } catch (_) {
    return undefined
  }
}

var sharedQueue = readPublishedQueue(global) || readPublishedQueue(coreFs) || []

function publishQueue (context, queue) {
  if (!context || readPublishedQueue(context) === queue)
    return true

  try {
    Object.defineProperty(context, gracefulQueue, {
      get: function () {
        return queue
      },
      enumerable: false,
      configurable: false
    })
    return true
  } catch (_) {
    // ESM module namespaces and some embedded fs facades are intentionally
    // non-extensible. The process-wide queue remains available on global.
    return false
  }
}

publishQueue(global, sharedQueue)
publishQueue(coreFs, sharedQueue)

installCloseHooks(coreFs)

module.exports = patch(clone(coreFs))

if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !coreFs.__patched) {
  module.exports = patch(coreFs)
  coreFs.__patched = true
}

function installCloseHooks (fs) {
  if (!fs || typeof fs.close !== 'function' || typeof fs.closeSync !== 'function')
    return

  if (fs.close[previousSymbol] ||
      !canReplace(fs, 'close') || !canReplace(fs, 'closeSync'))
    return

  var fs$close = fs.close
  var fs$closeSync = fs.closeSync

  function close (fd, cb) {
    return fs$close.call(fs, fd, function (err) {
      if (!err)
        resetQueue()
      if (typeof cb === 'function')
        cb.apply(this, arguments)
    })
  }

  Object.defineProperty(close, previousSymbol, { value: fs$close })

  function closeSync (_fd) {
    var result = fs$closeSync.apply(fs, arguments)
    resetQueue()
    return result
  }

  Object.defineProperty(closeSync, previousSymbol, { value: fs$closeSync })

  try {
    fs.close = close
    fs.closeSync = closeSync
  } catch (_) {}
}

function canReplace (target, key) {
  if (!target)
    return false
  var descriptor = Object.getOwnPropertyDescriptor(target, key)
  return Object.isExtensible(target) && (!descriptor || descriptor.writable || descriptor.configurable)
}

function needsMutableClone (fs) {
  if (!fs || !Object.isExtensible(fs))
    return true

  var patchedKeys = [
    'ReadStream', 'WriteStream', 'FileReadStream', 'FileWriteStream',
    'readFile', 'writeFile', 'appendFile', 'copyFile', 'readdir', 'open',
    'createReadStream', 'createWriteStream'
  ]
  var redefinedKeys = {
    ReadStream: true,
    WriteStream: true,
    FileReadStream: true,
    FileWriteStream: true
  }

  for (var i = 0; i < patchedKeys.length; i++) {
    var key = patchedKeys[i]
    var descriptor = Object.getOwnPropertyDescriptor(fs, key)
    if (descriptor && !descriptor.configurable &&
        (redefinedKeys[key] || !descriptor.writable))
      return true
  }

  return false
}

function patch (target) {
  var fs = needsMutableClone(target) ? clone(target, true, true) : target

  installCloseHooks(fs)
  polyfills(fs)
  fs.gracefulify = patch

  var fs$readFile = fs.readFile
  fs.readFile = function readFile (path, options, cb) {
    if (typeof options === 'function') {
      cb = options
      options = null
    }
    return attempt(
      fs$readFile,
      fs,
      [path, options],
      cb,
      undefined,
      typeof path !== 'number'
    )
  }

  var fs$writeFile = fs.writeFile
  fs.writeFile = function writeFile (path, data, options, cb) {
    if (typeof options === 'function') {
      cb = options
      options = null
    }
    return attempt(
      fs$writeFile,
      fs,
      [path, data, options],
      cb,
      undefined,
      typeof path !== 'number' && !usesAppendFlag(options)
    )
  }

  var fs$appendFile = fs.appendFile
  if (fs$appendFile) {
    fs.appendFile = function appendFile (path, data, options, cb) {
      if (typeof options === 'function') {
        cb = options
        options = null
      }
      // A callback-level EAGAIN does not prove that an append had no partial
      // side effect. Retrying blindly can duplicate bytes, so only descriptor
      // exhaustion is queued for append operations.
      return attempt(fs$appendFile, fs, [path, data, options], cb, undefined, false)
    }
  }

  var fs$copyFile = fs.copyFile
  if (fs$copyFile) {
    fs.copyFile = function copyFile (src, dest, flags, cb) {
      if (typeof flags === 'function') {
        cb = flags
        flags = 0
      }
      return attempt(fs$copyFile, fs, [src, dest, flags], cb, undefined, true)
    }
  }

  var fs$readdir = fs.readdir
  fs.readdir = function readdir (path, options, cb) {
    if (typeof options === 'function') {
      cb = options
      options = null
    }

    return attempt(fs$readdir, fs, [path, options], function (err, files) {
      if (files && typeof files.sort === 'function')
        files.sort()
      if (typeof cb === 'function')
        cb.call(this, err, files)
    }, undefined, true)
  }

  var fs$open = fs.open
  fs.open = function open (path, flags, mode, cb) {
    if (typeof mode === 'function') {
      cb = mode
      mode = null
    }
    return attempt(fs$open, fs, [path, flags, mode], cb, undefined, true)
  }

  installStreams(fs)
  return fs
}

function attempt (operation, receiver, args, callback, startTime, retryEagain) {
  var started = startTime || Date.now()

  return operation.apply(receiver, args.concat(function (err) {
    if (isRetryable(err, retryEagain)) {
      // Keep the exact five-slot array wire format used by 4.2.11. Older and
      // newer installed copies share this queue and may consume each other's
      // records. Object records make the older retry loop crash.
      var entry = [
        function retryOperation (queuedCallback, retryStartTime) {
          return attempt(
            operation,
            receiver,
            args,
            queuedCallback,
            retryStartTime,
            retryEagain
          )
        },
        [callback],
        err,
        started,
        Date.now()
      ]
      if (err.code === 'EAGAIN')
        enqueueEagain(entry)
      else
        enqueue(entry)
      return
    }

    if (typeof callback === 'function')
      callback.apply(this, arguments)
  }))
}

function isRetryable (err, retryEagain) {
  return !!err && (
    err.code === 'EMFILE' ||
    err.code === 'ENFILE' ||
    (retryEagain && err.code === 'EAGAIN')
  )
}

function usesAppendFlag (options) {
  if (!options || typeof options !== 'object')
    return false
  if (typeof options.flag === 'string')
    return options.flag.indexOf('a') !== -1
  return typeof options.flag === 'number' &&
    (options.flag & coreFs.constants.O_APPEND) === coreFs.constants.O_APPEND
}


function installStreams (fs) {
  var NativeReadStream = fs.ReadStream
  var NativeWriteStream = fs.WriteStream

  if (typeof NativeReadStream === 'function') {
    function ReadStream (path, options) {
      return new NativeReadStream(path, withStreamFs(options, fs))
    }
    ReadStream.prototype = NativeReadStream.prototype
    if (Object.setPrototypeOf)
      Object.setPrototypeOf(ReadStream, NativeReadStream)
    defineStream(fs, 'ReadStream', ReadStream)
    defineStream(fs, 'FileReadStream', ReadStream)
  }

  if (typeof NativeWriteStream === 'function') {
    function WriteStream (path, options) {
      return new NativeWriteStream(path, withStreamFs(options, fs))
    }
    WriteStream.prototype = NativeWriteStream.prototype
    if (Object.setPrototypeOf)
      Object.setPrototypeOf(WriteStream, NativeWriteStream)
    defineStream(fs, 'WriteStream', WriteStream)
    defineStream(fs, 'FileWriteStream', WriteStream)
  }

  fs.createReadStream = function createReadStream (path, options) {
    return new fs.ReadStream(path, options)
  }

  fs.createWriteStream = function createWriteStream (path, options) {
    return new fs.WriteStream(path, options)
  }
}

function defineStream (fs, key, value) {
  Object.defineProperty(fs, key, {
    get: function () {
      return value
    },
    set: function (next) {
      value = next
    },
    enumerable: true,
    configurable: true
  })
}

function withStreamFs (options, fs) {
  if (options !== undefined && options !== null &&
      typeof options !== 'object' && typeof options !== 'string')
    return options

  var copy = typeof options === 'string'
    ? { encoding: options }
    : Object.create(options || null)

  if (!copy.fs) {
    Object.defineProperty(copy, 'fs', {
      value: fs,
      writable: true,
      enumerable: true,
      configurable: true
    })
  }
  return copy
}

function enqueue (entry) {
  debug('ENQUEUE', entry[0] && entry[0].name, entry[1])
  sharedQueue.push(entry)
  scheduleRetry(0)
}

// EAGAIN is not descriptor pressure. It intentionally uses a module-local
// queue so a 4.2.11 close wrapper cannot reset its absolute deadline, and so
// older copies never consume a record whose policy they do not understand.
var eagainQueue = []

function enqueueEagain (entry) {
  debug('ENQUEUE EAGAIN', entry[0] && entry[0].name, entry[1])
  eagainQueue.push(entry)
  scheduleEagainRetry(0)
}

var retryTimer
var eagainRetryTimer

function scheduleRetry (delay) {
  if (retryTimer !== undefined)
    return
  retryTimer = setTimeout(function () {
    retryTimer = undefined
    retry()
  }, delay)
}

function scheduleEagainRetry (delay) {
  if (eagainRetryTimer !== undefined)
    return
  eagainRetryTimer = setTimeout(function () {
    eagainRetryTimer = undefined
    retryEagain()
  }, delay)
}

function resetQueue () {
  var now = Date.now()
  for (var i = 0; i < sharedQueue.length; i++) {
    var entry = sharedQueue[i]
    if (Array.isArray(entry) && entry.length >= 5 &&
        typeof entry[3] === 'number' && typeof entry[4] === 'number') {
      entry[3] = now
      entry[4] = now
    }
  }
  if (retryTimer !== undefined) {
    clearTimeout(retryTimer)
    retryTimer = undefined
  }
  scheduleRetry(0)
}

function retry () {
  retryQueue(sharedQueue, scheduleRetry)
}

function retryEagain () {
  retryQueue(eagainQueue, scheduleEagainRetry)
}

function retryQueue (queue, schedule) {
  if (queue.length === 0)
    return

  var entry = queue.shift()
  if (!Array.isArray(entry) || typeof entry[0] !== 'function') {
    if (queue.length > 0)
      schedule(0)
    return
  }

  var operation = entry[0]
  var args = entry[1] || []
  var error = entry[2]
  var startTime = entry[3]
  var lastTime = entry[4]

  var now = Date.now()

  if (startTime === undefined) {
    debug('RETRY', operation.name, args)
    operation.apply(null, args)
  } else if (now - startTime >= 60000) {
    debug('TIMEOUT', operation.name, args)
    var callback = args[args.length - 1]
    if (typeof callback === 'function')
      callback.call(null, error)
  } else {
    var sinceAttempt = now - lastTime
    var sinceStart = Math.max(lastTime - startTime, 1)
    var desiredDelay = Math.min(sinceStart * 1.2, 100)

    if (sinceAttempt >= desiredDelay) {
      debug('RETRY', operation.name, args)
      operation.apply(null, args.concat([startTime]))
    } else {
      queue.unshift(entry)
      schedule(Math.ceil(desiredDelay - sinceAttempt))
      return
    }
  }

  if (queue.length > 0)
    schedule(0)
}
