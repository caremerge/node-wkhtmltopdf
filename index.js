var spawn = require('child_process').spawn;
var slang = require('slang');
var _ = require('underscore');

function quote(val) {
  // escape and quote the value if it is a string and this isn't windows
  if (typeof val === 'string' && process.platform !== 'win32')
    val = '"' + val.replace(/(["\\$`])/g, '\\$1') + '"';
    
  return val;
}

function wkhtmltopdf(input, options, callback) {
  if (!options) {
    options = {};
  } else if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  
  var output = options.output;
  delete options.output;
    
  // make sure the special keys are last
  var args = [wkhtmltopdf.command, '--quiet'];

  if (options.rawArgs && options.rawArgs.length) {
    options.rawArgs.forEach(function(arg) {
      args.push(quote(arg));
    });
  }
  else {
    var extraKeys = [];
    var keys = Object.keys(options).filter(function(key) {
      if (key === 'toc' || key === 'cover' || key === 'page') {
        extraKeys.push(key);
        return false;
      }
      
      return true;
    }).concat(extraKeys);

    // make sure toc specific args appear after toc arg
    if(_.find(keys, function(key){return key === 'toc'})) {
      var tocArgs = ['disableDottedLines', 'tocHeaderText', 'tocLevelIndentation', 'disableTocLinks', 'tocTextSizeShrink', 'xslStyleSheet'];
      var myTocArgs = [];
      keys = keys.filter(function(key){
        if(_.find(tocArgs, function(tkey){ return tkey === key })) {
          myTocArgs.push(key);
          return false;
        }
        return true;
      });
      var spliceArgs = [keys.indexOf('toc')+1, 0].concat(myTocArgs);
      Array.prototype.splice.apply(keys, spliceArgs);
    }
    
    keys.forEach(function(key) {
      var val = options[key];
      if (key === 'ignore') { // skip adding the ignore key
        return false;
      }
          
      if (key !== 'toc' && key !== 'cover' && key !== 'page') {
        key = key.length === 1 ? '-' + key : '--' + slang.dasherize(key);
      }
      
      if (val !== false) {
        args.push(key);
      }
        
      if (Array.isArray(val)) {
        val.forEach(function(valPart) {
          args.push(quote(valPart));
        });
      } else if (typeof val !== 'boolean') {
        args.push(quote(val));
      }
    });
    var isUrl = /^(https?|file):\/\//.test(input);
    args.push(isUrl ? quote(input) : '-');    // stdin if HTML given directly
    args.push(output ? quote(output) : '-');  // stdout if no output file  
  } 
  if (process.platform === 'win32') {
    var child = spawn(args[0], args.slice(1));
  } else {
    // this nasty business prevents piping problems on linux
    var child = spawn('/bin/sh', ['-c', args.join(' ') + ' | cat']);
  }
  
  // call the callback with null error when the process exits successfully
  if (callback) {
    child.on('exit', function() { callback(null); });
  }
    
  // setup error handling
  var stream = child.stdout;
  function handleError(err) {
    // check ignore warnings array before killing child
    if (options.ignore && options.ignore instanceof Array) {
      var ignoreError = false;
      options.ignore.forEach(function(opt) {
        if (typeof opt === 'string' && opt === err.message) {
          ignoreError = true;
        }
        if (opt instanceof RegExp && err.message.match(opt)) {
          ignoreError = true;
        }
      });
      if (ignoreError) {
        return true;
      }
    }
    child.removeAllListeners('exit');
    child.kill();
    
    // call the callback if there is one
    if (callback) {
      callback(err);
    }
      
    // if not, or there are listeners for errors, emit the error event
    if (!callback || stream.listeners('error').length > 0) {
      stream.emit('error', err);
    }
  }
  
  child.once('error', handleError);
  child.stderr.once('data', function(err) {
    handleError(new Error((err || '').toString().trim()));
  });
  
  // write input to stdin if it isn't a url
  if (!isUrl) {
    child.stdin.end(input);
  }
  
  // return stdout stream so we can pipe
  if (callback) {
    return callback(null, stream);
  } else {
    return stream;
  }
}

wkhtmltopdf.command = 'wkhtmltopdf';
module.exports = wkhtmltopdf;
module.exports.render = wkhtmltopdf;
