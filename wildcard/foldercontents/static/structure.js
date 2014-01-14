(function () {
/**
 * almond 0.2.7 Copyright (c) 2011-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);

                name = baseParts.concat(name.split("/"));

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        config = cfg;
        if (config.deps) {
            req(config.deps, config.callback);
        }
        return req;
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("node_modules/almond/almond.js", function(){});

define('mockup-registry',[
  "jquery"
], function($, undefined) {

  var Registry = {

    patterns: {},

    warn: function warn(msg) {
      if (window.DEBUG) {
        console.warn(msg);
      }
    },

    getOptions: function($el, patternName, options) {
      options = options || {};

      // get options from parent element first, stop if element tag name is 'body'
      if ($el.length !== 0 && !$.nodeName($el[0], 'body')) {
        options = Registry.getOptions($el.parent(), patternName, options);
      }

      // collect all options from element
      var elOptions = {};
      if ($el.length !== 0) {
        elOptions = $el.data('pat-' + patternName);
        if (elOptions) {
          // parse options if string
          if (typeof(elOptions) === 'string') {
            var tmpOptions = {};
            $.each(elOptions.split(';'), function(i, item) {
              item = item.split(':');
              if (item.length >= 1) {
                item.reverse();
                var key = item.pop();
                key = key.replace(/^\s+|\s+$/g, '');  // trim
                item.reverse();
                var value = item.join(':');
                value = value.replace(/^\s+|\s+$/g, '');  // trim
                tmpOptions[key] = value;
              }
            });
            elOptions = tmpOptions;
          }
        }
      }

      return $.extend(true, {}, options, elOptions);
    },

    init: function($el, patternName, options) {
      var pattern = $el.data('pattern-' + patternName);
      if (pattern === undefined && Registry.patterns[patternName]) {
        if (window.DEBUG) {
          pattern = new Registry.patterns[patternName]($el,
              Registry.getOptions($el, patternName, options));
        } else {
          try {
            pattern = new Registry.patterns[patternName]($el,
                Registry.getOptions($el, patternName, options));
          } catch (e) {
            Registry.warn(
                'Failed while initializing "' + patternName + '" pattern.');
          }
        }
        $el.data('pattern-' + patternName, pattern);
      }
      return pattern;
    },

    scan: function(content) {
      var $content = $(content),
          patterns = [];

      patterns = $.merge(patterns, $content.filter('[class*="pat-"]'));
      patterns = $.merge(patterns, $('[class*="pat-"]', $content));

      $.each(patterns, function(i, $el) {
        $el = $($el);
        $.each($el.attr('class').split(' '), function(j, className) {
          if (className.indexOf('pat-') === 0) {
              Registry.init($el, className.substr(4));
          }
        });
      });
    },

    register: function(Pattern) {

      // require name
      if (!Pattern.prototype.name) {
        Registry.warn("Pattern didn't specified a name.");
        return false;
      }

      // automatically create jquery plugin from pattern
      if (Pattern.prototype.jqueryPlugin === undefined) {
        Pattern.prototype.jqueryPlugin = "pattern" +
            Pattern.prototype.name.charAt(0).toUpperCase() +
            Pattern.prototype.name.slice(1);
      }

      $.fn[Pattern.prototype.jqueryPlugin] = function(method, options) {
        $(this).each(function() {
          if (typeof method === "object") {
            options = method;
            method = undefined;
          }
          var $el = $(this),
              pattern = Registry.init($el, Pattern.prototype.name, options);

          if (method) {
            if (pattern[method] === undefined) {
              Registry.warn('Method "' + method + '" does not exists.');
              return false;
            }
            if (method.charAt(0) === '_') {
              Registry.warn('Method "' + method + '" is private.');
              return false;
            }
            pattern[method].apply(pattern, [options]);
          }
        });
        return this;
      };

      Registry.patterns[Pattern.prototype.name] = Pattern;
    }

  };

  return Registry;
});

// Patterns
//
// Author: Rok Garbas
// Contact: rok@garbas.si
// Version: 1.0
// Depends: jquery.js
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('mockup-patterns-base',[
  'jquery',
  'mockup-registry'
], function($, Registry) {
  

  // Base Pattern
  var Base = function($el, options) {
    this.$el = $el;
    this.options = $.extend(true, {}, this.defaults || {}, options || {});
    if (this.options.__returnDefaults !== true) {
      this.init();
      this.trigger('init');
    }
  };
  Base.prototype = {
    constructor: Base,
    on: function(eventName, eventCallback) {
      this.$el.on(eventName + '.' + this.name + '.patterns', eventCallback);
    },
    trigger: function(eventName, args) {
      /* args should be a list */
      if(args === undefined){
        args = [];
      }
      try{
        args.splice(0, 0, this);
      }catch(e){
        // let's not fail here but do our best to pass the args even
        // if it's trigger incorrectly
        args = [this];
      }
      this.$el.trigger(eventName + '.' + this.name + '.patterns', args);
    }
  };
  Base.extend = function(NewPattern) {
    var Base = this, Constructor;

    if (NewPattern && NewPattern.hasOwnProperty('constructor')) {
      Constructor = NewPattern.constructor;
    } else {
      Constructor = function() { Base.apply(this, arguments); };
    }

    var Surrogate = function() { this.constructor = Constructor; };
    Surrogate.prototype = Base.prototype;
    Constructor.prototype = new Surrogate();
    Constructor.extend = Base.extend;

    $.extend(true, Constructor.prototype, NewPattern);

    Constructor.__super__ = Base.prototype;

    Registry.register(Constructor);

    return Constructor;
  };

  return Base;
});

//     Underscore.js 1.5.1
//     http://underscorejs.org
//     (c) 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var
    push             = ArrayProto.push,
    slice            = ArrayProto.slice,
    concat           = ArrayProto.concat,
    toString         = ObjProto.toString,
    hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.5.1';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, l = obj.length; i < l; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      for (var key in obj) {
        if (_.has(obj, key)) {
          if (iterator.call(context, obj[key], key, obj) === breaker) return;
        }
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results.push(iterator.call(context, value, index, list));
    });
    return results;
  };

  var reduceError = 'Reduce of empty array with no initial value';

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    return _.filter(obj, function(value, index, list) {
      return !iterator.call(context, value, index, list);
    }, context);
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    if (obj == null) return false;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    return any(obj, function(value) {
      return value === target;
    });
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      return (isFunc ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs, first) {
    if (_.isEmpty(attrs)) return first ? void 0 : [];
    return _[first ? 'find' : 'filter'](obj, function(value) {
      for (var key in attrs) {
        if (attrs[key] !== value[key]) return false;
      }
      return true;
    });
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.where(obj, attrs, true);
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See [WebKit Bug 80797](https://bugs.webkit.org/show_bug.cgi?id=80797)
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity, value: -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed > result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity, value: Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array.
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    return _.isFunction(value) ? value : function(obj){ return obj[value]; };
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, value, context) {
    var iterator = lookupIterator(value);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value : value,
        index : index,
        criteria : iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index < right.index ? -1 : 1;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(obj, value, context, behavior) {
    var result = {};
    var iterator = lookupIterator(value == null ? _.identity : value);
    each(obj, function(value, index) {
      var key = iterator.call(context, value, index, obj);
      behavior(result, key, value);
    });
    return result;
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = function(obj, value, context) {
    return group(obj, value, context, function(result, key, value) {
      (_.has(result, key) ? result[key] : (result[key] = [])).push(value);
    });
  };

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = function(obj, value, context) {
    return group(obj, value, context, function(result, key) {
      if (!_.has(result, key)) result[key] = 0;
      result[key]++;
    });
  };

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = iterator == null ? _.identity : lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely create a real, live array from anything iterable.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (obj.length === +obj.length) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    return (n != null) && !guard ? slice.call(array, 0, n) : array[0];
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n != null) && !guard) {
      return slice.call(array, Math.max(array.length - n, 0));
    } else {
      return array[array.length - 1];
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    if (shallow && _.every(input, _.isArray)) {
      return concat.apply(output, input);
    }
    each(input, function(value) {
      if (_.isArray(value) || _.isArguments(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Return a completely flattened version of an array.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    if (_.isFunction(isSorted)) {
      context = iterator;
      iterator = isSorted;
      isSorted = false;
    }
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var length = _.max(_.pluck(arguments, "length").concat(0));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(arguments, '' + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    if (list == null) return {};
    var result = {};
    for (var i = 0, l = list.length; i < l; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, l = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, l + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < l; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var len = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(len);

    while(idx < len) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    var args, bound;
    if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      ctor.prototype = null;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context.
  _.partial = function(func) {
    var args = slice.call(arguments, 1);
    return function() {
      return func.apply(this, args.concat(slice.call(arguments)));
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length === 0) throw new Error("bindAll must be passed function names");
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    options || (options = {});
    var later = function() {
      previous = options.leading === false ? 0 : new Date;
      timeout = null;
      result = func.apply(context, args);
    };
    return function() {
      var now = new Date;
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var result;
    var timeout = null;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) result = func.apply(context, args);
      };
      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) result = func.apply(context, args);
      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func];
      push.apply(args, arguments);
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys.push(key);
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var values = [];
    for (var key in obj) if (_.has(obj, key)) values.push(obj[key]);
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var pairs = [];
    for (var key in obj) if (_.has(obj, key)) pairs.push([key, obj[key]]);
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    for (var key in obj) if (_.has(obj, key)) result[obj[key]] = key;
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          if (obj[prop] === void 0) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Objects with different constructors are not equivalent, but `Object`s
    // from different frames are.
    var aCtor = a.constructor, bCtor = b.constructor;
    if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                             _.isFunction(bCtor) && (bCtor instanceof bCtor))) {
      return false;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    var accum = Array(Math.max(0, n));
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named `property` is a function then invoke it with the
  // `object` as context; otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return void 0;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name){
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    var render;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      }
      if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      }
      if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }
      index = offset + match.length;
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

}).call(this);

define("underscore", (function (global) {
    return function () {
        var ret, fn;
        return ret || global.window._;
    };
}(this)));

// backdrop pattern.
//
// Author: Rok Garbas
// Contact: rok@garbas.si
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('mockup-patterns-backdrop',[
  'jquery',
  'mockup-patterns-base'
], function($, Base) {
  

  var Backdrop = Base.extend({
    name: "backdrop",
    defaults: {
      zIndex: null,
      opacity: "0.8",
      className: "backdrop",
      classActiveName: 'backdrop-active',
      closeOnEsc: true,
      closeOnClick: true
    },
    init: function() {
      var self = this;
      self.$backdrop = $('> .' + self.options.className, self.$el);
      if (self.$backdrop.size() === 0) {
        self.$backdrop = $('<div/>')
            .hide()
            .appendTo(self.$el)
            .addClass(self.options.className);
        if (self.options.zIndex !== null) {
          self.$backdrop.css('z-index', self.options.zIndex);
        }
      }
      if (self.options.closeOnEsc === true) {
        $(document).on('keydown', function(e, data) {
          if (self.$el.is('.' + self.options.classActiveName)) {
            if (e.keyCode === 27) {  // ESC key pressed
              self.hide();
            }
          }
        });
      }
      if (self.options.closeOnClick === true) {
        self.$backdrop.on('click', function() {
          if (self.$el.is('.' + self.options.classActiveName)) {
            self.hide();
          }
        });
      }
    },
    show: function() {
      var self = this;
      if (!self.$el.hasClass(self.options.classActiveName)) {
        self.trigger('show');
        self.$backdrop.css('opacity', '0').show();
        self.$el.addClass(self.options.classActiveName);
        self.$backdrop.animate({ opacity: self.options.opacity }, 500);
        self.trigger('shown');
      }
    },
    hide: function() {
      var self = this;
      if (self.$el.hasClass(self.options.classActiveName)) {
        self.trigger('hide');
        self.$backdrop.animate({ opacity: '0' }, 500).hide();
        self.$el.removeClass(self.options.classActiveName);
        self.trigger('hidden');
      }
    }
  });

  return Backdrop;

});

//     Backbone.js 1.0.0

//     (c) 2010-2013 Jeremy Ashkenas, DocumentCloud Inc.
//     Backbone may be freely distributed under the MIT license.
//     For all details and documentation:
//     http://backbonejs.org

(function(){

  // Initial Setup
  // -------------

  // Save a reference to the global object (`window` in the browser, `exports`
  // on the server).
  var root = this;

  // Save the previous value of the `Backbone` variable, so that it can be
  // restored later on, if `noConflict` is used.
  var previousBackbone = root.Backbone;

  // Create local references to array methods we'll want to use later.
  var array = [];
  var push = array.push;
  var slice = array.slice;
  var splice = array.splice;

  // The top-level namespace. All public Backbone classes and modules will
  // be attached to this. Exported for both the browser and the server.
  var Backbone;
  if (typeof exports !== 'undefined') {
    Backbone = exports;
  } else {
    Backbone = root.Backbone = {};
  }

  // Current version of the library. Keep in sync with `package.json`.
  Backbone.VERSION = '1.0.0';

  // Require Underscore, if we're on the server, and it's not already present.
  var _ = root._;
  if (!_ && (typeof require !== 'undefined')) _ = require('underscore');

  // For Backbone's purposes, jQuery, Zepto, Ender, or My Library (kidding) owns
  // the `$` variable.
  Backbone.$ = root.jQuery || root.Zepto || root.ender || root.$;

  // Runs Backbone.js in *noConflict* mode, returning the `Backbone` variable
  // to its previous owner. Returns a reference to this Backbone object.
  Backbone.noConflict = function() {
    root.Backbone = previousBackbone;
    return this;
  };

  // Turn on `emulateHTTP` to support legacy HTTP servers. Setting this option
  // will fake `"PUT"` and `"DELETE"` requests via the `_method` parameter and
  // set a `X-Http-Method-Override` header.
  Backbone.emulateHTTP = false;

  // Turn on `emulateJSON` to support legacy servers that can't deal with direct
  // `application/json` requests ... will encode the body as
  // `application/x-www-form-urlencoded` instead and will send the model in a
  // form param named `model`.
  Backbone.emulateJSON = false;

  // Backbone.Events
  // ---------------

  // A module that can be mixed in to *any object* in order to provide it with
  // custom events. You may bind with `on` or remove with `off` callback
  // functions to an event; `trigger`-ing an event fires all callbacks in
  // succession.
  //
  //     var object = {};
  //     _.extend(object, Backbone.Events);
  //     object.on('expand', function(){ alert('expanded'); });
  //     object.trigger('expand');
  //
  var Events = Backbone.Events = {

    // Bind an event to a `callback` function. Passing `"all"` will bind
    // the callback to all events fired.
    on: function(name, callback, context) {
      if (!eventsApi(this, 'on', name, [callback, context]) || !callback) return this;
      this._events || (this._events = {});
      var events = this._events[name] || (this._events[name] = []);
      events.push({callback: callback, context: context, ctx: context || this});
      return this;
    },

    // Bind an event to only be triggered a single time. After the first time
    // the callback is invoked, it will be removed.
    once: function(name, callback, context) {
      if (!eventsApi(this, 'once', name, [callback, context]) || !callback) return this;
      var self = this;
      var once = _.once(function() {
        self.off(name, once);
        callback.apply(this, arguments);
      });
      once._callback = callback;
      return this.on(name, once, context);
    },

    // Remove one or many callbacks. If `context` is null, removes all
    // callbacks with that function. If `callback` is null, removes all
    // callbacks for the event. If `name` is null, removes all bound
    // callbacks for all events.
    off: function(name, callback, context) {
      var retain, ev, events, names, i, l, j, k;
      if (!this._events || !eventsApi(this, 'off', name, [callback, context])) return this;
      if (!name && !callback && !context) {
        this._events = {};
        return this;
      }

      names = name ? [name] : _.keys(this._events);
      for (i = 0, l = names.length; i < l; i++) {
        name = names[i];
        if (events = this._events[name]) {
          this._events[name] = retain = [];
          if (callback || context) {
            for (j = 0, k = events.length; j < k; j++) {
              ev = events[j];
              if ((callback && callback !== ev.callback && callback !== ev.callback._callback) ||
                  (context && context !== ev.context)) {
                retain.push(ev);
              }
            }
          }
          if (!retain.length) delete this._events[name];
        }
      }

      return this;
    },

    // Trigger one or many events, firing all bound callbacks. Callbacks are
    // passed the same arguments as `trigger` is, apart from the event name
    // (unless you're listening on `"all"`, which will cause your callback to
    // receive the true name of the event as the first argument).
    trigger: function(name) {
      if (!this._events) return this;
      var args = slice.call(arguments, 1);
      if (!eventsApi(this, 'trigger', name, args)) return this;
      var events = this._events[name];
      var allEvents = this._events.all;
      if (events) triggerEvents(events, args);
      if (allEvents) triggerEvents(allEvents, arguments);
      return this;
    },

    // Tell this object to stop listening to either specific events ... or
    // to every object it's currently listening to.
    stopListening: function(obj, name, callback) {
      var listeners = this._listeners;
      if (!listeners) return this;
      var deleteListener = !name && !callback;
      if (typeof name === 'object') callback = this;
      if (obj) (listeners = {})[obj._listenerId] = obj;
      for (var id in listeners) {
        listeners[id].off(name, callback, this);
        if (deleteListener) delete this._listeners[id];
      }
      return this;
    }

  };

  // Regular expression used to split event strings.
  var eventSplitter = /\s+/;

  // Implement fancy features of the Events API such as multiple event
  // names `"change blur"` and jQuery-style event maps `{change: action}`
  // in terms of the existing API.
  var eventsApi = function(obj, action, name, rest) {
    if (!name) return true;

    // Handle event maps.
    if (typeof name === 'object') {
      for (var key in name) {
        obj[action].apply(obj, [key, name[key]].concat(rest));
      }
      return false;
    }

    // Handle space separated event names.
    if (eventSplitter.test(name)) {
      var names = name.split(eventSplitter);
      for (var i = 0, l = names.length; i < l; i++) {
        obj[action].apply(obj, [names[i]].concat(rest));
      }
      return false;
    }

    return true;
  };

  // A difficult-to-believe, but optimized internal dispatch function for
  // triggering events. Tries to keep the usual cases speedy (most internal
  // Backbone events have 3 arguments).
  var triggerEvents = function(events, args) {
    var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2];
    switch (args.length) {
      case 0: while (++i < l) (ev = events[i]).callback.call(ev.ctx); return;
      case 1: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1); return;
      case 2: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2); return;
      case 3: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); return;
      default: while (++i < l) (ev = events[i]).callback.apply(ev.ctx, args);
    }
  };

  var listenMethods = {listenTo: 'on', listenToOnce: 'once'};

  // Inversion-of-control versions of `on` and `once`. Tell *this* object to
  // listen to an event in another object ... keeping track of what it's
  // listening to.
  _.each(listenMethods, function(implementation, method) {
    Events[method] = function(obj, name, callback) {
      var listeners = this._listeners || (this._listeners = {});
      var id = obj._listenerId || (obj._listenerId = _.uniqueId('l'));
      listeners[id] = obj;
      if (typeof name === 'object') callback = this;
      obj[implementation](name, callback, this);
      return this;
    };
  });

  // Aliases for backwards compatibility.
  Events.bind   = Events.on;
  Events.unbind = Events.off;

  // Allow the `Backbone` object to serve as a global event bus, for folks who
  // want global "pubsub" in a convenient place.
  _.extend(Backbone, Events);

  // Backbone.Model
  // --------------

  // Backbone **Models** are the basic data object in the framework --
  // frequently representing a row in a table in a database on your server.
  // A discrete chunk of data and a bunch of useful, related methods for
  // performing computations and transformations on that data.

  // Create a new model with the specified attributes. A client id (`cid`)
  // is automatically generated and assigned for you.
  var Model = Backbone.Model = function(attributes, options) {
    var defaults;
    var attrs = attributes || {};
    options || (options = {});
    this.cid = _.uniqueId('c');
    this.attributes = {};
    _.extend(this, _.pick(options, modelOptions));
    if (options.parse) attrs = this.parse(attrs, options) || {};
    if (defaults = _.result(this, 'defaults')) {
      attrs = _.defaults({}, attrs, defaults);
    }
    this.set(attrs, options);
    this.changed = {};
    this.initialize.apply(this, arguments);
  };

  // A list of options to be attached directly to the model, if provided.
  var modelOptions = ['url', 'urlRoot', 'collection'];

  // Attach all inheritable methods to the Model prototype.
  _.extend(Model.prototype, Events, {

    // A hash of attributes whose current and previous value differ.
    changed: null,

    // The value returned during the last failed validation.
    validationError: null,

    // The default name for the JSON `id` attribute is `"id"`. MongoDB and
    // CouchDB users may want to set this to `"_id"`.
    idAttribute: 'id',

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // Return a copy of the model's `attributes` object.
    toJSON: function(options) {
      return _.clone(this.attributes);
    },

    // Proxy `Backbone.sync` by default -- but override this if you need
    // custom syncing semantics for *this* particular model.
    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    // Get the value of an attribute.
    get: function(attr) {
      return this.attributes[attr];
    },

    // Get the HTML-escaped value of an attribute.
    escape: function(attr) {
      return _.escape(this.get(attr));
    },

    // Returns `true` if the attribute contains a value that is not null
    // or undefined.
    has: function(attr) {
      return this.get(attr) != null;
    },

    // Set a hash of model attributes on the object, firing `"change"`. This is
    // the core primitive operation of a model, updating the data and notifying
    // anyone who needs to know about the change in state. The heart of the beast.
    set: function(key, val, options) {
      var attr, attrs, unset, changes, silent, changing, prev, current;
      if (key == null) return this;

      // Handle both `"key", value` and `{key: value}` -style arguments.
      if (typeof key === 'object') {
        attrs = key;
        options = val;
      } else {
        (attrs = {})[key] = val;
      }

      options || (options = {});

      // Run validation.
      if (!this._validate(attrs, options)) return false;

      // Extract attributes and options.
      unset           = options.unset;
      silent          = options.silent;
      changes         = [];
      changing        = this._changing;
      this._changing  = true;

      if (!changing) {
        this._previousAttributes = _.clone(this.attributes);
        this.changed = {};
      }
      current = this.attributes, prev = this._previousAttributes;

      // Check for changes of `id`.
      if (this.idAttribute in attrs) this.id = attrs[this.idAttribute];

      // For each `set` attribute, update or delete the current value.
      for (attr in attrs) {
        val = attrs[attr];
        if (!_.isEqual(current[attr], val)) changes.push(attr);
        if (!_.isEqual(prev[attr], val)) {
          this.changed[attr] = val;
        } else {
          delete this.changed[attr];
        }
        unset ? delete current[attr] : current[attr] = val;
      }

      // Trigger all relevant attribute changes.
      if (!silent) {
        if (changes.length) this._pending = true;
        for (var i = 0, l = changes.length; i < l; i++) {
          this.trigger('change:' + changes[i], this, current[changes[i]], options);
        }
      }

      // You might be wondering why there's a `while` loop here. Changes can
      // be recursively nested within `"change"` events.
      if (changing) return this;
      if (!silent) {
        while (this._pending) {
          this._pending = false;
          this.trigger('change', this, options);
        }
      }
      this._pending = false;
      this._changing = false;
      return this;
    },

    // Remove an attribute from the model, firing `"change"`. `unset` is a noop
    // if the attribute doesn't exist.
    unset: function(attr, options) {
      return this.set(attr, void 0, _.extend({}, options, {unset: true}));
    },

    // Clear all attributes on the model, firing `"change"`.
    clear: function(options) {
      var attrs = {};
      for (var key in this.attributes) attrs[key] = void 0;
      return this.set(attrs, _.extend({}, options, {unset: true}));
    },

    // Determine if the model has changed since the last `"change"` event.
    // If you specify an attribute name, determine if that attribute has changed.
    hasChanged: function(attr) {
      if (attr == null) return !_.isEmpty(this.changed);
      return _.has(this.changed, attr);
    },

    // Return an object containing all the attributes that have changed, or
    // false if there are no changed attributes. Useful for determining what
    // parts of a view need to be updated and/or what attributes need to be
    // persisted to the server. Unset attributes will be set to undefined.
    // You can also pass an attributes object to diff against the model,
    // determining if there *would be* a change.
    changedAttributes: function(diff) {
      if (!diff) return this.hasChanged() ? _.clone(this.changed) : false;
      var val, changed = false;
      var old = this._changing ? this._previousAttributes : this.attributes;
      for (var attr in diff) {
        if (_.isEqual(old[attr], (val = diff[attr]))) continue;
        (changed || (changed = {}))[attr] = val;
      }
      return changed;
    },

    // Get the previous value of an attribute, recorded at the time the last
    // `"change"` event was fired.
    previous: function(attr) {
      if (attr == null || !this._previousAttributes) return null;
      return this._previousAttributes[attr];
    },

    // Get all of the attributes of the model at the time of the previous
    // `"change"` event.
    previousAttributes: function() {
      return _.clone(this._previousAttributes);
    },

    // Fetch the model from the server. If the server's representation of the
    // model differs from its current attributes, they will be overridden,
    // triggering a `"change"` event.
    fetch: function(options) {
      options = options ? _.clone(options) : {};
      if (options.parse === void 0) options.parse = true;
      var model = this;
      var success = options.success;
      options.success = function(resp) {
        if (!model.set(model.parse(resp, options), options)) return false;
        if (success) success(model, resp, options);
        model.trigger('sync', model, resp, options);
      };
      wrapError(this, options);
      return this.sync('read', this, options);
    },

    // Set a hash of model attributes, and sync the model to the server.
    // If the server returns an attributes hash that differs, the model's
    // state will be `set` again.
    save: function(key, val, options) {
      var attrs, method, xhr, attributes = this.attributes;

      // Handle both `"key", value` and `{key: value}` -style arguments.
      if (key == null || typeof key === 'object') {
        attrs = key;
        options = val;
      } else {
        (attrs = {})[key] = val;
      }

      // If we're not waiting and attributes exist, save acts as `set(attr).save(null, opts)`.
      if (attrs && (!options || !options.wait) && !this.set(attrs, options)) return false;

      options = _.extend({validate: true}, options);

      // Do not persist invalid models.
      if (!this._validate(attrs, options)) return false;

      // Set temporary attributes if `{wait: true}`.
      if (attrs && options.wait) {
        this.attributes = _.extend({}, attributes, attrs);
      }

      // After a successful server-side save, the client is (optionally)
      // updated with the server-side state.
      if (options.parse === void 0) options.parse = true;
      var model = this;
      var success = options.success;
      options.success = function(resp) {
        // Ensure attributes are restored during synchronous saves.
        model.attributes = attributes;
        var serverAttrs = model.parse(resp, options);
        if (options.wait) serverAttrs = _.extend(attrs || {}, serverAttrs);
        if (_.isObject(serverAttrs) && !model.set(serverAttrs, options)) {
          return false;
        }
        if (success) success(model, resp, options);
        model.trigger('sync', model, resp, options);
      };
      wrapError(this, options);

      method = this.isNew() ? 'create' : (options.patch ? 'patch' : 'update');
      if (method === 'patch') options.attrs = attrs;
      xhr = this.sync(method, this, options);

      // Restore attributes.
      if (attrs && options.wait) this.attributes = attributes;

      return xhr;
    },

    // Destroy this model on the server if it was already persisted.
    // Optimistically removes the model from its collection, if it has one.
    // If `wait: true` is passed, waits for the server to respond before removal.
    destroy: function(options) {
      options = options ? _.clone(options) : {};
      var model = this;
      var success = options.success;

      var destroy = function() {
        model.trigger('destroy', model, model.collection, options);
      };

      options.success = function(resp) {
        if (options.wait || model.isNew()) destroy();
        if (success) success(model, resp, options);
        if (!model.isNew()) model.trigger('sync', model, resp, options);
      };

      if (this.isNew()) {
        options.success();
        return false;
      }
      wrapError(this, options);

      var xhr = this.sync('delete', this, options);
      if (!options.wait) destroy();
      return xhr;
    },

    // Default URL for the model's representation on the server -- if you're
    // using Backbone's restful methods, override this to change the endpoint
    // that will be called.
    url: function() {
      var base = _.result(this, 'urlRoot') || _.result(this.collection, 'url') || urlError();
      if (this.isNew()) return base;
      return base + (base.charAt(base.length - 1) === '/' ? '' : '/') + encodeURIComponent(this.id);
    },

    // **parse** converts a response into the hash of attributes to be `set` on
    // the model. The default implementation is just to pass the response along.
    parse: function(resp, options) {
      return resp;
    },

    // Create a new model with identical attributes to this one.
    clone: function() {
      return new this.constructor(this.attributes);
    },

    // A model is new if it has never been saved to the server, and lacks an id.
    isNew: function() {
      return this.id == null;
    },

    // Check if the model is currently in a valid state.
    isValid: function(options) {
      return this._validate({}, _.extend(options || {}, { validate: true }));
    },

    // Run validation against the next complete set of model attributes,
    // returning `true` if all is well. Otherwise, fire an `"invalid"` event.
    _validate: function(attrs, options) {
      if (!options.validate || !this.validate) return true;
      attrs = _.extend({}, this.attributes, attrs);
      var error = this.validationError = this.validate(attrs, options) || null;
      if (!error) return true;
      this.trigger('invalid', this, error, _.extend(options || {}, {validationError: error}));
      return false;
    }

  });

  // Underscore methods that we want to implement on the Model.
  var modelMethods = ['keys', 'values', 'pairs', 'invert', 'pick', 'omit'];

  // Mix in each Underscore method as a proxy to `Model#attributes`.
  _.each(modelMethods, function(method) {
    Model.prototype[method] = function() {
      var args = slice.call(arguments);
      args.unshift(this.attributes);
      return _[method].apply(_, args);
    };
  });

  // Backbone.Collection
  // -------------------

  // If models tend to represent a single row of data, a Backbone Collection is
  // more analagous to a table full of data ... or a small slice or page of that
  // table, or a collection of rows that belong together for a particular reason
  // -- all of the messages in this particular folder, all of the documents
  // belonging to this particular author, and so on. Collections maintain
  // indexes of their models, both in order, and for lookup by `id`.

  // Create a new **Collection**, perhaps to contain a specific type of `model`.
  // If a `comparator` is specified, the Collection will maintain
  // its models in sort order, as they're added and removed.
  var Collection = Backbone.Collection = function(models, options) {
    options || (options = {});
    if (options.url) this.url = options.url;
    if (options.model) this.model = options.model;
    if (options.comparator !== void 0) this.comparator = options.comparator;
    this._reset();
    this.initialize.apply(this, arguments);
    if (models) this.reset(models, _.extend({silent: true}, options));
  };

  // Default options for `Collection#set`.
  var setOptions = {add: true, remove: true, merge: true};
  var addOptions = {add: true, merge: false, remove: false};

  // Define the Collection's inheritable methods.
  _.extend(Collection.prototype, Events, {

    // The default model for a collection is just a **Backbone.Model**.
    // This should be overridden in most cases.
    model: Model,

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // The JSON representation of a Collection is an array of the
    // models' attributes.
    toJSON: function(options) {
      return this.map(function(model){ return model.toJSON(options); });
    },

    // Proxy `Backbone.sync` by default.
    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    // Add a model, or list of models to the set.
    add: function(models, options) {
      return this.set(models, _.defaults(options || {}, addOptions));
    },

    // Remove a model, or a list of models from the set.
    remove: function(models, options) {
      models = _.isArray(models) ? models.slice() : [models];
      options || (options = {});
      var i, l, index, model;
      for (i = 0, l = models.length; i < l; i++) {
        model = this.get(models[i]);
        if (!model) continue;
        delete this._byId[model.id];
        delete this._byId[model.cid];
        index = this.indexOf(model);
        this.models.splice(index, 1);
        this.length--;
        if (!options.silent) {
          options.index = index;
          model.trigger('remove', model, this, options);
        }
        this._removeReference(model);
      }
      return this;
    },

    // Update a collection by `set`-ing a new list of models, adding new ones,
    // removing models that are no longer present, and merging models that
    // already exist in the collection, as necessary. Similar to **Model#set**,
    // the core operation for updating the data contained by the collection.
    set: function(models, options) {
      options = _.defaults(options || {}, setOptions);
      if (options.parse) models = this.parse(models, options);
      if (!_.isArray(models)) models = models ? [models] : [];
      var i, l, model, attrs, existing, sort;
      var at = options.at;
      var sortable = this.comparator && (at == null) && options.sort !== false;
      var sortAttr = _.isString(this.comparator) ? this.comparator : null;
      var toAdd = [], toRemove = [], modelMap = {};

      // Turn bare objects into model references, and prevent invalid models
      // from being added.
      for (i = 0, l = models.length; i < l; i++) {
        if (!(model = this._prepareModel(models[i], options))) continue;

        // If a duplicate is found, prevent it from being added and
        // optionally merge it into the existing model.
        if (existing = this.get(model)) {
          if (options.remove) modelMap[existing.cid] = true;
          if (options.merge) {
            existing.set(model.attributes, options);
            if (sortable && !sort && existing.hasChanged(sortAttr)) sort = true;
          }

        // This is a new model, push it to the `toAdd` list.
        } else if (options.add) {
          toAdd.push(model);

          // Listen to added models' events, and index models for lookup by
          // `id` and by `cid`.
          model.on('all', this._onModelEvent, this);
          this._byId[model.cid] = model;
          if (model.id != null) this._byId[model.id] = model;
        }
      }

      // Remove nonexistent models if appropriate.
      if (options.remove) {
        for (i = 0, l = this.length; i < l; ++i) {
          if (!modelMap[(model = this.models[i]).cid]) toRemove.push(model);
        }
        if (toRemove.length) this.remove(toRemove, options);
      }

      // See if sorting is needed, update `length` and splice in new models.
      if (toAdd.length) {
        if (sortable) sort = true;
        this.length += toAdd.length;
        if (at != null) {
          splice.apply(this.models, [at, 0].concat(toAdd));
        } else {
          push.apply(this.models, toAdd);
        }
      }

      // Silently sort the collection if appropriate.
      if (sort) this.sort({silent: true});

      if (options.silent) return this;

      // Trigger `add` events.
      for (i = 0, l = toAdd.length; i < l; i++) {
        (model = toAdd[i]).trigger('add', model, this, options);
      }

      // Trigger `sort` if the collection was sorted.
      if (sort) this.trigger('sort', this, options);
      return this;
    },

    // When you have more items than you want to add or remove individually,
    // you can reset the entire set with a new list of models, without firing
    // any granular `add` or `remove` events. Fires `reset` when finished.
    // Useful for bulk operations and optimizations.
    reset: function(models, options) {
      options || (options = {});
      for (var i = 0, l = this.models.length; i < l; i++) {
        this._removeReference(this.models[i]);
      }
      options.previousModels = this.models;
      this._reset();
      this.add(models, _.extend({silent: true}, options));
      if (!options.silent) this.trigger('reset', this, options);
      return this;
    },

    // Add a model to the end of the collection.
    push: function(model, options) {
      model = this._prepareModel(model, options);
      this.add(model, _.extend({at: this.length}, options));
      return model;
    },

    // Remove a model from the end of the collection.
    pop: function(options) {
      var model = this.at(this.length - 1);
      this.remove(model, options);
      return model;
    },

    // Add a model to the beginning of the collection.
    unshift: function(model, options) {
      model = this._prepareModel(model, options);
      this.add(model, _.extend({at: 0}, options));
      return model;
    },

    // Remove a model from the beginning of the collection.
    shift: function(options) {
      var model = this.at(0);
      this.remove(model, options);
      return model;
    },

    // Slice out a sub-array of models from the collection.
    slice: function(begin, end) {
      return this.models.slice(begin, end);
    },

    // Get a model from the set by id.
    get: function(obj) {
      if (obj == null) return void 0;
      return this._byId[obj.id != null ? obj.id : obj.cid || obj];
    },

    // Get the model at the given index.
    at: function(index) {
      return this.models[index];
    },

    // Return models with matching attributes. Useful for simple cases of
    // `filter`.
    where: function(attrs, first) {
      if (_.isEmpty(attrs)) return first ? void 0 : [];
      return this[first ? 'find' : 'filter'](function(model) {
        for (var key in attrs) {
          if (attrs[key] !== model.get(key)) return false;
        }
        return true;
      });
    },

    // Return the first model with matching attributes. Useful for simple cases
    // of `find`.
    findWhere: function(attrs) {
      return this.where(attrs, true);
    },

    // Force the collection to re-sort itself. You don't need to call this under
    // normal circumstances, as the set will maintain sort order as each item
    // is added.
    sort: function(options) {
      if (!this.comparator) throw new Error('Cannot sort a set without a comparator');
      options || (options = {});

      // Run sort based on type of `comparator`.
      if (_.isString(this.comparator) || this.comparator.length === 1) {
        this.models = this.sortBy(this.comparator, this);
      } else {
        this.models.sort(_.bind(this.comparator, this));
      }

      if (!options.silent) this.trigger('sort', this, options);
      return this;
    },

    // Figure out the smallest index at which a model should be inserted so as
    // to maintain order.
    sortedIndex: function(model, value, context) {
      value || (value = this.comparator);
      var iterator = _.isFunction(value) ? value : function(model) {
        return model.get(value);
      };
      return _.sortedIndex(this.models, model, iterator, context);
    },

    // Pluck an attribute from each model in the collection.
    pluck: function(attr) {
      return _.invoke(this.models, 'get', attr);
    },

    // Fetch the default set of models for this collection, resetting the
    // collection when they arrive. If `reset: true` is passed, the response
    // data will be passed through the `reset` method instead of `set`.
    fetch: function(options) {
      options = options ? _.clone(options) : {};
      if (options.parse === void 0) options.parse = true;
      var success = options.success;
      var collection = this;
      options.success = function(resp) {
        var method = options.reset ? 'reset' : 'set';
        collection[method](resp, options);
        if (success) success(collection, resp, options);
        collection.trigger('sync', collection, resp, options);
      };
      wrapError(this, options);
      return this.sync('read', this, options);
    },

    // Create a new instance of a model in this collection. Add the model to the
    // collection immediately, unless `wait: true` is passed, in which case we
    // wait for the server to agree.
    create: function(model, options) {
      options = options ? _.clone(options) : {};
      if (!(model = this._prepareModel(model, options))) return false;
      if (!options.wait) this.add(model, options);
      var collection = this;
      var success = options.success;
      options.success = function(resp) {
        if (options.wait) collection.add(model, options);
        if (success) success(model, resp, options);
      };
      model.save(null, options);
      return model;
    },

    // **parse** converts a response into a list of models to be added to the
    // collection. The default implementation is just to pass it through.
    parse: function(resp, options) {
      return resp;
    },

    // Create a new collection with an identical list of models as this one.
    clone: function() {
      return new this.constructor(this.models);
    },

    // Private method to reset all internal state. Called when the collection
    // is first initialized or reset.
    _reset: function() {
      this.length = 0;
      this.models = [];
      this._byId  = {};
    },

    // Prepare a hash of attributes (or other model) to be added to this
    // collection.
    _prepareModel: function(attrs, options) {
      if (attrs instanceof Model) {
        if (!attrs.collection) attrs.collection = this;
        return attrs;
      }
      options || (options = {});
      options.collection = this;
      var model = new this.model(attrs, options);
      if (!model._validate(attrs, options)) {
        this.trigger('invalid', this, attrs, options);
        return false;
      }
      return model;
    },

    // Internal method to sever a model's ties to a collection.
    _removeReference: function(model) {
      if (this === model.collection) delete model.collection;
      model.off('all', this._onModelEvent, this);
    },

    // Internal method called every time a model in the set fires an event.
    // Sets need to update their indexes when models change ids. All other
    // events simply proxy through. "add" and "remove" events that originate
    // in other collections are ignored.
    _onModelEvent: function(event, model, collection, options) {
      if ((event === 'add' || event === 'remove') && collection !== this) return;
      if (event === 'destroy') this.remove(model, options);
      if (model && event === 'change:' + model.idAttribute) {
        delete this._byId[model.previous(model.idAttribute)];
        if (model.id != null) this._byId[model.id] = model;
      }
      this.trigger.apply(this, arguments);
    }

  });

  // Underscore methods that we want to implement on the Collection.
  // 90% of the core usefulness of Backbone Collections is actually implemented
  // right here:
  var methods = ['forEach', 'each', 'map', 'collect', 'reduce', 'foldl',
    'inject', 'reduceRight', 'foldr', 'find', 'detect', 'filter', 'select',
    'reject', 'every', 'all', 'some', 'any', 'include', 'contains', 'invoke',
    'max', 'min', 'toArray', 'size', 'first', 'head', 'take', 'initial', 'rest',
    'tail', 'drop', 'last', 'without', 'indexOf', 'shuffle', 'lastIndexOf',
    'isEmpty', 'chain'];

  // Mix in each Underscore method as a proxy to `Collection#models`.
  _.each(methods, function(method) {
    Collection.prototype[method] = function() {
      var args = slice.call(arguments);
      args.unshift(this.models);
      return _[method].apply(_, args);
    };
  });

  // Underscore methods that take a property name as an argument.
  var attributeMethods = ['groupBy', 'countBy', 'sortBy'];

  // Use attributes instead of properties.
  _.each(attributeMethods, function(method) {
    Collection.prototype[method] = function(value, context) {
      var iterator = _.isFunction(value) ? value : function(model) {
        return model.get(value);
      };
      return _[method](this.models, iterator, context);
    };
  });

  // Backbone.View
  // -------------

  // Backbone Views are almost more convention than they are actual code. A View
  // is simply a JavaScript object that represents a logical chunk of UI in the
  // DOM. This might be a single item, an entire list, a sidebar or panel, or
  // even the surrounding frame which wraps your whole app. Defining a chunk of
  // UI as a **View** allows you to define your DOM events declaratively, without
  // having to worry about render order ... and makes it easy for the view to
  // react to specific changes in the state of your models.

  // Creating a Backbone.View creates its initial element outside of the DOM,
  // if an existing element is not provided...
  var View = Backbone.View = function(options) {
    this.cid = _.uniqueId('view');
    this._configure(options || {});
    this._ensureElement();
    this.initialize.apply(this, arguments);
    this.delegateEvents();
  };

  // Cached regex to split keys for `delegate`.
  var delegateEventSplitter = /^(\S+)\s*(.*)$/;

  // List of view options to be merged as properties.
  var viewOptions = ['model', 'collection', 'el', 'id', 'attributes', 'className', 'tagName', 'events'];

  // Set up all inheritable **Backbone.View** properties and methods.
  _.extend(View.prototype, Events, {

    // The default `tagName` of a View's element is `"div"`.
    tagName: 'div',

    // jQuery delegate for element lookup, scoped to DOM elements within the
    // current view. This should be prefered to global lookups where possible.
    $: function(selector) {
      return this.$el.find(selector);
    },

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // **render** is the core function that your view should override, in order
    // to populate its element (`this.el`), with the appropriate HTML. The
    // convention is for **render** to always return `this`.
    render: function() {
      return this;
    },

    // Remove this view by taking the element out of the DOM, and removing any
    // applicable Backbone.Events listeners.
    remove: function() {
      this.$el.remove();
      this.stopListening();
      return this;
    },

    // Change the view's element (`this.el` property), including event
    // re-delegation.
    setElement: function(element, delegate) {
      if (this.$el) this.undelegateEvents();
      this.$el = element instanceof Backbone.$ ? element : Backbone.$(element);
      this.el = this.$el[0];
      if (delegate !== false) this.delegateEvents();
      return this;
    },

    // Set callbacks, where `this.events` is a hash of
    //
    // *{"event selector": "callback"}*
    //
    //     {
    //       'mousedown .title':  'edit',
    //       'click .button':     'save'
    //       'click .open':       function(e) { ... }
    //     }
    //
    // pairs. Callbacks will be bound to the view, with `this` set properly.
    // Uses event delegation for efficiency.
    // Omitting the selector binds the event to `this.el`.
    // This only works for delegate-able events: not `focus`, `blur`, and
    // not `change`, `submit`, and `reset` in Internet Explorer.
    delegateEvents: function(events) {
      if (!(events || (events = _.result(this, 'events')))) return this;
      this.undelegateEvents();
      for (var key in events) {
        var method = events[key];
        if (!_.isFunction(method)) method = this[events[key]];
        if (!method) continue;

        var match = key.match(delegateEventSplitter);
        var eventName = match[1], selector = match[2];
        method = _.bind(method, this);
        eventName += '.delegateEvents' + this.cid;
        if (selector === '') {
          this.$el.on(eventName, method);
        } else {
          this.$el.on(eventName, selector, method);
        }
      }
      return this;
    },

    // Clears all callbacks previously bound to the view with `delegateEvents`.
    // You usually don't need to use this, but may wish to if you have multiple
    // Backbone views attached to the same DOM element.
    undelegateEvents: function() {
      this.$el.off('.delegateEvents' + this.cid);
      return this;
    },

    // Performs the initial configuration of a View with a set of options.
    // Keys with special meaning *(e.g. model, collection, id, className)* are
    // attached directly to the view.  See `viewOptions` for an exhaustive
    // list.
    _configure: function(options) {
      if (this.options) options = _.extend({}, _.result(this, 'options'), options);
      _.extend(this, _.pick(options, viewOptions));
      this.options = options;
    },

    // Ensure that the View has a DOM element to render into.
    // If `this.el` is a string, pass it through `$()`, take the first
    // matching element, and re-assign it to `el`. Otherwise, create
    // an element from the `id`, `className` and `tagName` properties.
    _ensureElement: function() {
      if (!this.el) {
        var attrs = _.extend({}, _.result(this, 'attributes'));
        if (this.id) attrs.id = _.result(this, 'id');
        if (this.className) attrs['class'] = _.result(this, 'className');
        var $el = Backbone.$('<' + _.result(this, 'tagName') + '>').attr(attrs);
        this.setElement($el, false);
      } else {
        this.setElement(_.result(this, 'el'), false);
      }
    }

  });

  // Backbone.sync
  // -------------

  // Override this function to change the manner in which Backbone persists
  // models to the server. You will be passed the type of request, and the
  // model in question. By default, makes a RESTful Ajax request
  // to the model's `url()`. Some possible customizations could be:
  //
  // * Use `setTimeout` to batch rapid-fire updates into a single request.
  // * Send up the models as XML instead of JSON.
  // * Persist models via WebSockets instead of Ajax.
  //
  // Turn on `Backbone.emulateHTTP` in order to send `PUT` and `DELETE` requests
  // as `POST`, with a `_method` parameter containing the true HTTP method,
  // as well as all requests with the body as `application/x-www-form-urlencoded`
  // instead of `application/json` with the model in a param named `model`.
  // Useful when interfacing with server-side languages like **PHP** that make
  // it difficult to read the body of `PUT` requests.
  Backbone.sync = function(method, model, options) {
    var type = methodMap[method];

    // Default options, unless specified.
    _.defaults(options || (options = {}), {
      emulateHTTP: Backbone.emulateHTTP,
      emulateJSON: Backbone.emulateJSON
    });

    // Default JSON-request options.
    var params = {type: type, dataType: 'json'};

    // Ensure that we have a URL.
    if (!options.url) {
      params.url = _.result(model, 'url') || urlError();
    }

    // Ensure that we have the appropriate request data.
    if (options.data == null && model && (method === 'create' || method === 'update' || method === 'patch')) {
      params.contentType = 'application/json';
      params.data = JSON.stringify(options.attrs || model.toJSON(options));
    }

    // For older servers, emulate JSON by encoding the request into an HTML-form.
    if (options.emulateJSON) {
      params.contentType = 'application/x-www-form-urlencoded';
      params.data = params.data ? {model: params.data} : {};
    }

    // For older servers, emulate HTTP by mimicking the HTTP method with `_method`
    // And an `X-HTTP-Method-Override` header.
    if (options.emulateHTTP && (type === 'PUT' || type === 'DELETE' || type === 'PATCH')) {
      params.type = 'POST';
      if (options.emulateJSON) params.data._method = type;
      var beforeSend = options.beforeSend;
      options.beforeSend = function(xhr) {
        xhr.setRequestHeader('X-HTTP-Method-Override', type);
        if (beforeSend) return beforeSend.apply(this, arguments);
      };
    }

    // Don't process data on a non-GET request.
    if (params.type !== 'GET' && !options.emulateJSON) {
      params.processData = false;
    }

    // If we're sending a `PATCH` request, and we're in an old Internet Explorer
    // that still has ActiveX enabled by default, override jQuery to use that
    // for XHR instead. Remove this line when jQuery supports `PATCH` on IE8.
    if (params.type === 'PATCH' && window.ActiveXObject &&
          !(window.external && window.external.msActiveXFilteringEnabled)) {
      params.xhr = function() {
        return new ActiveXObject("Microsoft.XMLHTTP");
      };
    }

    // Make the request, allowing the user to override any Ajax options.
    var xhr = options.xhr = Backbone.ajax(_.extend(params, options));
    model.trigger('request', model, xhr, options);
    return xhr;
  };

  // Map from CRUD to HTTP for our default `Backbone.sync` implementation.
  var methodMap = {
    'create': 'POST',
    'update': 'PUT',
    'patch':  'PATCH',
    'delete': 'DELETE',
    'read':   'GET'
  };

  // Set the default implementation of `Backbone.ajax` to proxy through to `$`.
  // Override this if you'd like to use a different library.
  Backbone.ajax = function() {
    return Backbone.$.ajax.apply(Backbone.$, arguments);
  };

  // Backbone.Router
  // ---------------

  // Routers map faux-URLs to actions, and fire events when routes are
  // matched. Creating a new one sets its `routes` hash, if not set statically.
  var Router = Backbone.Router = function(options) {
    options || (options = {});
    if (options.routes) this.routes = options.routes;
    this._bindRoutes();
    this.initialize.apply(this, arguments);
  };

  // Cached regular expressions for matching named param parts and splatted
  // parts of route strings.
  var optionalParam = /\((.*?)\)/g;
  var namedParam    = /(\(\?)?:\w+/g;
  var splatParam    = /\*\w+/g;
  var escapeRegExp  = /[\-{}\[\]+?.,\\\^$|#\s]/g;

  // Set up all inheritable **Backbone.Router** properties and methods.
  _.extend(Router.prototype, Events, {

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // Manually bind a single named route to a callback. For example:
    //
    //     this.route('search/:query/p:num', 'search', function(query, num) {
    //       ...
    //     });
    //
    route: function(route, name, callback) {
      if (!_.isRegExp(route)) route = this._routeToRegExp(route);
      if (_.isFunction(name)) {
        callback = name;
        name = '';
      }
      if (!callback) callback = this[name];
      var router = this;
      Backbone.history.route(route, function(fragment) {
        var args = router._extractParameters(route, fragment);
        callback && callback.apply(router, args);
        router.trigger.apply(router, ['route:' + name].concat(args));
        router.trigger('route', name, args);
        Backbone.history.trigger('route', router, name, args);
      });
      return this;
    },

    // Simple proxy to `Backbone.history` to save a fragment into the history.
    navigate: function(fragment, options) {
      Backbone.history.navigate(fragment, options);
      return this;
    },

    // Bind all defined routes to `Backbone.history`. We have to reverse the
    // order of the routes here to support behavior where the most general
    // routes can be defined at the bottom of the route map.
    _bindRoutes: function() {
      if (!this.routes) return;
      this.routes = _.result(this, 'routes');
      var route, routes = _.keys(this.routes);
      while ((route = routes.pop()) != null) {
        this.route(route, this.routes[route]);
      }
    },

    // Convert a route string into a regular expression, suitable for matching
    // against the current location hash.
    _routeToRegExp: function(route) {
      route = route.replace(escapeRegExp, '\\$&')
                   .replace(optionalParam, '(?:$1)?')
                   .replace(namedParam, function(match, optional){
                     return optional ? match : '([^\/]+)';
                   })
                   .replace(splatParam, '(.*?)');
      return new RegExp('^' + route + '$');
    },

    // Given a route, and a URL fragment that it matches, return the array of
    // extracted decoded parameters. Empty or unmatched parameters will be
    // treated as `null` to normalize cross-browser behavior.
    _extractParameters: function(route, fragment) {
      var params = route.exec(fragment).slice(1);
      return _.map(params, function(param) {
        return param ? decodeURIComponent(param) : null;
      });
    }

  });

  // Backbone.History
  // ----------------

  // Handles cross-browser history management, based on either
  // [pushState](http://diveintohtml5.info/history.html) and real URLs, or
  // [onhashchange](https://developer.mozilla.org/en-US/docs/DOM/window.onhashchange)
  // and URL fragments. If the browser supports neither (old IE, natch),
  // falls back to polling.
  var History = Backbone.History = function() {
    this.handlers = [];
    _.bindAll(this, 'checkUrl');

    // Ensure that `History` can be used outside of the browser.
    if (typeof window !== 'undefined') {
      this.location = window.location;
      this.history = window.history;
    }
  };

  // Cached regex for stripping a leading hash/slash and trailing space.
  var routeStripper = /^[#\/]|\s+$/g;

  // Cached regex for stripping leading and trailing slashes.
  var rootStripper = /^\/+|\/+$/g;

  // Cached regex for detecting MSIE.
  var isExplorer = /msie [\w.]+/;

  // Cached regex for removing a trailing slash.
  var trailingSlash = /\/$/;

  // Has the history handling already been started?
  History.started = false;

  // Set up all inheritable **Backbone.History** properties and methods.
  _.extend(History.prototype, Events, {

    // The default interval to poll for hash changes, if necessary, is
    // twenty times a second.
    interval: 50,

    // Gets the true hash value. Cannot use location.hash directly due to bug
    // in Firefox where location.hash will always be decoded.
    getHash: function(window) {
      var match = (window || this).location.href.match(/#(.*)$/);
      return match ? match[1] : '';
    },

    // Get the cross-browser normalized URL fragment, either from the URL,
    // the hash, or the override.
    getFragment: function(fragment, forcePushState) {
      if (fragment == null) {
        if (this._hasPushState || !this._wantsHashChange || forcePushState) {
          fragment = this.location.pathname;
          var root = this.root.replace(trailingSlash, '');
          if (!fragment.indexOf(root)) fragment = fragment.substr(root.length);
        } else {
          fragment = this.getHash();
        }
      }
      return fragment.replace(routeStripper, '');
    },

    // Start the hash change handling, returning `true` if the current URL matches
    // an existing route, and `false` otherwise.
    start: function(options) {
      if (History.started) throw new Error("Backbone.history has already been started");
      History.started = true;

      // Figure out the initial configuration. Do we need an iframe?
      // Is pushState desired ... is it available?
      this.options          = _.extend({}, {root: '/'}, this.options, options);
      this.root             = this.options.root;
      this._wantsHashChange = this.options.hashChange !== false;
      this._wantsPushState  = !!this.options.pushState;
      this._hasPushState    = !!(this.options.pushState && this.history && this.history.pushState);
      var fragment          = this.getFragment();
      var docMode           = document.documentMode;
      var oldIE             = (isExplorer.exec(navigator.userAgent.toLowerCase()) && (!docMode || docMode <= 7));

      // Normalize root to always include a leading and trailing slash.
      this.root = ('/' + this.root + '/').replace(rootStripper, '/');

      if (oldIE && this._wantsHashChange) {
        this.iframe = Backbone.$('<iframe src="javascript:0" tabindex="-1" />').hide().appendTo('body')[0].contentWindow;
        this.navigate(fragment);
      }

      // Depending on whether we're using pushState or hashes, and whether
      // 'onhashchange' is supported, determine how we check the URL state.
      if (this._hasPushState) {
        Backbone.$(window).on('popstate', this.checkUrl);
      } else if (this._wantsHashChange && ('onhashchange' in window) && !oldIE) {
        Backbone.$(window).on('hashchange', this.checkUrl);
      } else if (this._wantsHashChange) {
        this._checkUrlInterval = setInterval(this.checkUrl, this.interval);
      }

      // Determine if we need to change the base url, for a pushState link
      // opened by a non-pushState browser.
      this.fragment = fragment;
      var loc = this.location;
      var atRoot = loc.pathname.replace(/[^\/]$/, '$&/') === this.root;

      // If we've started off with a route from a `pushState`-enabled browser,
      // but we're currently in a browser that doesn't support it...
      if (this._wantsHashChange && this._wantsPushState && !this._hasPushState && !atRoot) {
        this.fragment = this.getFragment(null, true);
        this.location.replace(this.root + this.location.search + '#' + this.fragment);
        // Return immediately as browser will do redirect to new url
        return true;

      // Or if we've started out with a hash-based route, but we're currently
      // in a browser where it could be `pushState`-based instead...
      } else if (this._wantsPushState && this._hasPushState && atRoot && loc.hash) {
        this.fragment = this.getHash().replace(routeStripper, '');
        this.history.replaceState({}, document.title, this.root + this.fragment + loc.search);
      }

      if (!this.options.silent) return this.loadUrl();
    },

    // Disable Backbone.history, perhaps temporarily. Not useful in a real app,
    // but possibly useful for unit testing Routers.
    stop: function() {
      Backbone.$(window).off('popstate', this.checkUrl).off('hashchange', this.checkUrl);
      clearInterval(this._checkUrlInterval);
      History.started = false;
    },

    // Add a route to be tested when the fragment changes. Routes added later
    // may override previous routes.
    route: function(route, callback) {
      this.handlers.unshift({route: route, callback: callback});
    },

    // Checks the current URL to see if it has changed, and if it has,
    // calls `loadUrl`, normalizing across the hidden iframe.
    checkUrl: function(e) {
      var current = this.getFragment();
      if (current === this.fragment && this.iframe) {
        current = this.getFragment(this.getHash(this.iframe));
      }
      if (current === this.fragment) return false;
      if (this.iframe) this.navigate(current);
      this.loadUrl() || this.loadUrl(this.getHash());
    },

    // Attempt to load the current URL fragment. If a route succeeds with a
    // match, returns `true`. If no defined routes matches the fragment,
    // returns `false`.
    loadUrl: function(fragmentOverride) {
      var fragment = this.fragment = this.getFragment(fragmentOverride);
      var matched = _.any(this.handlers, function(handler) {
        if (handler.route.test(fragment)) {
          handler.callback(fragment);
          return true;
        }
      });
      return matched;
    },

    // Save a fragment into the hash history, or replace the URL state if the
    // 'replace' option is passed. You are responsible for properly URL-encoding
    // the fragment in advance.
    //
    // The options object can contain `trigger: true` if you wish to have the
    // route callback be fired (not usually desirable), or `replace: true`, if
    // you wish to modify the current URL without adding an entry to the history.
    navigate: function(fragment, options) {
      if (!History.started) return false;
      if (!options || options === true) options = {trigger: options};
      fragment = this.getFragment(fragment || '');
      if (this.fragment === fragment) return;
      this.fragment = fragment;
      var url = this.root + fragment;

      // If pushState is available, we use it to set the fragment as a real URL.
      if (this._hasPushState) {
        this.history[options.replace ? 'replaceState' : 'pushState']({}, document.title, url);

      // If hash changes haven't been explicitly disabled, update the hash
      // fragment to store history.
      } else if (this._wantsHashChange) {
        this._updateHash(this.location, fragment, options.replace);
        if (this.iframe && (fragment !== this.getFragment(this.getHash(this.iframe)))) {
          // Opening and closing the iframe tricks IE7 and earlier to push a
          // history entry on hash-tag change.  When replace is true, we don't
          // want this.
          if(!options.replace) this.iframe.document.open().close();
          this._updateHash(this.iframe.location, fragment, options.replace);
        }

      // If you've told us that you explicitly don't want fallback hashchange-
      // based history, then `navigate` becomes a page refresh.
      } else {
        return this.location.assign(url);
      }
      if (options.trigger) this.loadUrl(fragment);
    },

    // Update the hash location, either replacing the current entry, or adding
    // a new one to the browser history.
    _updateHash: function(location, fragment, replace) {
      if (replace) {
        var href = location.href.replace(/(javascript:|#).*$/, '');
        location.replace(href + '#' + fragment);
      } else {
        // Some browsers require that `hash` contains a leading #.
        location.hash = '#' + fragment;
      }
    }

  });

  // Create the default Backbone.history.
  Backbone.history = new History;

  // Helpers
  // -------

  // Helper function to correctly set up the prototype chain, for subclasses.
  // Similar to `goog.inherits`, but uses a hash of prototype properties and
  // class properties to be extended.
  var extend = function(protoProps, staticProps) {
    var parent = this;
    var child;

    // The constructor function for the new subclass is either defined by you
    // (the "constructor" property in your `extend` definition), or defaulted
    // by us to simply call the parent's constructor.
    if (protoProps && _.has(protoProps, 'constructor')) {
      child = protoProps.constructor;
    } else {
      child = function(){ return parent.apply(this, arguments); };
    }

    // Add static properties to the constructor function, if supplied.
    _.extend(child, parent, staticProps);

    // Set the prototype chain to inherit from `parent`, without calling
    // `parent`'s constructor function.
    var Surrogate = function(){ this.constructor = child; };
    Surrogate.prototype = parent.prototype;
    child.prototype = new Surrogate;

    // Add prototype properties (instance properties) to the subclass,
    // if supplied.
    if (protoProps) _.extend(child.prototype, protoProps);

    // Set a convenience property in case the parent's prototype is needed
    // later.
    child.__super__ = parent.prototype;

    return child;
  };

  // Set up inheritance for the model, collection, router, view and history.
  Model.extend = Collection.extend = Router.extend = View.extend = History.extend = extend;

  // Throw an error when a URL is needed, and none is supplied.
  var urlError = function() {
    throw new Error('A "url" property or function must be specified');
  };

  // Wrap an optional error callback with a fallback error event.
  var wrapError = function (model, options) {
    var error = options.error;
    options.error = function(resp) {
      if (error) error(model, resp, options);
      model.trigger('error', model, resp, options);
    };
  };

}).call(this);

define("backbone", ["underscore","jquery"], (function (global) {
    return function () {
        var ret, fn;
        return ret || global.window.Backbone;
    };
}(this)));

// pattern router.
//
// Author: Ryan Foster
// Contact: ryan@rynamic.com
// Version: 1.0
// Depends: jquery.js
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('mockup-router',[
  'jquery',
  'underscore',
  'backbone'
], function($, _, Backbone) {
  

  var regexEscape = function(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  };

  var Router = Backbone.Router.extend({
    actions: [],
    redirects: {},
    addRoute: function(patternName, id, callback, context, pathExp, expReplace) {
      if (_.findWhere(this.patterns, {patternName: patternName, id: id}) === undefined) {
        this.actions.push({patternName: patternName, id: id, callback: callback, context: context, pathExp: pathExp, expReplace: expReplace});
      }
      var regex = new RegExp('(' + regexEscape(patternName) + ':' + regexEscape(id) + ')');
      this.route(regex, 'handleRoute');
    },
    addRedirect: function(pathExp, destination) {
      this.redirects[pathExp] = destination;
    },
    handleRoute: function(pattern) {
      var parts = pattern.split(':');
      var patternName = parts[0];
      var id = parts[1];
      var action = _.findWhere(this.actions, {patternName: patternName, id: id});
      if (action) {
        action.callback.call(action.context);
      }
    },
    redirect: function() {
      var path = window.parent.location.pathname,
          newPath,
          regex,
          hash;

      _.some(this.actions, function(action) {
        if (action.pathExp) {
          regex = new RegExp(action.pathExp);
          if (path.match(regex)) {
            hash = '!/' + action.patternName + ':' + action.id;
            var replaceWith = '';
            if(action.expReplace){
              replaceWith = action.expReplace;
            }
            newPath = path.replace(regex, replaceWith);
            return true;
          }
        }
      }, this);

      if (hash === undefined) {
        for (var pathExp in this.redirects) {
          regex = new RegExp(pathExp);
          if (path.match(regex)) {
            hash = '!/' + this.redirects[pathExp];
            newPath = path.replace(regex, '');
            break;
          }
        }
      }

      if (hash !== undefined) {
        this._change_location.apply(this, [newPath, hash]);
      }
    },
    _change_location: function(path, hash) {
      window.parent.location.hash = hash;
      window.parent.location.pathname = path;
    },
    start: function() {
      Backbone.history.start();
    },
    reset: function() {
      this.actions = [];
    }

  });

  return new Router();

});

// utils.
//
// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
// Depends: jquery.js
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('mockup-utils',[
  'jquery'
], function($) {
  

  var utils = {

    parseBodyTag: function(txt){
      return $((/<body[^>]*>((.|[\n\r])*)<\/body>/im).exec(txt)[0]
          .replace('<body', '<div').replace('</body>', '</div>')).eq(0).html();
    },
    setId: function($el, prefix){
      if(prefix === undefined){
        prefix = 'id';
      }
      var id = $el.attr('id');
      if(id === undefined){
        id = prefix + (Math.floor((1 + Math.random()) * 0x10000)
          .toString(16).substring(1));
      } else {
        /* hopefully we don't screw anything up here... changing the id
         * in some cases so we get a decent selector */
        id = id.replace(/\./g, '-');
      }
      $el.attr('id', id);
      return id;
    },
    bool: function(val){
      if(typeof(val) === 'string'){
        val = $.trim(val).toLowerCase();
      }
      return ['true', true, 1].indexOf(val) !== -1;
    }
  };

  return utils;

});

/*!
 * jQuery Form Plugin
 * version: 3.37.0-2013.07.11
 * @requires jQuery v1.5 or later
 * Copyright (c) 2013 M. Alsup
 * Examples and documentation at: http://malsup.com/jquery/form/
 * Project repository: https://github.com/malsup/form
 * Dual licensed under the MIT and GPL licenses.
 * https://github.com/malsup/form#copyright-and-license
 */
/*global ActiveXObject */
;(function($) {


/*
    Usage Note:
    -----------
    Do not use both ajaxSubmit and ajaxForm on the same form.  These
    functions are mutually exclusive.  Use ajaxSubmit if you want
    to bind your own submit handler to the form.  For example,

    $(document).ready(function() {
        $('#myForm').on('submit', function(e) {
            e.preventDefault(); // <-- important
            $(this).ajaxSubmit({
                target: '#output'
            });
        });
    });

    Use ajaxForm when you want the plugin to manage all the event binding
    for you.  For example,

    $(document).ready(function() {
        $('#myForm').ajaxForm({
            target: '#output'
        });
    });

    You can also use ajaxForm with delegation (requires jQuery v1.7+), so the
    form does not have to exist when you invoke ajaxForm:

    $('#myForm').ajaxForm({
        delegation: true,
        target: '#output'
    });

    When using ajaxForm, the ajaxSubmit function will be invoked for you
    at the appropriate time.
*/

/**
 * Feature detection
 */
var feature = {};
feature.fileapi = $("<input type='file'/>").get(0).files !== undefined;
feature.formdata = window.FormData !== undefined;

var hasProp = !!$.fn.prop;

// attr2 uses prop when it can but checks the return type for
// an expected string.  this accounts for the case where a form 
// contains inputs with names like "action" or "method"; in those
// cases "prop" returns the element
$.fn.attr2 = function() {
    if ( ! hasProp )
        return this.attr.apply(this, arguments);
    var val = this.prop.apply(this, arguments);
    if ( ( val && val.jquery ) || typeof val === 'string' )
        return val;
    return this.attr.apply(this, arguments);
};

/**
 * ajaxSubmit() provides a mechanism for immediately submitting
 * an HTML form using AJAX.
 */
$.fn.ajaxSubmit = function(options) {
    /*jshint scripturl:true */

    // fast fail if nothing selected (http://dev.jquery.com/ticket/2752)
    if (!this.length) {
        log('ajaxSubmit: skipping submit process - no element selected');
        return this;
    }

    var method, action, url, $form = this;

    if (typeof options == 'function') {
        options = { success: options };
    }
    else if ( options === undefined ) {
        options = {};
    }

    method = options.type || this.attr2('method');
    action = options.url  || this.attr2('action');

    url = (typeof action === 'string') ? $.trim(action) : '';
    url = url || window.location.href || '';
    if (url) {
        // clean url (don't include hash vaue)
        url = (url.match(/^([^#]+)/)||[])[1];
    }

    options = $.extend(true, {
        url:  url,
        success: $.ajaxSettings.success,
        type: method || 'GET',
        iframeSrc: /^https/i.test(window.location.href || '') ? 'javascript:false' : 'about:blank'
    }, options);

    // hook for manipulating the form data before it is extracted;
    // convenient for use with rich editors like tinyMCE or FCKEditor
    var veto = {};
    this.trigger('form-pre-serialize', [this, options, veto]);
    if (veto.veto) {
        log('ajaxSubmit: submit vetoed via form-pre-serialize trigger');
        return this;
    }

    // provide opportunity to alter form data before it is serialized
    if (options.beforeSerialize && options.beforeSerialize(this, options) === false) {
        log('ajaxSubmit: submit aborted via beforeSerialize callback');
        return this;
    }

    var traditional = options.traditional;
    if ( traditional === undefined ) {
        traditional = $.ajaxSettings.traditional;
    }

    var elements = [];
    var qx, a = this.formToArray(options.semantic, elements);
    if (options.data) {
        options.extraData = options.data;
        qx = $.param(options.data, traditional);
    }

    // give pre-submit callback an opportunity to abort the submit
    if (options.beforeSubmit && options.beforeSubmit(a, this, options) === false) {
        log('ajaxSubmit: submit aborted via beforeSubmit callback');
        return this;
    }

    // fire vetoable 'validate' event
    this.trigger('form-submit-validate', [a, this, options, veto]);
    if (veto.veto) {
        log('ajaxSubmit: submit vetoed via form-submit-validate trigger');
        return this;
    }

    var q = $.param(a, traditional);
    if (qx) {
        q = ( q ? (q + '&' + qx) : qx );
    }
    if (options.type.toUpperCase() == 'GET') {
        options.url += (options.url.indexOf('?') >= 0 ? '&' : '?') + q;
        options.data = null;  // data is null for 'get'
    }
    else {
        options.data = q; // data is the query string for 'post'
    }

    var callbacks = [];
    if (options.resetForm) {
        callbacks.push(function() { $form.resetForm(); });
    }
    if (options.clearForm) {
        callbacks.push(function() { $form.clearForm(options.includeHidden); });
    }

    // perform a load on the target only if dataType is not provided
    if (!options.dataType && options.target) {
        var oldSuccess = options.success || function(){};
        callbacks.push(function(data) {
            var fn = options.replaceTarget ? 'replaceWith' : 'html';
            $(options.target)[fn](data).each(oldSuccess, arguments);
        });
    }
    else if (options.success) {
        callbacks.push(options.success);
    }

    options.success = function(data, status, xhr) { // jQuery 1.4+ passes xhr as 3rd arg
        var context = options.context || this ;    // jQuery 1.4+ supports scope context
        for (var i=0, max=callbacks.length; i < max; i++) {
            callbacks[i].apply(context, [data, status, xhr || $form, $form]);
        }
    };

    if (options.error) {
        var oldError = options.error;
        options.error = function(xhr, status, error) {
            var context = options.context || this;
            oldError.apply(context, [xhr, status, error, $form]);
        };
    }

     if (options.complete) {
        var oldComplete = options.complete;
        options.complete = function(xhr, status) {
            var context = options.context || this;
            oldComplete.apply(context, [xhr, status, $form]);
        };
    }

    // are there files to upload?

    // [value] (issue #113), also see comment:
    // https://github.com/malsup/form/commit/588306aedba1de01388032d5f42a60159eea9228#commitcomment-2180219
    var fileInputs = $('input[type=file]:enabled[value!=""]', this);

    var hasFileInputs = fileInputs.length > 0;
    var mp = 'multipart/form-data';
    var multipart = ($form.attr('enctype') == mp || $form.attr('encoding') == mp);

    var fileAPI = feature.fileapi && feature.formdata;
    log("fileAPI :" + fileAPI);
    var shouldUseFrame = (hasFileInputs || multipart) && !fileAPI;

    var jqxhr;

    // options.iframe allows user to force iframe mode
    // 06-NOV-09: now defaulting to iframe mode if file input is detected
    if (options.iframe !== false && (options.iframe || shouldUseFrame)) {
        // hack to fix Safari hang (thanks to Tim Molendijk for this)
        // see:  http://groups.google.com/group/jquery-dev/browse_thread/thread/36395b7ab510dd5d
        if (options.closeKeepAlive) {
            $.get(options.closeKeepAlive, function() {
                jqxhr = fileUploadIframe(a);
            });
        }
        else {
            jqxhr = fileUploadIframe(a);
        }
    }
    else if ((hasFileInputs || multipart) && fileAPI) {
        jqxhr = fileUploadXhr(a);
    }
    else {
        jqxhr = $.ajax(options);
    }

    $form.removeData('jqxhr').data('jqxhr', jqxhr);

    // clear element array
    for (var k=0; k < elements.length; k++)
        elements[k] = null;

    // fire 'notify' event
    this.trigger('form-submit-notify', [this, options]);
    return this;

    // utility fn for deep serialization
    function deepSerialize(extraData){
        var serialized = $.param(extraData, options.traditional).split('&');
        var len = serialized.length;
        var result = [];
        var i, part;
        for (i=0; i < len; i++) {
            // #252; undo param space replacement
            serialized[i] = serialized[i].replace(/\+/g,' ');
            part = serialized[i].split('=');
            // #278; use array instead of object storage, favoring array serializations
            result.push([decodeURIComponent(part[0]), decodeURIComponent(part[1])]);
        }
        return result;
    }

     // XMLHttpRequest Level 2 file uploads (big hat tip to francois2metz)
    function fileUploadXhr(a) {
        var formdata = new FormData();

        for (var i=0; i < a.length; i++) {
            formdata.append(a[i].name, a[i].value);
        }

        if (options.extraData) {
            var serializedData = deepSerialize(options.extraData);
            for (i=0; i < serializedData.length; i++)
                if (serializedData[i])
                    formdata.append(serializedData[i][0], serializedData[i][1]);
        }

        options.data = null;

        var s = $.extend(true, {}, $.ajaxSettings, options, {
            contentType: false,
            processData: false,
            cache: false,
            type: method || 'POST'
        });

        if (options.uploadProgress) {
            // workaround because jqXHR does not expose upload property
            s.xhr = function() {
                var xhr = $.ajaxSettings.xhr();
                if (xhr.upload) {
                    xhr.upload.addEventListener('progress', function(event) {
                        var percent = 0;
                        var position = event.loaded || event.position; /*event.position is deprecated*/
                        var total = event.total;
                        if (event.lengthComputable) {
                            percent = Math.ceil(position / total * 100);
                        }
                        options.uploadProgress(event, position, total, percent);
                    }, false);
                }
                return xhr;
            };
        }

        s.data = null;
            var beforeSend = s.beforeSend;
            s.beforeSend = function(xhr, o) {
                o.data = formdata;
                if(beforeSend)
                    beforeSend.call(this, xhr, o);
        };
        return $.ajax(s);
    }

    // private function for handling file uploads (hat tip to YAHOO!)
    function fileUploadIframe(a) {
        var form = $form[0], el, i, s, g, id, $io, io, xhr, sub, n, timedOut, timeoutHandle;
        var deferred = $.Deferred();

        if (a) {
            // ensure that every serialized input is still enabled
            for (i=0; i < elements.length; i++) {
                el = $(elements[i]);
                if ( hasProp )
                    el.prop('disabled', false);
                else
                    el.removeAttr('disabled');
            }
        }

        s = $.extend(true, {}, $.ajaxSettings, options);
        s.context = s.context || s;
        id = 'jqFormIO' + (new Date().getTime());
        if (s.iframeTarget) {
            $io = $(s.iframeTarget);
            n = $io.attr2('name');
            if (!n)
                 $io.attr2('name', id);
            else
                id = n;
        }
        else {
            $io = $('<iframe name="' + id + '" src="'+ s.iframeSrc +'" />');
            $io.css({ position: 'absolute', top: '-1000px', left: '-1000px' });
        }
        io = $io[0];


        xhr = { // mock object
            aborted: 0,
            responseText: null,
            responseXML: null,
            status: 0,
            statusText: 'n/a',
            getAllResponseHeaders: function() {},
            getResponseHeader: function() {},
            setRequestHeader: function() {},
            abort: function(status) {
                var e = (status === 'timeout' ? 'timeout' : 'aborted');
                log('aborting upload... ' + e);
                this.aborted = 1;

                try { // #214, #257
                    if (io.contentWindow.document.execCommand) {
                        io.contentWindow.document.execCommand('Stop');
                    }
                }
                catch(ignore) {}

                $io.attr('src', s.iframeSrc); // abort op in progress
                xhr.error = e;
                if (s.error)
                    s.error.call(s.context, xhr, e, status);
                if (g)
                    $.event.trigger("ajaxError", [xhr, s, e]);
                if (s.complete)
                    s.complete.call(s.context, xhr, e);
            }
        };

        g = s.global;
        // trigger ajax global events so that activity/block indicators work like normal
        if (g && 0 === $.active++) {
            $.event.trigger("ajaxStart");
        }
        if (g) {
            $.event.trigger("ajaxSend", [xhr, s]);
        }

        if (s.beforeSend && s.beforeSend.call(s.context, xhr, s) === false) {
            if (s.global) {
                $.active--;
            }
            deferred.reject();
            return deferred;
        }
        if (xhr.aborted) {
            deferred.reject();
            return deferred;
        }

        // add submitting element to data if we know it
        sub = form.clk;
        if (sub) {
            n = sub.name;
            if (n && !sub.disabled) {
                s.extraData = s.extraData || {};
                s.extraData[n] = sub.value;
                if (sub.type == "image") {
                    s.extraData[n+'.x'] = form.clk_x;
                    s.extraData[n+'.y'] = form.clk_y;
                }
            }
        }

        var CLIENT_TIMEOUT_ABORT = 1;
        var SERVER_ABORT = 2;
                
        function getDoc(frame) {
            /* it looks like contentWindow or contentDocument do not
             * carry the protocol property in ie8, when running under ssl
             * frame.document is the only valid response document, since
             * the protocol is know but not on the other two objects. strange?
             * "Same origin policy" http://en.wikipedia.org/wiki/Same_origin_policy
             */
            
            var doc = null;
            
            // IE8 cascading access check
            try {
                if (frame.contentWindow) {
                    doc = frame.contentWindow.document;
                }
            } catch(err) {
                // IE8 access denied under ssl & missing protocol
                log('cannot get iframe.contentWindow document: ' + err);
            }

            if (doc) { // successful getting content
                return doc;
            }

            try { // simply checking may throw in ie8 under ssl or mismatched protocol
                doc = frame.contentDocument ? frame.contentDocument : frame.document;
            } catch(err) {
                // last attempt
                log('cannot get iframe.contentDocument: ' + err);
                doc = frame.document;
            }
            return doc;
        }

        // Rails CSRF hack (thanks to Yvan Barthelemy)
        var csrf_token = $('meta[name=csrf-token]').attr('content');
        var csrf_param = $('meta[name=csrf-param]').attr('content');
        if (csrf_param && csrf_token) {
            s.extraData = s.extraData || {};
            s.extraData[csrf_param] = csrf_token;
        }

        // take a breath so that pending repaints get some cpu time before the upload starts
        function doSubmit() {
            // make sure form attrs are set
            var t = $form.attr2('target'), a = $form.attr2('action');

            // update form attrs in IE friendly way
            form.setAttribute('target',id);
            if (!method) {
                form.setAttribute('method', 'POST');
            }
            if (a != s.url) {
                form.setAttribute('action', s.url);
            }

            // ie borks in some cases when setting encoding
            if (! s.skipEncodingOverride && (!method || /post/i.test(method))) {
                $form.attr({
                    encoding: 'multipart/form-data',
                    enctype:  'multipart/form-data'
                });
            }

            // support timout
            if (s.timeout) {
                timeoutHandle = setTimeout(function() { timedOut = true; cb(CLIENT_TIMEOUT_ABORT); }, s.timeout);
            }

            // look for server aborts
            function checkState() {
                try {
                    var state = getDoc(io).readyState;
                    log('state = ' + state);
                    if (state && state.toLowerCase() == 'uninitialized')
                        setTimeout(checkState,50);
                }
                catch(e) {
                    log('Server abort: ' , e, ' (', e.name, ')');
                    cb(SERVER_ABORT);
                    if (timeoutHandle)
                        clearTimeout(timeoutHandle);
                    timeoutHandle = undefined;
                }
            }

            // add "extra" data to form if provided in options
            var extraInputs = [];
            try {
                if (s.extraData) {
                    for (var n in s.extraData) {
                        if (s.extraData.hasOwnProperty(n)) {
                           // if using the $.param format that allows for multiple values with the same name
                           if($.isPlainObject(s.extraData[n]) && s.extraData[n].hasOwnProperty('name') && s.extraData[n].hasOwnProperty('value')) {
                               extraInputs.push(
                               $('<input type="hidden" name="'+s.extraData[n].name+'">').val(s.extraData[n].value)
                                   .appendTo(form)[0]);
                           } else {
                               extraInputs.push(
                               $('<input type="hidden" name="'+n+'">').val(s.extraData[n])
                                   .appendTo(form)[0]);
                           }
                        }
                    }
                }

                if (!s.iframeTarget) {
                    // add iframe to doc and submit the form
                    $io.appendTo('body');
                    if (io.attachEvent)
                        io.attachEvent('onload', cb);
                    else
                        io.addEventListener('load', cb, false);
                }
                setTimeout(checkState,15);

                try {
                    form.submit();
                } catch(err) {
                    // just in case form has element with name/id of 'submit'
                    var submitFn = document.createElement('form').submit;
                    submitFn.apply(form);
                }
            }
            finally {
                // reset attrs and remove "extra" input elements
                form.setAttribute('action',a);
                if(t) {
                    form.setAttribute('target', t);
                } else {
                    $form.removeAttr('target');
                }
                $(extraInputs).remove();
            }
        }

        if (s.forceSync) {
            doSubmit();
        }
        else {
            setTimeout(doSubmit, 10); // this lets dom updates render
        }

        var data, doc, domCheckCount = 50, callbackProcessed;

        function cb(e) {
            if (xhr.aborted || callbackProcessed) {
                return;
            }
            
            doc = getDoc(io);
            if(!doc) {
                log('cannot access response document');
                e = SERVER_ABORT;
            }
            if (e === CLIENT_TIMEOUT_ABORT && xhr) {
                xhr.abort('timeout');
                deferred.reject(xhr, 'timeout');
                return;
            }
            else if (e == SERVER_ABORT && xhr) {
                xhr.abort('server abort');
                deferred.reject(xhr, 'error', 'server abort');
                return;
            }

            if (!doc || doc.location.href == s.iframeSrc) {
                // response not received yet
                if (!timedOut)
                    return;
            }
            if (io.detachEvent)
                io.detachEvent('onload', cb);
            else
                io.removeEventListener('load', cb, false);

            var status = 'success', errMsg;
            try {
                if (timedOut) {
                    throw 'timeout';
                }

                var isXml = s.dataType == 'xml' || doc.XMLDocument || $.isXMLDoc(doc);
                log('isXml='+isXml);
                if (!isXml && window.opera && (doc.body === null || !doc.body.innerHTML)) {
                    if (--domCheckCount) {
                        // in some browsers (Opera) the iframe DOM is not always traversable when
                        // the onload callback fires, so we loop a bit to accommodate
                        log('requeing onLoad callback, DOM not available');
                        setTimeout(cb, 250);
                        return;
                    }
                    // let this fall through because server response could be an empty document
                    //log('Could not access iframe DOM after mutiple tries.');
                    //throw 'DOMException: not available';
                }

                //log('response detected');
                var docRoot = doc.body ? doc.body : doc.documentElement;
                xhr.responseText = docRoot ? docRoot.innerHTML : null;
                xhr.responseXML = doc.XMLDocument ? doc.XMLDocument : doc;
                if (isXml)
                    s.dataType = 'xml';
                xhr.getResponseHeader = function(header){
                    var headers = {'content-type': s.dataType};
                    return headers[header];
                };
                // support for XHR 'status' & 'statusText' emulation :
                if (docRoot) {
                    xhr.status = Number( docRoot.getAttribute('status') ) || xhr.status;
                    xhr.statusText = docRoot.getAttribute('statusText') || xhr.statusText;
                }

                var dt = (s.dataType || '').toLowerCase();
                var scr = /(json|script|text)/.test(dt);
                if (scr || s.textarea) {
                    // see if user embedded response in textarea
                    var ta = doc.getElementsByTagName('textarea')[0];
                    if (ta) {
                        xhr.responseText = ta.value;
                        // support for XHR 'status' & 'statusText' emulation :
                        xhr.status = Number( ta.getAttribute('status') ) || xhr.status;
                        xhr.statusText = ta.getAttribute('statusText') || xhr.statusText;
                    }
                    else if (scr) {
                        // account for browsers injecting pre around json response
                        var pre = doc.getElementsByTagName('pre')[0];
                        var b = doc.getElementsByTagName('body')[0];
                        if (pre) {
                            xhr.responseText = pre.textContent ? pre.textContent : pre.innerText;
                        }
                        else if (b) {
                            xhr.responseText = b.textContent ? b.textContent : b.innerText;
                        }
                    }
                }
                else if (dt == 'xml' && !xhr.responseXML && xhr.responseText) {
                    xhr.responseXML = toXml(xhr.responseText);
                }

                try {
                    data = httpData(xhr, dt, s);
                }
                catch (err) {
                    status = 'parsererror';
                    xhr.error = errMsg = (err || status);
                }
            }
            catch (err) {
                log('error caught: ',err);
                status = 'error';
                xhr.error = errMsg = (err || status);
            }

            if (xhr.aborted) {
                log('upload aborted');
                status = null;
            }

            if (xhr.status) { // we've set xhr.status
                status = (xhr.status >= 200 && xhr.status < 300 || xhr.status === 304) ? 'success' : 'error';
            }

            // ordering of these callbacks/triggers is odd, but that's how $.ajax does it
            if (status === 'success') {
                if (s.success)
                    s.success.call(s.context, data, 'success', xhr);
                deferred.resolve(xhr.responseText, 'success', xhr);
                if (g)
                    $.event.trigger("ajaxSuccess", [xhr, s]);
            }
            else if (status) {
                if (errMsg === undefined)
                    errMsg = xhr.statusText;
                if (s.error)
                    s.error.call(s.context, xhr, status, errMsg);
                deferred.reject(xhr, 'error', errMsg);
                if (g)
                    $.event.trigger("ajaxError", [xhr, s, errMsg]);
            }

            if (g)
                $.event.trigger("ajaxComplete", [xhr, s]);

            if (g && ! --$.active) {
                $.event.trigger("ajaxStop");
            }

            if (s.complete)
                s.complete.call(s.context, xhr, status);

            callbackProcessed = true;
            if (s.timeout)
                clearTimeout(timeoutHandle);

            // clean up
            setTimeout(function() {
                if (!s.iframeTarget)
                    $io.remove();
                xhr.responseXML = null;
            }, 100);
        }

        var toXml = $.parseXML || function(s, doc) { // use parseXML if available (jQuery 1.5+)
            if (window.ActiveXObject) {
                doc = new ActiveXObject('Microsoft.XMLDOM');
                doc.async = 'false';
                doc.loadXML(s);
            }
            else {
                doc = (new DOMParser()).parseFromString(s, 'text/xml');
            }
            return (doc && doc.documentElement && doc.documentElement.nodeName != 'parsererror') ? doc : null;
        };
        var parseJSON = $.parseJSON || function(s) {
            /*jslint evil:true */
            return window['eval']('(' + s + ')');
        };

        var httpData = function( xhr, type, s ) { // mostly lifted from jq1.4.4

            var ct = xhr.getResponseHeader('content-type') || '',
                xml = type === 'xml' || !type && ct.indexOf('xml') >= 0,
                data = xml ? xhr.responseXML : xhr.responseText;

            if (xml && data.documentElement.nodeName === 'parsererror') {
                if ($.error)
                    $.error('parsererror');
            }
            if (s && s.dataFilter) {
                data = s.dataFilter(data, type);
            }
            if (typeof data === 'string') {
                if (type === 'json' || !type && ct.indexOf('json') >= 0) {
                    data = parseJSON(data);
                } else if (type === "script" || !type && ct.indexOf("javascript") >= 0) {
                    $.globalEval(data);
                }
            }
            return data;
        };

        return deferred;
    }
};

/**
 * ajaxForm() provides a mechanism for fully automating form submission.
 *
 * The advantages of using this method instead of ajaxSubmit() are:
 *
 * 1: This method will include coordinates for <input type="image" /> elements (if the element
 *    is used to submit the form).
 * 2. This method will include the submit element's name/value data (for the element that was
 *    used to submit the form).
 * 3. This method binds the submit() method to the form for you.
 *
 * The options argument for ajaxForm works exactly as it does for ajaxSubmit.  ajaxForm merely
 * passes the options argument along after properly binding events for submit elements and
 * the form itself.
 */
$.fn.ajaxForm = function(options) {
    options = options || {};
    options.delegation = options.delegation && $.isFunction($.fn.on);

    // in jQuery 1.3+ we can fix mistakes with the ready state
    if (!options.delegation && this.length === 0) {
        var o = { s: this.selector, c: this.context };
        if (!$.isReady && o.s) {
            log('DOM not ready, queuing ajaxForm');
            $(function() {
                $(o.s,o.c).ajaxForm(options);
            });
            return this;
        }
        // is your DOM ready?  http://docs.jquery.com/Tutorials:Introducing_$(document).ready()
        log('terminating; zero elements found by selector' + ($.isReady ? '' : ' (DOM not ready)'));
        return this;
    }

    if ( options.delegation ) {
        $(document)
            .off('submit.form-plugin', this.selector, doAjaxSubmit)
            .off('click.form-plugin', this.selector, captureSubmittingElement)
            .on('submit.form-plugin', this.selector, options, doAjaxSubmit)
            .on('click.form-plugin', this.selector, options, captureSubmittingElement);
        return this;
    }

    return this.ajaxFormUnbind()
        .bind('submit.form-plugin', options, doAjaxSubmit)
        .bind('click.form-plugin', options, captureSubmittingElement);
};

// private event handlers
function doAjaxSubmit(e) {
    /*jshint validthis:true */
    var options = e.data;
    if (!e.isDefaultPrevented()) { // if event has been canceled, don't proceed
        e.preventDefault();
        $(this).ajaxSubmit(options);
    }
}

function captureSubmittingElement(e) {
    /*jshint validthis:true */
    var target = e.target;
    var $el = $(target);
    if (!($el.is("[type=submit],[type=image]"))) {
        // is this a child element of the submit el?  (ex: a span within a button)
        var t = $el.closest('[type=submit]');
        if (t.length === 0) {
            return;
        }
        target = t[0];
    }
    var form = this;
    form.clk = target;
    if (target.type == 'image') {
        if (e.offsetX !== undefined) {
            form.clk_x = e.offsetX;
            form.clk_y = e.offsetY;
        } else if (typeof $.fn.offset == 'function') {
            var offset = $el.offset();
            form.clk_x = e.pageX - offset.left;
            form.clk_y = e.pageY - offset.top;
        } else {
            form.clk_x = e.pageX - target.offsetLeft;
            form.clk_y = e.pageY - target.offsetTop;
        }
    }
    // clear form vars
    setTimeout(function() { form.clk = form.clk_x = form.clk_y = null; }, 100);
}


// ajaxFormUnbind unbinds the event handlers that were bound by ajaxForm
$.fn.ajaxFormUnbind = function() {
    return this.unbind('submit.form-plugin click.form-plugin');
};

/**
 * formToArray() gathers form element data into an array of objects that can
 * be passed to any of the following ajax functions: $.get, $.post, or load.
 * Each object in the array has both a 'name' and 'value' property.  An example of
 * an array for a simple login form might be:
 *
 * [ { name: 'username', value: 'jresig' }, { name: 'password', value: 'secret' } ]
 *
 * It is this array that is passed to pre-submit callback functions provided to the
 * ajaxSubmit() and ajaxForm() methods.
 */
$.fn.formToArray = function(semantic, elements) {
    var a = [];
    if (this.length === 0) {
        return a;
    }

    var form = this[0];
    var els = semantic ? form.getElementsByTagName('*') : form.elements;
    if (!els) {
        return a;
    }

    var i,j,n,v,el,max,jmax;
    for(i=0, max=els.length; i < max; i++) {
        el = els[i];
        n = el.name;
        if (!n || el.disabled) {
            continue;
        }

        if (semantic && form.clk && el.type == "image") {
            // handle image inputs on the fly when semantic == true
            if(form.clk == el) {
                a.push({name: n, value: $(el).val(), type: el.type });
                a.push({name: n+'.x', value: form.clk_x}, {name: n+'.y', value: form.clk_y});
            }
            continue;
        }

        v = $.fieldValue(el, true);
        if (v && v.constructor == Array) {
            if (elements)
                elements.push(el);
            for(j=0, jmax=v.length; j < jmax; j++) {
                a.push({name: n, value: v[j]});
            }
        }
        else if (feature.fileapi && el.type == 'file') {
            if (elements)
                elements.push(el);
            var files = el.files;
            if (files.length) {
                for (j=0; j < files.length; j++) {
                    a.push({name: n, value: files[j], type: el.type});
                }
            }
            else {
                // #180
                a.push({ name: n, value: '', type: el.type });
            }
        }
        else if (v !== null && typeof v != 'undefined') {
            if (elements)
                elements.push(el);
            a.push({name: n, value: v, type: el.type, required: el.required});
        }
    }

    if (!semantic && form.clk) {
        // input type=='image' are not found in elements array! handle it here
        var $input = $(form.clk), input = $input[0];
        n = input.name;
        if (n && !input.disabled && input.type == 'image') {
            a.push({name: n, value: $input.val()});
            a.push({name: n+'.x', value: form.clk_x}, {name: n+'.y', value: form.clk_y});
        }
    }
    return a;
};

/**
 * Serializes form data into a 'submittable' string. This method will return a string
 * in the format: name1=value1&amp;name2=value2
 */
$.fn.formSerialize = function(semantic) {
    //hand off to jQuery.param for proper encoding
    return $.param(this.formToArray(semantic));
};

/**
 * Serializes all field elements in the jQuery object into a query string.
 * This method will return a string in the format: name1=value1&amp;name2=value2
 */
$.fn.fieldSerialize = function(successful) {
    var a = [];
    this.each(function() {
        var n = this.name;
        if (!n) {
            return;
        }
        var v = $.fieldValue(this, successful);
        if (v && v.constructor == Array) {
            for (var i=0,max=v.length; i < max; i++) {
                a.push({name: n, value: v[i]});
            }
        }
        else if (v !== null && typeof v != 'undefined') {
            a.push({name: this.name, value: v});
        }
    });
    //hand off to jQuery.param for proper encoding
    return $.param(a);
};

/**
 * Returns the value(s) of the element in the matched set.  For example, consider the following form:
 *
 *  <form><fieldset>
 *      <input name="A" type="text" />
 *      <input name="A" type="text" />
 *      <input name="B" type="checkbox" value="B1" />
 *      <input name="B" type="checkbox" value="B2"/>
 *      <input name="C" type="radio" value="C1" />
 *      <input name="C" type="radio" value="C2" />
 *  </fieldset></form>
 *
 *  var v = $('input[type=text]').fieldValue();
 *  // if no values are entered into the text inputs
 *  v == ['','']
 *  // if values entered into the text inputs are 'foo' and 'bar'
 *  v == ['foo','bar']
 *
 *  var v = $('input[type=checkbox]').fieldValue();
 *  // if neither checkbox is checked
 *  v === undefined
 *  // if both checkboxes are checked
 *  v == ['B1', 'B2']
 *
 *  var v = $('input[type=radio]').fieldValue();
 *  // if neither radio is checked
 *  v === undefined
 *  // if first radio is checked
 *  v == ['C1']
 *
 * The successful argument controls whether or not the field element must be 'successful'
 * (per http://www.w3.org/TR/html4/interact/forms.html#successful-controls).
 * The default value of the successful argument is true.  If this value is false the value(s)
 * for each element is returned.
 *
 * Note: This method *always* returns an array.  If no valid value can be determined the
 *    array will be empty, otherwise it will contain one or more values.
 */
$.fn.fieldValue = function(successful) {
    for (var val=[], i=0, max=this.length; i < max; i++) {
        var el = this[i];
        var v = $.fieldValue(el, successful);
        if (v === null || typeof v == 'undefined' || (v.constructor == Array && !v.length)) {
            continue;
        }
        if (v.constructor == Array)
            $.merge(val, v);
        else
            val.push(v);
    }
    return val;
};

/**
 * Returns the value of the field element.
 */
$.fieldValue = function(el, successful) {
    var n = el.name, t = el.type, tag = el.tagName.toLowerCase();
    if (successful === undefined) {
        successful = true;
    }

    if (successful && (!n || el.disabled || t == 'reset' || t == 'button' ||
        (t == 'checkbox' || t == 'radio') && !el.checked ||
        (t == 'submit' || t == 'image') && el.form && el.form.clk != el ||
        tag == 'select' && el.selectedIndex == -1)) {
            return null;
    }

    if (tag == 'select') {
        var index = el.selectedIndex;
        if (index < 0) {
            return null;
        }
        var a = [], ops = el.options;
        var one = (t == 'select-one');
        var max = (one ? index+1 : ops.length);
        for(var i=(one ? index : 0); i < max; i++) {
            var op = ops[i];
            if (op.selected) {
                var v = op.value;
                if (!v) { // extra pain for IE...
                    v = (op.attributes && op.attributes['value'] && !(op.attributes['value'].specified)) ? op.text : op.value;
                }
                if (one) {
                    return v;
                }
                a.push(v);
            }
        }
        return a;
    }
    return $(el).val();
};

/**
 * Clears the form data.  Takes the following actions on the form's input fields:
 *  - input text fields will have their 'value' property set to the empty string
 *  - select elements will have their 'selectedIndex' property set to -1
 *  - checkbox and radio inputs will have their 'checked' property set to false
 *  - inputs of type submit, button, reset, and hidden will *not* be effected
 *  - button elements will *not* be effected
 */
$.fn.clearForm = function(includeHidden) {
    return this.each(function() {
        $('input,select,textarea', this).clearFields(includeHidden);
    });
};

/**
 * Clears the selected form elements.
 */
$.fn.clearFields = $.fn.clearInputs = function(includeHidden) {
    var re = /^(?:color|date|datetime|email|month|number|password|range|search|tel|text|time|url|week)$/i; // 'hidden' is not in this list
    return this.each(function() {
        var t = this.type, tag = this.tagName.toLowerCase();
        if (re.test(t) || tag == 'textarea') {
            this.value = '';
        }
        else if (t == 'checkbox' || t == 'radio') {
            this.checked = false;
        }
        else if (tag == 'select') {
            this.selectedIndex = -1;
        }
		else if (t == "file") {
			if (/MSIE/.test(navigator.userAgent)) {
				$(this).replaceWith($(this).clone(true));
			} else {
				$(this).val('');
			}
		}
        else if (includeHidden) {
            // includeHidden can be the value true, or it can be a selector string
            // indicating a special test; for example:
            //  $('#myForm').clearForm('.special:hidden')
            // the above would clean hidden inputs that have the class of 'special'
            if ( (includeHidden === true && /hidden/.test(t)) ||
                 (typeof includeHidden == 'string' && $(this).is(includeHidden)) )
                this.value = '';
        }
    });
};

/**
 * Resets the form data.  Causes all form elements to be reset to their original value.
 */
$.fn.resetForm = function() {
    return this.each(function() {
        // guard against an input with the name of 'reset'
        // note that IE reports the reset function as an 'object'
        if (typeof this.reset == 'function' || (typeof this.reset == 'object' && !this.reset.nodeType)) {
            this.reset();
        }
    });
};

/**
 * Enables or disables any matching elements.
 */
$.fn.enable = function(b) {
    if (b === undefined) {
        b = true;
    }
    return this.each(function() {
        this.disabled = !b;
    });
};

/**
 * Checks/unchecks any matching checkboxes or radio buttons and
 * selects/deselects and matching option elements.
 */
$.fn.selected = function(select) {
    if (select === undefined) {
        select = true;
    }
    return this.each(function() {
        var t = this.type;
        if (t == 'checkbox' || t == 'radio') {
            this.checked = select;
        }
        else if (this.tagName.toLowerCase() == 'option') {
            var $sel = $(this).parent('select');
            if (select && $sel[0] && $sel[0].type == 'select-one') {
                // deselect all other options
                $sel.find('option').selected(false);
            }
            this.selected = select;
        }
    });
};

// expose debug var
$.fn.ajaxSubmit.debug = false;

// helper fn for console logging
function log() {
    if (!$.fn.ajaxSubmit.debug)
        return;
    var msg = '[jquery.form] ' + Array.prototype.join.call(arguments,'');
    if (window.console && window.console.log) {
        window.console.log(msg);
    }
    else if (window.opera && window.opera.postError) {
        window.opera.postError(msg);
    }
}

})(jQuery);

define("jquery.form", function(){});

// modal pattern.
//
// Author: Rok Garbas
// Contact: rok@garbas.si
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('mockup-patterns-modal',[
  'jquery',
  'underscore',
  'mockup-patterns-base',
  'mockup-patterns-backdrop',
  'mockup-registry',
  'mockup-router',
  'mockup-utils',
  'jquery.form'
], function($, _, Base, Backdrop, registry, Router, utils) {
  

  var Modal = Base.extend({
    name: "modal",
    createModal: null,
    $model: null,
    defaults: {
      width: "",
      height: "",
      margin: function() { return 20; }, // can be int or function that returns an int -- int is a pixel value
      position: "center middle", // format: "<horizontal> <vertical>" -- allowed values: top, bottom, left, right, center, middle
      triggers: [],
      backdrop: "body", // Element to initiate the Backdrop on.
      backdropOptions: {
        zIndex: "1040",
        opacity: "0.8",
        className: "backdrop",
        classActiveName: "backdrop-active",
        closeOnEsc: true,
        closeOnClick: true
      },
      title: null,
      titleSelector: 'h1:first',
      buttons: '.formControls > input[type="submit"]',
      content: '#content',
      automaticallyAddButtonActions: true,
      loadLinksWithinModal: true,
      prependContent: '.portalMessage',
      templateOptions: {
        className: "modal",
        classHeaderName: "modal-header",
        classBodyName: "modal-body",
        classFooterName: "modal-footer",
        classWrapperName: "modal-wrapper",
        classWrapperInnerName: "modal-wrapper-inner",
        classLoadingName: "modal-loading",
        classActiveName: "active",
        classPrependName: "", // String, css class to be applied to the wrapper of the prepended content
        classContentName: '',  // String, class name to be applied to the content of the modal, useful for modal specific styling
        template: '' +
          '<div class="<%= options.className %>">' +
          '  <div class="<%= options.classHeaderName %>">' +
          '    <a class="close">&times;</a>' +
          '    <% if (title) { %><h3><%= title %></h3><% } %>' +
          '  </div>' +
          '  <div class="<%= options.classBodyName %>">' +
          '    <div class="<%= options.classPrependName %>"><%= prepend %></div> ' +
          '    <div class="<%= options.classContentName %>"><%= content %></div>' +
          '  </div>' +
          '  <div class="<%= options.classFooterName %>"> ' +
          '    <%= buttons %> ' +
          '    <a class="close hiddenStructure">&times;</a>' +
          '  </div>' +
          '</div>'
      },
      actions: {},
      actionOptions: {
        eventType: 'click',
        target: null,
        ajaxUrl: null, // string, or function($el, options) that returns a string
        modalFunction: null, // String, function name on self to call
        isForm: false,
        timeout: 5000,
        displayInModal: true,
        reloadWindowOnClose: true,
        error: '.portalMessage.error',
        formFieldError: '.field.error',
        loading: '' +
          '<div class="progress progress-striped active">' +
          '  <div class="bar" style="width: 100%;"></div>' +
          '</div>',
        onSuccess: null,
        onError: null,
        onFormError: null,
        onTimeout: null,
        redirectOnResponse: false,
        redirectToUrl: function($action, response, options) {
            var $base = $(/<base.*?(\/>|<\/base>)/im.exec(response)[0]);
          return $base.attr('href');
        }
      },
      routerOptions: {
        id: null,
        pathExp: null
      },
      form: function(actions) {
        var self = this;
        var $modal = self.$modal;

        if (self.options.automaticallyAddButtonActions) {
          actions[self.options.buttons] = {};
        }

        if (self.options.loadLinksWithinModal) {
          actions.a = {};
        }

        $.each(actions, function(action, options) {
          var actionKeys = _.union(_.keys(self.options.actionOptions), ['templateOptions']);
          var actionOptions = $.extend(true, {}, self.options.actionOptions, _.pick(options, actionKeys));
          options.templateOptions = $.extend(true, options.templateOptions, self.options.templateOptions);

          var patternKeys = _.union(_.keys(self.options.actionOptions), ['actions', 'actionOptions']);
          var patternOptions = $.extend(true, _.omit(options, patternKeys), self.options);

          $(action, $('.'+options.templateOptions.classBodyName, $modal)).each(function(action) {
            var $action = $(this);
            $action.on(actionOptions.eventType, function(e) {
              e.stopPropagation();
              e.preventDefault();

              self.showLoading(false);

              // handle event on $action using a function on self
              if (actionOptions.modalFunction !== null) {
                self[actionOptions.modalFunction]();
              // handle event on input/button using jquery.form library
              } else if ($.nodeName($action[0], 'input') || $.nodeName($action[0], 'button') || options.isForm === true) {
                self.options.handleFormAction.apply(self, [$action, actionOptions, patternOptions]);
              // handle event on link with jQuery.ajax
              } else if (options.ajaxUrl !== null || $.nodeName($action[0], 'a')) {
                self.options.handleLinkAction.apply(self, [$action, actionOptions, patternOptions]);
              }

            });
          });
        });
      },
      handleFormAction: function($action, options, patternOptions) {
        var self = this;
        // pass action that was clicked when submiting form
        var extraData = {};
        extraData[$action.attr('name')] = $action.attr('value');

        var $form;

        if ($.nodeName($action[0], 'form')) {
          $form = $action;
        } else {
          $form = $action.parents('form:not(.disableAutoSubmit)');
        }

        var url;
        if (options.ajaxUrl !== null) {
          if (typeof options.ajaxUrl === 'function') {
            url = options.ajaxUrl.apply(self, [$action, options]);
          } else {
            url = options.ajaxUrl;
          }
        } else {
          url = $action.parents('form').attr('action');
        }

        // We want to trigger the form submit event but NOT use the default
        $form.on('submit', function(e){
          e.preventDefault();
        });
        $form.trigger('submit');

        self.showLoading(false);
        $form.ajaxSubmit({
          timeout: options.timeout,
          data: extraData,
          url: url,
            error: function(xhr, textStatus, errorStatus) {
              self.$loading.hide();
              if (textStatus === 'timeout' && options.onTimeout) {
                options.onTimeout.apply(self, xhr, errorStatus);
              // on "error", "abort", and "parsererror"
              } else if (options.onError) {
                options.onError(xhr, textStatus, errorStatus);
              } else {
                console.log('error happened do something');
              }
              self.trigger('formActionError', [xhr, textStatus, errorStatus]);
            },
            success: function(response, state, xhr, form) {
              self.$loading.hide();
              // if error is found (NOTE: check for both the portal errors
              // and the form field-level errors)
              if ($(options.error, response).size() !== 0 ||
                  $(options.formFieldError, response).size() !== 0) {
                if (options.onFormError) {
                  options.onFormError(self, response, state, xhr, form);
                } else {
                  self.redraw(response, patternOptions);
                }
                return;
              }

              if (options.redirectOnResponse === true) {
                if (typeof options.redirectToUrl === 'function') {
                  window.parent.location.href = options.redirectToUrl.apply(self, [$action, response, options]);
                } else {
                  window.parent.location.href = options.redirectToUrl;
                }
                return; // cut out right here since we're changing url
              }

              if (options.onSuccess) {
                options.onSuccess(self, response, state, xhr, form);
              }

              if (options.displayInModal === true) {
                self.redraw(response, patternOptions);
              } else {
                $action.trigger('destroy.modal.patterns');
                // also calls hide
                if (options.reloadWindowOnClose) {
                  self.reloadWindow();
                }
              }
              self.trigger('formActionSuccess', [response, state, xhr, form]);
            }
        });
      },
      handleLinkAction: function($action, options, patternOptions) {
        var self = this;
        var url;

        // Figure out URL
        if (options.ajaxUrl) {
          if (typeof options.ajaxUrl === 'function') {
            url = options.ajaxUrl.apply(self, [$action, options]);
          } else {
            url = options.ajaxUrl;
          }
        } else {
          url = $action.attr('href');
        }

        // Non-ajax link (I know it says "ajaxUrl" ...)
        if (options.displayInModal === false) {
          window.parent.location.href = url;
          return;
        }

        // ajax version
        $.ajax({
          url: url,
          error: function(xhr, textStatus, errorStatus) {
            if (textStatus === 'timeout' && options.onTimeout) {
              options.onTimeout(self.$modal, xhr, errorStatus);

            // on "error", "abort", and "parsererror"
            } else if (options.onError) {
              options.onError(xhr, textStatus, errorStatus);
            } else {
              console.log('error happened do something');
            }
            self.$loading.hide();
            self.trigger('linkActionError', [xhr, textStatus, errorStatus]);
          },
          success: function(response, state, xhr) {
            self.redraw(response, patternOptions);
            if (options.onSuccess) {
              options.onSuccess(self, response, state, xhr);
            }
            self.$loading.hide();
            self.trigger('linkActionSuccess', [response, state, xhr]);
          }
        });
      },
      render: function(options) {
        var self = this;

        self.trigger('before-render');

        if (!self.$raw) {
          return;
        }
        var $raw = self.$raw.clone();
        // fix for IE9 bug (see http://bugs.jquery.com/ticket/10550)
        $('input:checked', $raw).each(function() {
          if (this.setAttribute){
            this.setAttribute('checked', 'checked');
          }
        });
        // Object that will be passed to the template
        var tpl_object = {
          title: '',
          prepend: '<div />',
          content: '',
          buttons: '<div class="pattern-modal-buttons"></div>',
          options: options.templateOptions
        };

        // setup the Title
        if (options.title === null) {
          var $title = $(options.titleSelector, $raw);
          tpl_object.title = $title.html();
          $(options.titleSelector, $raw).remove();
        } else {
          tpl_object.title = options.title;
        }

        // Grab items to to insert into the prepend area
        if (options.prependContent) {
          tpl_object.prepend = $('<div />').append($(options.prependContent, $raw).clone()).html();
          $(options.prependContent, $raw).remove();
        }

        // Filter out the content if there is a selector provided
        if (options.content) {
          tpl_object.content = $(options.content, $raw).html();
        } else {
          tpl_object.content = $raw.html();
        }

        // Render html
        self.$modal = $(_.template(self.options.templateOptions.template, tpl_object));

        // In most browsers, when you hit the enter key while a form element is focused
        // the browser will trigger the form 'submit' event.  Google Chrome also does this,
        // but not when when the default submit button is hidden with 'display: none'.
        // The following code will work around this issue:
        $('form', self.$modal).on ('keydown', function (event) {
            // ignore keys which are not enter, and ignore enter inside a textarea.
            if (event.keyCode !== 13 || event.target.nodeName == 'TEXTAREA')
                return;

            event.preventDefault ();
            $('input[type=submit], button[type=submit], button:not(type)', this).eq(0).trigger ('click');
        });

        // Setup buttons
        $(options.buttons, self.$modal).each(function() {
          var $button = $(this);
          $button
            .on('click', function(e) {
              e.stopPropagation();
              e.preventDefault();
            })
            .clone()
            .appendTo($('.pattern-modal-buttons', self.$modal))
            .off('click').on('click', function(e) {
              e.stopPropagation();
              e.preventDefault();
              $button.trigger('click');
            });
          $button.hide();
        });

        self.trigger('before-events-setup');

        // Wire up events
        $('.modal-header > a.close, .modal-footer > a.close', self.$modal)
          .off('click')
          .on('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            $(e.target).trigger('destroy.modal.patterns');
          });

        // cleanup html
        $('.row', self.$modal).removeClass('row');

        // form
        if (options.form) {
          options.form.apply(self, [options.actions]);
        }

        self.$modal
          .addClass(self.options.templateOptions.className)
          .on('click', function(e) {
            e.stopPropagation();
            if ($.nodeName(e.target, 'a')) {
              e.preventDefault();

              // TODO: open links inside modal
              // and slide modal body
            }
            self.$modal.trigger('modal-click');
          })
          .on('destroy.modal.patterns', function(e) {
            e.stopPropagation();
            self.hide();
          })
          .on('resize.modal.patterns', function(e) {
            e.stopPropagation();
            e.preventDefault();
            self.positionModal();
          })
          .appendTo(self.$wrapperInner);
        self.$modal.data('pattern-' + self.name, self);

        self.trigger('after-render');
      }
    },
    reloadWindow: function() {
      window.parent.location.reload();
    },
    init: function() {
      var self = this;

      self.backdrop = new Backdrop(
          self.$el.parents(self.options.backdrop),
          self.options.backdropOptions);

      self.$wrapper = $('> .' + self.options.templateOptions.classWrapperName, self.backdrop.$el);
      if (self.$wrapper.size() === 0) {
        var zIndex = self.options.backdropOptions.zIndex !== null ? parseInt(self.options.backdropOptions.zIndex, 10) + 1 : 1041;
        self.$wrapper = $('<div/>')
          .hide()
          .css({
            'z-index': zIndex,
            'overflow-y': 'auto',
            'position': 'fixed',
            'height': '100%',
            'width': '100%',
            'bottom': '0',
            'left': '0',
            'right': '0',
            'top': '0'
          })
          .addClass(self.options.templateOptions.classWrapperName)
          .insertBefore(self.backdrop.$backdrop)
          .on('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            if (self.options.backdropOptions.closeOnClick) {
              self.backdrop.hide();
            }
          });
      }

      // Router
      if (self.options.routerOptions.id !== null) {
        Router.addRoute('modal', self.options.routerOptions.id, function() {
          this.show();
        }, self, self.options.routerOptions.pathExp, self.options.routerOptions.expReplace);
      }

      self.backdrop.on('hidden', function(e) {
        if (self.$modal !== undefined && self.$modal.hasClass(self.options.templateOptions.classActiveName)) {
          self.hide();
        }
      });

      if (self.options.backdropOptions.closeOnEsc === true) {
        $(document).on('keydown', function(e, data) {
          if (self.$el.is('.' + self.options.templateOptions.classActiveName)) {
            if (e.keyCode === 27) {  // ESC key pressed
              self.hide();
            }
          }
        });
      }

      self.$wrapperInner = $('> .' + self.options.templateOptions.classWrapperInnerName, self.$wrapper);
      if (self.$wrapperInner.size() === 0) {
        self.$wrapperInner = $('<div/>')
          .addClass(self.options.classWrapperInnerName)
          .css({
            'position': 'absolute',
            'bottom': '0',
            'left': '0',
            'right': '0',
            'top': '0'
          })
          .appendTo(self.$wrapper);
      }

      self.$loading = $('> .' + self.options.templateOptions.classLoadingName, self.$wrapperInner);
      if (self.$loading.size() === 0) {
        self.$loading = $('<div/>').hide()
          .addClass(self.options.templateOptions.classLoadingName)
          .appendTo(self.$wrapperInner);
      }

      $(window.parent).resize(function() {
        self.positionModal();
      });

      if (self.options.triggers) {
        $.each(self.options.triggers, function(i, item) {
          var e = item.substring(0, item.indexOf(' '));
          var selector = item.substring(item.indexOf(' '), item.length);
          $(selector || self.$el).on(e, function(e) {
            e.stopPropagation();
            e.preventDefault();
            self.show();
          });
        });
      }

      if (self.$el.is('a')) {
        if (self.$el.attr('href')) {
          if (!self.options.target && self.$el.attr('href').substr(0, 1) === '#') {
            self.options.target = self.$el.attr('href');
            self.options.content = '';
          }
          if (!self.options.ajaxUrl && self.$el.attr('href').substr(0, 1) !== '#') {
            self.options.ajaxUrl = self.$el.attr('href');
          }
        }
        self.$el.on('click', function(e) {
          e.stopPropagation();
          e.preventDefault();
          self.show();
        });
      }

      self.initModal();
    },
    showLoading: function(closable) {
      var self = this;

      if (closable === undefined) {
        closable = true;
      }

      self.backdrop.closeOnClick = closable;
      self.backdrop.closeOnEsc = closable;
      self.backdrop.init();

      self.$wrapper.parent().css('overflow', 'hidden');
      self.$wrapper.show();
      self.backdrop.show();
      self.$loading.show();
      self.positionLoading();
    },
    createAjaxModal: function() {
      var self = this;
      self.trigger('before-ajax');
      self.showLoading();
      self.ajaxXHR = $.ajax({
          url: self.options.ajaxUrl,
          type: self.options.ajaxType
      }).done(function(response, textStatus, xhr) {
        self.ajaxXHR = undefined;
        self.$loading.hide();
        self.$raw = $('<div />').append($(utils.parseBodyTag(response)));
        self.trigger('after-ajax', self, textStatus, xhr);
        self._show();
      });
    },
    createTargetModal: function() {
      var self = this;
      self.$raw = $(self.options.target).clone();
      self._show();
    },
    createBasicModal: function() {
      var self = this;
      self.$raw = $('<div/>').html(self.$el.clone());
      self._show();
    },
    createHtmlModal: function() {
      var self = this;
      var $el = $(self.options.html);
      self.$raw = $el;
      self._show();
    },
    initModal: function() {
      var self = this;
      if (self.options.ajaxUrl) {
        self.createModal = self.createAjaxModal;
      } else if (self.options.target) {
        self.createModal = self.createTargetModal;
      } else if (self.options.html) {
        self.createModal = self.createHtmlModal;
      } else {
        self.createModal = self.createBasicModal;
      }
    },
    positionLoading: function() {
      var self = this;
      self.$loading.css({
        'margin-left': self.$wrapper.width()/2 - self.$loading.width()/2,
        'margin-top': self.$wrapper.height()/2 - self.$loading.height()/2,
        'position': 'absolute',
        'bottom': '0',
        'left': '0',
        'right': '0',
        'top': '0'
      });
      if(self.modalInitialized()){
        var zIndex = self.$modal.css('zIndex');
        if(zIndex){
          self.$loading.css('zIndex', parseInt(zIndex, 10) + 1);
        }
      }
    },
    findPosition: function(horpos, vertpos, margin, modalWidth, modalHeight,
                           wrapperInnerWidth, wrapperInnerHeight) {
      var returnpos = {};
      var absTop, absBottom, absLeft, absRight;
      absRight = absLeft = absTop = absLeft = 'auto';

      // -- HORIZONTAL POSITION -----------------------------------------------
      if(horpos === 'left') {
        absLeft = margin + 'px';
        // if the width of the wrapper is smaller than the modal, and thus the
        // screen is smaller than the modal, force the left to simply be 0
        if(modalWidth > wrapperInnerWidth) {
          absLeft = '0px';
        }
        returnpos.left = absLeft;
      }
      else if(horpos === 'right') {
        absRight =  margin + 'px';
        // if the width of the wrapper is smaller than the modal, and thus the
        // screen is smaller than the modal, force the right to simply be 0
        if(modalWidth > wrapperInnerWidth) {
          absRight = '0px';
        }
        returnpos.right = absRight;
        returnpos.left = 'auto';
      }
      // default, no specified location, is to center
      else {
        absLeft = ((wrapperInnerWidth / 2) - (modalWidth / 2) - margin) + 'px';
        // if the width of the wrapper is smaller than the modal, and thus the
        // screen is smaller than the modal, force the left to simply be 0
        if(modalWidth > wrapperInnerWidth) {
          absLeft = '0px';
        }
        returnpos.left = absLeft;
      }

      // -- VERTICAL POSITION -------------------------------------------------
      if(vertpos === 'top') {
        absTop = margin + 'px';
        // if the height of the wrapper is smaller than the modal, and thus the
        // screen is smaller than the modal, force the top to simply be 0
        if(modalHeight > wrapperInnerHeight) {
          absTop = '0px';
        }
        returnpos.top = absTop;
      }
      else if(vertpos === 'bottom') {
        absBottom = margin + 'px';
        // if the height of the wrapper is smaller than the modal, and thus the
        // screen is smaller than the modal, force the bottom to simply be 0
        if(modalHeight > wrapperInnerHeight) {
          absBottom = '0px';
        }
        returnpos.bottom = absBottom;
        returnpos.top = 'auto';
      }
      else {
        // default case, no specified location, is to center
        absTop = ((wrapperInnerHeight / 2) - (modalHeight / 2) - margin) + 'px';
        // if the height of the wrapper is smaller than the modal, and thus the
        // screen is smaller than the modal, force the top to simply be 0
        if(modalHeight > wrapperInnerHeight) {
          absTop = '0px';
        }
        returnpos.top = absTop;
      }

      return returnpos;
    },
    modalInitialized: function(){
      var self = this;
      return self.$modal !== null && self.$modal !== undefined;
    },
    // re-position modal at any point.
    //
    // Uses:
    //  options.margin
    //  options.width
    //  options.height
    //  options.position
    positionModal: function() {
      var self = this;

      // modal isn't initialized
      if(!self.modalInitialized()) { return; }

      // clear out any previously set styling
      self.$modal.removeAttr('style');

      // make sure the (inner) wrapper fills it's container
      //self.$wrapperInner.css({height:'100%', width:'100%'});

      // if backdrop wrapper is set on body, then wrapper should have height of
      // the window, so we can do scrolling of inner wrapper
      if(self.$wrapper.parent().is('body')) {
        self.$wrapper.height($(window.parent).height());
      }

      var margin = typeof self.options.margin === 'function' ? self.options.margin() : self.options.margin;
      self.$modal.css({
        'padding': '0',
        'margin': margin,
        'width': self.options.width, // defaults to "", which doesn't override other css
        'height': self.options.height, // defaults to "", which doesn't override other css
        'position': 'absolute'
      });

      var posopt = self.options.position.split(' '),
          horpos = posopt[0],
          vertpos = posopt[1];
      var modalWidth = self.$modal.outerWidth(true);
      var modalHeight = self.$modal.outerHeight(true);
      var wrapperInnerWidth = self.$wrapperInner.width();
      var wrapperInnerHeight = self.$wrapperInner.height();

      var pos = self.findPosition(horpos, vertpos, margin, modalWidth, modalHeight,
                                  wrapperInnerWidth, wrapperInnerHeight);
      for(var key in pos) {
        self.$modal.css(key, pos[key]);
      }
    },
    render: function(options) {
      var self = this;
      self.trigger('render');
      self.options.render.apply(self, [options]);
      self.trigger('rendered');
    },
    show: function() {
      var self = this;
      self.createModal();
    },
    _show: function() {
      var self = this;
      self.render.apply(self,
          [self.options]);
      self.trigger('show');
      self.backdrop.show();
      self.$wrapper.show();
      self.$loading.hide();
      self.$wrapper.parent().css('overflow', 'hidden');
      self.$el.addClass(self.options.templateOptions.classActiveName);
      self.$modal.addClass(self.options.templateOptions.classActiveName);
      registry.scan(self.$modal);
      self.positionModal();
      $('img', self.$modal).load(function() {
        self.positionModal();
      });
      $(window.parent).on('resize.modal.patterns', function() {
        self.positionModal();
      });
      self.trigger('shown');
    },
    hide: function() {
      var self = this;
      if (self.ajaxXHR) {
        self.ajaxXHR.abort();
      }
      self.trigger('hide');
      if ($('.modal', self.$wrapper).size() < 2) {
        self.backdrop.hide();
        self.$wrapper.hide();
        self.$wrapper.parent().css('overflow', 'visible');
      }
      self.$loading.hide();
      self.$el.removeClass(self.options.templateOptions.classActiveName);
      if (self.$modal !== undefined) {
        self.$modal.remove();
        self.initModal();
      }
      $(window.parent).off('resize.modal.patterns');
      self.trigger('hidden');
    },
    redraw: function(response, options) {
      var self = this;
      self.trigger('beforeDraw');
      self.$modal.remove();
      self.$raw = $('<div />').append($(utils.parseBodyTag(response)));
      self.render.apply(self, [options || self.options]);
      self.positionModal();
      registry.scan(self.$modal);
      self.trigger('afterDraw');
    }
  });

  return Modal;

});

// Pattern which Plone livesearch functionality on an input
//
// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Adapted from queryhelper.js in Plone.
//
// License:
//
// Copyright (C) 2013 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('mockup-patterns-queryhelper',[
  'jquery',
  'mockup-patterns-base'
], function($, Base) {
  

  var QueryHelper = Base.extend({
    name: "queryhelper",
    defaults: {
      basePattern: null, // must be passed in
      vocabularyUrl: null,
      searchParam: 'SearchableText', // query string param to pass to search url
      attributes: ['UID','Title', 'Description', 'getURL', 'Type'],
      batchSize: 10, // number of results to retrive
      baseCriteria: [],
      pathDepth: 1
    },

    init: function() {
      /* if basePattern argument provided, it can implement the interface of:
       *    - browsing: boolean if currently browsing
       *    - currentPath: string of current path to apply to search if browsing
       *    - basePath: default path to provide if no subpath used
       */
      var self = this;
      self.basePattern = self.options.basePattern;
      if(self.basePattern === undefined){
        self.basePattern = {
          browsing: false,
          basePath: '/'
        };
      }

      if (self.options.url && !self.options.vocabularyUrl) {
        self.options.vocabularyUrl = self.options.url;
      }
      if(self.options.vocabularyUrl !== undefined &&
          self.options.vocabularyUrl !== null){
        self.valid = true;
      }else{
        self.valid = false;
      }
    },
    getCurrentPath: function(){
      var self = this;
      var pattern = self.basePattern;
      var currentPath;
      /* If currentPath is set on the QueryHelper object, use that first.
       * Then, check on the pattern.
       * Finally, see if it is a function and call it if it is.
       */
      if(self.currentPath){
        currentPath = self.currentPath;
      }else{
        currentPath = pattern.currentPath;
      }
      if(typeof(currentPath) === 'function'){
        currentPath = currentPath();
      }
      var path = currentPath;
      if(!path){
        if(pattern.options.basePath){
          path = pattern.options.basePath;
        }else{
          path = '/';
        }
      }
      return path;
    },
    getCriterias: function(term, options){
      if(options === undefined){
        options = {};
      }
      options = $.extend({}, {
        useBaseCriteria: true,
        additionalCriterias: []
      }, options);

      var self = this;
      var criterias = [];
      if(options.useBaseCriteria){
        criterias = self.options.baseCriteria.slice(0);
      }
      if(term){
        term += '*';
        criterias.push({
          i: self.options.searchParam,
          o: 'plone.app.querystring.operation.string.contains',
          v: term
        });
      }
      var pattern = self.basePattern;
      if(pattern.browsing){
        criterias.push({
          i: 'path',
          o: 'plone.app.querystring.operation.string.path',
          v: self.getCurrentPath() + '::' + self.options.pathDepth
        });
      }
      criterias = criterias.concat(options.additionalCriterias);
      return criterias;
    },
    getBatch: function(page){
      if(!page){
        page = 1;
      }
      var self = this;
      return {
        page: page,
        size: self.options.batchSize
      };
    },
    selectAjax: function(){
      var self = this;
      return {
        url: self.options.vocabularyUrl,
        dataType: 'JSON',
        quietMillis: 100,
        data: function(term, page) {
          return self.getQueryData(term, page);
        },
        results: function (data, page) {
          var more = (page * 10) < data.total; // whether or not there are more results available
          // notice we return the value of more so Select2 knows if more results can be loaded
          return {results: data.results, more: more};
        }
      };
    },
    getUrl: function(){
      var self = this;
      var url = self.options.vocabularyUrl;
      if(url.indexOf('?') === -1){
        url += '?';
      }else{
        url += '&';
      }
      return url + $.param(self.getQueryData());
    },
    getQueryData: function(term, page){
      var self = this;
      var data = {
        query: JSON.stringify({
          criteria: self.getCriterias(term)
        }),
        attributes: JSON.stringify(self.options.attributes)
      };
      if(page){
        data.batch = JSON.stringify(self.getBatch(page));
      }
      return data;
    },
    search: function(term, operation, value, callback, useBaseCriteria){
      if(useBaseCriteria === undefined){
        useBaseCriteria = true;
      }
      var self = this;
      var criteria = [];
      if(useBaseCriteria){
        criteria = self.options.baseCriteria.slice(0);
      }
      criteria.push({
        i: term,
        o: operation,
        v: value
      });
      var data = {
        query: JSON.stringify({ criteria: criteria }),
        attributes: JSON.stringify(self.options.attributes)
      };
      $.ajax({
        url: self.options.vocabularyUrl,
        dataType: 'JSON',
        data: data,
        success: callback
      });
    }
  });

  return QueryHelper;

});


// Author: Ryan Foster
// Contact: ryan@rynamic.com
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/ui/views/base',[
  'underscore',
  'backbone'
  ], function(_, Backbone) {
  

  var BaseView = Backbone.View.extend({
    isUIView: true,
    eventPrefix: 'ui',
    template: null,
    appendInContainer: true,
    initialize: function() {
      for (var key in this.options) {
        this[key] = this.options[key];
      }
    },
    render: function() {
      this.applyTemplate();

      this.trigger('render', this);
      this.afterRender();

      return this;
    },
    afterRender: function() {

    },
    serializedModel: function() {
      return this.options;
    },
    applyTemplate: function() {
      if (this.template !== null) {
        this.$el.html(_.template(this.template, this.serializedModel()));
      }
    },
    propagateEvent: function(eventName) {
      if (eventName.indexOf(':') > 0) {
        var eventId = eventName.split(':')[0];
        if (this.eventPrefix !== '') {
          if (eventId === this.eventPrefix ||
              eventId === this.eventPrefix + '.' + this.id) { return true; }
        }
      }
      return false;
    },
    uiEventTrigger: function(name) {
      var args = [].slice.call(arguments, 0);

      if (this.eventPrefix !== '') {
        args[0] = this.eventPrefix + ':' + name;
        Backbone.View.prototype.trigger.apply(this, args);
        if (this.id) {
          args[0] =  this.eventPrefix + '.' + this.id + ':' + name;
          Backbone.View.prototype.trigger.apply(this, args);
        }
      }
    }
  });

  return BaseView;
});

// Author: Ryan Foster
// Contact: ryan@rynamic.com
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/ui/views/container',[
  'jquery',
  'underscore',
  'backbone',
  'js/ui/views/base'
], function($, _, Backbone, BaseView) {
  

  var Container = BaseView.extend({
    id: '',
    items: [],
    itemContainer: null,
    isOffsetParent: true,
    render: function() {
      this.applyTemplate();

      this.renderItems();
      this.bindEvents();

      if (this.isOffsetParent) {
        this.$el.addClass('ui-offset-parent');
      }

      this.trigger('render', this);

      this.afterRender();

      return this;
    },
    renderItems: function() {
      var $container;

      if (this.itemContainer !== null) {
        $container = $(this.itemContainer, this.$el);
        if ($container.length === 0) {
          throw "Item Container element not found.";
        }
      } else {
        $container = this.$el;
      }
      _.each(this.items, function(view){
        if (view.appendInContainer === true) {
          $container.append(view.render().$el);
        } else {
          view.render();
        }
      }, this);
    },
    bindEvents: function() {
      var self = this;
      _.each(this.items, function(view) {
        view.on('all', function() {
          var slice = [].slice;
          var eventName = arguments[0];
          var eventTarget;
          var newName = self.id !== '' ? self.id + '.' + eventName : eventName;
          if (arguments.length > 1) {
            eventTarget = arguments[1];
          }
          if (newName !== eventName) {
            var newArgs = slice.call(arguments, 0);
            newArgs[0] = newName;
            self.trigger.apply(self, newArgs);
          }
          if (eventTarget !== undefined && eventTarget.isUIView === true) {
            if (eventTarget.propagateEvent(eventName) === true) {
              self.trigger.apply(self, arguments);
            }
          }
        });
      });
    },
    get: function(id){
      // Remove the recursive part because it was confusing if two children had the
      // same id
      return _.findWhere(this.items, {'id': id});
    },
    add: function(item) {
      if (item.id !== undefined && this.get(item.id)) {
        throw "Another item with the same `id` already exists.";
      }
      this.items.push(item);
    }
  });

  return Container;
});

// Author: Ryan Foster
// Contact: ryan@rynamic.com
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/ui/views/toolbar',[
  'underscore',
  'backbone',
  'js/ui/views/container'
], function(_, Backbone, ContainerView) {
  

  var Toolbar = ContainerView.extend({
    tagName: 'div',
    className: 'navbar'
  });

  return Toolbar;
});

// Author: Ryan Foster
// Contact: ryan@rynamic.com
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/ui/views/buttongroup',[
  'underscore',
  'backbone',
  'js/ui/views/container'
  ], function(_, Backbone, ContainerView) {
  

  var ButtonGroup = ContainerView.extend({
    tagName: 'div',
    className: 'btn-group',
    disable: function() {
      _.each(this.items, function(button) {
        button.trigger('disable');
      });
    },
    enable: function() {
      _.each(this.items, function(button) {
        button.trigger('enable');
      });
    }
  });

  return ButtonGroup;
});

/* ===========================================================
 * bootstrap-tooltip.js v2.3.2
 * http://getbootstrap.com/2.3.2/javascript.html#tooltips
 * Inspired by the original jQuery.tipsy by Jason Frame
 * ===========================================================
 * Copyright 2013 Twitter, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ========================================================== */


!function ($) {

   // jshint ;_;


 /* TOOLTIP PUBLIC CLASS DEFINITION
  * =============================== */

  var Tooltip = function (element, options) {
    this.init('tooltip', element, options)
  }

  Tooltip.prototype = {

    constructor: Tooltip

  , init: function (type, element, options) {
      var eventIn
        , eventOut
        , triggers
        , trigger
        , i

      this.type = type
      this.$element = $(element)
      this.options = this.getOptions(options)
      this.enabled = true

      triggers = this.options.trigger.split(' ')

      for (i = triggers.length; i--;) {
        trigger = triggers[i]
        if (trigger == 'click') {
          this.$element.on('click.' + this.type, this.options.selector, $.proxy(this.toggle, this))
        } else if (trigger != 'manual') {
          eventIn = trigger == 'hover' ? 'mouseenter' : 'focus'
          eventOut = trigger == 'hover' ? 'mouseleave' : 'blur'
          this.$element.on(eventIn + '.' + this.type, this.options.selector, $.proxy(this.enter, this))
          this.$element.on(eventOut + '.' + this.type, this.options.selector, $.proxy(this.leave, this))
        }
      }

      this.options.selector ?
        (this._options = $.extend({}, this.options, { trigger: 'manual', selector: '' })) :
        this.fixTitle()
    }

  , getOptions: function (options) {
      options = $.extend({}, $.fn[this.type].defaults, this.$element.data(), options)

      if (options.delay && typeof options.delay == 'number') {
        options.delay = {
          show: options.delay
        , hide: options.delay
        }
      }

      return options
    }

  , enter: function (e) {
      var defaults = $.fn[this.type].defaults
        , options = {}
        , self

      this._options && $.each(this._options, function (key, value) {
        if (defaults[key] != value) options[key] = value
      }, this)

      self = $(e.currentTarget)[this.type](options).data(this.type)

      if (!self.options.delay || !self.options.delay.show) return self.show()

      clearTimeout(this.timeout)
      self.hoverState = 'in'
      this.timeout = setTimeout(function() {
        if (self.hoverState == 'in') self.show()
      }, self.options.delay.show)
    }

  , leave: function (e) {
      var self = $(e.currentTarget)[this.type](this._options).data(this.type)

      if (this.timeout) clearTimeout(this.timeout)
      if (!self.options.delay || !self.options.delay.hide) return self.hide()

      self.hoverState = 'out'
      this.timeout = setTimeout(function() {
        if (self.hoverState == 'out') self.hide()
      }, self.options.delay.hide)
    }

  , show: function () {
      var $tip
        , pos
        , actualWidth
        , actualHeight
        , placement
        , tp
        , e = $.Event('show')

      if (this.hasContent() && this.enabled) {
        this.$element.trigger(e)
        if (e.isDefaultPrevented()) return
        $tip = this.tip()
        this.setContent()

        if (this.options.animation) {
          $tip.addClass('fade')
        }

        placement = typeof this.options.placement == 'function' ?
          this.options.placement.call(this, $tip[0], this.$element[0]) :
          this.options.placement

        $tip
          .detach()
          .css({ top: 0, left: 0, display: 'block' })

        this.options.container ? $tip.appendTo(this.options.container) : $tip.insertAfter(this.$element)

        pos = this.getPosition()

        actualWidth = $tip[0].offsetWidth
        actualHeight = $tip[0].offsetHeight

        switch (placement) {
          case 'bottom':
            tp = {top: pos.top + pos.height, left: pos.left + pos.width / 2 - actualWidth / 2}
            break
          case 'top':
            tp = {top: pos.top - actualHeight, left: pos.left + pos.width / 2 - actualWidth / 2}
            break
          case 'left':
            tp = {top: pos.top + pos.height / 2 - actualHeight / 2, left: pos.left - actualWidth}
            break
          case 'right':
            tp = {top: pos.top + pos.height / 2 - actualHeight / 2, left: pos.left + pos.width}
            break
        }

        this.applyPlacement(tp, placement)
        this.$element.trigger('shown')
      }
    }

  , applyPlacement: function(offset, placement){
      var $tip = this.tip()
        , width = $tip[0].offsetWidth
        , height = $tip[0].offsetHeight
        , actualWidth
        , actualHeight
        , delta
        , replace

      $tip
        .offset(offset)
        .addClass(placement)
        .addClass('in')

      actualWidth = $tip[0].offsetWidth
      actualHeight = $tip[0].offsetHeight

      if (placement == 'top' && actualHeight != height) {
        offset.top = offset.top + height - actualHeight
        replace = true
      }

      if (placement == 'bottom' || placement == 'top') {
        delta = 0

        if (offset.left < 0){
          delta = offset.left * -2
          offset.left = 0
          $tip.offset(offset)
          actualWidth = $tip[0].offsetWidth
          actualHeight = $tip[0].offsetHeight
        }

        this.replaceArrow(delta - width + actualWidth, actualWidth, 'left')
      } else {
        this.replaceArrow(actualHeight - height, actualHeight, 'top')
      }

      if (replace) $tip.offset(offset)
    }

  , replaceArrow: function(delta, dimension, position){
      this
        .arrow()
        .css(position, delta ? (50 * (1 - delta / dimension) + "%") : '')
    }

  , setContent: function () {
      var $tip = this.tip()
        , title = this.getTitle()

      $tip.find('.tooltip-inner')[this.options.html ? 'html' : 'text'](title)
      $tip.removeClass('fade in top bottom left right')
    }

  , hide: function () {
      var that = this
        , $tip = this.tip()
        , e = $.Event('hide')

      this.$element.trigger(e)
      if (e.isDefaultPrevented()) return

      $tip.removeClass('in')

      function removeWithAnimation() {
        var timeout = setTimeout(function () {
          $tip.off($.support.transition.end).detach()
        }, 500)

        $tip.one($.support.transition.end, function () {
          clearTimeout(timeout)
          $tip.detach()
        })
      }

      $.support.transition && this.$tip.hasClass('fade') ?
        removeWithAnimation() :
        $tip.detach()

      this.$element.trigger('hidden')

      return this
    }

  , fixTitle: function () {
      var $e = this.$element
      if ($e.attr('title') || typeof($e.attr('data-original-title')) != 'string') {
        $e.attr('data-original-title', $e.attr('title') || '').attr('title', '')
      }
    }

  , hasContent: function () {
      return this.getTitle()
    }

  , getPosition: function () {
      var el = this.$element[0]
      return $.extend({}, (typeof el.getBoundingClientRect == 'function') ? el.getBoundingClientRect() : {
        width: el.offsetWidth
      , height: el.offsetHeight
      }, this.$element.offset())
    }

  , getTitle: function () {
      var title
        , $e = this.$element
        , o = this.options

      title = $e.attr('data-original-title')
        || (typeof o.title == 'function' ? o.title.call($e[0]) :  o.title)

      return title
    }

  , tip: function () {
      return this.$tip = this.$tip || $(this.options.template)
    }

  , arrow: function(){
      return this.$arrow = this.$arrow || this.tip().find(".tooltip-arrow")
    }

  , validate: function () {
      if (!this.$element[0].parentNode) {
        this.hide()
        this.$element = null
        this.options = null
      }
    }

  , enable: function () {
      this.enabled = true
    }

  , disable: function () {
      this.enabled = false
    }

  , toggleEnabled: function () {
      this.enabled = !this.enabled
    }

  , toggle: function (e) {
      var self = e ? $(e.currentTarget)[this.type](this._options).data(this.type) : this
      self.tip().hasClass('in') ? self.hide() : self.show()
    }

  , destroy: function () {
      this.hide().$element.off('.' + this.type).removeData(this.type)
    }

  }


 /* TOOLTIP PLUGIN DEFINITION
  * ========================= */

  var old = $.fn.tooltip

  $.fn.tooltip = function ( option ) {
    return this.each(function () {
      var $this = $(this)
        , data = $this.data('tooltip')
        , options = typeof option == 'object' && option
      if (!data) $this.data('tooltip', (data = new Tooltip(this, options)))
      if (typeof option == 'string') data[option]()
    })
  }

  $.fn.tooltip.Constructor = Tooltip

  $.fn.tooltip.defaults = {
    animation: true
  , placement: 'top'
  , selector: false
  , template: '<div class="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner"></div></div>'
  , trigger: 'hover focus'
  , title: ''
  , delay: 0
  , html: false
  , container: false
  }


 /* TOOLTIP NO CONFLICT
  * =================== */

  $.fn.tooltip.noConflict = function () {
    $.fn.tooltip = old
    return this
  }

}(window.jQuery);

define("bootstrap-tooltip", ["jquery"], function(){});

// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/ui/views/button',[
  'jquery',
  'backbone',
  'underscore',
  'js/ui/views/base',
  'bootstrap-tooltip'
],
  function($, Backbone, _, BaseView) {
  

  var ButtonView = BaseView.extend({
    tagName: 'a',
    className: 'btn',
    eventPrefix: 'button',
    context: null,
    attributes: {
      'href': '#'
    },
    tooltip: null,
    template: '<% if (icon) { %><i class="icon-<%= icon %>"</i><% } %> <%= title %>',
    events: {
      'click': 'handleClick'
    },
    initialize: function() {
      if (!this.options.id) {
        var title = this.options.title || '';
        this.options.id = title !== '' ? title.toLowerCase().replace(' ', '-') : this.cid;
      }
      BaseView.prototype.initialize.call(this);

      this.on('disable', function() {
        this.disable();
      }, this);

      this.on('enable', function() {
        this.enable();
      }, this);

      this.on('render', function() {
        if(this.context !== null){
          this.$el.addClass('btn-' + this.context);
        }

        if (this.tooltip !== null) {
          this.$el.tooltip({
            title: this.tooltip
          });
          // XXX since tooltip triggers hidden
          // suppress so it plays nice with modals, backdrops, etc
          this.$el.on('hidden', function(e){
            if(e.type == 'hidden'){
              e.stopPropagation();
            }
          });
        }
      }, this);
    },
    handleClick: function(e){
      e.preventDefault();
      if (!this.$el.is('.disabled')) {
        this.uiEventTrigger('click', this, e);
      }
    },
    serializedModel: function() {
      return _.extend({'icon': '', 'title': ''}, this.options);
    },
    disable: function() {
      this.options.disabled = true;
      this.$el.addClass('disabled');
    },
    enable: function() {
      this.options.disabled = false;
      this.$el.removeClass('disabled');
    }
  });

  return ButtonView;
});

/**
 * @license RequireJS text 2.0.10 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/text for details
 */
/*jslint regexp: true */
/*global require, XMLHttpRequest, ActiveXObject,
  define, window, process, Packages,
  java, location, Components, FileUtils */

define('text',['module'], function (module) {
    

    var text, fs, Cc, Ci, xpcIsWindows,
        progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'],
        xmlRegExp = /^\s*<\?xml(\s)+version=[\'\"](\d)*.(\d)*[\'\"](\s)*\?>/im,
        bodyRegExp = /<body[^>]*>\s*([\s\S]+)\s*<\/body>/im,
        hasLocation = typeof location !== 'undefined' && location.href,
        defaultProtocol = hasLocation && location.protocol && location.protocol.replace(/\:/, ''),
        defaultHostName = hasLocation && location.hostname,
        defaultPort = hasLocation && (location.port || undefined),
        buildMap = {},
        masterConfig = (module.config && module.config()) || {};

    text = {
        version: '2.0.10',

        strip: function (content) {
            //Strips <?xml ...?> declarations so that external SVG and XML
            //documents can be added to a document without worry. Also, if the string
            //is an HTML document, only the part inside the body tag is returned.
            if (content) {
                content = content.replace(xmlRegExp, "");
                var matches = content.match(bodyRegExp);
                if (matches) {
                    content = matches[1];
                }
            } else {
                content = "";
            }
            return content;
        },

        jsEscape: function (content) {
            return content.replace(/(['\\])/g, '\\$1')
                .replace(/[\f]/g, "\\f")
                .replace(/[\b]/g, "\\b")
                .replace(/[\n]/g, "\\n")
                .replace(/[\t]/g, "\\t")
                .replace(/[\r]/g, "\\r")
                .replace(/[\u2028]/g, "\\u2028")
                .replace(/[\u2029]/g, "\\u2029");
        },

        createXhr: masterConfig.createXhr || function () {
            //Would love to dump the ActiveX crap in here. Need IE 6 to die first.
            var xhr, i, progId;
            if (typeof XMLHttpRequest !== "undefined") {
                return new XMLHttpRequest();
            } else if (typeof ActiveXObject !== "undefined") {
                for (i = 0; i < 3; i += 1) {
                    progId = progIds[i];
                    try {
                        xhr = new ActiveXObject(progId);
                    } catch (e) {}

                    if (xhr) {
                        progIds = [progId];  // so faster next time
                        break;
                    }
                }
            }

            return xhr;
        },

        /**
         * Parses a resource name into its component parts. Resource names
         * look like: module/name.ext!strip, where the !strip part is
         * optional.
         * @param {String} name the resource name
         * @returns {Object} with properties "moduleName", "ext" and "strip"
         * where strip is a boolean.
         */
        parseName: function (name) {
            var modName, ext, temp,
                strip = false,
                index = name.indexOf("."),
                isRelative = name.indexOf('./') === 0 ||
                             name.indexOf('../') === 0;

            if (index !== -1 && (!isRelative || index > 1)) {
                modName = name.substring(0, index);
                ext = name.substring(index + 1, name.length);
            } else {
                modName = name;
            }

            temp = ext || modName;
            index = temp.indexOf("!");
            if (index !== -1) {
                //Pull off the strip arg.
                strip = temp.substring(index + 1) === "strip";
                temp = temp.substring(0, index);
                if (ext) {
                    ext = temp;
                } else {
                    modName = temp;
                }
            }

            return {
                moduleName: modName,
                ext: ext,
                strip: strip
            };
        },

        xdRegExp: /^((\w+)\:)?\/\/([^\/\\]+)/,

        /**
         * Is an URL on another domain. Only works for browser use, returns
         * false in non-browser environments. Only used to know if an
         * optimized .js version of a text resource should be loaded
         * instead.
         * @param {String} url
         * @returns Boolean
         */
        useXhr: function (url, protocol, hostname, port) {
            var uProtocol, uHostName, uPort,
                match = text.xdRegExp.exec(url);
            if (!match) {
                return true;
            }
            uProtocol = match[2];
            uHostName = match[3];

            uHostName = uHostName.split(':');
            uPort = uHostName[1];
            uHostName = uHostName[0];

            return (!uProtocol || uProtocol === protocol) &&
                   (!uHostName || uHostName.toLowerCase() === hostname.toLowerCase()) &&
                   ((!uPort && !uHostName) || uPort === port);
        },

        finishLoad: function (name, strip, content, onLoad) {
            content = strip ? text.strip(content) : content;
            if (masterConfig.isBuild) {
                buildMap[name] = content;
            }
            onLoad(content);
        },

        load: function (name, req, onLoad, config) {
            //Name has format: some.module.filext!strip
            //The strip part is optional.
            //if strip is present, then that means only get the string contents
            //inside a body tag in an HTML string. For XML/SVG content it means
            //removing the <?xml ...?> declarations so the content can be inserted
            //into the current doc without problems.

            // Do not bother with the work if a build and text will
            // not be inlined.
            if (config.isBuild && !config.inlineText) {
                onLoad();
                return;
            }

            masterConfig.isBuild = config.isBuild;

            var parsed = text.parseName(name),
                nonStripName = parsed.moduleName +
                    (parsed.ext ? '.' + parsed.ext : ''),
                url = req.toUrl(nonStripName),
                useXhr = (masterConfig.useXhr) ||
                         text.useXhr;

            // Do not load if it is an empty: url
            if (url.indexOf('empty:') === 0) {
                onLoad();
                return;
            }

            //Load the text. Use XHR if possible and in a browser.
            if (!hasLocation || useXhr(url, defaultProtocol, defaultHostName, defaultPort)) {
                text.get(url, function (content) {
                    text.finishLoad(name, parsed.strip, content, onLoad);
                }, function (err) {
                    if (onLoad.error) {
                        onLoad.error(err);
                    }
                });
            } else {
                //Need to fetch the resource across domains. Assume
                //the resource has been optimized into a JS module. Fetch
                //by the module name + extension, but do not include the
                //!strip part to avoid file system issues.
                req([nonStripName], function (content) {
                    text.finishLoad(parsed.moduleName + '.' + parsed.ext,
                                    parsed.strip, content, onLoad);
                });
            }
        },

        write: function (pluginName, moduleName, write, config) {
            if (buildMap.hasOwnProperty(moduleName)) {
                var content = text.jsEscape(buildMap[moduleName]);
                write.asModule(pluginName + "!" + moduleName,
                               "define(function () { return '" +
                                   content +
                               "';});\n");
            }
        },

        writeFile: function (pluginName, moduleName, req, write, config) {
            var parsed = text.parseName(moduleName),
                extPart = parsed.ext ? '.' + parsed.ext : '',
                nonStripName = parsed.moduleName + extPart,
                //Use a '.js' file name so that it indicates it is a
                //script that can be loaded across domains.
                fileName = req.toUrl(parsed.moduleName + extPart) + '.js';

            //Leverage own load() method to load plugin value, but only
            //write out values that do not have the strip argument,
            //to avoid any potential issues with ! in file names.
            text.load(nonStripName, req, function (value) {
                //Use own write() method to construct full module value.
                //But need to create shell that translates writeFile's
                //write() to the right interface.
                var textWrite = function (contents) {
                    return write(fileName, contents);
                };
                textWrite.asModule = function (moduleName, contents) {
                    return write.asModule(moduleName, fileName, contents);
                };

                text.write(pluginName, nonStripName, textWrite, config);
            }, config);
        }
    };

    if (masterConfig.env === 'node' || (!masterConfig.env &&
            typeof process !== "undefined" &&
            process.versions &&
            !!process.versions.node &&
            !process.versions['node-webkit'])) {
        //Using special require.nodeRequire, something added by r.js.
        fs = require.nodeRequire('fs');

        text.get = function (url, callback, errback) {
            try {
                var file = fs.readFileSync(url, 'utf8');
                //Remove BOM (Byte Mark Order) from utf8 files if it is there.
                if (file.indexOf('\uFEFF') === 0) {
                    file = file.substring(1);
                }
                callback(file);
            } catch (e) {
                errback(e);
            }
        };
    } else if (masterConfig.env === 'xhr' || (!masterConfig.env &&
            text.createXhr())) {
        text.get = function (url, callback, errback, headers) {
            var xhr = text.createXhr(), header;
            xhr.open('GET', url, true);

            //Allow plugins direct access to xhr headers
            if (headers) {
                for (header in headers) {
                    if (headers.hasOwnProperty(header)) {
                        xhr.setRequestHeader(header.toLowerCase(), headers[header]);
                    }
                }
            }

            //Allow overrides specified in config
            if (masterConfig.onXhr) {
                masterConfig.onXhr(xhr, url);
            }

            xhr.onreadystatechange = function (evt) {
                var status, err;
                //Do not explicitly handle errors, those should be
                //visible via console output in the browser.
                if (xhr.readyState === 4) {
                    status = xhr.status;
                    if (status > 399 && status < 600) {
                        //An http 4xx or 5xx error. Signal an error.
                        err = new Error(url + ' HTTP status: ' + status);
                        err.xhr = xhr;
                        errback(err);
                    } else {
                        callback(xhr.responseText);
                    }

                    if (masterConfig.onXhrComplete) {
                        masterConfig.onXhrComplete(xhr, url);
                    }
                }
            };
            xhr.send(null);
        };
    } else if (masterConfig.env === 'rhino' || (!masterConfig.env &&
            typeof Packages !== 'undefined' && typeof java !== 'undefined')) {
        //Why Java, why is this so awkward?
        text.get = function (url, callback) {
            var stringBuffer, line,
                encoding = "utf-8",
                file = new java.io.File(url),
                lineSeparator = java.lang.System.getProperty("line.separator"),
                input = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(file), encoding)),
                content = '';
            try {
                stringBuffer = new java.lang.StringBuffer();
                line = input.readLine();

                // Byte Order Mark (BOM) - The Unicode Standard, version 3.0, page 324
                // http://www.unicode.org/faq/utf_bom.html

                // Note that when we use utf-8, the BOM should appear as "EF BB BF", but it doesn't due to this bug in the JDK:
                // http://bugs.sun.com/bugdatabase/view_bug.do?bug_id=4508058
                if (line && line.length() && line.charAt(0) === 0xfeff) {
                    // Eat the BOM, since we've already found the encoding on this file,
                    // and we plan to concatenating this buffer with others; the BOM should
                    // only appear at the top of a file.
                    line = line.substring(1);
                }

                if (line !== null) {
                    stringBuffer.append(line);
                }

                while ((line = input.readLine()) !== null) {
                    stringBuffer.append(lineSeparator);
                    stringBuffer.append(line);
                }
                //Make sure we return a JavaScript string and not a Java string.
                content = String(stringBuffer.toString()); //String
            } finally {
                input.close();
            }
            callback(content);
        };
    } else if (masterConfig.env === 'xpconnect' || (!masterConfig.env &&
            typeof Components !== 'undefined' && Components.classes &&
            Components.interfaces)) {
        //Avert your gaze!
        Cc = Components.classes,
        Ci = Components.interfaces;
        Components.utils['import']('resource://gre/modules/FileUtils.jsm');
        xpcIsWindows = ('@mozilla.org/windows-registry-key;1' in Cc);

        text.get = function (url, callback) {
            var inStream, convertStream, fileObj,
                readData = {};

            if (xpcIsWindows) {
                url = url.replace(/\//g, '\\');
            }

            fileObj = new FileUtils.File(url);

            //XPCOM, you so crazy
            try {
                inStream = Cc['@mozilla.org/network/file-input-stream;1']
                           .createInstance(Ci.nsIFileInputStream);
                inStream.init(fileObj, 1, 0, false);

                convertStream = Cc['@mozilla.org/intl/converter-input-stream;1']
                                .createInstance(Ci.nsIConverterInputStream);
                convertStream.init(inStream, "utf-8", inStream.available(),
                Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

                convertStream.readString(inStream.available(), readData);
                convertStream.close();
                inStream.close();
                callback(readData.value);
            } catch (e) {
                throw new Error((fileObj && fileObj.path || '') + ': ' + e);
            }
        };
    }
    return text;
});

define('text!js/patterns/structure/templates/tablerow.xml',[],function () { return '<td class="selection"><input type="checkbox" <% if(selected){ %> checked="checked" <% } %>/></td>\n<td class="title">\n  <a href="<%- getURL %>">\n    <% if([\'File\', \'Image\'].indexOf(attributes.Type) !== -1){ %>\n      <span class="icon icon-file"></span>\n    <% } %>\n    <% if(attributes.is_folderish) { %>\n      <span class="icon icon-folder-open"></span>\n    <% } %>\n    <%- Title %>\n  </a>\n</td>\n<% _.each(activeColumns, function(column){ %>\n  <% if(_.has(availableColumns, column)) { %>\n    <td class="<%- column %>"><%- attributes[column] %></td>\n  <% } %>\n<% }); %>\n<td>\n  <div class="btn-group">\n    <a class="btn btn-mini dropdown-toggle" data-toggle="dropdown" href="#">\n      <i class="icon-gears"></i>\n      <span class="caret"></span>\n    </a>\n    <ul class="dropdown-menu">\n      <li class="cutItem"><a href="#">Cut</a></li>\n      <li class="copyItem"><a href="#">Copy</a></li>\n      <% if(pasteAllowed && attributes.is_folderish){ %>\n        <li class="pasteItem"><a href="#">Paste</a></li>\n      <% } %>\n      <% if(!inQueryMode){ %>\n        <li class="move-top"><a href="#">Move to top of folder</a></li>\n        <li class="move-bottom"><a href="#">Move to bottom of folder</a></li>\n      <% } %>\n      <% if(!attributes.is_folderish && canSetDefaultPage){ %>\n        <li class="set-default-page"><a href="#">Set as default page</a></li>\n      <% } %>\n      <li class="openItem"><a href="#">Open</a></li>\n      <li class="editItem"><a href="#">Edit</a></li>\n    </ul>\n  </div>\n</td>\n';});

/* ============================================================
 * bootstrap-dropdown.js v2.3.2
 * http://getbootstrap.com/2.3.2/javascript.html#dropdowns
 * ============================================================
 * Copyright 2013 Twitter, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ============================================================ */


!function ($) {

   // jshint ;_;


 /* DROPDOWN CLASS DEFINITION
  * ========================= */

  var toggle = '[data-toggle=dropdown]'
    , Dropdown = function (element) {
        var $el = $(element).on('click.dropdown.data-api', this.toggle)
        $('html').on('click.dropdown.data-api', function () {
          $el.parent().removeClass('open')
        })
      }

  Dropdown.prototype = {

    constructor: Dropdown

  , toggle: function (e) {
      var $this = $(this)
        , $parent
        , isActive

      if ($this.is('.disabled, :disabled')) return

      $parent = getParent($this)

      isActive = $parent.hasClass('open')

      clearMenus()

      if (!isActive) {
        if ('ontouchstart' in document.documentElement) {
          // if mobile we we use a backdrop because click events don't delegate
          $('<div class="dropdown-backdrop"/>').insertBefore($(this)).on('click', clearMenus)
        }
        $parent.toggleClass('open')
      }

      $this.focus()

      return false
    }

  , keydown: function (e) {
      var $this
        , $items
        , $active
        , $parent
        , isActive
        , index

      if (!/(38|40|27)/.test(e.keyCode)) return

      $this = $(this)

      e.preventDefault()
      e.stopPropagation()

      if ($this.is('.disabled, :disabled')) return

      $parent = getParent($this)

      isActive = $parent.hasClass('open')

      if (!isActive || (isActive && e.keyCode == 27)) {
        if (e.which == 27) $parent.find(toggle).focus()
        return $this.click()
      }

      $items = $('[role=menu] li:not(.divider):visible a', $parent)

      if (!$items.length) return

      index = $items.index($items.filter(':focus'))

      if (e.keyCode == 38 && index > 0) index--                                        // up
      if (e.keyCode == 40 && index < $items.length - 1) index++                        // down
      if (!~index) index = 0

      $items
        .eq(index)
        .focus()
    }

  }

  function clearMenus() {
    $('.dropdown-backdrop').remove()
    $(toggle).each(function () {
      getParent($(this)).removeClass('open')
    })
  }

  function getParent($this) {
    var selector = $this.attr('data-target')
      , $parent

    if (!selector) {
      selector = $this.attr('href')
      selector = selector && /#/.test(selector) && selector.replace(/.*(?=#[^\s]*$)/, '') //strip for ie7
    }

    $parent = selector && $(selector)

    if (!$parent || !$parent.length) $parent = $this.parent()

    return $parent
  }


  /* DROPDOWN PLUGIN DEFINITION
   * ========================== */

  var old = $.fn.dropdown

  $.fn.dropdown = function (option) {
    return this.each(function () {
      var $this = $(this)
        , data = $this.data('dropdown')
      if (!data) $this.data('dropdown', (data = new Dropdown(this)))
      if (typeof option == 'string') data[option].call($this)
    })
  }

  $.fn.dropdown.Constructor = Dropdown


 /* DROPDOWN NO CONFLICT
  * ==================== */

  $.fn.dropdown.noConflict = function () {
    $.fn.dropdown = old
    return this
  }


  /* APPLY TO STANDARD DROPDOWN ELEMENTS
   * =================================== */

  $(document)
    .on('click.dropdown.data-api', clearMenus)
    .on('click.dropdown.data-api', '.dropdown form', function (e) { e.stopPropagation() })
    .on('click.dropdown.data-api'  , toggle, Dropdown.prototype.toggle)
    .on('keydown.dropdown.data-api', toggle + ', [role=menu]' , Dropdown.prototype.keydown)

}(window.jQuery);

define("bootstrap-dropdown", ["jquery"], function(){});

// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/views/tablerow',[
  'jquery',
  'underscore',
  'backbone',
  'text!js/patterns/structure/templates/tablerow.xml',
  'bootstrap-dropdown'
], function($, _, Backbone, TableRowTemplate) {
  

  var TableRowView = Backbone.View.extend({
    tagName: 'tr',
    className: 'itemRow',
    template: _.template(TableRowTemplate),
    events: {
      'change input': 'itemSelected',
      'click td.title a': 'itemClicked',
      'click .cutItem a': 'cutClicked',
      'click .copyItem a': 'copyClicked',
      'click .pasteItem a': 'pasteClicked',
      'click .move-top a': 'moveTopClicked',
      'click .move-bottom a': 'moveBottomClicked',
      'click .set-default-page a': 'setDefaultPageClicked',
      'click .openItem a': 'openClicked',
      'click .editItem a': 'editClicked'
    },
    initialize: function(){
      this.app = this.options.app;
      this.selectedCollection = this.app.selectedCollection;
      this.table = this.options.table;
    },
    render: function() {
      var self = this;
      var data = this.model.toJSON();
      data.selected = false;
      if(this.selectedCollection.findWhere({UID: data.UID})){
        data.selected = true;
      }
      data.attributes = self.model.attributes;
      data.activeColumns = self.app.activeColumns;
      data.availableColumns = self.app.availableColumns;
      data.pasteAllowed = self.app.pasteAllowed;
      data.canSetDefaultPage = self.app.setDefaultPageUrl;
      data.inQueryMode = self.app.inQueryMode();
      self.$el.html(self.template(data));
      var attrs = self.model.attributes;
      self.$el.addClass('state-' + attrs.review_state).
        addClass('type-' + attrs.Type);
      if(attrs.is_folderish){
        self.$el.addClass('folder');
      }
      self.$el.attr('data-path', data.path);
      self.$el.attr('data-UID', data.UID);
      self.$el.attr('data-id', data.id);
      self.$el.attr('data-type', data.Type);
      self.$el.attr('data-folderish', data.is_folderish);
      self.el.model = this.model;

      self.$dropdown = self.$('.dropdown-toggle');
      self.$dropdown.dropdown();

      return this;
    },
    itemClicked: function(e){
      e.preventDefault();
      /* check if this should just be opened in new window */
      var keyEvent = this.app.keyEvent;
      if(keyEvent && keyEvent.ctrlKey){
        this.openClicked(e);
      }else if(this.model.attributes.is_folderish){
        // it's a folder, go down path and show in contents window.
        this.app.queryHelper.currentPath = this.model.attributes.path;
        // also switch to fix page in batch
        var collection = this.app.collection;
        collection.goTo(collection.information.firstPage);
      }else{
        this.openClicked(e);
      }
    },
    itemSelected: function(){
      var checkbox = this.$('input')[0];
      if(checkbox.checked){
        this.app.selectedCollection.add(this.model);
      }else{
        this.app.selectedCollection.removeResult(this.model);
      }

      var selectedCollection = this.selectedCollection;

      /* check for shift click now */
      var keyEvent = this.app.keyEvent;
      if(keyEvent && keyEvent.shiftKey && this.app.last_selected &&
            this.app.last_selected.parentNode !== null){
        var $el = $(this.app.last_selected);
        var last_checked_index = $el.index();
        var this_index = this.$el.index();
        this.app.tableView.$('input[type="checkbox"]').each(function(){
          $el = $(this);
          var index = $el.parents('tr').index();
          if((index > last_checked_index && index < this_index) ||
              (index < last_checked_index && index > this_index)){
            this.checked = checkbox.checked;
            var model = $(this).closest('tr')[0].model;
            var existing = selectedCollection.getByUID(model.attributes.UID);
            if(this.checked){
              if(!existing){
                selectedCollection.add(model);
              }
            } else if(existing){
              selectedCollection.remove(existing);
            }
          }
        });

      }
      this.app.last_selected = this.el;
    },
    cutClicked: function(e){
      e.preventDefault();
      this.cutCopyClicked('cut');
      this.app.collection.pager(); // reload to be able to now show paste button
    },
    copyClicked: function(e){
      e.preventDefault();
      this.cutCopyClicked('copy');
      this.app.collection.pager(); // reload to be able to now show paste button
    },
    cutCopyClicked: function(operation){
      var self = this;
      self.app.pasteOperation = operation;

      self.app.pasteSelection = new Backbone.Collection();
      self.app.pasteSelection.add(this.model);
      self.app.setStatus(operation + ' 1 item');
      self.app.pasteAllowed = true;
      self.app.buttons.primary.get('paste').enable();
    },
    pasteClicked: function(e){
      e.preventDefault();
      this.app.pasteEvent(this.app.buttons.primary.get('paste'), e, {
        folder: this.model.attributes.path
      });
      this.app.collection.pager(); // reload to be able to now show paste button
    },
    moveTopClicked: function(e){
      e.preventDefault();
      this.app.moveItem(this.model.attributes.id, 'top');
    },
    moveBottomClicked: function(e){
      e.preventDefault();
      this.app.moveItem(this.model.attributes.id, 'bottom');
    },
    setDefaultPageClicked: function(e){
      e.preventDefault();
      var self = this;
      $.ajax({
        url: self.app.getAjaxUrl(self.app.setDefaultPageUrl),
        type: 'POST',
        data: {
          '_authenticator': $('[name="_authenticator"]').val(),
          'id': this.$active.attr('data-id')
        },
        success: function(data){
          self.app.ajaxSuccessResponse.apply(self.app, [data]);
        },
        error: function(data){
          self.app.ajaxErrorResponse.apply(self.app, [data]);
        }
      });
    },
    getSelectedBaseUrl: function(){
      var self = this;
      return self.model.attributes.getURL;
    },
    getWindow: function(){
      var win = window;
      if (win.parent !== window) {
        win = win.parent;
      }
      return win;
    },
    openUrl: function(url){
      var self = this;
      var win = self.getWindow();
      var keyEvent = this.app.keyEvent;
      if(keyEvent && keyEvent.ctrlKey){
        win.open(url);
      }else{
        win.location = url;
      }
    },
    openClicked: function(e){
      e.preventDefault();
      var self = this;
      self.openUrl(self.getSelectedBaseUrl() + '/view');
    },
    editClicked: function(e){
      e.preventDefault();
      var self = this;
      self.openUrl(self.getSelectedBaseUrl() + '/edit');
    }
  });

  return TableRowView;
});

define('text!js/patterns/structure/templates/table.xml',[],function () { return '<div class="alert alert-<%= statusType %> status">\n    <%= status %>\n</div>\n<table class="table table-striped table-bordered">\n  <thead>\n    <tr class="breadcrumbs">\n        <td colspan="<%= activeColumns.length + 2 %>">\n          <a href="#" data-path="/">\n              <span class="icon icon-home"></span> /\n          </a>\n        <% _.each(pathParts, function(part, idx, list){\n          if(part){\n            if(idx > 0){ %>\n              /\n            <% } %>\n            <a href="#" class="crumb" data-path="<%- part %>"><%- part %></a>\n          <% }\n        }); %>\n      </td>\n    </tr>\n    <tr>\n      <th><input type="checkbox" class="select-all" /></th>\n      <th>Title</th>\n      <% _.each(activeColumns, function(column){ %>\n        <% if(_.has(availableColumns, column)) { %>\n          <th><%- availableColumns[column] %></th>\n        <% } %>\n      <% }); %>\n      <th>Actions</th>\n    </tr>\n  </thead>\n  <tbody>\n  </tbody>\n</table>\n';});

/*! 
 * jquery.event.drag - v 2.2
 * Copyright (c) 2010 Three Dub Media - http://threedubmedia.com
 * Open Source MIT License - http://threedubmedia.com/code/license
 */
// Created: 2008-06-04 
// Updated: 2012-05-21
// REQUIRES: jquery 1.7.x

;(function( $ ){

// add the jquery instance method
$.fn.drag = function( str, arg, opts ){
	// figure out the event type
	var type = typeof str == "string" ? str : "",
	// figure out the event handler...
	fn = $.isFunction( str ) ? str : $.isFunction( arg ) ? arg : null;
	// fix the event type
	if ( type.indexOf("drag") !== 0 ) 
		type = "drag"+ type;
	// were options passed
	opts = ( str == fn ? arg : opts ) || {};
	// trigger or bind event handler
	return fn ? this.bind( type, opts, fn ) : this.trigger( type );
};

// local refs (increase compression)
var $event = $.event, 
$special = $event.special,
// configure the drag special event 
drag = $special.drag = {
	
	// these are the default settings
	defaults: {
		which: 1, // mouse button pressed to start drag sequence
		distance: 0, // distance dragged before dragstart
		not: ':input', // selector to suppress dragging on target elements
		handle: null, // selector to match handle target elements
		relative: false, // true to use "position", false to use "offset"
		drop: true, // false to suppress drop events, true or selector to allow
		click: false // false to suppress click events after dragend (no proxy)
	},
	
	// the key name for stored drag data
	datakey: "dragdata",
	
	// prevent bubbling for better performance
	noBubble: true,
	
	// count bound related events
	add: function( obj ){ 
		// read the interaction data
		var data = $.data( this, drag.datakey ),
		// read any passed options 
		opts = obj.data || {};
		// count another realted event
		data.related += 1;
		// extend data options bound with this event
		// don't iterate "opts" in case it is a node 
		$.each( drag.defaults, function( key, def ){
			if ( opts[ key ] !== undefined )
				data[ key ] = opts[ key ];
		});
	},
	
	// forget unbound related events
	remove: function(){
		$.data( this, drag.datakey ).related -= 1;
	},
	
	// configure interaction, capture settings
	setup: function(){
		// check for related events
		if ( $.data( this, drag.datakey ) ) 
			return;
		// initialize the drag data with copied defaults
		var data = $.extend({ related:0 }, drag.defaults );
		// store the interaction data
		$.data( this, drag.datakey, data );
		// bind the mousedown event, which starts drag interactions
		$event.add( this, "touchstart mousedown", drag.init, data );
		// prevent image dragging in IE...
		if ( this.attachEvent ) 
			this.attachEvent("ondragstart", drag.dontstart ); 
	},
	
	// destroy configured interaction
	teardown: function(){
		var data = $.data( this, drag.datakey ) || {};
		// check for related events
		if ( data.related ) 
			return;
		// remove the stored data
		$.removeData( this, drag.datakey );
		// remove the mousedown event
		$event.remove( this, "touchstart mousedown", drag.init );
		// enable text selection
		drag.textselect( true ); 
		// un-prevent image dragging in IE...
		if ( this.detachEvent ) 
			this.detachEvent("ondragstart", drag.dontstart ); 
	},
		
	// initialize the interaction
	init: function( event ){ 
		// sorry, only one touch at a time
		if ( drag.touched ) 
			return;
		// the drag/drop interaction data
		var dd = event.data, results;
		// check the which directive
		if ( event.which != 0 && dd.which > 0 && event.which != dd.which ) 
			return; 
		// check for suppressed selector
		if ( $( event.target ).is( dd.not ) ) 
			return;
		// check for handle selector
		if ( dd.handle && !$( event.target ).closest( dd.handle, event.currentTarget ).length ) 
			return;

		drag.touched = event.type == 'touchstart' ? this : null;
		dd.propagates = 1;
		dd.mousedown = this;
		dd.interactions = [ drag.interaction( this, dd ) ];
		dd.target = event.target;
		dd.pageX = event.pageX;
		dd.pageY = event.pageY;
		dd.dragging = null;
		// handle draginit event... 
		results = drag.hijack( event, "draginit", dd );
		// early cancel
		if ( !dd.propagates )
			return;
		// flatten the result set
		results = drag.flatten( results );
		// insert new interaction elements
		if ( results && results.length ){
			dd.interactions = [];
			$.each( results, function(){
				dd.interactions.push( drag.interaction( this, dd ) );
			});
		}
		// remember how many interactions are propagating
		dd.propagates = dd.interactions.length;
		// locate and init the drop targets
		if ( dd.drop !== false && $special.drop ) 
			$special.drop.handler( event, dd );
		// disable text selection
		drag.textselect( false ); 
		// bind additional events...
		if ( drag.touched )
			$event.add( drag.touched, "touchmove touchend", drag.handler, dd );
		else 
			$event.add( document, "mousemove mouseup", drag.handler, dd );
		// helps prevent text selection or scrolling
		if ( !drag.touched || dd.live )
			return false;
	},	
	
	// returns an interaction object
	interaction: function( elem, dd ){
		var offset = $( elem )[ dd.relative ? "position" : "offset" ]() || { top:0, left:0 };
		return {
			drag: elem, 
			callback: new drag.callback(), 
			droppable: [],
			offset: offset
		};
	},
	
	// handle drag-releatd DOM events
	handler: function( event ){ 
		// read the data before hijacking anything
		var dd = event.data;	
		// handle various events
		switch ( event.type ){
			// mousemove, check distance, start dragging
			case !dd.dragging && 'touchmove': 
				event.preventDefault();
			case !dd.dragging && 'mousemove':
				//  drag tolerance, x� + y� = distance�
				if ( Math.pow(  event.pageX-dd.pageX, 2 ) + Math.pow(  event.pageY-dd.pageY, 2 ) < Math.pow( dd.distance, 2 ) ) 
					break; // distance tolerance not reached
				event.target = dd.target; // force target from "mousedown" event (fix distance issue)
				drag.hijack( event, "dragstart", dd ); // trigger "dragstart"
				if ( dd.propagates ) // "dragstart" not rejected
					dd.dragging = true; // activate interaction
			// mousemove, dragging
			case 'touchmove':
				event.preventDefault();
			case 'mousemove':
				if ( dd.dragging ){
					// trigger "drag"		
					drag.hijack( event, "drag", dd );
					if ( dd.propagates ){
						// manage drop events
						if ( dd.drop !== false && $special.drop )
							$special.drop.handler( event, dd ); // "dropstart", "dropend"							
						break; // "drag" not rejected, stop		
					}
					event.type = "mouseup"; // helps "drop" handler behave
				}
			// mouseup, stop dragging
			case 'touchend': 
			case 'mouseup': 
			default:
				if ( drag.touched )
					$event.remove( drag.touched, "touchmove touchend", drag.handler ); // remove touch events
				else 
					$event.remove( document, "mousemove mouseup", drag.handler ); // remove page events	
				if ( dd.dragging ){
					if ( dd.drop !== false && $special.drop )
						$special.drop.handler( event, dd ); // "drop"
					drag.hijack( event, "dragend", dd ); // trigger "dragend"	
				}
				drag.textselect( true ); // enable text selection
				// if suppressing click events...
				if ( dd.click === false && dd.dragging )
					$.data( dd.mousedown, "suppress.click", new Date().getTime() + 5 );
				dd.dragging = drag.touched = false; // deactivate element	
				break;
		}
	},
		
	// re-use event object for custom events
	hijack: function( event, type, dd, x, elem ){
		// not configured
		if ( !dd ) 
			return;
		// remember the original event and type
		var orig = { event:event.originalEvent, type:event.type },
		// is the event drag related or drog related?
		mode = type.indexOf("drop") ? "drag" : "drop",
		// iteration vars
		result, i = x || 0, ia, $elems, callback,
		len = !isNaN( x ) ? x : dd.interactions.length;
		// modify the event type
		event.type = type;
		// remove the original event
		event.originalEvent = null;
		// initialize the results
		dd.results = [];
		// handle each interacted element
		do if ( ia = dd.interactions[ i ] ){
			// validate the interaction
			if ( type !== "dragend" && ia.cancelled )
				continue;
			// set the dragdrop properties on the event object
			callback = drag.properties( event, dd, ia );
			// prepare for more results
			ia.results = [];
			// handle each element
			$( elem || ia[ mode ] || dd.droppable ).each(function( p, subject ){
				// identify drag or drop targets individually
				callback.target = subject;
				// force propagtion of the custom event
				event.isPropagationStopped = function(){ return false; };
				// handle the event	
				result = subject ? $event.dispatch.call( subject, event, callback ) : null;
				// stop the drag interaction for this element
				if ( result === false ){
					if ( mode == "drag" ){
						ia.cancelled = true;
						dd.propagates -= 1;
					}
					if ( type == "drop" ){
						ia[ mode ][p] = null;
					}
				}
				// assign any dropinit elements
				else if ( type == "dropinit" )
					ia.droppable.push( drag.element( result ) || subject );
				// accept a returned proxy element 
				if ( type == "dragstart" )
					ia.proxy = $( drag.element( result ) || ia.drag )[0];
				// remember this result	
				ia.results.push( result );
				// forget the event result, for recycling
				delete event.result;
				// break on cancelled handler
				if ( type !== "dropinit" )
					return result;
			});	
			// flatten the results	
			dd.results[ i ] = drag.flatten( ia.results );	
			// accept a set of valid drop targets
			if ( type == "dropinit" )
				ia.droppable = drag.flatten( ia.droppable );
			// locate drop targets
			if ( type == "dragstart" && !ia.cancelled )
				callback.update(); 
		}
		while ( ++i < len )
		// restore the original event & type
		event.type = orig.type;
		event.originalEvent = orig.event;
		// return all handler results
		return drag.flatten( dd.results );
	},
		
	// extend the callback object with drag/drop properties...
	properties: function( event, dd, ia ){		
		var obj = ia.callback;
		// elements
		obj.drag = ia.drag;
		obj.proxy = ia.proxy || ia.drag;
		// starting mouse position
		obj.startX = dd.pageX;
		obj.startY = dd.pageY;
		// current distance dragged
		obj.deltaX = event.pageX - dd.pageX;
		obj.deltaY = event.pageY - dd.pageY;
		// original element position
		obj.originalX = ia.offset.left;
		obj.originalY = ia.offset.top;
		// adjusted element position
		obj.offsetX = obj.originalX + obj.deltaX; 
		obj.offsetY = obj.originalY + obj.deltaY;
		// assign the drop targets information
		obj.drop = drag.flatten( ( ia.drop || [] ).slice() );
		obj.available = drag.flatten( ( ia.droppable || [] ).slice() );
		return obj;	
	},
	
	// determine is the argument is an element or jquery instance
	element: function( arg ){
		if ( arg && ( arg.jquery || arg.nodeType == 1 ) )
			return arg;
	},
	
	// flatten nested jquery objects and arrays into a single dimension array
	flatten: function( arr ){
		return $.map( arr, function( member ){
			return member && member.jquery ? $.makeArray( member ) : 
				member && member.length ? drag.flatten( member ) : member;
		});
	},
	
	// toggles text selection attributes ON (true) or OFF (false)
	textselect: function( bool ){ 
		$( document )[ bool ? "unbind" : "bind" ]("selectstart", drag.dontstart )
			.css("MozUserSelect", bool ? "" : "none" );
		// .attr("unselectable", bool ? "off" : "on" )
		document.unselectable = bool ? "off" : "on"; 
	},
	
	// suppress "selectstart" and "ondragstart" events
	dontstart: function(){ 
		return false; 
	},
	
	// a callback instance contructor
	callback: function(){}
	
};

// callback methods
drag.callback.prototype = {
	update: function(){
		if ( $special.drop && this.available.length )
			$.each( this.available, function( i ){
				$special.drop.locate( this, i );
			});
	}
};

// patch $.event.$dispatch to allow suppressing clicks
var $dispatch = $event.dispatch;
$event.dispatch = function( event ){
	if ( $.data( this, "suppress."+ event.type ) - new Date().getTime() > 0 ){
		$.removeData( this, "suppress."+ event.type );
		return;
	}
	return $dispatch.apply( this, arguments );
};

// event fix hooks for touch events...
var touchHooks = 
$event.fixHooks.touchstart = 
$event.fixHooks.touchmove = 
$event.fixHooks.touchend =
$event.fixHooks.touchcancel = {
	props: "clientX clientY pageX pageY screenX screenY".split( " " ),
	filter: function( event, orig ) {
		if ( orig ){
			var touched = ( orig.touches && orig.touches[0] )
				|| ( orig.changedTouches && orig.changedTouches[0] )
				|| null; 
			// iOS webkit: touchstart, touchmove, touchend
			if ( touched ) 
				$.each( touchHooks.props, function( i, prop ){
					event[ prop ] = touched[ prop ];
				});
		}
		return event;
	}
};

// share the same special event configuration with related events...
$special.draginit = $special.dragstart = $special.dragend = drag;

})( jQuery );
define("jquery.event.drag", ["jquery"], function(){});

/*! 
 * jquery.event.drop - v 2.2
 * Copyright (c) 2010 Three Dub Media - http://threedubmedia.com
 * Open Source MIT License - http://threedubmedia.com/code/license
 */
// Created: 2008-06-04 
// Updated: 2012-05-21
// REQUIRES: jquery 1.7.x, event.drag 2.2

;(function($){ // secure $ jQuery alias

// Events: drop, dropstart, dropend

// add the jquery instance method
$.fn.drop = function( str, arg, opts ){
	// figure out the event type
	var type = typeof str == "string" ? str : "",
	// figure out the event handler...
	fn = $.isFunction( str ) ? str : $.isFunction( arg ) ? arg : null;
	// fix the event type
	if ( type.indexOf("drop") !== 0 ) 
		type = "drop"+ type;
	// were options passed
	opts = ( str == fn ? arg : opts ) || {};
	// trigger or bind event handler
	return fn ? this.bind( type, opts, fn ) : this.trigger( type );
};

// DROP MANAGEMENT UTILITY
// returns filtered drop target elements, caches their positions
$.drop = function( opts ){ 
	opts = opts || {};
	// safely set new options...
	drop.multi = opts.multi === true ? Infinity : 
		opts.multi === false ? 1 : !isNaN( opts.multi ) ? opts.multi : drop.multi;
	drop.delay = opts.delay || drop.delay;
	drop.tolerance = $.isFunction( opts.tolerance ) ? opts.tolerance : 
		opts.tolerance === null ? null : drop.tolerance;
	drop.mode = opts.mode || drop.mode || 'intersect';
};

// local refs (increase compression)
var $event = $.event, 
$special = $event.special,
// configure the drop special event
drop = $.event.special.drop = {

	// these are the default settings
	multi: 1, // allow multiple drop winners per dragged element
	delay: 20, // async timeout delay
	mode: 'overlap', // drop tolerance mode
		
	// internal cache
	targets: [], 
	
	// the key name for stored drop data
	datakey: "dropdata",
		
	// prevent bubbling for better performance
	noBubble: true,
	
	// count bound related events
	add: function( obj ){ 
		// read the interaction data
		var data = $.data( this, drop.datakey );
		// count another realted event
		data.related += 1;
	},
	
	// forget unbound related events
	remove: function(){
		$.data( this, drop.datakey ).related -= 1;
	},
	
	// configure the interactions
	setup: function(){
		// check for related events
		if ( $.data( this, drop.datakey ) ) 
			return;
		// initialize the drop element data
		var data = { 
			related: 0,
			active: [],
			anyactive: 0,
			winner: 0,
			location: {}
		};
		// store the drop data on the element
		$.data( this, drop.datakey, data );
		// store the drop target in internal cache
		drop.targets.push( this );
	},
	
	// destroy the configure interaction	
	teardown: function(){ 
		var data = $.data( this, drop.datakey ) || {};
		// check for related events
		if ( data.related ) 
			return;
		// remove the stored data
		$.removeData( this, drop.datakey );
		// reference the targeted element
		var element = this;
		// remove from the internal cache
		drop.targets = $.grep( drop.targets, function( target ){ 
			return ( target !== element ); 
		});
	},
	
	// shared event handler
	handler: function( event, dd ){ 
		// local vars
		var results, $targets;
		// make sure the right data is available
		if ( !dd ) 
			return;
		// handle various events
		switch ( event.type ){
			// draginit, from $.event.special.drag
			case 'mousedown': // DROPINIT >>
			case 'touchstart': // DROPINIT >>
				// collect and assign the drop targets
				$targets =  $( drop.targets );
				if ( typeof dd.drop == "string" )
					$targets = $targets.filter( dd.drop );
				// reset drop data winner properties
				$targets.each(function(){
					var data = $.data( this, drop.datakey );
					data.active = [];
					data.anyactive = 0;
					data.winner = 0;
				});
				// set available target elements
				dd.droppable = $targets;
				// activate drop targets for the initial element being dragged
				$special.drag.hijack( event, "dropinit", dd ); 
				break;
			// drag, from $.event.special.drag
			case 'mousemove': // TOLERATE >>
			case 'touchmove': // TOLERATE >>
				drop.event = event; // store the mousemove event
				if ( !drop.timer )
					// monitor drop targets
					drop.tolerate( dd ); 
				break;
			// dragend, from $.event.special.drag
			case 'mouseup': // DROP >> DROPEND >>
			case 'touchend': // DROP >> DROPEND >>
				drop.timer = clearTimeout( drop.timer ); // delete timer	
				if ( dd.propagates ){
					$special.drag.hijack( event, "drop", dd ); 
					$special.drag.hijack( event, "dropend", dd ); 
				}
				break;
				
		}
	},
		
	// returns the location positions of an element
	locate: function( elem, index ){ 
		var data = $.data( elem, drop.datakey ),
		$elem = $( elem ), 
		posi = $elem.offset() || {}, 
		height = $elem.outerHeight(), 
		width = $elem.outerWidth(),
		location = { 
			elem: elem, 
			width: width, 
			height: height,
			top: posi.top, 
			left: posi.left, 
			right: posi.left + width, 
			bottom: posi.top + height
		};
		// drag elements might not have dropdata
		if ( data ){
			data.location = location;
			data.index = index;
			data.elem = elem;
		}
		return location;
	},
	
	// test the location positions of an element against another OR an X,Y coord
	contains: function( target, test ){ // target { location } contains test [x,y] or { location }
		return ( ( test[0] || test.left ) >= target.left && ( test[0] || test.right ) <= target.right
			&& ( test[1] || test.top ) >= target.top && ( test[1] || test.bottom ) <= target.bottom ); 
	},
	
	// stored tolerance modes
	modes: { // fn scope: "$.event.special.drop" object 
		// target with mouse wins, else target with most overlap wins
		'intersect': function( event, proxy, target ){
			return this.contains( target, [ event.pageX, event.pageY ] ) ? // check cursor
				1e9 : this.modes.overlap.apply( this, arguments ); // check overlap
		},
		// target with most overlap wins	
		'overlap': function( event, proxy, target ){
			// calculate the area of overlap...
			return Math.max( 0, Math.min( target.bottom, proxy.bottom ) - Math.max( target.top, proxy.top ) )
				* Math.max( 0, Math.min( target.right, proxy.right ) - Math.max( target.left, proxy.left ) );
		},
		// proxy is completely contained within target bounds	
		'fit': function( event, proxy, target ){
			return this.contains( target, proxy ) ? 1 : 0;
		},
		// center of the proxy is contained within target bounds	
		'middle': function( event, proxy, target ){
			return this.contains( target, [ proxy.left + proxy.width * .5, proxy.top + proxy.height * .5 ] ) ? 1 : 0;
		}
	},	
	
	// sort drop target cache by by winner (dsc), then index (asc)
	sort: function( a, b ){
		return ( b.winner - a.winner ) || ( a.index - b.index );
	},
		
	// async, recursive tolerance execution
	tolerate: function( dd ){		
		// declare local refs
		var i, drp, drg, data, arr, len, elem,
		// interaction iteration variables
		x = 0, ia, end = dd.interactions.length,
		// determine the mouse coords
		xy = [ drop.event.pageX, drop.event.pageY ],
		// custom or stored tolerance fn
		tolerance = drop.tolerance || drop.modes[ drop.mode ];
		// go through each passed interaction...
		do if ( ia = dd.interactions[x] ){
			// check valid interaction
			if ( !ia )
				return; 
			// initialize or clear the drop data
			ia.drop = [];
			// holds the drop elements
			arr = []; 
			len = ia.droppable.length;
			// determine the proxy location, if needed
			if ( tolerance )
				drg = drop.locate( ia.proxy ); 
			// reset the loop
			i = 0;
			// loop each stored drop target
			do if ( elem = ia.droppable[i] ){ 
				data = $.data( elem, drop.datakey );
				drp = data.location;
				if ( !drp ) continue;
				// find a winner: tolerance function is defined, call it
				data.winner = tolerance ? tolerance.call( drop, drop.event, drg, drp ) 
					// mouse position is always the fallback
					: drop.contains( drp, xy ) ? 1 : 0; 
				arr.push( data );	
			} while ( ++i < len ); // loop 
			// sort the drop targets
			arr.sort( drop.sort );			
			// reset the loop
			i = 0;
			// loop through all of the targets again
			do if ( data = arr[ i ] ){
				// winners...
				if ( data.winner && ia.drop.length < drop.multi ){
					// new winner... dropstart
					if ( !data.active[x] && !data.anyactive ){
						// check to make sure that this is not prevented
						if ( $special.drag.hijack( drop.event, "dropstart", dd, x, data.elem )[0] !== false ){ 	
							data.active[x] = 1;
							data.anyactive += 1;
						}
						// if false, it is not a winner
						else
							data.winner = 0;
					}
					// if it is still a winner
					if ( data.winner )
						ia.drop.push( data.elem );
				}
				// losers... 
				else if ( data.active[x] && data.anyactive == 1 ){
					// former winner... dropend
					$special.drag.hijack( drop.event, "dropend", dd, x, data.elem ); 
					data.active[x] = 0;
					data.anyactive -= 1;
				}
			} while ( ++i < len ); // loop 		
		} while ( ++x < end ) // loop
		// check if the mouse is still moving or is idle
		if ( drop.last && xy[0] == drop.last.pageX && xy[1] == drop.last.pageY ) 
			delete drop.timer; // idle, don't recurse
		else  // recurse
			drop.timer = setTimeout(function(){ 
				drop.tolerate( dd ); 
			}, drop.delay );
		// remember event, to compare idleness
		drop.last = drop.event; 
	}
	
};

// share the same special event configuration with related events...
$special.dropinit = $special.dropstart = $special.dropend = drop;

})(jQuery); // confine scope	;
define("jquery.event.drop", ["jquery"], function(){});

// drag and drop support.
//
// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('mockup-patterns-dragdrop',[
  'jquery',
  'mockup-patterns-base',
  'jquery.event.drag',
  'jquery.event.drop'
], function($, Base) {
  

  var DragDropPattern = Base.extend({
    name: "dragdrop",
    defaults: {
      selector: 'li',
      dragClass: 'item-dragging',
      cloneClass: 'dragging',
      drop: null // function to handle drop event
    },
    init: function() {
      var self = this;
      var start = 0;

      self.$el.find(self.options.selector).drag('start', function(e, dd) {
        var dragged = this;
        $(dragged).addClass(self.options.dragClass);
        $.drop({
          tolerance: function(event, proxy, target) {
            if($(target.elem).closest(self.$el).length === 0){
              /* prevent dragging conflict over another drag area */
              return;
            }
            var test = event.pageY > (target.top + target.height / 2);
            $.data(target.elem, "drop+reorder",
                   test ? "insertAfter" : "insertBefore" );
            return this.contains(target, [event.pageX, event.pageY]);
          }
        });
        start = $(this).index();
        return $( this ).clone().
          addClass(self.options.cloneClass).
          css({opacity: 0.75, position: 'absolute'}).
          appendTo(document.body);
      })
      .drag(function(e, dd) {
        /*jshint eqeqeq:false */
        $( dd.proxy ).css({
          top: dd.offsetY,
          left: dd.offsetX
        });
        var drop = dd.drop[0],
            method = $.data(drop || {}, "drop+reorder");
        /* XXX Cannot use triple equals here */
        if (method && drop && (drop != dd.current || method != dd.method)){
          $(this)[method](drop);
          dd.current = drop;
          dd.method = method;
          dd.update();
        }
      })
      .drag('end', function(e, dd) {
        var $el = $(this);
        $el.removeClass(self.options.dragClass);
        $(dd.proxy).remove();
        if(self.options.drop){
          self.options.drop($el, $el.index() - start);
        }
      })
      .drop('init', function(e, dd ) {
        /*jshint eqeqeq:false */
        /* XXX Cannot use triple equals here */
        return (this == dd.drag) ? false: true;
      });

    }
  });

  return DragDropPattern;

});



//! moment.js
//! version : 2.2.1
//! authors : Tim Wood, Iskren Chernev, Moment.js contributors
//! license : MIT
//! momentjs.com

(function (undefined) {

    /************************************
        Constants
    ************************************/

    var moment,
        VERSION = "2.2.1",
        round = Math.round, i,
        // internal storage for language config files
        languages = {},

        // check for nodeJS
        hasModule = (typeof module !== 'undefined' && module.exports),

        // ASP.NET json date format regex
        aspNetJsonRegex = /^\/?Date\((\-?\d+)/i,
        aspNetTimeSpanJsonRegex = /(\-)?(?:(\d*)\.)?(\d+)\:(\d+)\:(\d+)\.?(\d{3})?/,

        // format tokens
        formattingTokens = /(\[[^\[]*\])|(\\)?(Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|mm?|ss?|SS?S?|X|zz?|ZZ?|.)/g,
        localFormattingTokens = /(\[[^\[]*\])|(\\)?(LT|LL?L?L?|l{1,4})/g,

        // parsing token regexes
        parseTokenOneOrTwoDigits = /\d\d?/, // 0 - 99
        parseTokenOneToThreeDigits = /\d{1,3}/, // 0 - 999
        parseTokenThreeDigits = /\d{3}/, // 000 - 999
        parseTokenFourDigits = /\d{1,4}/, // 0 - 9999
        parseTokenSixDigits = /[+\-]?\d{1,6}/, // -999,999 - 999,999
        parseTokenWord = /[0-9]*['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+|[\u0600-\u06FF\/]+(\s*?[\u0600-\u06FF]+){1,2}/i, // any word (or two) characters or numbers including two/three word month in arabic.
        parseTokenTimezone = /Z|[\+\-]\d\d:?\d\d/i, // +00:00 -00:00 +0000 -0000 or Z
        parseTokenT = /T/i, // T (ISO seperator)
        parseTokenTimestampMs = /[\+\-]?\d+(\.\d{1,3})?/, // 123456789 123456789.123

        // preliminary iso regex
        // 0000-00-00 + T + 00 or 00:00 or 00:00:00 or 00:00:00.000 + +00:00 or +0000
        isoRegex = /^\s*\d{4}-\d\d-\d\d((T| )(\d\d(:\d\d(:\d\d(\.\d\d?\d?)?)?)?)?([\+\-]\d\d:?\d\d)?)?/,
        isoFormat = 'YYYY-MM-DDTHH:mm:ssZ',

        // iso time formats and regexes
        isoTimes = [
            ['HH:mm:ss.S', /(T| )\d\d:\d\d:\d\d\.\d{1,3}/],
            ['HH:mm:ss', /(T| )\d\d:\d\d:\d\d/],
            ['HH:mm', /(T| )\d\d:\d\d/],
            ['HH', /(T| )\d\d/]
        ],

        // timezone chunker "+10:00" > ["10", "00"] or "-1530" > ["-15", "30"]
        parseTimezoneChunker = /([\+\-]|\d\d)/gi,

        // getter and setter names
        proxyGettersAndSetters = 'Date|Hours|Minutes|Seconds|Milliseconds'.split('|'),
        unitMillisecondFactors = {
            'Milliseconds' : 1,
            'Seconds' : 1e3,
            'Minutes' : 6e4,
            'Hours' : 36e5,
            'Days' : 864e5,
            'Months' : 2592e6,
            'Years' : 31536e6
        },

        unitAliases = {
            ms : 'millisecond',
            s : 'second',
            m : 'minute',
            h : 'hour',
            d : 'day',
            w : 'week',
            W : 'isoweek',
            M : 'month',
            y : 'year'
        },

        // format function strings
        formatFunctions = {},

        // tokens to ordinalize and pad
        ordinalizeTokens = 'DDD w W M D d'.split(' '),
        paddedTokens = 'M D H h m s w W'.split(' '),

        formatTokenFunctions = {
            M    : function () {
                return this.month() + 1;
            },
            MMM  : function (format) {
                return this.lang().monthsShort(this, format);
            },
            MMMM : function (format) {
                return this.lang().months(this, format);
            },
            D    : function () {
                return this.date();
            },
            DDD  : function () {
                return this.dayOfYear();
            },
            d    : function () {
                return this.day();
            },
            dd   : function (format) {
                return this.lang().weekdaysMin(this, format);
            },
            ddd  : function (format) {
                return this.lang().weekdaysShort(this, format);
            },
            dddd : function (format) {
                return this.lang().weekdays(this, format);
            },
            w    : function () {
                return this.week();
            },
            W    : function () {
                return this.isoWeek();
            },
            YY   : function () {
                return leftZeroFill(this.year() % 100, 2);
            },
            YYYY : function () {
                return leftZeroFill(this.year(), 4);
            },
            YYYYY : function () {
                return leftZeroFill(this.year(), 5);
            },
            gg   : function () {
                return leftZeroFill(this.weekYear() % 100, 2);
            },
            gggg : function () {
                return this.weekYear();
            },
            ggggg : function () {
                return leftZeroFill(this.weekYear(), 5);
            },
            GG   : function () {
                return leftZeroFill(this.isoWeekYear() % 100, 2);
            },
            GGGG : function () {
                return this.isoWeekYear();
            },
            GGGGG : function () {
                return leftZeroFill(this.isoWeekYear(), 5);
            },
            e : function () {
                return this.weekday();
            },
            E : function () {
                return this.isoWeekday();
            },
            a    : function () {
                return this.lang().meridiem(this.hours(), this.minutes(), true);
            },
            A    : function () {
                return this.lang().meridiem(this.hours(), this.minutes(), false);
            },
            H    : function () {
                return this.hours();
            },
            h    : function () {
                return this.hours() % 12 || 12;
            },
            m    : function () {
                return this.minutes();
            },
            s    : function () {
                return this.seconds();
            },
            S    : function () {
                return ~~(this.milliseconds() / 100);
            },
            SS   : function () {
                return leftZeroFill(~~(this.milliseconds() / 10), 2);
            },
            SSS  : function () {
                return leftZeroFill(this.milliseconds(), 3);
            },
            Z    : function () {
                var a = -this.zone(),
                    b = "+";
                if (a < 0) {
                    a = -a;
                    b = "-";
                }
                return b + leftZeroFill(~~(a / 60), 2) + ":" + leftZeroFill(~~a % 60, 2);
            },
            ZZ   : function () {
                var a = -this.zone(),
                    b = "+";
                if (a < 0) {
                    a = -a;
                    b = "-";
                }
                return b + leftZeroFill(~~(10 * a / 6), 4);
            },
            z : function () {
                return this.zoneAbbr();
            },
            zz : function () {
                return this.zoneName();
            },
            X    : function () {
                return this.unix();
            }
        };

    function padToken(func, count) {
        return function (a) {
            return leftZeroFill(func.call(this, a), count);
        };
    }
    function ordinalizeToken(func, period) {
        return function (a) {
            return this.lang().ordinal(func.call(this, a), period);
        };
    }

    while (ordinalizeTokens.length) {
        i = ordinalizeTokens.pop();
        formatTokenFunctions[i + 'o'] = ordinalizeToken(formatTokenFunctions[i], i);
    }
    while (paddedTokens.length) {
        i = paddedTokens.pop();
        formatTokenFunctions[i + i] = padToken(formatTokenFunctions[i], 2);
    }
    formatTokenFunctions.DDDD = padToken(formatTokenFunctions.DDD, 3);


    /************************************
        Constructors
    ************************************/

    function Language() {

    }

    // Moment prototype object
    function Moment(config) {
        extend(this, config);
    }

    // Duration Constructor
    function Duration(duration) {
        var years = duration.years || duration.year || duration.y || 0,
            months = duration.months || duration.month || duration.M || 0,
            weeks = duration.weeks || duration.week || duration.w || 0,
            days = duration.days || duration.day || duration.d || 0,
            hours = duration.hours || duration.hour || duration.h || 0,
            minutes = duration.minutes || duration.minute || duration.m || 0,
            seconds = duration.seconds || duration.second || duration.s || 0,
            milliseconds = duration.milliseconds || duration.millisecond || duration.ms || 0;

        // store reference to input for deterministic cloning
        this._input = duration;

        // representation for dateAddRemove
        this._milliseconds = +milliseconds +
            seconds * 1e3 + // 1000
            minutes * 6e4 + // 1000 * 60
            hours * 36e5; // 1000 * 60 * 60
        // Because of dateAddRemove treats 24 hours as different from a
        // day when working around DST, we need to store them separately
        this._days = +days +
            weeks * 7;
        // It is impossible translate months into days without knowing
        // which months you are are talking about, so we have to store
        // it separately.
        this._months = +months +
            years * 12;

        this._data = {};

        this._bubble();
    }


    /************************************
        Helpers
    ************************************/


    function extend(a, b) {
        for (var i in b) {
            if (b.hasOwnProperty(i)) {
                a[i] = b[i];
            }
        }
        return a;
    }

    function absRound(number) {
        if (number < 0) {
            return Math.ceil(number);
        } else {
            return Math.floor(number);
        }
    }

    // left zero fill a number
    // see http://jsperf.com/left-zero-filling for performance comparison
    function leftZeroFill(number, targetLength) {
        var output = number + '';
        while (output.length < targetLength) {
            output = '0' + output;
        }
        return output;
    }

    // helper function for _.addTime and _.subtractTime
    function addOrSubtractDurationFromMoment(mom, duration, isAdding, ignoreUpdateOffset) {
        var milliseconds = duration._milliseconds,
            days = duration._days,
            months = duration._months,
            minutes,
            hours;

        if (milliseconds) {
            mom._d.setTime(+mom._d + milliseconds * isAdding);
        }
        // store the minutes and hours so we can restore them
        if (days || months) {
            minutes = mom.minute();
            hours = mom.hour();
        }
        if (days) {
            mom.date(mom.date() + days * isAdding);
        }
        if (months) {
            mom.month(mom.month() + months * isAdding);
        }
        if (milliseconds && !ignoreUpdateOffset) {
            moment.updateOffset(mom);
        }
        // restore the minutes and hours after possibly changing dst
        if (days || months) {
            mom.minute(minutes);
            mom.hour(hours);
        }
    }

    // check if is an array
    function isArray(input) {
        return Object.prototype.toString.call(input) === '[object Array]';
    }

    // compare two arrays, return the number of differences
    function compareArrays(array1, array2) {
        var len = Math.min(array1.length, array2.length),
            lengthDiff = Math.abs(array1.length - array2.length),
            diffs = 0,
            i;
        for (i = 0; i < len; i++) {
            if (~~array1[i] !== ~~array2[i]) {
                diffs++;
            }
        }
        return diffs + lengthDiff;
    }

    function normalizeUnits(units) {
        return units ? unitAliases[units] || units.toLowerCase().replace(/(.)s$/, '$1') : units;
    }


    /************************************
        Languages
    ************************************/


    extend(Language.prototype, {

        set : function (config) {
            var prop, i;
            for (i in config) {
                prop = config[i];
                if (typeof prop === 'function') {
                    this[i] = prop;
                } else {
                    this['_' + i] = prop;
                }
            }
        },

        _months : "January_February_March_April_May_June_July_August_September_October_November_December".split("_"),
        months : function (m) {
            return this._months[m.month()];
        },

        _monthsShort : "Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec".split("_"),
        monthsShort : function (m) {
            return this._monthsShort[m.month()];
        },

        monthsParse : function (monthName) {
            var i, mom, regex;

            if (!this._monthsParse) {
                this._monthsParse = [];
            }

            for (i = 0; i < 12; i++) {
                // make the regex if we don't have it already
                if (!this._monthsParse[i]) {
                    mom = moment.utc([2000, i]);
                    regex = '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');
                    this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (this._monthsParse[i].test(monthName)) {
                    return i;
                }
            }
        },

        _weekdays : "Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"),
        weekdays : function (m) {
            return this._weekdays[m.day()];
        },

        _weekdaysShort : "Sun_Mon_Tue_Wed_Thu_Fri_Sat".split("_"),
        weekdaysShort : function (m) {
            return this._weekdaysShort[m.day()];
        },

        _weekdaysMin : "Su_Mo_Tu_We_Th_Fr_Sa".split("_"),
        weekdaysMin : function (m) {
            return this._weekdaysMin[m.day()];
        },

        weekdaysParse : function (weekdayName) {
            var i, mom, regex;

            if (!this._weekdaysParse) {
                this._weekdaysParse = [];
            }

            for (i = 0; i < 7; i++) {
                // make the regex if we don't have it already
                if (!this._weekdaysParse[i]) {
                    mom = moment([2000, 1]).day(i);
                    regex = '^' + this.weekdays(mom, '') + '|^' + this.weekdaysShort(mom, '') + '|^' + this.weekdaysMin(mom, '');
                    this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (this._weekdaysParse[i].test(weekdayName)) {
                    return i;
                }
            }
        },

        _longDateFormat : {
            LT : "h:mm A",
            L : "MM/DD/YYYY",
            LL : "MMMM D YYYY",
            LLL : "MMMM D YYYY LT",
            LLLL : "dddd, MMMM D YYYY LT"
        },
        longDateFormat : function (key) {
            var output = this._longDateFormat[key];
            if (!output && this._longDateFormat[key.toUpperCase()]) {
                output = this._longDateFormat[key.toUpperCase()].replace(/MMMM|MM|DD|dddd/g, function (val) {
                    return val.slice(1);
                });
                this._longDateFormat[key] = output;
            }
            return output;
        },

        isPM : function (input) {
            // IE8 Quirks Mode & IE7 Standards Mode do not allow accessing strings like arrays
            // Using charAt should be more compatible.
            return ((input + '').toLowerCase().charAt(0) === 'p');
        },

        _meridiemParse : /[ap]\.?m?\.?/i,
        meridiem : function (hours, minutes, isLower) {
            if (hours > 11) {
                return isLower ? 'pm' : 'PM';
            } else {
                return isLower ? 'am' : 'AM';
            }
        },

        _calendar : {
            sameDay : '[Today at] LT',
            nextDay : '[Tomorrow at] LT',
            nextWeek : 'dddd [at] LT',
            lastDay : '[Yesterday at] LT',
            lastWeek : '[Last] dddd [at] LT',
            sameElse : 'L'
        },
        calendar : function (key, mom) {
            var output = this._calendar[key];
            return typeof output === 'function' ? output.apply(mom) : output;
        },

        _relativeTime : {
            future : "in %s",
            past : "%s ago",
            s : "a few seconds",
            m : "a minute",
            mm : "%d minutes",
            h : "an hour",
            hh : "%d hours",
            d : "a day",
            dd : "%d days",
            M : "a month",
            MM : "%d months",
            y : "a year",
            yy : "%d years"
        },
        relativeTime : function (number, withoutSuffix, string, isFuture) {
            var output = this._relativeTime[string];
            return (typeof output === 'function') ?
                output(number, withoutSuffix, string, isFuture) :
                output.replace(/%d/i, number);
        },
        pastFuture : function (diff, output) {
            var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
            return typeof format === 'function' ? format(output) : format.replace(/%s/i, output);
        },

        ordinal : function (number) {
            return this._ordinal.replace("%d", number);
        },
        _ordinal : "%d",

        preparse : function (string) {
            return string;
        },

        postformat : function (string) {
            return string;
        },

        week : function (mom) {
            return weekOfYear(mom, this._week.dow, this._week.doy).week;
        },
        _week : {
            dow : 0, // Sunday is the first day of the week.
            doy : 6  // The week that contains Jan 1st is the first week of the year.
        }
    });

    // Loads a language definition into the `languages` cache.  The function
    // takes a key and optionally values.  If not in the browser and no values
    // are provided, it will load the language file module.  As a convenience,
    // this function also returns the language values.
    function loadLang(key, values) {
        values.abbr = key;
        if (!languages[key]) {
            languages[key] = new Language();
        }
        languages[key].set(values);
        return languages[key];
    }

    // Remove a language from the `languages` cache. Mostly useful in tests.
    function unloadLang(key) {
        delete languages[key];
    }

    // Determines which language definition to use and returns it.
    //
    // With no parameters, it will return the global language.  If you
    // pass in a language key, such as 'en', it will return the
    // definition for 'en', so long as 'en' has already been loaded using
    // moment.lang.
    function getLangDefinition(key) {
        if (!key) {
            return moment.fn._lang;
        }
        if (!languages[key] && hasModule) {
            try {
                require('./lang/' + key);
            } catch (e) {
                // call with no params to set to default
                return moment.fn._lang;
            }
        }
        return languages[key] || moment.fn._lang;
    }


    /************************************
        Formatting
    ************************************/


    function removeFormattingTokens(input) {
        if (input.match(/\[.*\]/)) {
            return input.replace(/^\[|\]$/g, "");
        }
        return input.replace(/\\/g, "");
    }

    function makeFormatFunction(format) {
        var array = format.match(formattingTokens), i, length;

        for (i = 0, length = array.length; i < length; i++) {
            if (formatTokenFunctions[array[i]]) {
                array[i] = formatTokenFunctions[array[i]];
            } else {
                array[i] = removeFormattingTokens(array[i]);
            }
        }

        return function (mom) {
            var output = "";
            for (i = 0; i < length; i++) {
                output += array[i] instanceof Function ? array[i].call(mom, format) : array[i];
            }
            return output;
        };
    }

    // format date using native date object
    function formatMoment(m, format) {

        format = expandFormat(format, m.lang());

        if (!formatFunctions[format]) {
            formatFunctions[format] = makeFormatFunction(format);
        }

        return formatFunctions[format](m);
    }

    function expandFormat(format, lang) {
        var i = 5;

        function replaceLongDateFormatTokens(input) {
            return lang.longDateFormat(input) || input;
        }

        while (i-- && (localFormattingTokens.lastIndex = 0,
                    localFormattingTokens.test(format))) {
            format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);
        }

        return format;
    }


    /************************************
        Parsing
    ************************************/


    // get the regex to find the next token
    function getParseRegexForToken(token, config) {
        switch (token) {
        case 'DDDD':
            return parseTokenThreeDigits;
        case 'YYYY':
            return parseTokenFourDigits;
        case 'YYYYY':
            return parseTokenSixDigits;
        case 'S':
        case 'SS':
        case 'SSS':
        case 'DDD':
            return parseTokenOneToThreeDigits;
        case 'MMM':
        case 'MMMM':
        case 'dd':
        case 'ddd':
        case 'dddd':
            return parseTokenWord;
        case 'a':
        case 'A':
            return getLangDefinition(config._l)._meridiemParse;
        case 'X':
            return parseTokenTimestampMs;
        case 'Z':
        case 'ZZ':
            return parseTokenTimezone;
        case 'T':
            return parseTokenT;
        case 'MM':
        case 'DD':
        case 'YY':
        case 'HH':
        case 'hh':
        case 'mm':
        case 'ss':
        case 'M':
        case 'D':
        case 'd':
        case 'H':
        case 'h':
        case 'm':
        case 's':
            return parseTokenOneOrTwoDigits;
        default :
            return new RegExp(token.replace('\\', ''));
        }
    }

    function timezoneMinutesFromString(string) {
        var tzchunk = (parseTokenTimezone.exec(string) || [])[0],
            parts = (tzchunk + '').match(parseTimezoneChunker) || ['-', 0, 0],
            minutes = +(parts[1] * 60) + ~~parts[2];

        return parts[0] === '+' ? -minutes : minutes;
    }

    // function to convert string input to date
    function addTimeToArrayFromToken(token, input, config) {
        var a, datePartArray = config._a;

        switch (token) {
        // MONTH
        case 'M' : // fall through to MM
        case 'MM' :
            if (input != null) {
                datePartArray[1] = ~~input - 1;
            }
            break;
        case 'MMM' : // fall through to MMMM
        case 'MMMM' :
            a = getLangDefinition(config._l).monthsParse(input);
            // if we didn't find a month name, mark the date as invalid.
            if (a != null) {
                datePartArray[1] = a;
            } else {
                config._isValid = false;
            }
            break;
        // DAY OF MONTH
        case 'D' : // fall through to DD
        case 'DD' :
            if (input != null) {
                datePartArray[2] = ~~input;
            }
            break;
        // DAY OF YEAR
        case 'DDD' : // fall through to DDDD
        case 'DDDD' :
            if (input != null) {
                datePartArray[1] = 0;
                datePartArray[2] = ~~input;
            }
            break;
        // YEAR
        case 'YY' :
            datePartArray[0] = ~~input + (~~input > 68 ? 1900 : 2000);
            break;
        case 'YYYY' :
        case 'YYYYY' :
            datePartArray[0] = ~~input;
            break;
        // AM / PM
        case 'a' : // fall through to A
        case 'A' :
            config._isPm = getLangDefinition(config._l).isPM(input);
            break;
        // 24 HOUR
        case 'H' : // fall through to hh
        case 'HH' : // fall through to hh
        case 'h' : // fall through to hh
        case 'hh' :
            datePartArray[3] = ~~input;
            break;
        // MINUTE
        case 'm' : // fall through to mm
        case 'mm' :
            datePartArray[4] = ~~input;
            break;
        // SECOND
        case 's' : // fall through to ss
        case 'ss' :
            datePartArray[5] = ~~input;
            break;
        // MILLISECOND
        case 'S' :
        case 'SS' :
        case 'SSS' :
            datePartArray[6] = ~~ (('0.' + input) * 1000);
            break;
        // UNIX TIMESTAMP WITH MS
        case 'X':
            config._d = new Date(parseFloat(input) * 1000);
            break;
        // TIMEZONE
        case 'Z' : // fall through to ZZ
        case 'ZZ' :
            config._useUTC = true;
            config._tzm = timezoneMinutesFromString(input);
            break;
        }

        // if the input is null, the date is not valid
        if (input == null) {
            config._isValid = false;
        }
    }

    // convert an array to a date.
    // the array should mirror the parameters below
    // note: all values past the year are optional and will default to the lowest possible value.
    // [year, month, day , hour, minute, second, millisecond]
    function dateFromArray(config) {
        var i, date, input = [], currentDate;

        if (config._d) {
            return;
        }

        // Default to current date.
        // * if no year, month, day of month are given, default to today
        // * if day of month is given, default month and year
        // * if month is given, default only year
        // * if year is given, don't default anything
        currentDate = currentDateArray(config);
        for (i = 0; i < 3 && config._a[i] == null; ++i) {
            config._a[i] = input[i] = currentDate[i];
        }

        // Zero out whatever was not defaulted, including time
        for (; i < 7; i++) {
            config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];
        }

        // add the offsets to the time to be parsed so that we can have a clean array for checking isValid
        input[3] += ~~((config._tzm || 0) / 60);
        input[4] += ~~((config._tzm || 0) % 60);

        date = new Date(0);

        if (config._useUTC) {
            date.setUTCFullYear(input[0], input[1], input[2]);
            date.setUTCHours(input[3], input[4], input[5], input[6]);
        } else {
            date.setFullYear(input[0], input[1], input[2]);
            date.setHours(input[3], input[4], input[5], input[6]);
        }

        config._d = date;
    }

    function dateFromObject(config) {
        var o = config._i;

        if (config._d) {
            return;
        }

        config._a = [
            o.years || o.year || o.y,
            o.months || o.month || o.M,
            o.days || o.day || o.d,
            o.hours || o.hour || o.h,
            o.minutes || o.minute || o.m,
            o.seconds || o.second || o.s,
            o.milliseconds || o.millisecond || o.ms
        ];

        dateFromArray(config);
    }

    function currentDateArray(config) {
        var now = new Date();
        if (config._useUTC) {
            return [
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate()
            ];
        } else {
            return [now.getFullYear(), now.getMonth(), now.getDate()];
        }
    }

    // date from string and format string
    function makeDateFromStringAndFormat(config) {
        // This array is used to make a Date, either with `new Date` or `Date.UTC`
        var lang = getLangDefinition(config._l),
            string = '' + config._i,
            i, parsedInput, tokens;

        tokens = expandFormat(config._f, lang).match(formattingTokens);

        config._a = [];

        for (i = 0; i < tokens.length; i++) {
            parsedInput = (getParseRegexForToken(tokens[i], config).exec(string) || [])[0];
            if (parsedInput) {
                string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
            }
            // don't parse if its not a known token
            if (formatTokenFunctions[tokens[i]]) {
                addTimeToArrayFromToken(tokens[i], parsedInput, config);
            }
        }

        // add remaining unparsed input to the string
        if (string) {
            config._il = string;
        }

        // handle am pm
        if (config._isPm && config._a[3] < 12) {
            config._a[3] += 12;
        }
        // if is 12 am, change hours to 0
        if (config._isPm === false && config._a[3] === 12) {
            config._a[3] = 0;
        }
        // return
        dateFromArray(config);
    }

    // date from string and array of format strings
    function makeDateFromStringAndArray(config) {
        var tempConfig,
            tempMoment,
            bestMoment,

            scoreToBeat = 99,
            i,
            currentScore;

        for (i = 0; i < config._f.length; i++) {
            tempConfig = extend({}, config);
            tempConfig._f = config._f[i];
            makeDateFromStringAndFormat(tempConfig);
            tempMoment = new Moment(tempConfig);

            currentScore = compareArrays(tempConfig._a, tempMoment.toArray());

            // if there is any input that was not parsed
            // add a penalty for that format
            if (tempMoment._il) {
                currentScore += tempMoment._il.length;
            }

            if (currentScore < scoreToBeat) {
                scoreToBeat = currentScore;
                bestMoment = tempMoment;
            }
        }

        extend(config, bestMoment);
    }

    // date from iso format
    function makeDateFromString(config) {
        var i,
            string = config._i,
            match = isoRegex.exec(string);

        if (match) {
            // match[2] should be "T" or undefined
            config._f = 'YYYY-MM-DD' + (match[2] || " ");
            for (i = 0; i < 4; i++) {
                if (isoTimes[i][1].exec(string)) {
                    config._f += isoTimes[i][0];
                    break;
                }
            }
            if (parseTokenTimezone.exec(string)) {
                config._f += " Z";
            }
            makeDateFromStringAndFormat(config);
        } else {
            config._d = new Date(string);
        }
    }

    function makeDateFromInput(config) {
        var input = config._i,
            matched = aspNetJsonRegex.exec(input);

        if (input === undefined) {
            config._d = new Date();
        } else if (matched) {
            config._d = new Date(+matched[1]);
        } else if (typeof input === 'string') {
            makeDateFromString(config);
        } else if (isArray(input)) {
            config._a = input.slice(0);
            dateFromArray(config);
        } else if (input instanceof Date) {
            config._d = new Date(+input);
        } else if (typeof(input) === 'object') {
            dateFromObject(config);
        } else {
            config._d = new Date(input);
        }
    }


    /************************************
        Relative Time
    ************************************/


    // helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize
    function substituteTimeAgo(string, number, withoutSuffix, isFuture, lang) {
        return lang.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
    }

    function relativeTime(milliseconds, withoutSuffix, lang) {
        var seconds = round(Math.abs(milliseconds) / 1000),
            minutes = round(seconds / 60),
            hours = round(minutes / 60),
            days = round(hours / 24),
            years = round(days / 365),
            args = seconds < 45 && ['s', seconds] ||
                minutes === 1 && ['m'] ||
                minutes < 45 && ['mm', minutes] ||
                hours === 1 && ['h'] ||
                hours < 22 && ['hh', hours] ||
                days === 1 && ['d'] ||
                days <= 25 && ['dd', days] ||
                days <= 45 && ['M'] ||
                days < 345 && ['MM', round(days / 30)] ||
                years === 1 && ['y'] || ['yy', years];
        args[2] = withoutSuffix;
        args[3] = milliseconds > 0;
        args[4] = lang;
        return substituteTimeAgo.apply({}, args);
    }


    /************************************
        Week of Year
    ************************************/


    // firstDayOfWeek       0 = sun, 6 = sat
    //                      the day of the week that starts the week
    //                      (usually sunday or monday)
    // firstDayOfWeekOfYear 0 = sun, 6 = sat
    //                      the first week is the week that contains the first
    //                      of this day of the week
    //                      (eg. ISO weeks use thursday (4))
    function weekOfYear(mom, firstDayOfWeek, firstDayOfWeekOfYear) {
        var end = firstDayOfWeekOfYear - firstDayOfWeek,
            daysToDayOfWeek = firstDayOfWeekOfYear - mom.day(),
            adjustedMoment;


        if (daysToDayOfWeek > end) {
            daysToDayOfWeek -= 7;
        }

        if (daysToDayOfWeek < end - 7) {
            daysToDayOfWeek += 7;
        }

        adjustedMoment = moment(mom).add('d', daysToDayOfWeek);
        return {
            week: Math.ceil(adjustedMoment.dayOfYear() / 7),
            year: adjustedMoment.year()
        };
    }


    /************************************
        Top Level Functions
    ************************************/

    function makeMoment(config) {
        var input = config._i,
            format = config._f;

        if (input === null || input === '') {
            return null;
        }

        if (typeof input === 'string') {
            config._i = input = getLangDefinition().preparse(input);
        }

        if (moment.isMoment(input)) {
            config = extend({}, input);
            config._d = new Date(+input._d);
        } else if (format) {
            if (isArray(format)) {
                makeDateFromStringAndArray(config);
            } else {
                makeDateFromStringAndFormat(config);
            }
        } else {
            makeDateFromInput(config);
        }

        return new Moment(config);
    }

    moment = function (input, format, lang) {
        return makeMoment({
            _i : input,
            _f : format,
            _l : lang,
            _isUTC : false
        });
    };

    // creating with utc
    moment.utc = function (input, format, lang) {
        return makeMoment({
            _useUTC : true,
            _isUTC : true,
            _l : lang,
            _i : input,
            _f : format
        }).utc();
    };

    // creating with unix timestamp (in seconds)
    moment.unix = function (input) {
        return moment(input * 1000);
    };

    // duration
    moment.duration = function (input, key) {
        var isDuration = moment.isDuration(input),
            isNumber = (typeof input === 'number'),
            duration = (isDuration ? input._input : (isNumber ? {} : input)),
            matched = aspNetTimeSpanJsonRegex.exec(input),
            sign,
            ret;

        if (isNumber) {
            if (key) {
                duration[key] = input;
            } else {
                duration.milliseconds = input;
            }
        } else if (matched) {
            sign = (matched[1] === "-") ? -1 : 1;
            duration = {
                y: 0,
                d: ~~matched[2] * sign,
                h: ~~matched[3] * sign,
                m: ~~matched[4] * sign,
                s: ~~matched[5] * sign,
                ms: ~~matched[6] * sign
            };
        }

        ret = new Duration(duration);

        if (isDuration && input.hasOwnProperty('_lang')) {
            ret._lang = input._lang;
        }

        return ret;
    };

    // version number
    moment.version = VERSION;

    // default format
    moment.defaultFormat = isoFormat;

    // This function will be called whenever a moment is mutated.
    // It is intended to keep the offset in sync with the timezone.
    moment.updateOffset = function () {};

    // This function will load languages and then set the global language.  If
    // no arguments are passed in, it will simply return the current global
    // language key.
    moment.lang = function (key, values) {
        if (!key) {
            return moment.fn._lang._abbr;
        }
        key = key.toLowerCase();
        key = key.replace('_', '-');
        if (values) {
            loadLang(key, values);
        } else if (values === null) {
            unloadLang(key);
            key = 'en';
        } else if (!languages[key]) {
            getLangDefinition(key);
        }
        moment.duration.fn._lang = moment.fn._lang = getLangDefinition(key);
    };

    // returns language data
    moment.langData = function (key) {
        if (key && key._lang && key._lang._abbr) {
            key = key._lang._abbr;
        }
        return getLangDefinition(key);
    };

    // compare moment object
    moment.isMoment = function (obj) {
        return obj instanceof Moment;
    };

    // for typechecking Duration objects
    moment.isDuration = function (obj) {
        return obj instanceof Duration;
    };


    /************************************
        Moment Prototype
    ************************************/


    extend(moment.fn = Moment.prototype, {

        clone : function () {
            return moment(this);
        },

        valueOf : function () {
            return +this._d + ((this._offset || 0) * 60000);
        },

        unix : function () {
            return Math.floor(+this / 1000);
        },

        toString : function () {
            return this.format("ddd MMM DD YYYY HH:mm:ss [GMT]ZZ");
        },

        toDate : function () {
            return this._offset ? new Date(+this) : this._d;
        },

        toISOString : function () {
            return formatMoment(moment(this).utc(), 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
        },

        toArray : function () {
            var m = this;
            return [
                m.year(),
                m.month(),
                m.date(),
                m.hours(),
                m.minutes(),
                m.seconds(),
                m.milliseconds()
            ];
        },

        isValid : function () {
            if (this._isValid == null) {
                if (this._a) {
                    this._isValid = !compareArrays(this._a, (this._isUTC ? moment.utc(this._a) : moment(this._a)).toArray());
                } else {
                    this._isValid = !isNaN(this._d.getTime());
                }
            }
            return !!this._isValid;
        },

        invalidAt: function () {
            var i, arr1 = this._a, arr2 = (this._isUTC ? moment.utc(this._a) : moment(this._a)).toArray();
            for (i = 6; i >= 0 && arr1[i] === arr2[i]; --i) {
                // empty loop body
            }
            return i;
        },

        utc : function () {
            return this.zone(0);
        },

        local : function () {
            this.zone(0);
            this._isUTC = false;
            return this;
        },

        format : function (inputString) {
            var output = formatMoment(this, inputString || moment.defaultFormat);
            return this.lang().postformat(output);
        },

        add : function (input, val) {
            var dur;
            // switch args to support add('s', 1) and add(1, 's')
            if (typeof input === 'string') {
                dur = moment.duration(+val, input);
            } else {
                dur = moment.duration(input, val);
            }
            addOrSubtractDurationFromMoment(this, dur, 1);
            return this;
        },

        subtract : function (input, val) {
            var dur;
            // switch args to support subtract('s', 1) and subtract(1, 's')
            if (typeof input === 'string') {
                dur = moment.duration(+val, input);
            } else {
                dur = moment.duration(input, val);
            }
            addOrSubtractDurationFromMoment(this, dur, -1);
            return this;
        },

        diff : function (input, units, asFloat) {
            var that = this._isUTC ? moment(input).zone(this._offset || 0) : moment(input).local(),
                zoneDiff = (this.zone() - that.zone()) * 6e4,
                diff, output;

            units = normalizeUnits(units);

            if (units === 'year' || units === 'month') {
                // average number of days in the months in the given dates
                diff = (this.daysInMonth() + that.daysInMonth()) * 432e5; // 24 * 60 * 60 * 1000 / 2
                // difference in months
                output = ((this.year() - that.year()) * 12) + (this.month() - that.month());
                // adjust by taking difference in days, average number of days
                // and dst in the given months.
                output += ((this - moment(this).startOf('month')) -
                        (that - moment(that).startOf('month'))) / diff;
                // same as above but with zones, to negate all dst
                output -= ((this.zone() - moment(this).startOf('month').zone()) -
                        (that.zone() - moment(that).startOf('month').zone())) * 6e4 / diff;
                if (units === 'year') {
                    output = output / 12;
                }
            } else {
                diff = (this - that);
                output = units === 'second' ? diff / 1e3 : // 1000
                    units === 'minute' ? diff / 6e4 : // 1000 * 60
                    units === 'hour' ? diff / 36e5 : // 1000 * 60 * 60
                    units === 'day' ? (diff - zoneDiff) / 864e5 : // 1000 * 60 * 60 * 24, negate dst
                    units === 'week' ? (diff - zoneDiff) / 6048e5 : // 1000 * 60 * 60 * 24 * 7, negate dst
                    diff;
            }
            return asFloat ? output : absRound(output);
        },

        from : function (time, withoutSuffix) {
            return moment.duration(this.diff(time)).lang(this.lang()._abbr).humanize(!withoutSuffix);
        },

        fromNow : function (withoutSuffix) {
            return this.from(moment(), withoutSuffix);
        },

        calendar : function () {
            var diff = this.diff(moment().zone(this.zone()).startOf('day'), 'days', true),
                format = diff < -6 ? 'sameElse' :
                diff < -1 ? 'lastWeek' :
                diff < 0 ? 'lastDay' :
                diff < 1 ? 'sameDay' :
                diff < 2 ? 'nextDay' :
                diff < 7 ? 'nextWeek' : 'sameElse';
            return this.format(this.lang().calendar(format, this));
        },

        isLeapYear : function () {
            var year = this.year();
            return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
        },

        isDST : function () {
            return (this.zone() < this.clone().month(0).zone() ||
                this.zone() < this.clone().month(5).zone());
        },

        day : function (input) {
            var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
            if (input != null) {
                if (typeof input === 'string') {
                    input = this.lang().weekdaysParse(input);
                    if (typeof input !== 'number') {
                        return this;
                    }
                }
                return this.add({ d : input - day });
            } else {
                return day;
            }
        },

        month : function (input) {
            var utc = this._isUTC ? 'UTC' : '',
                dayOfMonth;

            if (input != null) {
                if (typeof input === 'string') {
                    input = this.lang().monthsParse(input);
                    if (typeof input !== 'number') {
                        return this;
                    }
                }

                dayOfMonth = this.date();
                this.date(1);
                this._d['set' + utc + 'Month'](input);
                this.date(Math.min(dayOfMonth, this.daysInMonth()));

                moment.updateOffset(this);
                return this;
            } else {
                return this._d['get' + utc + 'Month']();
            }
        },

        startOf: function (units) {
            units = normalizeUnits(units);
            // the following switch intentionally omits break keywords
            // to utilize falling through the cases.
            switch (units) {
            case 'year':
                this.month(0);
                /* falls through */
            case 'month':
                this.date(1);
                /* falls through */
            case 'week':
            case 'isoweek':
            case 'day':
                this.hours(0);
                /* falls through */
            case 'hour':
                this.minutes(0);
                /* falls through */
            case 'minute':
                this.seconds(0);
                /* falls through */
            case 'second':
                this.milliseconds(0);
                /* falls through */
            }

            // weeks are a special case
            if (units === 'week') {
                this.weekday(0);
            } else if (units === 'isoweek') {
                this.isoWeekday(1);
            }

            return this;
        },

        endOf: function (units) {
            units = normalizeUnits(units);
            return this.startOf(units).add((units === 'isoweek' ? 'week' : units), 1).subtract('ms', 1);
        },

        isAfter: function (input, units) {
            units = typeof units !== 'undefined' ? units : 'millisecond';
            return +this.clone().startOf(units) > +moment(input).startOf(units);
        },

        isBefore: function (input, units) {
            units = typeof units !== 'undefined' ? units : 'millisecond';
            return +this.clone().startOf(units) < +moment(input).startOf(units);
        },

        isSame: function (input, units) {
            units = typeof units !== 'undefined' ? units : 'millisecond';
            return +this.clone().startOf(units) === +moment(input).startOf(units);
        },

        min: function (other) {
            other = moment.apply(null, arguments);
            return other < this ? this : other;
        },

        max: function (other) {
            other = moment.apply(null, arguments);
            return other > this ? this : other;
        },

        zone : function (input) {
            var offset = this._offset || 0;
            if (input != null) {
                if (typeof input === "string") {
                    input = timezoneMinutesFromString(input);
                }
                if (Math.abs(input) < 16) {
                    input = input * 60;
                }
                this._offset = input;
                this._isUTC = true;
                if (offset !== input) {
                    addOrSubtractDurationFromMoment(this, moment.duration(offset - input, 'm'), 1, true);
                }
            } else {
                return this._isUTC ? offset : this._d.getTimezoneOffset();
            }
            return this;
        },

        zoneAbbr : function () {
            return this._isUTC ? "UTC" : "";
        },

        zoneName : function () {
            return this._isUTC ? "Coordinated Universal Time" : "";
        },

        hasAlignedHourOffset : function (input) {
            if (!input) {
                input = 0;
            }
            else {
                input = moment(input).zone();
            }

            return (this.zone() - input) % 60 === 0;
        },

        daysInMonth : function () {
            return moment.utc([this.year(), this.month() + 1, 0]).date();
        },

        dayOfYear : function (input) {
            var dayOfYear = round((moment(this).startOf('day') - moment(this).startOf('year')) / 864e5) + 1;
            return input == null ? dayOfYear : this.add("d", (input - dayOfYear));
        },

        weekYear : function (input) {
            var year = weekOfYear(this, this.lang()._week.dow, this.lang()._week.doy).year;
            return input == null ? year : this.add("y", (input - year));
        },

        isoWeekYear : function (input) {
            var year = weekOfYear(this, 1, 4).year;
            return input == null ? year : this.add("y", (input - year));
        },

        week : function (input) {
            var week = this.lang().week(this);
            return input == null ? week : this.add("d", (input - week) * 7);
        },

        isoWeek : function (input) {
            var week = weekOfYear(this, 1, 4).week;
            return input == null ? week : this.add("d", (input - week) * 7);
        },

        weekday : function (input) {
            var weekday = (this._d.getDay() + 7 - this.lang()._week.dow) % 7;
            return input == null ? weekday : this.add("d", input - weekday);
        },

        isoWeekday : function (input) {
            // behaves the same as moment#day except
            // as a getter, returns 7 instead of 0 (1-7 range instead of 0-6)
            // as a setter, sunday should belong to the previous week.
            return input == null ? this.day() || 7 : this.day(this.day() % 7 ? input : input - 7);
        },

        get : function (units) {
            units = normalizeUnits(units);
            return this[units.toLowerCase()]();
        },

        set : function (units, value) {
            units = normalizeUnits(units);
            this[units.toLowerCase()](value);
        },

        // If passed a language key, it will set the language for this
        // instance.  Otherwise, it will return the language configuration
        // variables for this instance.
        lang : function (key) {
            if (key === undefined) {
                return this._lang;
            } else {
                this._lang = getLangDefinition(key);
                return this;
            }
        }
    });

    // helper for adding shortcuts
    function makeGetterAndSetter(name, key) {
        moment.fn[name] = moment.fn[name + 's'] = function (input) {
            var utc = this._isUTC ? 'UTC' : '';
            if (input != null) {
                this._d['set' + utc + key](input);
                moment.updateOffset(this);
                return this;
            } else {
                return this._d['get' + utc + key]();
            }
        };
    }

    // loop through and add shortcuts (Month, Date, Hours, Minutes, Seconds, Milliseconds)
    for (i = 0; i < proxyGettersAndSetters.length; i ++) {
        makeGetterAndSetter(proxyGettersAndSetters[i].toLowerCase().replace(/s$/, ''), proxyGettersAndSetters[i]);
    }

    // add shortcut for year (uses different syntax than the getter/setter 'year' == 'FullYear')
    makeGetterAndSetter('year', 'FullYear');

    // add plural methods
    moment.fn.days = moment.fn.day;
    moment.fn.months = moment.fn.month;
    moment.fn.weeks = moment.fn.week;
    moment.fn.isoWeeks = moment.fn.isoWeek;

    // add aliased format methods
    moment.fn.toJSON = moment.fn.toISOString;

    /************************************
        Duration Prototype
    ************************************/


    extend(moment.duration.fn = Duration.prototype, {

        _bubble : function () {
            var milliseconds = this._milliseconds,
                days = this._days,
                months = this._months,
                data = this._data,
                seconds, minutes, hours, years;

            // The following code bubbles up values, see the tests for
            // examples of what that means.
            data.milliseconds = milliseconds % 1000;

            seconds = absRound(milliseconds / 1000);
            data.seconds = seconds % 60;

            minutes = absRound(seconds / 60);
            data.minutes = minutes % 60;

            hours = absRound(minutes / 60);
            data.hours = hours % 24;

            days += absRound(hours / 24);
            data.days = days % 30;

            months += absRound(days / 30);
            data.months = months % 12;

            years = absRound(months / 12);
            data.years = years;
        },

        weeks : function () {
            return absRound(this.days() / 7);
        },

        valueOf : function () {
            return this._milliseconds +
              this._days * 864e5 +
              (this._months % 12) * 2592e6 +
              ~~(this._months / 12) * 31536e6;
        },

        humanize : function (withSuffix) {
            var difference = +this,
                output = relativeTime(difference, !withSuffix, this.lang());

            if (withSuffix) {
                output = this.lang().pastFuture(difference, output);
            }

            return this.lang().postformat(output);
        },

        add : function (input, val) {
            // supports only 2.0-style add(1, 's') or add(moment)
            var dur = moment.duration(input, val);

            this._milliseconds += dur._milliseconds;
            this._days += dur._days;
            this._months += dur._months;

            this._bubble();

            return this;
        },

        subtract : function (input, val) {
            var dur = moment.duration(input, val);

            this._milliseconds -= dur._milliseconds;
            this._days -= dur._days;
            this._months -= dur._months;

            this._bubble();

            return this;
        },

        get : function (units) {
            units = normalizeUnits(units);
            return this[units.toLowerCase() + 's']();
        },

        as : function (units) {
            units = normalizeUnits(units);
            return this['as' + units.charAt(0).toUpperCase() + units.slice(1) + 's']();
        },

        lang : moment.fn.lang
    });

    function makeDurationGetter(name) {
        moment.duration.fn[name] = function () {
            return this._data[name];
        };
    }

    function makeDurationAsGetter(name, factor) {
        moment.duration.fn['as' + name] = function () {
            return +this / factor;
        };
    }

    for (i in unitMillisecondFactors) {
        if (unitMillisecondFactors.hasOwnProperty(i)) {
            makeDurationAsGetter(i, unitMillisecondFactors[i]);
            makeDurationGetter(i.toLowerCase());
        }
    }

    makeDurationAsGetter('Weeks', 6048e5);
    moment.duration.fn.asMonths = function () {
        return (+this - this.years() * 31536e6) / 2592e6 + this.years() * 12;
    };


    /************************************
        Default Lang
    ************************************/


    // Set default language, other languages will inherit from English.
    moment.lang('en', {
        ordinal : function (number) {
            var b = number % 10,
                output = (~~ (number % 100 / 10) === 1) ? 'th' :
                (b === 1) ? 'st' :
                (b === 2) ? 'nd' :
                (b === 3) ? 'rd' : 'th';
            return number + output;
        }
    });

    /* EMBED_LANGUAGES */

    /************************************
        Exposing Moment
    ************************************/


    // CommonJS module is defined
    if (hasModule) {
        module.exports = moment;
    }
    /*global ender:false */
    if (typeof ender === 'undefined') {
        // here, `this` means `window` in the browser, or `global` on the server
        // add `moment` as a global object via a string identifier,
        // for Closure Compiler "advanced" mode
        this['moment'] = moment;
    }
    /*global define:false */
    if (typeof define === "function" && define.amd) {
        define("moment", [], function () {
            return moment;
        });
    }
}).call(this);

// moment.js integration pattern
//
// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('mockup-patterns-moment',[
  'jquery',
  'mockup-patterns-base',
  'moment'
], function($, Base, moment) {
  

  var Moment = Base.extend({
    name: 'moment',
    defaults: {
      // selector of elements to format dates for
      selector: null,
      // also available options are relative, calendar
      format: 'MMMM Do YYYY, h:mm:ss a'
    },
    convert: function($el){
      var self = this;
      var date = $el.attr('data-date');
      if(!date){
        date = $.trim($el.html());
      }
      date = moment(date);
      if(!date.isValid()){
        return;
      }
      if(self.options.format === 'relative'){
        date = date.fromNow();
      }else if(self.options.format === 'calendar'){
        date = date.calendar();
      }else{
        date = date.format(self.options.format);
      }
      if(date){
        $el.html(date);
      }
    },
    init: function() {
      var self = this;
      if(self.options.selector){
        self.$el.find(self.options.selector).each(function(){
          self.convert($(this));
        });
      }else{
        self.convert(self.$el);
      }
    }
  });

  return Moment;

});

// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/views/table',[
  'jquery',
  'underscore',
  'backbone',
  'js/patterns/structure/views/tablerow',
  'text!js/patterns/structure/templates/table.xml',
  'js/ui/views/base',
  'mockup-patterns-dragdrop',
  'mockup-patterns-moment'
], function($, _, Backbone, TableRowView, TableTemplate, BaseView, DragDrop,
            Moment) {
  

  var TableView = BaseView.extend({
    tagName: 'div',
    template: _.template(TableTemplate),
    initialize: function(){
      var self = this;
      BaseView.prototype.initialize.call(self);
      self.collection = self.app.collection;
      self.selectedCollection = self.app.selectedCollection;
      self.listenTo(self.collection, 'sync', self.render);
      self.listenTo(self.selectedCollection, 'remove', self.render);
      self.listenTo(self.selectedCollection, 'reset', self.render);
      self.collection.pager();
      self.subset_ids = [];

      self.app.on('context-info-loaded', function(data){
        /* set default page info */
        var $defaultPage = self.$('[data-id="' + data.defaultPage + '"]');
        if($defaultPage.length > 0){
          $defaultPage.find('td.title').prepend('<span>*</span> ');
          $defaultPage.addClass('default-page');
        }
        /* set breadcrumb title info */
        var crumbs = data.breadcrumbs;
        if(crumbs && crumbs.length){
          var $crumbs = self.$('.breadcrumbs a.crumb');
          _.each(crumbs, function(crumb, idx){
            $crumbs.eq(idx).html(crumb.title);
          });
        }
      });
    },
    events: {
      'click .breadcrumbs a': 'breadcrumbClicked',
      'change .select-all': 'selectAll',
      // 'change tbody input[type="checkbox"]': 'toggleSelectAll'
    },
    render: function() {
      var self = this;
      self.$el.html(self.template({
        pathParts: self.app.queryHelper.getCurrentPath().split('/').slice(1),
        status: self.app.status,
        statusType: self.app.statusType,
        activeColumns: self.app.activeColumns,
        availableColumns: self.app.availableColumns
      }));

      if(self.collection.length){
        var container = self.$('tbody');
        self.collection.each(function(result){
          var view = (new TableRowView({
            model: result,
            app: self.app,
            table: self
          })).render();
          container.append(view.el);
        });
      }

      self.moment = new Moment(self.$el, {
        selector: '.ModificationDate,.EffectiveDate,.CreationDate',
        format: 'relative'
      });
      self.addReordering();
      self.storeOrder();
      return this;
    },
    breadcrumbClicked: function(e){
      e.preventDefault();
      var $el = $(e.target);
      if($el[0].tagName !== 'A'){
        $el = $el.parent('a');
      }
      var path = '';
      $($el.prevAll('a').get().reverse()).each(function(){
        var part = $(this).attr('data-path');
        path += part;
        if(part !== '/'){
          path += '/';
        }
      });
      path += $el.attr('data-path');
      this.app.queryHelper.currentPath = path;
      this.collection.pager();
    },
    selectAll: function(e) {
      if ($(e.target).is(':checked')) {
        $('input[type="checkbox"]', $('tbody')).attr('checked', 'checked').change();
      } else {
        this.selectedCollection.remove(this.collection.models);
      }
    },
    toggleSelectAll: function(e) {
      var $el = $(e.target);
      if (!$el.is(':checked')) {
        this.$('.select-all').removeAttr('checked');
      }
    },
    addReordering: function(){
      var self = this;
      // if we have a custom query going on, we do not allow sorting.
      if(self.app.inQueryMode()){
        self.app.setStatus('Can not order items while querying');
        self.$el.removeClass('order-support');
        return;
      }
      self.$el.addClass('order-support');
      var dd = new DragDrop(self.$('tbody'), {
        selector: 'tr',
        dragClass: 'structure-dragging',
        drop: function($el, delta){
          self.app.moveItem($el.attr('data-id'), delta, self.subset_ids);
          self.storeOrder();
        }
      });
    },
    storeOrder: function(){
      var self = this;
      var subset_ids = [];
      self.$('tbody tr.itemRow').each(function(idx){
        subset_ids.push($(this).attr('data-id'));
      });
      self.subset_ids = subset_ids;
    }
  });

  return TableView;
});

define('text!js/ui/templates/popover.xml',[],function () { return '<div class="arrow"></div>\n<div class="popover-title">\n</div>\n<div class="items popover-content">\n</div>\n\n';});

// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/ui/views/popover',[
  'jquery',
  'underscore',
  'backbone',
  'js/ui/views/container',
  'mockup-patterns-backdrop',
  'text!js/ui/templates/popover.xml',
], function($, _, Backbone, ContainerView, Backdrop, PopoverTemplate) {
  

  var PopoverView = ContainerView.extend({
    tagName: 'div',
    className: 'popover',
    eventPrefix: 'popover',
    template: PopoverTemplate,
    content: null,
    title: null,
    triggerView: null,
    triggerEvents: {
      'button:click': 'toggle'
    },
    placement: "bottom",
    events: {
    },
    opened: false,
    closeOnOutClick: true,
    appendInContainer: true,
    backdrop: undefined,
    $backdrop: null,
    useBackdrop: true,
    backdropOptions: {
      zIndex: "1009",
      opacity: "0.4",
      className: "backdrop backdrop-popover",
      classActiveName: "backdrop-active",
      closeOnEsc: false,
      closeOnClick: true
    },
    afterRender: function () {
      var self = this;
      this.bindTriggerEvents();

      this.$('.popover-title').append(this.title(this.options));
      this.$('.popover-content').append(this.content(this.options));
    },
    bindTriggerEvents: function() {
      if (this.triggerView) {
        _.each(this.triggerEvents, function(func, event) {
          var method = this[func];
          if (!method) {
            $.error('Function not found.');
          }
          this.stopListening(this.triggerView, event);
          this.listenTo(this.triggerView, event, method);
        }, this);
      }
    },
    getPosition: function(){
      var $el = this.triggerView.$el;
      return $.extend({}, {
        width: $el[0].offsetWidth,
        height: $el[0].offsetHeight
      }, $el.offset());
    },
    show: function(){
      var pos = this.getPosition();
      var $tip = this.$el, tp, placement, actualWidth, actualHeight;

      placement = this.placement;

      $tip.css({ top: 0, left: 0 }).addClass('active');


      actualWidth = $tip[0].offsetWidth;
      actualHeight = $tip[0].offsetHeight;

      switch (placement) {
        case 'bottom':
          tp = {top: pos.top + pos.height, left: pos.left + pos.width / 2 - actualWidth / 2};
          break;
        case 'top':
          tp = {top: pos.top - actualHeight, left: pos.left + pos.width / 2 - actualWidth / 2};
          break;
        case 'left':
          tp = {top: pos.top + pos.height / 2 - actualHeight / 2, left: pos.left - actualWidth};
          break;
        case 'right':
          tp = {top: pos.top + pos.height / 2 - actualHeight / 2, left: pos.left + pos.width};
          break;
      }

      this.applyPlacement(tp, placement);

      this.setBackdrop();
      if(this.useBackdrop === true){
        this.backdrop.show();
      }

      this.opened = true;

      if(this.triggerView){
        this.triggerView.$el.addClass('active');
      }

      this.uiEventTrigger('show', this);
    },
    applyPlacement: function(offset, placement){
      var $el = this.$el,
        $tip = this.$el,
        width = $tip[0].offsetWidth,
        height = $tip[0].offsetHeight,
        actualWidth,
        actualHeight,
        delta,
        replace;

      $el.offset(offset)
        .addClass(placement)
        .addClass('active');

      actualWidth = $tip[0].offsetWidth;
      actualHeight = $tip[0].offsetHeight;

      if (placement === 'top' && actualHeight !== height) {
        offset.top = offset.top + height - actualHeight;
        replace = true;
      }

      if (placement === 'bottom' || placement === 'top') {
        delta = 0;

        if (offset.left < 0){
          delta = offset.left * -2;
          offset.left = 0;
          $el.offset(offset);
          actualWidth = $tip[0].offsetWidth;
          actualHeight = $tip[0].offsetHeight;
        }

        this.positionArrow(delta - width + actualWidth, actualWidth, 'left');

      } else {
        this.positionArrow(actualHeight - height, actualHeight, 'top');
      }

      if (replace) {
        $el.offset(offset);
      }
    },
    positionArrow: function(delta, dimension, position) {
      var $arrow = this.$('.arrow');
      $arrow.css(position, delta ? (50 * (1 - delta / dimension) + "%") : '');
    },
    hide: function(){
      this.opened = false;
      this.$el.removeClass('active');
      if(this.triggerView){
        this.triggerView.$el.removeClass('active');
      }
      this.uiEventTrigger('hide', this);
    },
    toggle: function(button, e){
      if(this.opened){
        this.hide();
      } else {
        this.show();
      }
    },
    setBackdrop: function() {
      if (this.useBackdrop === true && this.backdrop === undefined) {
        var self = this;
        this.$backdrop = this.$el.closest('.ui-backdrop-element');
        if (this.$backdrop.length === 0) {
          this.$backdrop = $('body');
        }

        this.backdrop = new Backdrop(this.$backdrop, this.backdropOptions);
        this.backdrop.$el.on('hidden.backdrop.patterns', function(e) {
          if (e.namespace === 'backdrop.patterns') {
            e.stopPropagation();
            if (self.opened === true) {
              self.hide();
            }
          }
        });
        this.on('popover:hide', function() {
          this.backdrop.hide();
        }, this);
      }
    }
  });

  return PopoverView;
});


define('text!js/patterns/structure/templates/selection_item.xml',[],function () { return '<span class="selected-item">\r  <a href="#" data-uid="<%= UID %>" title="remove" class="remove"></a>\r  <%= Title %>\r</span>\r';});

// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/views/selectionwell',[
  'jquery',
  'underscore',
  'backbone',
  'js/ui/views/popover',
  'text!js/patterns/structure/templates/selection_item.xml'
], function($, _, Backbone, PopoverView, ItemTemplate) {
  

  var WellView = PopoverView.extend({
    className: 'popover selected',
    title: _.template('<input type="text" class="filter" placeholder="Filter" />' +
                      '<a href="#" class="icon-remove-sign remove-all">remove all</a>'),
    content: _.template(
      '<% collection.each(function(item){ %>' +
        '<%= item_template(item.toJSON()) %>' +
      '<% }); %>'),
    events: {
      'click a.remove': 'itemRemoved',
      'keyup input.filter': 'filterSelected',
      'click .remove-all': 'removeAll'
    },
    initialize: function(){
      PopoverView.prototype.initialize.call(this);
      this.listenTo(this.collection, 'reset all add remove', this.render);
      this.options.item_template = _.template(ItemTemplate);
    },
    render: function () {
      PopoverView.prototype.render.call(this);
      if (this.collection.length === 0) {
        this.$el.removeClass('active');
      }
      return this;
    },
    itemRemoved: function(e){
      e.preventDefault();
      var uid = $(e.target).data('uid');
      this.collection.removeByUID(uid);
      if(this.collection.length !== 0){
        // re-rendering causes it to close, reopen
        this.show();
      }
    },
    filterSelected: function(e) {
      var val = $(e.target).val().toLowerCase();
      $('.selected-item', this.$el).each(function() {
        var $el = $(this);
        if ($el.text().toLowerCase().indexOf(val) === -1) {
          $el.hide();
        } else {
          $el.show();
        }
      });
    },
    removeAll: function(e) {
      e.preventDefault();
      this.collection.reset();
      this.hide();
    }
  });

  return WellView;
});

/*
Copyright 2012 Igor Vaynberg

Version: 3.4.2 Timestamp: Mon Aug 12 15:04:12 PDT 2013

This software is licensed under the Apache License, Version 2.0 (the "Apache License") or the GNU
General Public License version 2 (the "GPL License"). You may choose either license to govern your
use of this software only upon the condition that you accept all of the terms of either the Apache
License or the GPL License.

You may obtain a copy of the Apache License and the GPL License at:

    http://www.apache.org/licenses/LICENSE-2.0
    http://www.gnu.org/licenses/gpl-2.0.html

Unless required by applicable law or agreed to in writing, software distributed under the
Apache License or the GPL Licesnse is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. See the Apache License and the GPL License for
the specific language governing permissions and limitations under the Apache License and the GPL License.
*/
(function ($) {
    if(typeof $.fn.each2 == "undefined") {
        $.extend($.fn, {
            /*
            * 4-10 times faster .each replacement
            * use it carefully, as it overrides jQuery context of element on each iteration
            */
            each2 : function (c) {
                var j = $([0]), i = -1, l = this.length;
                while (
                    ++i < l
                    && (j.context = j[0] = this[i])
                    && c.call(j[0], i, j) !== false //"this"=DOM, i=index, j=jQuery object
                );
                return this;
            }
        });
    }
})(jQuery);

(function ($, undefined) {
    
    /*global document, window, jQuery, console */

    if (window.Select2 !== undefined) {
        return;
    }

    var KEY, AbstractSelect2, SingleSelect2, MultiSelect2, nextUid, sizer,
        lastMousePosition={x:0,y:0}, $document, scrollBarDimensions,

    KEY = {
        TAB: 9,
        ENTER: 13,
        ESC: 27,
        SPACE: 32,
        LEFT: 37,
        UP: 38,
        RIGHT: 39,
        DOWN: 40,
        SHIFT: 16,
        CTRL: 17,
        ALT: 18,
        PAGE_UP: 33,
        PAGE_DOWN: 34,
        HOME: 36,
        END: 35,
        BACKSPACE: 8,
        DELETE: 46,
        isArrow: function (k) {
            k = k.which ? k.which : k;
            switch (k) {
            case KEY.LEFT:
            case KEY.RIGHT:
            case KEY.UP:
            case KEY.DOWN:
                return true;
            }
            return false;
        },
        isControl: function (e) {
            var k = e.which;
            switch (k) {
            case KEY.SHIFT:
            case KEY.CTRL:
            case KEY.ALT:
                return true;
            }

            if (e.metaKey) return true;

            return false;
        },
        isFunctionKey: function (k) {
            k = k.which ? k.which : k;
            return k >= 112 && k <= 123;
        }
    },
    MEASURE_SCROLLBAR_TEMPLATE = "<div class='select2-measure-scrollbar'></div>",

    DIACRITICS = {"\u24B6":"A","\uFF21":"A","\u00C0":"A","\u00C1":"A","\u00C2":"A","\u1EA6":"A","\u1EA4":"A","\u1EAA":"A","\u1EA8":"A","\u00C3":"A","\u0100":"A","\u0102":"A","\u1EB0":"A","\u1EAE":"A","\u1EB4":"A","\u1EB2":"A","\u0226":"A","\u01E0":"A","\u00C4":"A","\u01DE":"A","\u1EA2":"A","\u00C5":"A","\u01FA":"A","\u01CD":"A","\u0200":"A","\u0202":"A","\u1EA0":"A","\u1EAC":"A","\u1EB6":"A","\u1E00":"A","\u0104":"A","\u023A":"A","\u2C6F":"A","\uA732":"AA","\u00C6":"AE","\u01FC":"AE","\u01E2":"AE","\uA734":"AO","\uA736":"AU","\uA738":"AV","\uA73A":"AV","\uA73C":"AY","\u24B7":"B","\uFF22":"B","\u1E02":"B","\u1E04":"B","\u1E06":"B","\u0243":"B","\u0182":"B","\u0181":"B","\u24B8":"C","\uFF23":"C","\u0106":"C","\u0108":"C","\u010A":"C","\u010C":"C","\u00C7":"C","\u1E08":"C","\u0187":"C","\u023B":"C","\uA73E":"C","\u24B9":"D","\uFF24":"D","\u1E0A":"D","\u010E":"D","\u1E0C":"D","\u1E10":"D","\u1E12":"D","\u1E0E":"D","\u0110":"D","\u018B":"D","\u018A":"D","\u0189":"D","\uA779":"D","\u01F1":"DZ","\u01C4":"DZ","\u01F2":"Dz","\u01C5":"Dz","\u24BA":"E","\uFF25":"E","\u00C8":"E","\u00C9":"E","\u00CA":"E","\u1EC0":"E","\u1EBE":"E","\u1EC4":"E","\u1EC2":"E","\u1EBC":"E","\u0112":"E","\u1E14":"E","\u1E16":"E","\u0114":"E","\u0116":"E","\u00CB":"E","\u1EBA":"E","\u011A":"E","\u0204":"E","\u0206":"E","\u1EB8":"E","\u1EC6":"E","\u0228":"E","\u1E1C":"E","\u0118":"E","\u1E18":"E","\u1E1A":"E","\u0190":"E","\u018E":"E","\u24BB":"F","\uFF26":"F","\u1E1E":"F","\u0191":"F","\uA77B":"F","\u24BC":"G","\uFF27":"G","\u01F4":"G","\u011C":"G","\u1E20":"G","\u011E":"G","\u0120":"G","\u01E6":"G","\u0122":"G","\u01E4":"G","\u0193":"G","\uA7A0":"G","\uA77D":"G","\uA77E":"G","\u24BD":"H","\uFF28":"H","\u0124":"H","\u1E22":"H","\u1E26":"H","\u021E":"H","\u1E24":"H","\u1E28":"H","\u1E2A":"H","\u0126":"H","\u2C67":"H","\u2C75":"H","\uA78D":"H","\u24BE":"I","\uFF29":"I","\u00CC":"I","\u00CD":"I","\u00CE":"I","\u0128":"I","\u012A":"I","\u012C":"I","\u0130":"I","\u00CF":"I","\u1E2E":"I","\u1EC8":"I","\u01CF":"I","\u0208":"I","\u020A":"I","\u1ECA":"I","\u012E":"I","\u1E2C":"I","\u0197":"I","\u24BF":"J","\uFF2A":"J","\u0134":"J","\u0248":"J","\u24C0":"K","\uFF2B":"K","\u1E30":"K","\u01E8":"K","\u1E32":"K","\u0136":"K","\u1E34":"K","\u0198":"K","\u2C69":"K","\uA740":"K","\uA742":"K","\uA744":"K","\uA7A2":"K","\u24C1":"L","\uFF2C":"L","\u013F":"L","\u0139":"L","\u013D":"L","\u1E36":"L","\u1E38":"L","\u013B":"L","\u1E3C":"L","\u1E3A":"L","\u0141":"L","\u023D":"L","\u2C62":"L","\u2C60":"L","\uA748":"L","\uA746":"L","\uA780":"L","\u01C7":"LJ","\u01C8":"Lj","\u24C2":"M","\uFF2D":"M","\u1E3E":"M","\u1E40":"M","\u1E42":"M","\u2C6E":"M","\u019C":"M","\u24C3":"N","\uFF2E":"N","\u01F8":"N","\u0143":"N","\u00D1":"N","\u1E44":"N","\u0147":"N","\u1E46":"N","\u0145":"N","\u1E4A":"N","\u1E48":"N","\u0220":"N","\u019D":"N","\uA790":"N","\uA7A4":"N","\u01CA":"NJ","\u01CB":"Nj","\u24C4":"O","\uFF2F":"O","\u00D2":"O","\u00D3":"O","\u00D4":"O","\u1ED2":"O","\u1ED0":"O","\u1ED6":"O","\u1ED4":"O","\u00D5":"O","\u1E4C":"O","\u022C":"O","\u1E4E":"O","\u014C":"O","\u1E50":"O","\u1E52":"O","\u014E":"O","\u022E":"O","\u0230":"O","\u00D6":"O","\u022A":"O","\u1ECE":"O","\u0150":"O","\u01D1":"O","\u020C":"O","\u020E":"O","\u01A0":"O","\u1EDC":"O","\u1EDA":"O","\u1EE0":"O","\u1EDE":"O","\u1EE2":"O","\u1ECC":"O","\u1ED8":"O","\u01EA":"O","\u01EC":"O","\u00D8":"O","\u01FE":"O","\u0186":"O","\u019F":"O","\uA74A":"O","\uA74C":"O","\u01A2":"OI","\uA74E":"OO","\u0222":"OU","\u24C5":"P","\uFF30":"P","\u1E54":"P","\u1E56":"P","\u01A4":"P","\u2C63":"P","\uA750":"P","\uA752":"P","\uA754":"P","\u24C6":"Q","\uFF31":"Q","\uA756":"Q","\uA758":"Q","\u024A":"Q","\u24C7":"R","\uFF32":"R","\u0154":"R","\u1E58":"R","\u0158":"R","\u0210":"R","\u0212":"R","\u1E5A":"R","\u1E5C":"R","\u0156":"R","\u1E5E":"R","\u024C":"R","\u2C64":"R","\uA75A":"R","\uA7A6":"R","\uA782":"R","\u24C8":"S","\uFF33":"S","\u1E9E":"S","\u015A":"S","\u1E64":"S","\u015C":"S","\u1E60":"S","\u0160":"S","\u1E66":"S","\u1E62":"S","\u1E68":"S","\u0218":"S","\u015E":"S","\u2C7E":"S","\uA7A8":"S","\uA784":"S","\u24C9":"T","\uFF34":"T","\u1E6A":"T","\u0164":"T","\u1E6C":"T","\u021A":"T","\u0162":"T","\u1E70":"T","\u1E6E":"T","\u0166":"T","\u01AC":"T","\u01AE":"T","\u023E":"T","\uA786":"T","\uA728":"TZ","\u24CA":"U","\uFF35":"U","\u00D9":"U","\u00DA":"U","\u00DB":"U","\u0168":"U","\u1E78":"U","\u016A":"U","\u1E7A":"U","\u016C":"U","\u00DC":"U","\u01DB":"U","\u01D7":"U","\u01D5":"U","\u01D9":"U","\u1EE6":"U","\u016E":"U","\u0170":"U","\u01D3":"U","\u0214":"U","\u0216":"U","\u01AF":"U","\u1EEA":"U","\u1EE8":"U","\u1EEE":"U","\u1EEC":"U","\u1EF0":"U","\u1EE4":"U","\u1E72":"U","\u0172":"U","\u1E76":"U","\u1E74":"U","\u0244":"U","\u24CB":"V","\uFF36":"V","\u1E7C":"V","\u1E7E":"V","\u01B2":"V","\uA75E":"V","\u0245":"V","\uA760":"VY","\u24CC":"W","\uFF37":"W","\u1E80":"W","\u1E82":"W","\u0174":"W","\u1E86":"W","\u1E84":"W","\u1E88":"W","\u2C72":"W","\u24CD":"X","\uFF38":"X","\u1E8A":"X","\u1E8C":"X","\u24CE":"Y","\uFF39":"Y","\u1EF2":"Y","\u00DD":"Y","\u0176":"Y","\u1EF8":"Y","\u0232":"Y","\u1E8E":"Y","\u0178":"Y","\u1EF6":"Y","\u1EF4":"Y","\u01B3":"Y","\u024E":"Y","\u1EFE":"Y","\u24CF":"Z","\uFF3A":"Z","\u0179":"Z","\u1E90":"Z","\u017B":"Z","\u017D":"Z","\u1E92":"Z","\u1E94":"Z","\u01B5":"Z","\u0224":"Z","\u2C7F":"Z","\u2C6B":"Z","\uA762":"Z","\u24D0":"a","\uFF41":"a","\u1E9A":"a","\u00E0":"a","\u00E1":"a","\u00E2":"a","\u1EA7":"a","\u1EA5":"a","\u1EAB":"a","\u1EA9":"a","\u00E3":"a","\u0101":"a","\u0103":"a","\u1EB1":"a","\u1EAF":"a","\u1EB5":"a","\u1EB3":"a","\u0227":"a","\u01E1":"a","\u00E4":"a","\u01DF":"a","\u1EA3":"a","\u00E5":"a","\u01FB":"a","\u01CE":"a","\u0201":"a","\u0203":"a","\u1EA1":"a","\u1EAD":"a","\u1EB7":"a","\u1E01":"a","\u0105":"a","\u2C65":"a","\u0250":"a","\uA733":"aa","\u00E6":"ae","\u01FD":"ae","\u01E3":"ae","\uA735":"ao","\uA737":"au","\uA739":"av","\uA73B":"av","\uA73D":"ay","\u24D1":"b","\uFF42":"b","\u1E03":"b","\u1E05":"b","\u1E07":"b","\u0180":"b","\u0183":"b","\u0253":"b","\u24D2":"c","\uFF43":"c","\u0107":"c","\u0109":"c","\u010B":"c","\u010D":"c","\u00E7":"c","\u1E09":"c","\u0188":"c","\u023C":"c","\uA73F":"c","\u2184":"c","\u24D3":"d","\uFF44":"d","\u1E0B":"d","\u010F":"d","\u1E0D":"d","\u1E11":"d","\u1E13":"d","\u1E0F":"d","\u0111":"d","\u018C":"d","\u0256":"d","\u0257":"d","\uA77A":"d","\u01F3":"dz","\u01C6":"dz","\u24D4":"e","\uFF45":"e","\u00E8":"e","\u00E9":"e","\u00EA":"e","\u1EC1":"e","\u1EBF":"e","\u1EC5":"e","\u1EC3":"e","\u1EBD":"e","\u0113":"e","\u1E15":"e","\u1E17":"e","\u0115":"e","\u0117":"e","\u00EB":"e","\u1EBB":"e","\u011B":"e","\u0205":"e","\u0207":"e","\u1EB9":"e","\u1EC7":"e","\u0229":"e","\u1E1D":"e","\u0119":"e","\u1E19":"e","\u1E1B":"e","\u0247":"e","\u025B":"e","\u01DD":"e","\u24D5":"f","\uFF46":"f","\u1E1F":"f","\u0192":"f","\uA77C":"f","\u24D6":"g","\uFF47":"g","\u01F5":"g","\u011D":"g","\u1E21":"g","\u011F":"g","\u0121":"g","\u01E7":"g","\u0123":"g","\u01E5":"g","\u0260":"g","\uA7A1":"g","\u1D79":"g","\uA77F":"g","\u24D7":"h","\uFF48":"h","\u0125":"h","\u1E23":"h","\u1E27":"h","\u021F":"h","\u1E25":"h","\u1E29":"h","\u1E2B":"h","\u1E96":"h","\u0127":"h","\u2C68":"h","\u2C76":"h","\u0265":"h","\u0195":"hv","\u24D8":"i","\uFF49":"i","\u00EC":"i","\u00ED":"i","\u00EE":"i","\u0129":"i","\u012B":"i","\u012D":"i","\u00EF":"i","\u1E2F":"i","\u1EC9":"i","\u01D0":"i","\u0209":"i","\u020B":"i","\u1ECB":"i","\u012F":"i","\u1E2D":"i","\u0268":"i","\u0131":"i","\u24D9":"j","\uFF4A":"j","\u0135":"j","\u01F0":"j","\u0249":"j","\u24DA":"k","\uFF4B":"k","\u1E31":"k","\u01E9":"k","\u1E33":"k","\u0137":"k","\u1E35":"k","\u0199":"k","\u2C6A":"k","\uA741":"k","\uA743":"k","\uA745":"k","\uA7A3":"k","\u24DB":"l","\uFF4C":"l","\u0140":"l","\u013A":"l","\u013E":"l","\u1E37":"l","\u1E39":"l","\u013C":"l","\u1E3D":"l","\u1E3B":"l","\u017F":"l","\u0142":"l","\u019A":"l","\u026B":"l","\u2C61":"l","\uA749":"l","\uA781":"l","\uA747":"l","\u01C9":"lj","\u24DC":"m","\uFF4D":"m","\u1E3F":"m","\u1E41":"m","\u1E43":"m","\u0271":"m","\u026F":"m","\u24DD":"n","\uFF4E":"n","\u01F9":"n","\u0144":"n","\u00F1":"n","\u1E45":"n","\u0148":"n","\u1E47":"n","\u0146":"n","\u1E4B":"n","\u1E49":"n","\u019E":"n","\u0272":"n","\u0149":"n","\uA791":"n","\uA7A5":"n","\u01CC":"nj","\u24DE":"o","\uFF4F":"o","\u00F2":"o","\u00F3":"o","\u00F4":"o","\u1ED3":"o","\u1ED1":"o","\u1ED7":"o","\u1ED5":"o","\u00F5":"o","\u1E4D":"o","\u022D":"o","\u1E4F":"o","\u014D":"o","\u1E51":"o","\u1E53":"o","\u014F":"o","\u022F":"o","\u0231":"o","\u00F6":"o","\u022B":"o","\u1ECF":"o","\u0151":"o","\u01D2":"o","\u020D":"o","\u020F":"o","\u01A1":"o","\u1EDD":"o","\u1EDB":"o","\u1EE1":"o","\u1EDF":"o","\u1EE3":"o","\u1ECD":"o","\u1ED9":"o","\u01EB":"o","\u01ED":"o","\u00F8":"o","\u01FF":"o","\u0254":"o","\uA74B":"o","\uA74D":"o","\u0275":"o","\u01A3":"oi","\u0223":"ou","\uA74F":"oo","\u24DF":"p","\uFF50":"p","\u1E55":"p","\u1E57":"p","\u01A5":"p","\u1D7D":"p","\uA751":"p","\uA753":"p","\uA755":"p","\u24E0":"q","\uFF51":"q","\u024B":"q","\uA757":"q","\uA759":"q","\u24E1":"r","\uFF52":"r","\u0155":"r","\u1E59":"r","\u0159":"r","\u0211":"r","\u0213":"r","\u1E5B":"r","\u1E5D":"r","\u0157":"r","\u1E5F":"r","\u024D":"r","\u027D":"r","\uA75B":"r","\uA7A7":"r","\uA783":"r","\u24E2":"s","\uFF53":"s","\u00DF":"s","\u015B":"s","\u1E65":"s","\u015D":"s","\u1E61":"s","\u0161":"s","\u1E67":"s","\u1E63":"s","\u1E69":"s","\u0219":"s","\u015F":"s","\u023F":"s","\uA7A9":"s","\uA785":"s","\u1E9B":"s","\u24E3":"t","\uFF54":"t","\u1E6B":"t","\u1E97":"t","\u0165":"t","\u1E6D":"t","\u021B":"t","\u0163":"t","\u1E71":"t","\u1E6F":"t","\u0167":"t","\u01AD":"t","\u0288":"t","\u2C66":"t","\uA787":"t","\uA729":"tz","\u24E4":"u","\uFF55":"u","\u00F9":"u","\u00FA":"u","\u00FB":"u","\u0169":"u","\u1E79":"u","\u016B":"u","\u1E7B":"u","\u016D":"u","\u00FC":"u","\u01DC":"u","\u01D8":"u","\u01D6":"u","\u01DA":"u","\u1EE7":"u","\u016F":"u","\u0171":"u","\u01D4":"u","\u0215":"u","\u0217":"u","\u01B0":"u","\u1EEB":"u","\u1EE9":"u","\u1EEF":"u","\u1EED":"u","\u1EF1":"u","\u1EE5":"u","\u1E73":"u","\u0173":"u","\u1E77":"u","\u1E75":"u","\u0289":"u","\u24E5":"v","\uFF56":"v","\u1E7D":"v","\u1E7F":"v","\u028B":"v","\uA75F":"v","\u028C":"v","\uA761":"vy","\u24E6":"w","\uFF57":"w","\u1E81":"w","\u1E83":"w","\u0175":"w","\u1E87":"w","\u1E85":"w","\u1E98":"w","\u1E89":"w","\u2C73":"w","\u24E7":"x","\uFF58":"x","\u1E8B":"x","\u1E8D":"x","\u24E8":"y","\uFF59":"y","\u1EF3":"y","\u00FD":"y","\u0177":"y","\u1EF9":"y","\u0233":"y","\u1E8F":"y","\u00FF":"y","\u1EF7":"y","\u1E99":"y","\u1EF5":"y","\u01B4":"y","\u024F":"y","\u1EFF":"y","\u24E9":"z","\uFF5A":"z","\u017A":"z","\u1E91":"z","\u017C":"z","\u017E":"z","\u1E93":"z","\u1E95":"z","\u01B6":"z","\u0225":"z","\u0240":"z","\u2C6C":"z","\uA763":"z"};

    $document = $(document);

    nextUid=(function() { var counter=1; return function() { return counter++; }; }());


    function stripDiacritics(str) {
        var ret, i, l, c;

        if (!str || str.length < 1) return str;

        ret = "";
        for (i = 0, l = str.length; i < l; i++) {
            c = str.charAt(i);
            ret += DIACRITICS[c] || c;
        }
        return ret;
    }

    function indexOf(value, array) {
        var i = 0, l = array.length;
        for (; i < l; i = i + 1) {
            if (equal(value, array[i])) return i;
        }
        return -1;
    }

    function measureScrollbar () {
        var $template = $( MEASURE_SCROLLBAR_TEMPLATE );
        $template.appendTo('body');

        var dim = {
            width: $template.width() - $template[0].clientWidth,
            height: $template.height() - $template[0].clientHeight
        };
        $template.remove();

        return dim;
    }

    /**
     * Compares equality of a and b
     * @param a
     * @param b
     */
    function equal(a, b) {
        if (a === b) return true;
        if (a === undefined || b === undefined) return false;
        if (a === null || b === null) return false;
        // Check whether 'a' or 'b' is a string (primitive or object).
        // The concatenation of an empty string (+'') converts its argument to a string's primitive.
        if (a.constructor === String) return a+'' === b+''; // a+'' - in case 'a' is a String object
        if (b.constructor === String) return b+'' === a+''; // b+'' - in case 'b' is a String object
        return false;
    }

    /**
     * Splits the string into an array of values, trimming each value. An empty array is returned for nulls or empty
     * strings
     * @param string
     * @param separator
     */
    function splitVal(string, separator) {
        var val, i, l;
        if (string === null || string.length < 1) return [];
        val = string.split(separator);
        for (i = 0, l = val.length; i < l; i = i + 1) val[i] = $.trim(val[i]);
        return val;
    }

    function getSideBorderPadding(element) {
        return element.outerWidth(false) - element.width();
    }

    function installKeyUpChangeEvent(element) {
        var key="keyup-change-value";
        element.on("keydown", function () {
            if ($.data(element, key) === undefined) {
                $.data(element, key, element.val());
            }
        });
        element.on("keyup", function () {
            var val= $.data(element, key);
            if (val !== undefined && element.val() !== val) {
                $.removeData(element, key);
                element.trigger("keyup-change");
            }
        });
    }

    $document.on("mousemove", function (e) {
        lastMousePosition.x = e.pageX;
        lastMousePosition.y = e.pageY;
    });

    /**
     * filters mouse events so an event is fired only if the mouse moved.
     *
     * filters out mouse events that occur when mouse is stationary but
     * the elements under the pointer are scrolled.
     */
    function installFilteredMouseMove(element) {
        element.on("mousemove", function (e) {
            var lastpos = lastMousePosition;
            if (lastpos === undefined || lastpos.x !== e.pageX || lastpos.y !== e.pageY) {
                $(e.target).trigger("mousemove-filtered", e);
            }
        });
    }

    /**
     * Debounces a function. Returns a function that calls the original fn function only if no invocations have been made
     * within the last quietMillis milliseconds.
     *
     * @param quietMillis number of milliseconds to wait before invoking fn
     * @param fn function to be debounced
     * @param ctx object to be used as this reference within fn
     * @return debounced version of fn
     */
    function debounce(quietMillis, fn, ctx) {
        ctx = ctx || undefined;
        var timeout;
        return function () {
            var args = arguments;
            window.clearTimeout(timeout);
            timeout = window.setTimeout(function() {
                fn.apply(ctx, args);
            }, quietMillis);
        };
    }

    /**
     * A simple implementation of a thunk
     * @param formula function used to lazily initialize the thunk
     * @return {Function}
     */
    function thunk(formula) {
        var evaluated = false,
            value;
        return function() {
            if (evaluated === false) { value = formula(); evaluated = true; }
            return value;
        };
    };

    function installDebouncedScroll(threshold, element) {
        var notify = debounce(threshold, function (e) { element.trigger("scroll-debounced", e);});
        element.on("scroll", function (e) {
            if (indexOf(e.target, element.get()) >= 0) notify(e);
        });
    }

    function focus($el) {
        if ($el[0] === document.activeElement) return;

        /* set the focus in a 0 timeout - that way the focus is set after the processing
            of the current event has finished - which seems like the only reliable way
            to set focus */
        window.setTimeout(function() {
            var el=$el[0], pos=$el.val().length, range;

            $el.focus();

            /* make sure el received focus so we do not error out when trying to manipulate the caret.
                sometimes modals or others listeners may steal it after its set */
            if ($el.is(":visible") && el === document.activeElement) {

                /* after the focus is set move the caret to the end, necessary when we val()
                    just before setting focus */
                if(el.setSelectionRange)
                {
                    el.setSelectionRange(pos, pos);
                }
                else if (el.createTextRange) {
                    range = el.createTextRange();
                    range.collapse(false);
                    range.select();
                }
            }
        }, 0);
    }

    function getCursorInfo(el) {
        el = $(el)[0];
        var offset = 0;
        var length = 0;
        if ('selectionStart' in el) {
            offset = el.selectionStart;
            length = el.selectionEnd - offset;
        } else if ('selection' in document) {
            el.focus();
            var sel = document.selection.createRange();
            length = document.selection.createRange().text.length;
            sel.moveStart('character', -el.value.length);
            offset = sel.text.length - length;
        }
        return { offset: offset, length: length };
    }

    function killEvent(event) {
        event.preventDefault();
        event.stopPropagation();
    }
    function killEventImmediately(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    function measureTextWidth(e) {
        if (!sizer){
            var style = e[0].currentStyle || window.getComputedStyle(e[0], null);
            sizer = $(document.createElement("div")).css({
                position: "absolute",
                left: "-10000px",
                top: "-10000px",
                display: "none",
                fontSize: style.fontSize,
                fontFamily: style.fontFamily,
                fontStyle: style.fontStyle,
                fontWeight: style.fontWeight,
                letterSpacing: style.letterSpacing,
                textTransform: style.textTransform,
                whiteSpace: "nowrap"
            });
            sizer.attr("class","select2-sizer");
            $("body").append(sizer);
        }
        sizer.text(e.val());
        return sizer.width();
    }

    function syncCssClasses(dest, src, adapter) {
        var classes, replacements = [], adapted;

        classes = dest.attr("class");
        if (classes) {
            classes = '' + classes; // for IE which returns object
            $(classes.split(" ")).each2(function() {
                if (this.indexOf("select2-") === 0) {
                    replacements.push(this);
                }
            });
        }
        classes = src.attr("class");
        if (classes) {
            classes = '' + classes; // for IE which returns object
            $(classes.split(" ")).each2(function() {
                if (this.indexOf("select2-") !== 0) {
                    adapted = adapter(this);
                    if (adapted) {
                        replacements.push(this);
                    }
                }
            });
        }
        dest.attr("class", replacements.join(" "));
    }


    function markMatch(text, term, markup, escapeMarkup) {
        var match=stripDiacritics(text.toUpperCase()).indexOf(stripDiacritics(term.toUpperCase())),
            tl=term.length;

        if (match<0) {
            markup.push(escapeMarkup(text));
            return;
        }

        markup.push(escapeMarkup(text.substring(0, match)));
        markup.push("<span class='select2-match'>");
        markup.push(escapeMarkup(text.substring(match, match + tl)));
        markup.push("</span>");
        markup.push(escapeMarkup(text.substring(match + tl, text.length)));
    }

    function defaultEscapeMarkup(markup) {
        var replace_map = {
            '\\': '&#92;',
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            "/": '&#47;'
        };

        return String(markup).replace(/[&<>"'\/\\]/g, function (match) {
            return replace_map[match];
        });
    }

    /**
     * Produces an ajax-based query function
     *
     * @param options object containing configuration paramters
     * @param options.params parameter map for the transport ajax call, can contain such options as cache, jsonpCallback, etc. see $.ajax
     * @param options.transport function that will be used to execute the ajax request. must be compatible with parameters supported by $.ajax
     * @param options.url url for the data
     * @param options.data a function(searchTerm, pageNumber, context) that should return an object containing query string parameters for the above url.
     * @param options.dataType request data type: ajax, jsonp, other datatatypes supported by jQuery's $.ajax function or the transport function if specified
     * @param options.quietMillis (optional) milliseconds to wait before making the ajaxRequest, helps debounce the ajax function if invoked too often
     * @param options.results a function(remoteData, pageNumber) that converts data returned form the remote request to the format expected by Select2.
     *      The expected format is an object containing the following keys:
     *      results array of objects that will be used as choices
     *      more (optional) boolean indicating whether there are more results available
     *      Example: {results:[{id:1, text:'Red'},{id:2, text:'Blue'}], more:true}
     */
    function ajax(options) {
        var timeout, // current scheduled but not yet executed request
            handler = null,
            quietMillis = options.quietMillis || 100,
            ajaxUrl = options.url,
            self = this;

        return function (query) {
            window.clearTimeout(timeout);
            timeout = window.setTimeout(function () {
                var data = options.data, // ajax data function
                    url = ajaxUrl, // ajax url string or function
                    transport = options.transport || $.fn.select2.ajaxDefaults.transport,
                    // deprecated - to be removed in 4.0  - use params instead
                    deprecated = {
                        type: options.type || 'GET', // set type of request (GET or POST)
                        cache: options.cache || false,
                        jsonpCallback: options.jsonpCallback||undefined,
                        dataType: options.dataType||"json"
                    },
                    params = $.extend({}, $.fn.select2.ajaxDefaults.params, deprecated);

                data = data ? data.call(self, query.term, query.page, query.context) : null;
                url = (typeof url === 'function') ? url.call(self, query.term, query.page, query.context) : url;

                if (handler) { handler.abort(); }

                if (options.params) {
                    if ($.isFunction(options.params)) {
                        $.extend(params, options.params.call(self));
                    } else {
                        $.extend(params, options.params);
                    }
                }

                $.extend(params, {
                    url: url,
                    dataType: options.dataType,
                    data: data,
                    success: function (data) {
                        // TODO - replace query.page with query so users have access to term, page, etc.
                        var results = options.results(data, query.page);
                        query.callback(results);
                    }
                });
                handler = transport.call(self, params);
            }, quietMillis);
        };
    }

    /**
     * Produces a query function that works with a local array
     *
     * @param options object containing configuration parameters. The options parameter can either be an array or an
     * object.
     *
     * If the array form is used it is assumed that it contains objects with 'id' and 'text' keys.
     *
     * If the object form is used ti is assumed that it contains 'data' and 'text' keys. The 'data' key should contain
     * an array of objects that will be used as choices. These objects must contain at least an 'id' key. The 'text'
     * key can either be a String in which case it is expected that each element in the 'data' array has a key with the
     * value of 'text' which will be used to match choices. Alternatively, text can be a function(item) that can extract
     * the text.
     */
    function local(options) {
        var data = options, // data elements
            dataText,
            tmp,
            text = function (item) { return ""+item.text; }; // function used to retrieve the text portion of a data item that is matched against the search

         if ($.isArray(data)) {
            tmp = data;
            data = { results: tmp };
        }

         if ($.isFunction(data) === false) {
            tmp = data;
            data = function() { return tmp; };
        }

        var dataItem = data();
        if (dataItem.text) {
            text = dataItem.text;
            // if text is not a function we assume it to be a key name
            if (!$.isFunction(text)) {
                dataText = dataItem.text; // we need to store this in a separate variable because in the next step data gets reset and data.text is no longer available
                text = function (item) { return item[dataText]; };
            }
        }

        return function (query) {
            var t = query.term, filtered = { results: [] }, process;
            if (t === "") {
                query.callback(data());
                return;
            }

            process = function(datum, collection) {
                var group, attr;
                datum = datum[0];
                if (datum.children) {
                    group = {};
                    for (attr in datum) {
                        if (datum.hasOwnProperty(attr)) group[attr]=datum[attr];
                    }
                    group.children=[];
                    $(datum.children).each2(function(i, childDatum) { process(childDatum, group.children); });
                    if (group.children.length || query.matcher(t, text(group), datum)) {
                        collection.push(group);
                    }
                } else {
                    if (query.matcher(t, text(datum), datum)) {
                        collection.push(datum);
                    }
                }
            };

            $(data().results).each2(function(i, datum) { process(datum, filtered.results); });
            query.callback(filtered);
        };
    }

    // TODO javadoc
    function tags(data) {
        var isFunc = $.isFunction(data);
        return function (query) {
            var t = query.term, filtered = {results: []};
            $(isFunc ? data() : data).each(function () {
                var isObject = this.text !== undefined,
                    text = isObject ? this.text : this;
                if (t === "" || query.matcher(t, text)) {
                    filtered.results.push(isObject ? this : {id: this, text: this});
                }
            });
            query.callback(filtered);
        };
    }

    /**
     * Checks if the formatter function should be used.
     *
     * Throws an error if it is not a function. Returns true if it should be used,
     * false if no formatting should be performed.
     *
     * @param formatter
     */
    function checkFormatter(formatter, formatterName) {
        if ($.isFunction(formatter)) return true;
        if (!formatter) return false;
        throw new Error(formatterName +" must be a function or a falsy value");
    }

    function evaluate(val) {
        return $.isFunction(val) ? val() : val;
    }

    function countResults(results) {
        var count = 0;
        $.each(results, function(i, item) {
            if (item.children) {
                count += countResults(item.children);
            } else {
                count++;
            }
        });
        return count;
    }

    /**
     * Default tokenizer. This function uses breaks the input on substring match of any string from the
     * opts.tokenSeparators array and uses opts.createSearchChoice to create the choice object. Both of those
     * two options have to be defined in order for the tokenizer to work.
     *
     * @param input text user has typed so far or pasted into the search field
     * @param selection currently selected choices
     * @param selectCallback function(choice) callback tho add the choice to selection
     * @param opts select2's opts
     * @return undefined/null to leave the current input unchanged, or a string to change the input to the returned value
     */
    function defaultTokenizer(input, selection, selectCallback, opts) {
        var original = input, // store the original so we can compare and know if we need to tell the search to update its text
            dupe = false, // check for whether a token we extracted represents a duplicate selected choice
            token, // token
            index, // position at which the separator was found
            i, l, // looping variables
            separator; // the matched separator

        if (!opts.createSearchChoice || !opts.tokenSeparators || opts.tokenSeparators.length < 1) return undefined;

        while (true) {
            index = -1;

            for (i = 0, l = opts.tokenSeparators.length; i < l; i++) {
                separator = opts.tokenSeparators[i];
                index = input.indexOf(separator);
                if (index >= 0) break;
            }

            if (index < 0) break; // did not find any token separator in the input string, bail

            token = input.substring(0, index);
            input = input.substring(index + separator.length);

            if (token.length > 0) {
                token = opts.createSearchChoice.call(this, token, selection);
                if (token !== undefined && token !== null && opts.id(token) !== undefined && opts.id(token) !== null) {
                    dupe = false;
                    for (i = 0, l = selection.length; i < l; i++) {
                        if (equal(opts.id(token), opts.id(selection[i]))) {
                            dupe = true; break;
                        }
                    }

                    if (!dupe) selectCallback(token);
                }
            }
        }

        if (original!==input) return input;
    }

    /**
     * Creates a new class
     *
     * @param superClass
     * @param methods
     */
    function clazz(SuperClass, methods) {
        var constructor = function () {};
        constructor.prototype = new SuperClass;
        constructor.prototype.constructor = constructor;
        constructor.prototype.parent = SuperClass.prototype;
        constructor.prototype = $.extend(constructor.prototype, methods);
        return constructor;
    }

    AbstractSelect2 = clazz(Object, {

        // abstract
        bind: function (func) {
            var self = this;
            return function () {
                func.apply(self, arguments);
            };
        },

        // abstract
        init: function (opts) {
            var results, search, resultsSelector = ".select2-results", disabled, readonly;

            // prepare options
            this.opts = opts = this.prepareOpts(opts);

            this.id=opts.id;

            // destroy if called on an existing component
            if (opts.element.data("select2") !== undefined &&
                opts.element.data("select2") !== null) {
                opts.element.data("select2").destroy();
            }

            this.container = this.createContainer();

            this.containerId="s2id_"+(opts.element.attr("id") || "autogen"+nextUid());
            this.containerSelector="#"+this.containerId.replace(/([;&,\.\+\*\~':"\!\^#$%@\[\]\(\)=>\|])/g, '\\$1');
            this.container.attr("id", this.containerId);

            // cache the body so future lookups are cheap
            this.body = thunk(function() { return opts.element.closest("body"); });

            syncCssClasses(this.container, this.opts.element, this.opts.adaptContainerCssClass);

            this.container.attr("style", opts.element.attr("style"));
            this.container.css(evaluate(opts.containerCss));
            this.container.addClass(evaluate(opts.containerCssClass));

            this.elementTabIndex = this.opts.element.attr("tabindex");

            // swap container for the element
            this.opts.element
                .data("select2", this)
                .attr("tabindex", "-1")
                .before(this.container);
            this.container.data("select2", this);

            this.dropdown = this.container.find(".select2-drop");
            this.dropdown.addClass(evaluate(opts.dropdownCssClass));
            this.dropdown.data("select2", this);

            syncCssClasses(this.dropdown, this.opts.element, this.opts.adaptDropdownCssClass);

            this.results = results = this.container.find(resultsSelector);
            this.search = search = this.container.find("input.select2-input");

            this.queryCount = 0;
            this.resultsPage = 0;
            this.context = null;

            // initialize the container
            this.initContainer();

            installFilteredMouseMove(this.results);
            this.dropdown.on("mousemove-filtered touchstart touchmove touchend", resultsSelector, this.bind(this.highlightUnderEvent));

            installDebouncedScroll(80, this.results);
            this.dropdown.on("scroll-debounced", resultsSelector, this.bind(this.loadMoreIfNeeded));

            // do not propagate change event from the search field out of the component
            $(this.container).on("change", ".select2-input", function(e) {e.stopPropagation();});
            $(this.dropdown).on("change", ".select2-input", function(e) {e.stopPropagation();});

            // if jquery.mousewheel plugin is installed we can prevent out-of-bounds scrolling of results via mousewheel
            if ($.fn.mousewheel) {
                results.mousewheel(function (e, delta, deltaX, deltaY) {
                    var top = results.scrollTop(), height;
                    if (deltaY > 0 && top - deltaY <= 0) {
                        results.scrollTop(0);
                        killEvent(e);
                    } else if (deltaY < 0 && results.get(0).scrollHeight - results.scrollTop() + deltaY <= results.height()) {
                        results.scrollTop(results.get(0).scrollHeight - results.height());
                        killEvent(e);
                    }
                });
            }

            installKeyUpChangeEvent(search);
            search.on("keyup-change input paste", this.bind(this.updateResults));
            search.on("focus", function () { search.addClass("select2-focused"); });
            search.on("blur", function () { search.removeClass("select2-focused");});

            this.dropdown.on("mouseup", resultsSelector, this.bind(function (e) {
                if ($(e.target).closest(".select2-result-selectable").length > 0) {
                    this.highlightUnderEvent(e);
                    this.selectHighlighted(e);
                }
            }));

            // trap all mouse events from leaving the dropdown. sometimes there may be a modal that is listening
            // for mouse events outside of itself so it can close itself. since the dropdown is now outside the select2's
            // dom it will trigger the popup close, which is not what we want
            this.dropdown.on("click mouseup mousedown", function (e) { e.stopPropagation(); });

            if ($.isFunction(this.opts.initSelection)) {
                // initialize selection based on the current value of the source element
                this.initSelection();

                // if the user has provided a function that can set selection based on the value of the source element
                // we monitor the change event on the element and trigger it, allowing for two way synchronization
                this.monitorSource();
            }

            if (opts.maximumInputLength !== null) {
                this.search.attr("maxlength", opts.maximumInputLength);
            }

            var disabled = opts.element.prop("disabled");
            if (disabled === undefined) disabled = false;
            this.enable(!disabled);

            var readonly = opts.element.prop("readonly");
            if (readonly === undefined) readonly = false;
            this.readonly(readonly);

            // Calculate size of scrollbar
            scrollBarDimensions = scrollBarDimensions || measureScrollbar();

            this.autofocus = opts.element.prop("autofocus");
            opts.element.prop("autofocus", false);
            if (this.autofocus) this.focus();

            this.nextSearchTerm = undefined;
        },

        // abstract
        destroy: function () {
            var element=this.opts.element, select2 = element.data("select2");

            this.close();

            if (this.propertyObserver) { delete this.propertyObserver; this.propertyObserver = null; }

            if (select2 !== undefined) {
                select2.container.remove();
                select2.dropdown.remove();
                element
                    .removeClass("select2-offscreen")
                    .removeData("select2")
                    .off(".select2")
                    .prop("autofocus", this.autofocus || false);
                if (this.elementTabIndex) {
                    element.attr({tabindex: this.elementTabIndex});
                } else {
                    element.removeAttr("tabindex");
                }
                element.show();
            }
        },

        // abstract
        optionToData: function(element) {
            if (element.is("option")) {
                return {
                    id:element.prop("value"),
                    text:element.text(),
                    element: element.get(),
                    css: element.attr("class"),
                    disabled: element.prop("disabled"),
                    locked: equal(element.attr("locked"), "locked") || equal(element.data("locked"), true)
                };
            } else if (element.is("optgroup")) {
                return {
                    text:element.attr("label"),
                    children:[],
                    element: element.get(),
                    css: element.attr("class")
                };
            }
        },

        // abstract
        prepareOpts: function (opts) {
            var element, select, idKey, ajaxUrl, self = this;

            element = opts.element;

            if (element.get(0).tagName.toLowerCase() === "select") {
                this.select = select = opts.element;
            }

            if (select) {
                // these options are not allowed when attached to a select because they are picked up off the element itself
                $.each(["id", "multiple", "ajax", "query", "createSearchChoice", "initSelection", "data", "tags"], function () {
                    if (this in opts) {
                        throw new Error("Option '" + this + "' is not allowed for Select2 when attached to a <select> element.");
                    }
                });
            }

            opts = $.extend({}, {
                populateResults: function(container, results, query) {
                    var populate,  data, result, children, id=this.opts.id;

                    populate=function(results, container, depth) {

                        var i, l, result, selectable, disabled, compound, node, label, innerContainer, formatted;

                        results = opts.sortResults(results, container, query);

                        for (i = 0, l = results.length; i < l; i = i + 1) {

                            result=results[i];

                            disabled = (result.disabled === true);
                            selectable = (!disabled) && (id(result) !== undefined);

                            compound=result.children && result.children.length > 0;

                            node=$("<li></li>");
                            node.addClass("select2-results-dept-"+depth);
                            node.addClass("select2-result");
                            node.addClass(selectable ? "select2-result-selectable" : "select2-result-unselectable");
                            if (disabled) { node.addClass("select2-disabled"); }
                            if (compound) { node.addClass("select2-result-with-children"); }
                            node.addClass(self.opts.formatResultCssClass(result));

                            label=$(document.createElement("div"));
                            label.addClass("select2-result-label");

                            formatted=opts.formatResult(result, label, query, self.opts.escapeMarkup);
                            if (formatted!==undefined) {
                                label.html(formatted);
                            }

                            node.append(label);

                            if (compound) {

                                innerContainer=$("<ul></ul>");
                                innerContainer.addClass("select2-result-sub");
                                populate(result.children, innerContainer, depth+1);
                                node.append(innerContainer);
                            }

                            node.data("select2-data", result);
                            container.append(node);
                        }
                    };

                    populate(results, container, 0);
                }
            }, $.fn.select2.defaults, opts);

            if (typeof(opts.id) !== "function") {
                idKey = opts.id;
                opts.id = function (e) { return e[idKey]; };
            }

            if ($.isArray(opts.element.data("select2Tags"))) {
                if ("tags" in opts) {
                    throw "tags specified as both an attribute 'data-select2-tags' and in options of Select2 " + opts.element.attr("id");
                }
                opts.tags=opts.element.data("select2Tags");
            }

            if (select) {
                opts.query = this.bind(function (query) {
                    var data = { results: [], more: false },
                        term = query.term,
                        children, placeholderOption, process;

                    process=function(element, collection) {
                        var group;
                        if (element.is("option")) {
                            if (query.matcher(term, element.text(), element)) {
                                collection.push(self.optionToData(element));
                            }
                        } else if (element.is("optgroup")) {
                            group=self.optionToData(element);
                            element.children().each2(function(i, elm) { process(elm, group.children); });
                            if (group.children.length>0) {
                                collection.push(group);
                            }
                        }
                    };

                    children=element.children();

                    // ignore the placeholder option if there is one
                    if (this.getPlaceholder() !== undefined && children.length > 0) {
                        placeholderOption = this.getPlaceholderOption();
                        if (placeholderOption) {
                            children=children.not(placeholderOption);
                        }
                    }

                    children.each2(function(i, elm) { process(elm, data.results); });

                    query.callback(data);
                });
                // this is needed because inside val() we construct choices from options and there id is hardcoded
                opts.id=function(e) { return e.id; };
                opts.formatResultCssClass = function(data) { return data.css; };
            } else {
                if (!("query" in opts)) {

                    if ("ajax" in opts) {
                        ajaxUrl = opts.element.data("ajax-url");
                        if (ajaxUrl && ajaxUrl.length > 0) {
                            opts.ajax.url = ajaxUrl;
                        }
                        opts.query = ajax.call(opts.element, opts.ajax);
                    } else if ("data" in opts) {
                        opts.query = local(opts.data);
                    } else if ("tags" in opts) {
                        opts.query = tags(opts.tags);
                        if (opts.createSearchChoice === undefined) {
                            opts.createSearchChoice = function (term) { return {id: $.trim(term), text: $.trim(term)}; };
                        }
                        if (opts.initSelection === undefined) {
                            opts.initSelection = function (element, callback) {
                                var data = [];
                                $(splitVal(element.val(), opts.separator)).each(function () {
                                    var id = this, text = this, tags=opts.tags;
                                    if ($.isFunction(tags)) tags=tags();
                                    $(tags).each(function() { if (equal(this.id, id)) { text = this.text; return false; } });
                                    data.push({id: id, text: text});
                                });

                                callback(data);
                            };
                        }
                    }
                }
            }
            if (typeof(opts.query) !== "function") {
                throw "query function not defined for Select2 " + opts.element.attr("id");
            }

            return opts;
        },

        /**
         * Monitor the original element for changes and update select2 accordingly
         */
        // abstract
        monitorSource: function () {
            var el = this.opts.element, sync;

            el.on("change.select2", this.bind(function (e) {
                if (this.opts.element.data("select2-change-triggered") !== true) {
                    this.initSelection();
                }
            }));

            sync = this.bind(function () {

                var enabled, readonly, self = this;

                // sync enabled state
                var disabled = el.prop("disabled");
                if (disabled === undefined) disabled = false;
                this.enable(!disabled);

                var readonly = el.prop("readonly");
                if (readonly === undefined) readonly = false;
                this.readonly(readonly);

                syncCssClasses(this.container, this.opts.element, this.opts.adaptContainerCssClass);
                this.container.addClass(evaluate(this.opts.containerCssClass));

                syncCssClasses(this.dropdown, this.opts.element, this.opts.adaptDropdownCssClass);
                this.dropdown.addClass(evaluate(this.opts.dropdownCssClass));

            });

            // mozilla and IE
            el.on("propertychange.select2 DOMAttrModified.select2", sync);


            // hold onto a reference of the callback to work around a chromium bug
            if (this.mutationCallback === undefined) {
                this.mutationCallback = function (mutations) {
                    mutations.forEach(sync);
                }
            }

            // safari and chrome
            if (typeof WebKitMutationObserver !== "undefined") {
                if (this.propertyObserver) { delete this.propertyObserver; this.propertyObserver = null; }
                this.propertyObserver = new WebKitMutationObserver(this.mutationCallback);
                this.propertyObserver.observe(el.get(0), { attributes:true, subtree:false });
            }
        },

        // abstract
        triggerSelect: function(data) {
            var evt = $.Event("select2-selecting", { val: this.id(data), object: data });
            this.opts.element.trigger(evt);
            return !evt.isDefaultPrevented();
        },

        /**
         * Triggers the change event on the source element
         */
        // abstract
        triggerChange: function (details) {

            details = details || {};
            details= $.extend({}, details, { type: "change", val: this.val() });
            // prevents recursive triggering
            this.opts.element.data("select2-change-triggered", true);
            this.opts.element.trigger(details);
            this.opts.element.data("select2-change-triggered", false);

            // some validation frameworks ignore the change event and listen instead to keyup, click for selects
            // so here we trigger the click event manually
            this.opts.element.click();

            // ValidationEngine ignorea the change event and listens instead to blur
            // so here we trigger the blur event manually if so desired
            if (this.opts.blurOnChange)
                this.opts.element.blur();
        },

        //abstract
        isInterfaceEnabled: function()
        {
            return this.enabledInterface === true;
        },

        // abstract
        enableInterface: function() {
            var enabled = this._enabled && !this._readonly,
                disabled = !enabled;

            if (enabled === this.enabledInterface) return false;

            this.container.toggleClass("select2-container-disabled", disabled);
            this.close();
            this.enabledInterface = enabled;

            return true;
        },

        // abstract
        enable: function(enabled) {
            if (enabled === undefined) enabled = true;
            if (this._enabled === enabled) return;
            this._enabled = enabled;

            this.opts.element.prop("disabled", !enabled);
            this.enableInterface();
        },

        // abstract
        disable: function() {
            this.enable(false);
        },

        // abstract
        readonly: function(enabled) {
            if (enabled === undefined) enabled = false;
            if (this._readonly === enabled) return false;
            this._readonly = enabled;

            this.opts.element.prop("readonly", enabled);
            this.enableInterface();
            return true;
        },

        // abstract
        opened: function () {
            return this.container.hasClass("select2-dropdown-open");
        },

        // abstract
        positionDropdown: function() {
            var $dropdown = this.dropdown,
                offset = this.container.offset(),
                height = this.container.outerHeight(false),
                width = this.container.outerWidth(false),
                dropHeight = $dropdown.outerHeight(false),
                viewPortRight = $(window).scrollLeft() + $(window).width(),
                viewportBottom = $(window).scrollTop() + $(window).height(),
                dropTop = offset.top + height,
                dropLeft = offset.left,
                enoughRoomBelow = dropTop + dropHeight <= viewportBottom,
                enoughRoomAbove = (offset.top - dropHeight) >= this.body().scrollTop(),
                dropWidth = $dropdown.outerWidth(false),
                enoughRoomOnRight = dropLeft + dropWidth <= viewPortRight,
                aboveNow = $dropdown.hasClass("select2-drop-above"),
                bodyOffset,
                above,
                css,
                resultsListNode;

            if (this.opts.dropdownAutoWidth) {
                resultsListNode = $('.select2-results', $dropdown)[0];
                $dropdown.addClass('select2-drop-auto-width');
                $dropdown.css('width', '');
                // Add scrollbar width to dropdown if vertical scrollbar is present
                dropWidth = $dropdown.outerWidth(false) + (resultsListNode.scrollHeight === resultsListNode.clientHeight ? 0 : scrollBarDimensions.width);
                dropWidth > width ? width = dropWidth : dropWidth = width;
                enoughRoomOnRight = dropLeft + dropWidth <= viewPortRight;
            }
            else {
                this.container.removeClass('select2-drop-auto-width');
            }

            //console.log("below/ droptop:", dropTop, "dropHeight", dropHeight, "sum", (dropTop+dropHeight)+" viewport bottom", viewportBottom, "enough?", enoughRoomBelow);
            //console.log("above/ offset.top", offset.top, "dropHeight", dropHeight, "top", (offset.top-dropHeight), "scrollTop", this.body().scrollTop(), "enough?", enoughRoomAbove);

            // fix positioning when body has an offset and is not position: static
            if (this.body().css('position') !== 'static') {
                bodyOffset = this.body().offset();
                dropTop -= bodyOffset.top;
                dropLeft -= bodyOffset.left;
            }

            // always prefer the current above/below alignment, unless there is not enough room
            if (aboveNow) {
                above = true;
                if (!enoughRoomAbove && enoughRoomBelow) above = false;
            } else {
                above = false;
                if (!enoughRoomBelow && enoughRoomAbove) above = true;
            }

            if (!enoughRoomOnRight) {
               dropLeft = offset.left + width - dropWidth;
            }

            if (above) {
                dropTop = offset.top - dropHeight;
                this.container.addClass("select2-drop-above");
                $dropdown.addClass("select2-drop-above");
            }
            else {
                this.container.removeClass("select2-drop-above");
                $dropdown.removeClass("select2-drop-above");
            }

            css = $.extend({
                top: dropTop,
                left: dropLeft,
                width: width
            }, evaluate(this.opts.dropdownCss));

            $dropdown.css(css);
        },

        // abstract
        shouldOpen: function() {
            var event;

            if (this.opened()) return false;

            if (this._enabled === false || this._readonly === true) return false;

            event = $.Event("select2-opening");
            this.opts.element.trigger(event);
            return !event.isDefaultPrevented();
        },

        // abstract
        clearDropdownAlignmentPreference: function() {
            // clear the classes used to figure out the preference of where the dropdown should be opened
            this.container.removeClass("select2-drop-above");
            this.dropdown.removeClass("select2-drop-above");
        },

        /**
         * Opens the dropdown
         *
         * @return {Boolean} whether or not dropdown was opened. This method will return false if, for example,
         * the dropdown is already open, or if the 'open' event listener on the element called preventDefault().
         */
        // abstract
        open: function () {

            if (!this.shouldOpen()) return false;

            this.opening();

            return true;
        },

        /**
         * Performs the opening of the dropdown
         */
        // abstract
        opening: function() {
            var cid = this.containerId,
                scroll = "scroll." + cid,
                resize = "resize."+cid,
                orient = "orientationchange."+cid,
                mask, maskCss;

            this.container.addClass("select2-dropdown-open").addClass("select2-container-active");

            this.clearDropdownAlignmentPreference();

            if(this.dropdown[0] !== this.body().children().last()[0]) {
                this.dropdown.detach().appendTo(this.body());
            }

            // create the dropdown mask if doesnt already exist
            mask = $("#select2-drop-mask");
            if (mask.length == 0) {
                mask = $(document.createElement("div"));
                mask.attr("id","select2-drop-mask").attr("class","select2-drop-mask");
                mask.hide();
                mask.appendTo(this.body());
                mask.on("mousedown touchstart click", function (e) {
                    var dropdown = $("#select2-drop"), self;
                    if (dropdown.length > 0) {
                        self=dropdown.data("select2");
                        if (self.opts.selectOnBlur) {
                            self.selectHighlighted({noFocus: true});
                        }
                        self.close({focus:false});
                        e.preventDefault();
                        e.stopPropagation();
                    }
                });
            }

            // ensure the mask is always right before the dropdown
            if (this.dropdown.prev()[0] !== mask[0]) {
                this.dropdown.before(mask);
            }

            // move the global id to the correct dropdown
            $("#select2-drop").removeAttr("id");
            this.dropdown.attr("id", "select2-drop");

            // show the elements
            mask.show();

            this.positionDropdown();
            this.dropdown.show();
            this.positionDropdown();

            this.dropdown.addClass("select2-drop-active");

            // attach listeners to events that can change the position of the container and thus require
            // the position of the dropdown to be updated as well so it does not come unglued from the container
            var that = this;
            this.container.parents().add(window).each(function () {
                $(this).on(resize+" "+scroll+" "+orient, function (e) {
                    that.positionDropdown();
                });
            });


        },

        // abstract
        close: function () {
            if (!this.opened()) return;

            var cid = this.containerId,
                scroll = "scroll." + cid,
                resize = "resize."+cid,
                orient = "orientationchange."+cid;

            // unbind event listeners
            this.container.parents().add(window).each(function () { $(this).off(scroll).off(resize).off(orient); });

            this.clearDropdownAlignmentPreference();

            $("#select2-drop-mask").hide();
            this.dropdown.removeAttr("id"); // only the active dropdown has the select2-drop id
            this.dropdown.hide();
            this.container.removeClass("select2-dropdown-open");
            this.results.empty();


            this.clearSearch();
            this.search.removeClass("select2-active");
            this.opts.element.trigger($.Event("select2-close"));
        },

        /**
         * Opens control, sets input value, and updates results.
         */
        // abstract
        externalSearch: function (term) {
            this.open();
            this.search.val(term);
            this.updateResults(false);
        },

        // abstract
        clearSearch: function () {

        },

        //abstract
        getMaximumSelectionSize: function() {
            return evaluate(this.opts.maximumSelectionSize);
        },

        // abstract
        ensureHighlightVisible: function () {
            var results = this.results, children, index, child, hb, rb, y, more;

            index = this.highlight();

            if (index < 0) return;

            if (index == 0) {

                // if the first element is highlighted scroll all the way to the top,
                // that way any unselectable headers above it will also be scrolled
                // into view

                results.scrollTop(0);
                return;
            }

            children = this.findHighlightableChoices().find('.select2-result-label');

            child = $(children[index]);

            hb = child.offset().top + child.outerHeight(true);

            // if this is the last child lets also make sure select2-more-results is visible
            if (index === children.length - 1) {
                more = results.find("li.select2-more-results");
                if (more.length > 0) {
                    hb = more.offset().top + more.outerHeight(true);
                }
            }

            rb = results.offset().top + results.outerHeight(true);
            if (hb > rb) {
                results.scrollTop(results.scrollTop() + (hb - rb));
            }
            y = child.offset().top - results.offset().top;

            // make sure the top of the element is visible
            if (y < 0 && child.css('display') != 'none' ) {
                results.scrollTop(results.scrollTop() + y); // y is negative
            }
        },

        // abstract
        findHighlightableChoices: function() {
            return this.results.find(".select2-result-selectable:not(.select2-selected):not(.select2-disabled)");
        },

        // abstract
        moveHighlight: function (delta) {
            var choices = this.findHighlightableChoices(),
                index = this.highlight();

            while (index > -1 && index < choices.length) {
                index += delta;
                var choice = $(choices[index]);
                if (choice.hasClass("select2-result-selectable") && !choice.hasClass("select2-disabled") && !choice.hasClass("select2-selected")) {
                    this.highlight(index);
                    break;
                }
            }
        },

        // abstract
        highlight: function (index) {
            var choices = this.findHighlightableChoices(),
                choice,
                data;

            if (arguments.length === 0) {
                return indexOf(choices.filter(".select2-highlighted")[0], choices.get());
            }

            if (index >= choices.length) index = choices.length - 1;
            if (index < 0) index = 0;

            this.removeHighlight();

            choice = $(choices[index]);
            choice.addClass("select2-highlighted");

            this.ensureHighlightVisible();

            data = choice.data("select2-data");
            if (data) {
                this.opts.element.trigger({ type: "select2-highlight", val: this.id(data), choice: data });
            }
        },

        removeHighlight: function() {
            this.results.find(".select2-highlighted").removeClass("select2-highlighted");
        },

        // abstract
        countSelectableResults: function() {
            return this.findHighlightableChoices().length;
        },

        // abstract
        highlightUnderEvent: function (event) {
            var el = $(event.target).closest(".select2-result-selectable");
            if (el.length > 0 && !el.is(".select2-highlighted")) {
                var choices = this.findHighlightableChoices();
                this.highlight(choices.index(el));
            } else if (el.length == 0) {
                // if we are over an unselectable item remove all highlights
                this.removeHighlight();
            }
        },

        // abstract
        loadMoreIfNeeded: function () {
            var results = this.results,
                more = results.find("li.select2-more-results"),
                below, // pixels the element is below the scroll fold, below==0 is when the element is starting to be visible
                offset = -1, // index of first element without data
                page = this.resultsPage + 1,
                self=this,
                term=this.search.val(),
                context=this.context;

            if (more.length === 0) return;
            below = more.offset().top - results.offset().top - results.height();

            if (below <= this.opts.loadMorePadding) {
                more.addClass("select2-active");
                this.opts.query({
                        element: this.opts.element,
                        term: term,
                        page: page,
                        context: context,
                        matcher: this.opts.matcher,
                        callback: this.bind(function (data) {

                    // ignore a response if the select2 has been closed before it was received
                    if (!self.opened()) return;


                    self.opts.populateResults.call(this, results, data.results, {term: term, page: page, context:context});
                    self.postprocessResults(data, false, false);

                    if (data.more===true) {
                        more.detach().appendTo(results).text(self.opts.formatLoadMore(page+1));
                        window.setTimeout(function() { self.loadMoreIfNeeded(); }, 10);
                    } else {
                        more.remove();
                    }
                    self.positionDropdown();
                    self.resultsPage = page;
                    self.context = data.context;
                    this.opts.element.trigger({ type: "select2-loaded", items: data });
                })});
            }
        },

        /**
         * Default tokenizer function which does nothing
         */
        tokenize: function() {

        },

        /**
         * @param initial whether or not this is the call to this method right after the dropdown has been opened
         */
        // abstract
        updateResults: function (initial) {
            var search = this.search,
                results = this.results,
                opts = this.opts,
                data,
                self = this,
                input,
                term = search.val(),
                lastTerm = $.data(this.container, "select2-last-term"),
                // sequence number used to drop out-of-order responses
                queryNumber;

            // prevent duplicate queries against the same term
            if (initial !== true && lastTerm && equal(term, lastTerm)) return;

            $.data(this.container, "select2-last-term", term);

            // if the search is currently hidden we do not alter the results
            if (initial !== true && (this.showSearchInput === false || !this.opened())) {
                return;
            }

            function postRender() {
                search.removeClass("select2-active");
                self.positionDropdown();
            }

            function render(html) {
                results.html(html);
                postRender();
            }

            queryNumber = ++this.queryCount;

            var maxSelSize = this.getMaximumSelectionSize();
            if (maxSelSize >=1) {
                data = this.data();
                if ($.isArray(data) && data.length >= maxSelSize && checkFormatter(opts.formatSelectionTooBig, "formatSelectionTooBig")) {
                    render("<li class='select2-selection-limit'>" + opts.formatSelectionTooBig(maxSelSize) + "</li>");
                    return;
                }
            }

            if (search.val().length < opts.minimumInputLength) {
                if (checkFormatter(opts.formatInputTooShort, "formatInputTooShort")) {
                    render("<li class='select2-no-results'>" + opts.formatInputTooShort(search.val(), opts.minimumInputLength) + "</li>");
                } else {
                    render("");
                }
                if (initial && this.showSearch) this.showSearch(true);
                return;
            }

            if (opts.maximumInputLength && search.val().length > opts.maximumInputLength) {
                if (checkFormatter(opts.formatInputTooLong, "formatInputTooLong")) {
                    render("<li class='select2-no-results'>" + opts.formatInputTooLong(search.val(), opts.maximumInputLength) + "</li>");
                } else {
                    render("");
                }
                return;
            }

            if (opts.formatSearching && this.findHighlightableChoices().length === 0) {
                render("<li class='select2-searching'>" + opts.formatSearching() + "</li>");
            }

            search.addClass("select2-active");

            this.removeHighlight();

            // give the tokenizer a chance to pre-process the input
            input = this.tokenize();
            if (input != undefined && input != null) {
                search.val(input);
            }

            this.resultsPage = 1;

            opts.query({
                element: opts.element,
                    term: search.val(),
                    page: this.resultsPage,
                    context: null,
                    matcher: opts.matcher,
                    callback: this.bind(function (data) {
                var def; // default choice

                // ignore old responses
                if (queryNumber != this.queryCount) {
                  return;
                }

                // ignore a response if the select2 has been closed before it was received
                if (!this.opened()) {
                    this.search.removeClass("select2-active");
                    return;
                }

                // save context, if any
                this.context = (data.context===undefined) ? null : data.context;
                // create a default choice and prepend it to the list
                if (this.opts.createSearchChoice && search.val() !== "") {
                    def = this.opts.createSearchChoice.call(self, search.val(), data.results);
                    if (def !== undefined && def !== null && self.id(def) !== undefined && self.id(def) !== null) {
                        if ($(data.results).filter(
                            function () {
                                return equal(self.id(this), self.id(def));
                            }).length === 0) {
                            data.results.unshift(def);
                        }
                    }
                }

                if (data.results.length === 0 && checkFormatter(opts.formatNoMatches, "formatNoMatches")) {
                    render("<li class='select2-no-results'>" + opts.formatNoMatches(search.val()) + "</li>");
                    return;
                }

                results.empty();
                self.opts.populateResults.call(this, results, data.results, {term: search.val(), page: this.resultsPage, context:null});

                if (data.more === true && checkFormatter(opts.formatLoadMore, "formatLoadMore")) {
                    results.append("<li class='select2-more-results'>" + self.opts.escapeMarkup(opts.formatLoadMore(this.resultsPage)) + "</li>");
                    window.setTimeout(function() { self.loadMoreIfNeeded(); }, 10);
                }

                this.postprocessResults(data, initial);

                postRender();

                this.opts.element.trigger({ type: "select2-loaded", items: data });
            })});
        },

        // abstract
        cancel: function () {
            this.close();
        },

        // abstract
        blur: function () {
            // if selectOnBlur == true, select the currently highlighted option
            if (this.opts.selectOnBlur)
                this.selectHighlighted({noFocus: true});

            this.close();
            this.container.removeClass("select2-container-active");
            // synonymous to .is(':focus'), which is available in jquery >= 1.6
            if (this.search[0] === document.activeElement) { this.search.blur(); }
            this.clearSearch();
            this.selection.find(".select2-search-choice-focus").removeClass("select2-search-choice-focus");
        },

        // abstract
        focusSearch: function () {
            focus(this.search);
        },

        // abstract
        selectHighlighted: function (options) {
            var index=this.highlight(),
                highlighted=this.results.find(".select2-highlighted"),
                data = highlighted.closest('.select2-result').data("select2-data");

            if (data) {
                this.highlight(index);
                this.onSelect(data, options);
            } else if (options && options.noFocus) {
                this.close();
            }
        },

        // abstract
        getPlaceholder: function () {
            var placeholderOption;
            return this.opts.element.attr("placeholder") ||
                this.opts.element.attr("data-placeholder") || // jquery 1.4 compat
                this.opts.element.data("placeholder") ||
                this.opts.placeholder ||
                ((placeholderOption = this.getPlaceholderOption()) !== undefined ? placeholderOption.text() : undefined);
        },

        // abstract
        getPlaceholderOption: function() {
            if (this.select) {
                var firstOption = this.select.children().first();
                if (this.opts.placeholderOption !== undefined ) {
                    //Determine the placeholder option based on the specified placeholderOption setting
                    return (this.opts.placeholderOption === "first" && firstOption) ||
                           (typeof this.opts.placeholderOption === "function" && this.opts.placeholderOption(this.select));
                } else if (firstOption.text() === "" && firstOption.val() === "") {
                    //No explicit placeholder option specified, use the first if it's blank
                    return firstOption;
                }
            }
        },

        /**
         * Get the desired width for the container element.  This is
         * derived first from option `width` passed to select2, then
         * the inline 'style' on the original element, and finally
         * falls back to the jQuery calculated element width.
         */
        // abstract
        initContainerWidth: function () {
            function resolveContainerWidth() {
                var style, attrs, matches, i, l;

                if (this.opts.width === "off") {
                    return null;
                } else if (this.opts.width === "element"){
                    return this.opts.element.outerWidth(false) === 0 ? 'auto' : this.opts.element.outerWidth(false) + 'px';
                } else if (this.opts.width === "copy" || this.opts.width === "resolve") {
                    // check if there is inline style on the element that contains width
                    style = this.opts.element.attr('style');
                    if (style !== undefined) {
                        attrs = style.split(';');
                        for (i = 0, l = attrs.length; i < l; i = i + 1) {
                            matches = attrs[i].replace(/\s/g, '')
                                .match(/[^-]width:(([-+]?([0-9]*\.)?[0-9]+)(px|em|ex|%|in|cm|mm|pt|pc))/i);
                            if (matches !== null && matches.length >= 1)
                                return matches[1];
                        }
                    }

                    if (this.opts.width === "resolve") {
                        // next check if css('width') can resolve a width that is percent based, this is sometimes possible
                        // when attached to input type=hidden or elements hidden via css
                        style = this.opts.element.css('width');
                        if (style.indexOf("%") > 0) return style;

                        // finally, fallback on the calculated width of the element
                        return (this.opts.element.outerWidth(false) === 0 ? 'auto' : this.opts.element.outerWidth(false) + 'px');
                    }

                    return null;
                } else if ($.isFunction(this.opts.width)) {
                    return this.opts.width();
                } else {
                    return this.opts.width;
               }
            };

            var width = resolveContainerWidth.call(this);
            if (width !== null) {
                this.container.css("width", width);
            }
        }
    });

    SingleSelect2 = clazz(AbstractSelect2, {

        // single

        createContainer: function () {
            var container = $(document.createElement("div")).attr({
                "class": "select2-container"
            }).html([
                "<a href='javascript:void(0)' onclick='return false;' class='select2-choice' tabindex='-1'>",
                "   <span class='select2-chosen'>&nbsp;</span><abbr class='select2-search-choice-close'></abbr>",
                "   <span class='select2-arrow'><b></b></span>",
                "</a>",
                "<input class='select2-focusser select2-offscreen' type='text'/>",
                "<div class='select2-drop select2-display-none'>",
                "   <div class='select2-search'>",
                "       <input type='text' autocomplete='off' autocorrect='off' autocapitalize='off' spellcheck='false' class='select2-input'/>",
                "   </div>",
                "   <ul class='select2-results'>",
                "   </ul>",
                "</div>"].join(""));
            return container;
        },

        // single
        enableInterface: function() {
            if (this.parent.enableInterface.apply(this, arguments)) {
                this.focusser.prop("disabled", !this.isInterfaceEnabled());
            }
        },

        // single
        opening: function () {
            var el, range, len;

            if (this.opts.minimumResultsForSearch >= 0) {
                this.showSearch(true);
            }

            this.parent.opening.apply(this, arguments);

            if (this.showSearchInput !== false) {
                // IE appends focusser.val() at the end of field :/ so we manually insert it at the beginning using a range
                // all other browsers handle this just fine

                this.search.val(this.focusser.val());
            }
            this.search.focus();
            // move the cursor to the end after focussing, otherwise it will be at the beginning and
            // new text will appear *before* focusser.val()
            el = this.search.get(0);
            if (el.createTextRange) {
                range = el.createTextRange();
                range.collapse(false);
                range.select();
            } else if (el.setSelectionRange) {
                len = this.search.val().length;
                el.setSelectionRange(len, len);
            }

            // initializes search's value with nextSearchTerm (if defined by user)
            // ignore nextSearchTerm if the dropdown is opened by the user pressing a letter
            if(this.search.val() === "") {
                if(this.nextSearchTerm != undefined){
                    this.search.val(this.nextSearchTerm);
                    this.search.select();
                }
            }

            this.focusser.prop("disabled", true).val("");
            this.updateResults(true);
            this.opts.element.trigger($.Event("select2-open"));
        },

        // single
        close: function (params) {
            if (!this.opened()) return;
            this.parent.close.apply(this, arguments);

            params = params || {focus: true};
            this.focusser.removeAttr("disabled");

            if (params.focus) {
                this.focusser.focus();
            }
        },

        // single
        focus: function () {
            if (this.opened()) {
                this.close();
            } else {
                this.focusser.removeAttr("disabled");
                this.focusser.focus();
            }
        },

        // single
        isFocused: function () {
            return this.container.hasClass("select2-container-active");
        },

        // single
        cancel: function () {
            this.parent.cancel.apply(this, arguments);
            this.focusser.removeAttr("disabled");
            this.focusser.focus();
        },

        // single
        destroy: function() {
            $("label[for='" + this.focusser.attr('id') + "']")
                .attr('for', this.opts.element.attr("id"));
            this.parent.destroy.apply(this, arguments);
        },

        // single
        initContainer: function () {

            var selection,
                container = this.container,
                dropdown = this.dropdown;

            if (this.opts.minimumResultsForSearch < 0) {
                this.showSearch(false);
            } else {
                this.showSearch(true);
            }

            this.selection = selection = container.find(".select2-choice");

            this.focusser = container.find(".select2-focusser");

            // rewrite labels from original element to focusser
            this.focusser.attr("id", "s2id_autogen"+nextUid());

            $("label[for='" + this.opts.element.attr("id") + "']")
                .attr('for', this.focusser.attr('id'));

            this.focusser.attr("tabindex", this.elementTabIndex);

            this.search.on("keydown", this.bind(function (e) {
                if (!this.isInterfaceEnabled()) return;

                if (e.which === KEY.PAGE_UP || e.which === KEY.PAGE_DOWN) {
                    // prevent the page from scrolling
                    killEvent(e);
                    return;
                }

                switch (e.which) {
                    case KEY.UP:
                    case KEY.DOWN:
                        this.moveHighlight((e.which === KEY.UP) ? -1 : 1);
                        killEvent(e);
                        return;
                    case KEY.ENTER:
                        this.selectHighlighted();
                        killEvent(e);
                        return;
                    case KEY.TAB:
                        // if selectOnBlur == true, select the currently highlighted option
                        if (this.opts.selectOnBlur) {
                            this.selectHighlighted({noFocus: true});
                        }
                        return;
                    case KEY.ESC:
                        this.cancel(e);
                        killEvent(e);
                        return;
                }
            }));

            this.search.on("blur", this.bind(function(e) {
                // a workaround for chrome to keep the search field focussed when the scroll bar is used to scroll the dropdown.
                // without this the search field loses focus which is annoying
                if (document.activeElement === this.body().get(0)) {
                    window.setTimeout(this.bind(function() {
                        this.search.focus();
                    }), 0);
                }
            }));

            this.focusser.on("keydown", this.bind(function (e) {
                if (!this.isInterfaceEnabled()) return;

                if (e.which === KEY.TAB || KEY.isControl(e) || KEY.isFunctionKey(e) || e.which === KEY.ESC) {
                    return;
                }

                if (this.opts.openOnEnter === false && e.which === KEY.ENTER) {
                    killEvent(e);
                    return;
                }

                if (e.which == KEY.DOWN || e.which == KEY.UP
                    || (e.which == KEY.ENTER && this.opts.openOnEnter)) {

                    if (e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;

                    this.open();
                    killEvent(e);
                    return;
                }

                if (e.which == KEY.DELETE || e.which == KEY.BACKSPACE) {
                    if (this.opts.allowClear) {
                        this.clear();
                    }
                    killEvent(e);
                    return;
                }
            }));


            installKeyUpChangeEvent(this.focusser);
            this.focusser.on("keyup-change input", this.bind(function(e) {
                if (this.opts.minimumResultsForSearch >= 0) {
                    e.stopPropagation();
                    if (this.opened()) return;
                    this.open();
                }
            }));

            selection.on("mousedown", "abbr", this.bind(function (e) {
                if (!this.isInterfaceEnabled()) return;
                this.clear();
                killEventImmediately(e);
                this.close();
                this.selection.focus();
            }));

            selection.on("mousedown", this.bind(function (e) {

                if (!this.container.hasClass("select2-container-active")) {
                    this.opts.element.trigger($.Event("select2-focus"));
                }

                if (this.opened()) {
                    this.close();
                } else if (this.isInterfaceEnabled()) {
                    this.open();
                }

                killEvent(e);
            }));

            dropdown.on("mousedown", this.bind(function() { this.search.focus(); }));

            selection.on("focus", this.bind(function(e) {
                killEvent(e);
            }));

            this.focusser.on("focus", this.bind(function(){
                if (!this.container.hasClass("select2-container-active")) {
                    this.opts.element.trigger($.Event("select2-focus"));
                }
                this.container.addClass("select2-container-active");
            })).on("blur", this.bind(function() {
                if (!this.opened()) {
                    this.container.removeClass("select2-container-active");
                    this.opts.element.trigger($.Event("select2-blur"));
                }
            }));
            this.search.on("focus", this.bind(function(){
                if (!this.container.hasClass("select2-container-active")) {
                    this.opts.element.trigger($.Event("select2-focus"));
                }
                this.container.addClass("select2-container-active");
            }));

            this.initContainerWidth();
            this.opts.element.addClass("select2-offscreen");
            this.setPlaceholder();

        },

        // single
        clear: function(triggerChange) {
            var data=this.selection.data("select2-data");
            if (data) { // guard against queued quick consecutive clicks
                var placeholderOption = this.getPlaceholderOption();
                this.opts.element.val(placeholderOption ? placeholderOption.val() : "");
                this.selection.find(".select2-chosen").empty();
                this.selection.removeData("select2-data");
                this.setPlaceholder();

                if (triggerChange !== false){
                    this.opts.element.trigger({ type: "select2-removed", val: this.id(data), choice: data });
                    this.triggerChange({removed:data});
                }
            }
        },

        /**
         * Sets selection based on source element's value
         */
        // single
        initSelection: function () {
            var selected;
            if (this.isPlaceholderOptionSelected()) {
                this.updateSelection(null);
                this.close();
                this.setPlaceholder();
            } else {
                var self = this;
                this.opts.initSelection.call(null, this.opts.element, function(selected){
                    if (selected !== undefined && selected !== null) {
                        self.updateSelection(selected);
                        self.close();
                        self.setPlaceholder();
                    }
                });
            }
        },

        isPlaceholderOptionSelected: function() {
            var placeholderOption;
            if (!this.opts.placeholder) return false; // no placeholder specified so no option should be considered
            return ((placeholderOption = this.getPlaceholderOption()) !== undefined && placeholderOption.is(':selected'))
                || (this.opts.element.val() === "")
                || (this.opts.element.val() === undefined)
                || (this.opts.element.val() === null);
        },

        // single
        prepareOpts: function () {
            var opts = this.parent.prepareOpts.apply(this, arguments),
                self=this;

            if (opts.element.get(0).tagName.toLowerCase() === "select") {
                // install the selection initializer
                opts.initSelection = function (element, callback) {
                    var selected = element.find(":selected");
                    // a single select box always has a value, no need to null check 'selected'
                    callback(self.optionToData(selected));
                };
            } else if ("data" in opts) {
                // install default initSelection when applied to hidden input and data is local
                opts.initSelection = opts.initSelection || function (element, callback) {
                    var id = element.val();
                    //search in data by id, storing the actual matching item
                    var match = null;
                    opts.query({
                        matcher: function(term, text, el){
                            var is_match = equal(id, opts.id(el));
                            if (is_match) {
                                match = el;
                            }
                            return is_match;
                        },
                        callback: !$.isFunction(callback) ? $.noop : function() {
                            callback(match);
                        }
                    });
                };
            }

            return opts;
        },

        // single
        getPlaceholder: function() {
            // if a placeholder is specified on a single select without a valid placeholder option ignore it
            if (this.select) {
                if (this.getPlaceholderOption() === undefined) {
                    return undefined;
                }
            }

            return this.parent.getPlaceholder.apply(this, arguments);
        },

        // single
        setPlaceholder: function () {
            var placeholder = this.getPlaceholder();

            if (this.isPlaceholderOptionSelected() && placeholder !== undefined) {

                // check for a placeholder option if attached to a select
                if (this.select && this.getPlaceholderOption() === undefined) return;

                this.selection.find(".select2-chosen").html(this.opts.escapeMarkup(placeholder));

                this.selection.addClass("select2-default");

                this.container.removeClass("select2-allowclear");
            }
        },

        // single
        postprocessResults: function (data, initial, noHighlightUpdate) {
            var selected = 0, self = this, showSearchInput = true;

            // find the selected element in the result list

            this.findHighlightableChoices().each2(function (i, elm) {
                if (equal(self.id(elm.data("select2-data")), self.opts.element.val())) {
                    selected = i;
                    return false;
                }
            });

            // and highlight it
            if (noHighlightUpdate !== false) {
                if (initial === true && selected >= 0) {
                    this.highlight(selected);
                } else {
                    this.highlight(0);
                }
            }

            // hide the search box if this is the first we got the results and there are enough of them for search

            if (initial === true) {
                var min = this.opts.minimumResultsForSearch;
                if (min >= 0) {
                    this.showSearch(countResults(data.results) >= min);
                }
            }
        },

        // single
        showSearch: function(showSearchInput) {
            if (this.showSearchInput === showSearchInput) return;

            this.showSearchInput = showSearchInput;

            this.dropdown.find(".select2-search").toggleClass("select2-search-hidden", !showSearchInput);
            this.dropdown.find(".select2-search").toggleClass("select2-offscreen", !showSearchInput);
            //add "select2-with-searchbox" to the container if search box is shown
            $(this.dropdown, this.container).toggleClass("select2-with-searchbox", showSearchInput);
        },

        // single
        onSelect: function (data, options) {

            if (!this.triggerSelect(data)) { return; }

            var old = this.opts.element.val(),
                oldData = this.data();

            this.opts.element.val(this.id(data));
            this.updateSelection(data);

            this.opts.element.trigger({ type: "select2-selected", val: this.id(data), choice: data });

            this.nextSearchTerm = this.opts.nextSearchTerm(data, this.search.val());
            this.close();

            if (!options || !options.noFocus)
                this.selection.focus();

            if (!equal(old, this.id(data))) { this.triggerChange({added:data,removed:oldData}); }
        },

        // single
        updateSelection: function (data) {

            var container=this.selection.find(".select2-chosen"), formatted, cssClass;

            this.selection.data("select2-data", data);

            container.empty();
            if (data !== null) {
                formatted=this.opts.formatSelection(data, container, this.opts.escapeMarkup);
            }
            if (formatted !== undefined) {
                container.append(formatted);
            }
            cssClass=this.opts.formatSelectionCssClass(data, container);
            if (cssClass !== undefined) {
                container.addClass(cssClass);
            }

            this.selection.removeClass("select2-default");

            if (this.opts.allowClear && this.getPlaceholder() !== undefined) {
                this.container.addClass("select2-allowclear");
            }
        },

        // single
        val: function () {
            var val,
                triggerChange = false,
                data = null,
                self = this,
                oldData = this.data();

            if (arguments.length === 0) {
                return this.opts.element.val();
            }

            val = arguments[0];

            if (arguments.length > 1) {
                triggerChange = arguments[1];
            }

            if (this.select) {
                this.select
                    .val(val)
                    .find(":selected").each2(function (i, elm) {
                        data = self.optionToData(elm);
                        return false;
                    });
                this.updateSelection(data);
                this.setPlaceholder();
                if (triggerChange) {
                    this.triggerChange({added: data, removed:oldData});
                }
            } else {
                // val is an id. !val is true for [undefined,null,'',0] - 0 is legal
                if (!val && val !== 0) {
                    this.clear(triggerChange);
                    return;
                }
                if (this.opts.initSelection === undefined) {
                    throw new Error("cannot call val() if initSelection() is not defined");
                }
                this.opts.element.val(val);
                this.opts.initSelection(this.opts.element, function(data){
                    self.opts.element.val(!data ? "" : self.id(data));
                    self.updateSelection(data);
                    self.setPlaceholder();
                    if (triggerChange) {
                        self.triggerChange({added: data, removed:oldData});
                    }
                });
            }
        },

        // single
        clearSearch: function () {
            this.search.val("");
            this.focusser.val("");
        },

        // single
        data: function(value) {
            var data,
                triggerChange = false;

            if (arguments.length === 0) {
                data = this.selection.data("select2-data");
                if (data == undefined) data = null;
                return data;
            } else {
                if (arguments.length > 1) {
                    triggerChange = arguments[1];
                }
                if (!value) {
                    this.clear(triggerChange);
                } else {
                    data = this.data();
                    this.opts.element.val(!value ? "" : this.id(value));
                    this.updateSelection(value);
                    if (triggerChange) {
                        this.triggerChange({added: value, removed:data});
                    }
                }
            }
        }
    });

    MultiSelect2 = clazz(AbstractSelect2, {

        // multi
        createContainer: function () {
            var container = $(document.createElement("div")).attr({
                "class": "select2-container select2-container-multi"
            }).html([
                "<ul class='select2-choices'>",
                "  <li class='select2-search-field'>",
                "    <input type='text' autocomplete='off' autocorrect='off' autocapitalize='off' spellcheck='false' class='select2-input'>",
                "  </li>",
                "</ul>",
                "<div class='select2-drop select2-drop-multi select2-display-none'>",
                "   <ul class='select2-results'>",
                "   </ul>",
                "</div>"].join(""));
            return container;
        },

        // multi
        prepareOpts: function () {
            var opts = this.parent.prepareOpts.apply(this, arguments),
                self=this;

            // TODO validate placeholder is a string if specified

            if (opts.element.get(0).tagName.toLowerCase() === "select") {
                // install sthe selection initializer
                opts.initSelection = function (element, callback) {

                    var data = [];

                    element.find(":selected").each2(function (i, elm) {
                        data.push(self.optionToData(elm));
                    });
                    callback(data);
                };
            } else if ("data" in opts) {
                // install default initSelection when applied to hidden input and data is local
                opts.initSelection = opts.initSelection || function (element, callback) {
                    var ids = splitVal(element.val(), opts.separator);
                    //search in data by array of ids, storing matching items in a list
                    var matches = [];
                    opts.query({
                        matcher: function(term, text, el){
                            var is_match = $.grep(ids, function(id) {
                                return equal(id, opts.id(el));
                            }).length;
                            if (is_match) {
                                matches.push(el);
                            }
                            return is_match;
                        },
                        callback: !$.isFunction(callback) ? $.noop : function() {
                            // reorder matches based on the order they appear in the ids array because right now
                            // they are in the order in which they appear in data array
                            var ordered = [];
                            for (var i = 0; i < ids.length; i++) {
                                var id = ids[i];
                                for (var j = 0; j < matches.length; j++) {
                                    var match = matches[j];
                                    if (equal(id, opts.id(match))) {
                                        ordered.push(match);
                                        matches.splice(j, 1);
                                        break;
                                    }
                                }
                            }
                            callback(ordered);
                        }
                    });
                };
            }

            return opts;
        },

        selectChoice: function (choice) {

            var selected = this.container.find(".select2-search-choice-focus");
            if (selected.length && choice && choice[0] == selected[0]) {

            } else {
                if (selected.length) {
                    this.opts.element.trigger("choice-deselected", selected);
                }
                selected.removeClass("select2-search-choice-focus");
                if (choice && choice.length) {
                    this.close();
                    choice.addClass("select2-search-choice-focus");
                    this.opts.element.trigger("choice-selected", choice);
                }
            }
        },

        // multi
        destroy: function() {
            $("label[for='" + this.search.attr('id') + "']")
                .attr('for', this.opts.element.attr("id"));
            this.parent.destroy.apply(this, arguments);
        },

        // multi
        initContainer: function () {

            var selector = ".select2-choices", selection;

            this.searchContainer = this.container.find(".select2-search-field");
            this.selection = selection = this.container.find(selector);

            var _this = this;
            this.selection.on("click", ".select2-search-choice", function (e) {
                //killEvent(e);
                _this.search[0].focus();
                _this.selectChoice($(this));
            });

            // rewrite labels from original element to focusser
            this.search.attr("id", "s2id_autogen"+nextUid());
            $("label[for='" + this.opts.element.attr("id") + "']")
                .attr('for', this.search.attr('id'));

            this.search.on("input paste", this.bind(function() {
                if (!this.isInterfaceEnabled()) return;
                if (!this.opened()) {
                    this.open();
                }
            }));

            this.search.attr("tabindex", this.elementTabIndex);

            this.keydowns = 0;
            this.search.on("keydown", this.bind(function (e) {
                if (!this.isInterfaceEnabled()) return;

                ++this.keydowns;
                var selected = selection.find(".select2-search-choice-focus");
                var prev = selected.prev(".select2-search-choice:not(.select2-locked)");
                var next = selected.next(".select2-search-choice:not(.select2-locked)");
                var pos = getCursorInfo(this.search);

                if (selected.length &&
                    (e.which == KEY.LEFT || e.which == KEY.RIGHT || e.which == KEY.BACKSPACE || e.which == KEY.DELETE || e.which == KEY.ENTER)) {
                    var selectedChoice = selected;
                    if (e.which == KEY.LEFT && prev.length) {
                        selectedChoice = prev;
                    }
                    else if (e.which == KEY.RIGHT) {
                        selectedChoice = next.length ? next : null;
                    }
                    else if (e.which === KEY.BACKSPACE) {
                        this.unselect(selected.first());
                        this.search.width(10);
                        selectedChoice = prev.length ? prev : next;
                    } else if (e.which == KEY.DELETE) {
                        this.unselect(selected.first());
                        this.search.width(10);
                        selectedChoice = next.length ? next : null;
                    } else if (e.which == KEY.ENTER) {
                        selectedChoice = null;
                    }

                    this.selectChoice(selectedChoice);
                    killEvent(e);
                    if (!selectedChoice || !selectedChoice.length) {
                        this.open();
                    }
                    return;
                } else if (((e.which === KEY.BACKSPACE && this.keydowns == 1)
                    || e.which == KEY.LEFT) && (pos.offset == 0 && !pos.length)) {

                    this.selectChoice(selection.find(".select2-search-choice:not(.select2-locked)").last());
                    killEvent(e);
                    return;
                } else {
                    this.selectChoice(null);
                }

                if (this.opened()) {
                    switch (e.which) {
                    case KEY.UP:
                    case KEY.DOWN:
                        this.moveHighlight((e.which === KEY.UP) ? -1 : 1);
                        killEvent(e);
                        return;
                    case KEY.ENTER:
                        this.selectHighlighted();
                        killEvent(e);
                        return;
                    case KEY.TAB:
                        // if selectOnBlur == true, select the currently highlighted option
                        if (this.opts.selectOnBlur) {
                            this.selectHighlighted({noFocus:true});
                        }
                        this.close();
                        return;
                    case KEY.ESC:
                        this.cancel(e);
                        killEvent(e);
                        return;
                    }
                }

                if (e.which === KEY.TAB || KEY.isControl(e) || KEY.isFunctionKey(e)
                 || e.which === KEY.BACKSPACE || e.which === KEY.ESC) {
                    return;
                }

                if (e.which === KEY.ENTER) {
                    if (this.opts.openOnEnter === false) {
                        return;
                    } else if (e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) {
                        return;
                    }
                }

                this.open();

                if (e.which === KEY.PAGE_UP || e.which === KEY.PAGE_DOWN) {
                    // prevent the page from scrolling
                    killEvent(e);
                }

                if (e.which === KEY.ENTER) {
                    // prevent form from being submitted
                    killEvent(e);
                }

            }));

            this.search.on("keyup", this.bind(function (e) {
                this.keydowns = 0;
                this.resizeSearch();
            })
            );

            this.search.on("blur", this.bind(function(e) {
                this.container.removeClass("select2-container-active");
                this.search.removeClass("select2-focused");
                this.selectChoice(null);
                if (!this.opened()) this.clearSearch();
                e.stopImmediatePropagation();
                this.opts.element.trigger($.Event("select2-blur"));
            }));

            this.container.on("click", selector, this.bind(function (e) {
                if (!this.isInterfaceEnabled()) return;
                if ($(e.target).closest(".select2-search-choice").length > 0) {
                    // clicked inside a select2 search choice, do not open
                    return;
                }
                this.selectChoice(null);
                this.clearPlaceholder();
                if (!this.container.hasClass("select2-container-active")) {
                    this.opts.element.trigger($.Event("select2-focus"));
                }
                this.open();
                this.focusSearch();
                e.preventDefault();
            }));

            this.container.on("focus", selector, this.bind(function () {
                if (!this.isInterfaceEnabled()) return;
                if (!this.container.hasClass("select2-container-active")) {
                    this.opts.element.trigger($.Event("select2-focus"));
                }
                this.container.addClass("select2-container-active");
                this.dropdown.addClass("select2-drop-active");
                this.clearPlaceholder();
            }));

            this.initContainerWidth();
            this.opts.element.addClass("select2-offscreen");

            // set the placeholder if necessary
            this.clearSearch();
        },

        // multi
        enableInterface: function() {
            if (this.parent.enableInterface.apply(this, arguments)) {
                this.search.prop("disabled", !this.isInterfaceEnabled());
            }
        },

        // multi
        initSelection: function () {
            var data;
            if (this.opts.element.val() === "" && this.opts.element.text() === "") {
                this.updateSelection([]);
                this.close();
                // set the placeholder if necessary
                this.clearSearch();
            }
            if (this.select || this.opts.element.val() !== "") {
                var self = this;
                this.opts.initSelection.call(null, this.opts.element, function(data){
                    if (data !== undefined && data !== null) {
                        self.updateSelection(data);
                        self.close();
                        // set the placeholder if necessary
                        self.clearSearch();
                    }
                });
            }
        },

        // multi
        clearSearch: function () {
            var placeholder = this.getPlaceholder(),
                maxWidth = this.getMaxSearchWidth();

            if (placeholder !== undefined  && this.getVal().length === 0 && this.search.hasClass("select2-focused") === false) {
                this.search.val(placeholder).addClass("select2-default");
                // stretch the search box to full width of the container so as much of the placeholder is visible as possible
                // we could call this.resizeSearch(), but we do not because that requires a sizer and we do not want to create one so early because of a firefox bug, see #944
                this.search.width(maxWidth > 0 ? maxWidth : this.container.css("width"));
            } else {
                this.search.val("").width(10);
            }
        },

        // multi
        clearPlaceholder: function () {
            if (this.search.hasClass("select2-default")) {
                this.search.val("").removeClass("select2-default");
            }
        },

        // multi
        opening: function () {
            this.clearPlaceholder(); // should be done before super so placeholder is not used to search
            this.resizeSearch();

            this.parent.opening.apply(this, arguments);

            this.focusSearch();

            this.updateResults(true);
            this.search.focus();
            this.opts.element.trigger($.Event("select2-open"));
        },

        // multi
        close: function () {
            if (!this.opened()) return;
            this.parent.close.apply(this, arguments);
        },

        // multi
        focus: function () {
            this.close();
            this.search.focus();
        },

        // multi
        isFocused: function () {
            return this.search.hasClass("select2-focused");
        },

        // multi
        updateSelection: function (data) {
            var ids = [], filtered = [], self = this;

            // filter out duplicates
            $(data).each(function () {
                if (indexOf(self.id(this), ids) < 0) {
                    ids.push(self.id(this));
                    filtered.push(this);
                }
            });
            data = filtered;

            this.selection.find(".select2-search-choice").remove();
            $(data).each(function () {
                self.addSelectedChoice(this);
            });
            self.postprocessResults();
        },

        // multi
        tokenize: function() {
            var input = this.search.val();
            input = this.opts.tokenizer.call(this, input, this.data(), this.bind(this.onSelect), this.opts);
            if (input != null && input != undefined) {
                this.search.val(input);
                if (input.length > 0) {
                    this.open();
                }
            }

        },

        // multi
        onSelect: function (data, options) {

            if (!this.triggerSelect(data)) { return; }

            this.addSelectedChoice(data);

            this.opts.element.trigger({ type: "selected", val: this.id(data), choice: data });

            if (this.select || !this.opts.closeOnSelect) this.postprocessResults(data, false, this.opts.closeOnSelect===true);

            if (this.opts.closeOnSelect) {
                this.close();
                this.search.width(10);
            } else {
                if (this.countSelectableResults()>0) {
                    this.search.width(10);
                    this.resizeSearch();
                    if (this.getMaximumSelectionSize() > 0 && this.val().length >= this.getMaximumSelectionSize()) {
                        // if we reached max selection size repaint the results so choices
                        // are replaced with the max selection reached message
                        this.updateResults(true);
                    }
                    this.positionDropdown();
                } else {
                    // if nothing left to select close
                    this.close();
                    this.search.width(10);
                }
            }

            // since its not possible to select an element that has already been
            // added we do not need to check if this is a new element before firing change
            this.triggerChange({ added: data });

            if (!options || !options.noFocus)
                this.focusSearch();
        },

        // multi
        cancel: function () {
            this.close();
            this.focusSearch();
        },

        addSelectedChoice: function (data) {
            var enableChoice = !data.locked,
                enabledItem = $(
                    "<li class='select2-search-choice'>" +
                    "    <div></div>" +
                    "    <a href='#' onclick='return false;' class='select2-search-choice-close' tabindex='-1'></a>" +
                    "</li>"),
                disabledItem = $(
                    "<li class='select2-search-choice select2-locked'>" +
                    "<div></div>" +
                    "</li>");
            var choice = enableChoice ? enabledItem : disabledItem,
                id = this.id(data),
                val = this.getVal(),
                formatted,
                cssClass;

            formatted=this.opts.formatSelection(data, choice.find("div"), this.opts.escapeMarkup);
            if (formatted != undefined) {
                choice.find("div").replaceWith("<div>"+formatted+"</div>");
            }
            cssClass=this.opts.formatSelectionCssClass(data, choice.find("div"));
            if (cssClass != undefined) {
                choice.addClass(cssClass);
            }

            if(enableChoice){
              choice.find(".select2-search-choice-close")
                  .on("mousedown", killEvent)
                  .on("click dblclick", this.bind(function (e) {
                  if (!this.isInterfaceEnabled()) return;

                  $(e.target).closest(".select2-search-choice").fadeOut('fast', this.bind(function(){
                      this.unselect($(e.target));
                      this.selection.find(".select2-search-choice-focus").removeClass("select2-search-choice-focus");
                      this.close();
                      this.focusSearch();
                  })).dequeue();
                  killEvent(e);
              })).on("focus", this.bind(function () {
                  if (!this.isInterfaceEnabled()) return;
                  this.container.addClass("select2-container-active");
                  this.dropdown.addClass("select2-drop-active");
              }));
            }

            choice.data("select2-data", data);
            choice.insertBefore(this.searchContainer);

            val.push(id);
            this.setVal(val);
        },

        // multi
        unselect: function (selected) {
            var val = this.getVal(),
                data,
                index;

            selected = selected.closest(".select2-search-choice");

            if (selected.length === 0) {
                throw "Invalid argument: " + selected + ". Must be .select2-search-choice";
            }

            data = selected.data("select2-data");

            if (!data) {
                // prevent a race condition when the 'x' is clicked really fast repeatedly the event can be queued
                // and invoked on an element already removed
                return;
            }

            index = indexOf(this.id(data), val);

            if (index >= 0) {
                val.splice(index, 1);
                this.setVal(val);
                if (this.select) this.postprocessResults();
            }
            selected.remove();

            this.opts.element.trigger({ type: "removed", val: this.id(data), choice: data });
            this.triggerChange({ removed: data });
        },

        // multi
        postprocessResults: function (data, initial, noHighlightUpdate) {
            var val = this.getVal(),
                choices = this.results.find(".select2-result"),
                compound = this.results.find(".select2-result-with-children"),
                self = this;

            choices.each2(function (i, choice) {
                var id = self.id(choice.data("select2-data"));
                if (indexOf(id, val) >= 0) {
                    choice.addClass("select2-selected");
                    // mark all children of the selected parent as selected
                    choice.find(".select2-result-selectable").addClass("select2-selected");
                }
            });

            compound.each2(function(i, choice) {
                // hide an optgroup if it doesnt have any selectable children
                if (!choice.is('.select2-result-selectable')
                    && choice.find(".select2-result-selectable:not(.select2-selected)").length === 0) {
                    choice.addClass("select2-selected");
                }
            });

            if (this.highlight() == -1 && noHighlightUpdate !== false){
                self.highlight(0);
            }

            //If all results are chosen render formatNoMAtches
            if(!this.opts.createSearchChoice && !choices.filter('.select2-result:not(.select2-selected)').length > 0){
                if(!data || data && !data.more && this.results.find(".select2-no-results").length === 0) {
                    if (checkFormatter(self.opts.formatNoMatches, "formatNoMatches")) {
                        this.results.append("<li class='select2-no-results'>" + self.opts.formatNoMatches(self.search.val()) + "</li>");
                    }
                }
            }

        },

        // multi
        getMaxSearchWidth: function() {
            return this.selection.width() - getSideBorderPadding(this.search);
        },

        // multi
        resizeSearch: function () {
            var minimumWidth, left, maxWidth, containerLeft, searchWidth,
                sideBorderPadding = getSideBorderPadding(this.search);

            minimumWidth = measureTextWidth(this.search) + 10;

            left = this.search.offset().left;

            maxWidth = this.selection.width();
            containerLeft = this.selection.offset().left;

            searchWidth = maxWidth - (left - containerLeft) - sideBorderPadding;

            if (searchWidth < minimumWidth) {
                searchWidth = maxWidth - sideBorderPadding;
            }

            if (searchWidth < 40) {
                searchWidth = maxWidth - sideBorderPadding;
            }

            if (searchWidth <= 0) {
              searchWidth = minimumWidth;
            }

            this.search.width(searchWidth);
        },

        // multi
        getVal: function () {
            var val;
            if (this.select) {
                val = this.select.val();
                return val === null ? [] : val;
            } else {
                val = this.opts.element.val();
                return splitVal(val, this.opts.separator);
            }
        },

        // multi
        setVal: function (val) {
            var unique;
            if (this.select) {
                this.select.val(val);
            } else {
                unique = [];
                // filter out duplicates
                $(val).each(function () {
                    if (indexOf(this, unique) < 0) unique.push(this);
                });
                this.opts.element.val(unique.length === 0 ? "" : unique.join(this.opts.separator));
            }
        },

        // multi
        buildChangeDetails: function (old, current) {
            var current = current.slice(0),
                old = old.slice(0);

            // remove intersection from each array
            for (var i = 0; i < current.length; i++) {
                for (var j = 0; j < old.length; j++) {
                    if (equal(this.opts.id(current[i]), this.opts.id(old[j]))) {
                        current.splice(i, 1);
                        i--;
                        old.splice(j, 1);
                        j--;
                    }
                }
            }

            return {added: current, removed: old};
        },


        // multi
        val: function (val, triggerChange) {
            var oldData, self=this, changeDetails;

            if (arguments.length === 0) {
                return this.getVal();
            }

            oldData=this.data();
            if (!oldData.length) oldData=[];

            // val is an id. !val is true for [undefined,null,'',0] - 0 is legal
            if (!val && val !== 0) {
                this.opts.element.val("");
                this.updateSelection([]);
                this.clearSearch();
                if (triggerChange) {
                    this.triggerChange({added: this.data(), removed: oldData});
                }
                return;
            }

            // val is a list of ids
            this.setVal(val);

            if (this.select) {
                this.opts.initSelection(this.select, this.bind(this.updateSelection));
                if (triggerChange) {
                    this.triggerChange(this.buildChangeDetails(oldData, this.data()));
                }
            } else {
                if (this.opts.initSelection === undefined) {
                    throw new Error("val() cannot be called if initSelection() is not defined");
                }

                this.opts.initSelection(this.opts.element, function(data){
                    var ids=$.map(data, self.id);
                    self.setVal(ids);
                    self.updateSelection(data);
                    self.clearSearch();
                    if (triggerChange) {
                        self.triggerChange(self.buildChangeDetails(oldData, this.data()));
                    }
                });
            }
            this.clearSearch();
        },

        // multi
        onSortStart: function() {
            if (this.select) {
                throw new Error("Sorting of elements is not supported when attached to <select>. Attach to <input type='hidden'/> instead.");
            }

            // collapse search field into 0 width so its container can be collapsed as well
            this.search.width(0);
            // hide the container
            this.searchContainer.hide();
        },

        // multi
        onSortEnd:function() {

            var val=[], self=this;

            // show search and move it to the end of the list
            this.searchContainer.show();
            // make sure the search container is the last item in the list
            this.searchContainer.appendTo(this.searchContainer.parent());
            // since we collapsed the width in dragStarted, we resize it here
            this.resizeSearch();

            // update selection
            this.selection.find(".select2-search-choice").each(function() {
                val.push(self.opts.id($(this).data("select2-data")));
            });
            this.setVal(val);
            this.triggerChange();
        },

        // multi
        data: function(values, triggerChange) {
            var self=this, ids, old;
            if (arguments.length === 0) {
                 return this.selection
                     .find(".select2-search-choice")
                     .map(function() { return $(this).data("select2-data"); })
                     .get();
            } else {
                old = this.data();
                if (!values) { values = []; }
                ids = $.map(values, function(e) { return self.opts.id(e); });
                this.setVal(ids);
                this.updateSelection(values);
                this.clearSearch();
                if (triggerChange) {
                    this.triggerChange(this.buildChangeDetails(old, this.data()));
                }
            }
        }
    });

    $.fn.select2 = function () {

        var args = Array.prototype.slice.call(arguments, 0),
            opts,
            select2,
            method, value, multiple,
            allowedMethods = ["val", "destroy", "opened", "open", "close", "focus", "isFocused", "container", "dropdown", "onSortStart", "onSortEnd", "enable", "disable", "readonly", "positionDropdown", "data", "search"],
            valueMethods = ["opened", "isFocused", "container", "dropdown"],
            propertyMethods = ["val", "data"],
            methodsMap = { search: "externalSearch" };

        this.each(function () {
            if (args.length === 0 || typeof(args[0]) === "object") {
                opts = args.length === 0 ? {} : $.extend({}, args[0]);
                opts.element = $(this);

                if (opts.element.get(0).tagName.toLowerCase() === "select") {
                    multiple = opts.element.prop("multiple");
                } else {
                    multiple = opts.multiple || false;
                    if ("tags" in opts) {opts.multiple = multiple = true;}
                }

                select2 = multiple ? new MultiSelect2() : new SingleSelect2();
                select2.init(opts);
            } else if (typeof(args[0]) === "string") {

                if (indexOf(args[0], allowedMethods) < 0) {
                    throw "Unknown method: " + args[0];
                }

                value = undefined;
                select2 = $(this).data("select2");
                if (select2 === undefined) return;

                method=args[0];

                if (method === "container") {
                    value = select2.container;
                } else if (method === "dropdown") {
                    value = select2.dropdown;
                } else {
                    if (methodsMap[method]) method = methodsMap[method];

                    value = select2[method].apply(select2, args.slice(1));
                }
                if (indexOf(args[0], valueMethods) >= 0
                    || (indexOf(args[0], propertyMethods) && args.length == 1)) {
                    return false; // abort the iteration, ready to return first matched value
                }
            } else {
                throw "Invalid arguments to select2 plugin: " + args;
            }
        });
        return (value === undefined) ? this : value;
    };

    // plugin defaults, accessible to users
    $.fn.select2.defaults = {
        width: "copy",
        loadMorePadding: 0,
        closeOnSelect: true,
        openOnEnter: true,
        containerCss: {},
        dropdownCss: {},
        containerCssClass: "",
        dropdownCssClass: "",
        formatResult: function(result, container, query, escapeMarkup) {
            var markup=[];
            markMatch(result.text, query.term, markup, escapeMarkup);
            return markup.join("");
        },
        formatSelection: function (data, container, escapeMarkup) {
            return data ? escapeMarkup(data.text) : undefined;
        },
        sortResults: function (results, container, query) {
            return results;
        },
        formatResultCssClass: function(data) {return undefined;},
        formatSelectionCssClass: function(data, container) {return undefined;},
        formatNoMatches: function () { return "No matches found"; },
        formatInputTooShort: function (input, min) { var n = min - input.length; return "Please enter " + n + " more character" + (n == 1? "" : "s"); },
        formatInputTooLong: function (input, max) { var n = input.length - max; return "Please delete " + n + " character" + (n == 1? "" : "s"); },
        formatSelectionTooBig: function (limit) { return "You can only select " + limit + " item" + (limit == 1 ? "" : "s"); },
        formatLoadMore: function (pageNumber) { return "Loading more results..."; },
        formatSearching: function () { return "Searching..."; },
        minimumResultsForSearch: 0,
        minimumInputLength: 0,
        maximumInputLength: null,
        maximumSelectionSize: 0,
        id: function (e) { return e.id; },
        matcher: function(term, text) {
            return stripDiacritics(''+text).toUpperCase().indexOf(stripDiacritics(''+term).toUpperCase()) >= 0;
        },
        separator: ",",
        tokenSeparators: [],
        tokenizer: defaultTokenizer,
        escapeMarkup: defaultEscapeMarkup,
        blurOnChange: false,
        selectOnBlur: false,
        adaptContainerCssClass: function(c) { return c; },
        adaptDropdownCssClass: function(c) { return null; },
        nextSearchTerm: function(selectedObject, currentSearchTerm) { return undefined; }
    };

    $.fn.select2.ajaxDefaults = {
        transport: $.ajax,
        params: {
            type: "GET",
            cache: false,
            dataType: "json"
        }
    };

    // exports
    window.Select2 = {
        query: {
            ajax: ajax,
            local: local,
            tags: tags
        }, util: {
            debounce: debounce,
            markMatch: markMatch,
            escapeMarkup: defaultEscapeMarkup,
            stripDiacritics: stripDiacritics
        }, "class": {
            "abstract": AbstractSelect2,
            "single": SingleSelect2,
            "multi": MultiSelect2
        }
    };

}(jQuery));

define("select2", function(){});

// plone integration for select2
//
// Author: Rok Garbas
// Contact: rok@garbas.si
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('mockup-patterns-select2',[
  'jquery',
  'mockup-patterns-base',
  'select2',
  'jquery.event.drag',
  'jquery.event.drop'
], function($, Base) {
  

  var Select2 = Base.extend({
    name: "select2",
    defaults: {
      separator: ","
    },
    initializeValues: function(){
      var self = this;
      // Init Selection ---------------------------------------------
      if (self.options.initialValues) {
        self.options.id = function(term) {
          return term.id;
        };
        self.options.initSelection = function ($el, callback) {
          var data = [],
              value = $el.val(),
              seldefaults = self.options.initialValues;

          // Create the initSelection value that contains the default selection,
          // but in a javascript object
          if (typeof(self.options.initialValues) === 'string' && self.options.initialValues !== '') {
            // if default selection value starts with a '{', then treat the value as
            // a JSON object that needs to be parsed
            if(self.options.initialValues[0] === '{') {
              seldefaults = JSON.parse(self.options.initialValues);
            }
            // otherwise, treat the value as a list, separated by the defaults.separator value of
            // strings in the format "id:text", and convert it to an object
            else {
              seldefaults = {};
              $(self.options.initialValues.split(self.options.separator)).each(function() {
                var selection = this.split(':');
                var id = $.trim(selection[0]);
                var text = $.trim(selection[1]);
                seldefaults[id] = text;
              });
            }
          }

          $(value.split(self.options.separator)).each(function() {
            var text = this;
            if (seldefaults[this]) {
              text = seldefaults[this];
            }
            data.push({id: this, text: text});
          });
          callback(data);
        };
      }
    },
    initializeTags: function(){
      var self = this;
      if (self.options.tags && typeof(self.options.tags) === 'string') {
        if (self.options.tags.substr(0, 1) === '[') {
          self.options.tags = JSON.parse(self.options.tags);
        } else {
          self.options.tags = self.options.tags.split(self.options.separator);
        }
      }

      if (self.options.tags && !self.options.allowNewItems) {
         self.options.data = $.map (self.options.tags, function (value, i) {
             return { id: value, text: value };
         });
         self.options.multiple = true;
         delete self.options.tags;
      }
    },
    initializeOrdering: function(){
      var self = this;
      if (self.options.orderable) {
        var formatSelection = function(data, $container){
          return data ? data.text : undefined;
        };
        if(self.options.formatSelection){
          formatSelection = self.options.formatSelection;
        }

        self.options.formatSelection = function(data, $container) {
          $container.parents('li')
            .drag("start", function(e, dd) {
              $(this).addClass('select2-choice-dragging');
              self.$el.select2("onSortStart");
              $.drop({
                tolerance: function(event, proxy, target) {
                  var test = event.pageY > (target.top + target.height / 2);
                  $.data(target.elem, "drop+reorder",
                         test ? "insertAfter" : "insertBefore" );
                  return this.contains(target, [event.pageX, event.pageY]);
                }
              });
              return $( this ).clone().
                addClass('dragging').
                css({opacity: 0.75, position: 'absolute'}).
                appendTo(document.body);
            })
            .drag(function(e, dd) {
              /*jshint eqeqeq:false */
              $( dd.proxy ).css({
                top: dd.offsetY,
                left: dd.offsetX
              });
              var drop = dd.drop[0],
                  method = $.data(drop || {}, "drop+reorder");

              /* XXX Cannot use triple equals here */
              if (drop && (drop != dd.current || method != dd.method)){
                $(this)[method](drop);
                dd.current = drop;
                dd.method = method;
                dd.update();
              }
            })
            .drag("end", function(e, dd) {
              $(this).removeClass('select2-choice-dragging');
              self.$el.select2("onSortEnd");
              $( dd.proxy ).remove();
            })
            .drop("init", function(e, dd ) {
              /*jshint eqeqeq:false */
              /* XXX Cannot use triple equals here */
              return (this == dd.drag) ? false: true;
            });
          return formatSelection(data, $container);
        };
      }
    },
    initializeSelect2: function(){
      var self = this;
      self.$el.select2(self.options);
      self.$select2 = self.$el.parent().find('.select2-container');
      self.$el.parent().off('close.modal.patterns');
      if(self.options.orderable){
        self.$select2.addClass('select2-orderable');
      }
    },
    init: function() {
      var self = this;

      self.options.allowNewItems = self.options.hasOwnProperty ('allowNewItems') ?
            JSON.parse(self.options.allowNewItems) : true;

      if (self.options.ajax || self.options.vocabularyUrl) {
        if(self.options.vocabularyUrl) {
          self.options.multiple = true;
          self.options.ajax = self.options.ajax || {};
          self.options.ajax.url = self.options.vocabularyUrl;
          // XXX removing the following function does'nt break tests. dead code?
          self.options.initSelection = function ($el, callback) {
            var data = [], value = $el.val();
            $(value.split(self.options.separator)).each(function () {
              data.push({id: this, text: this});
            });
            callback(data);
          };
        }

        var query_term = '';
        self.options.ajax = $.extend({
          quietMillis: 300,
          data: function (term, page) {
            query_term = term;
            return {
              query: term,
              page_limit: 10,
              page: page
            };
          },
          results: function (data, page) {
            var results = data.results;
            if (self.options.vocabularyUrl) {
              var data_ids = [];
              $.each(data.results, function(i, item) {
                data_ids.push(item.id);
              });
              results = [];

              var have_result = query_term === '' || $.inArray(query_term, data_ids) >= 0;
              if (self.options.allowNewItems && !have_result) {
                  results.push({id:query_term, text:query_term});
              }

              if (have_result || self.options.allowNewItems) {
                $.each(data.results, function(i, item) {
                    results.push(item);
                });
              }
            }
            return { results: results };
          }
        }, self.options.ajax);
      }

      self.initializeValues();
      self.initializeTags();
      self.initializeOrdering();
      self.initializeSelect2();
    }
  });

  return Select2;

});

// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/views/tags',[
  'jquery',
  'underscore',
  'backbone',
  'js/ui/views/popover',
  'mockup-patterns-select2'
], function($, _, Backbone, PopoverView, Select2) {
  

  var TagsView = PopoverView.extend({
    title: _.template('Add/Remove tags'),
    content: _.template(
      '<label>Tags to remove</label>' +
      '<select multiple class="toremove" style="width: 300px">' +
      '</select>' +
      '<label>Tags to add</label>' +
      '<input class="toadd" style="width:300px" />' +
      '<button class="btn btn-block btn-primary">Apply</button>'
    ),
    events: {
      'click button': 'applyButtonClicked'
    },
    initialize: function(){
      this.app = this.options.app;
      this.removeSelect2 = null;
      this.addSelect2 = null;
      PopoverView.prototype.initialize.call(this);
    },
    render: function(){
      PopoverView.prototype.render.call(this);
      this.$remove = this.$('.toremove');
      this.$add = this.$('.toadd');
      this.$remove.select2();
      this.addSelect2 = new Select2(this.$add, {
        multiple: true,
        vocabularyUrl: this.app.options.tagsVocabularyUrl
      });
      return this;
    },
    getSelect2Values: function($el){
      var values = [];
      _.each($el.select2('data'), function(item){
        values.push(item.id);
      });
      return values;
    },
    applyButtonClicked: function(e){
      this.app.defaultButtonClickEvent(this.triggerView, {
        remove: JSON.stringify(this.getSelect2Values(this.$remove)),
        add: JSON.stringify(this.getSelect2Values(this.$add))
      });
      this.hide();
    },
    toggle: function(button, e){
      PopoverView.prototype.toggle.apply(this, [button, e]);
      var self = this;
      if(!this.opened){
        return;
      }
      // clear out
      self.$remove.select2('destroy');
      self.$remove.empty();
      self.$add.select2('data', []);

      self.app.selectedCollection.each(function(item){
        if(!item.attributes.Subject){
          return;
        }
        _.each(item.attributes.Subject, function(tag){
          if(self.$remove.find('[value="' + tag + '"]').length === 0){
            self.$remove.append('<option value="' + tag + '">' + tag + '</option>');
          }
        });
      });
      self.$remove.select2();
    }
  });

  return TagsView;
});


/*!
 * pickadate.js v3.2.2, 2013/09/19
 * By Amsul, http://amsul.ca
 * Hosted on http://amsul.github.io/pickadate.js
 * Licensed under MIT
 */

/*jshint
   debug: true,
   devel: true,
   browser: true,
   asi: true,
   unused: true,
   boss: true,
   eqnull: true
 */

(function ( factory ) {

    // Register as an anonymous module.
    if ( typeof define === 'function' && define.amd )
        define( 'picker', ['jquery'], factory )

    // Or using browser globals.
    else this.Picker = factory( jQuery )

}(function( $ ) {

var $document = $( document )


/**
 * The picker constructor that creates a blank picker.
 */
function PickerConstructor( ELEMENT, NAME, COMPONENT, OPTIONS ) {

    // If there’s no element, return the picker constructor.
    if ( !ELEMENT ) return PickerConstructor


    var
        // The state of the picker.
        STATE = {
            id: Math.abs( ~~( Math.random() * 1e9 ) )
        },


        // Merge the defaults and options passed.
        SETTINGS = COMPONENT ? $.extend( true, {}, COMPONENT.defaults, OPTIONS ) : OPTIONS || {},


        // Merge the default classes with the settings classes.
        CLASSES = $.extend( {}, PickerConstructor.klasses(), SETTINGS.klass ),


        // The element node wrapper into a jQuery object.
        $ELEMENT = $( ELEMENT ),


        // Pseudo picker constructor.
        PickerInstance = function() {
            return this.start()
        },


        // The picker prototype.
        P = PickerInstance.prototype = {

            constructor: PickerInstance,

            $node: $ELEMENT,


            /**
             * Initialize everything
             */
            start: function() {

                // If it’s already started, do nothing.
                if ( STATE && STATE.start ) return P


                // Update the picker states.
                STATE.methods = {}
                STATE.start = true
                STATE.open = false
                STATE.type = ELEMENT.type


                // Confirm focus state, convert into text input to remove UA stylings,
                // and set as readonly to prevent keyboard popup.
                ELEMENT.autofocus = ELEMENT == document.activeElement
                ELEMENT.type = 'text'
                ELEMENT.readOnly = true


                // Create a new picker component with the settings.
                P.component = new COMPONENT( P, SETTINGS )


                // Create the picker root with a new wrapped holder and bind the events.
                P.$root = $( PickerConstructor._.node( 'div', createWrappedComponent(), CLASSES.picker ) ).
                    on({

                        // When something within the root is focused, stop from bubbling
                        // to the doc and remove the “focused” state from the root.
                        focusin: function( event ) {
                            P.$root.removeClass( CLASSES.focused )
                            event.stopPropagation()
                        },

                        // If the click is not on the root holder, stop it from bubbling to the doc.
                        'mousedown click': function( event ) {
                            if ( event.target != P.$root.children()[ 0 ] ) {
                                event.stopPropagation()
                            }
                        }
                    }).

                    // If there’s a click on an actionable element, carry out the actions.
                    on( 'click', '[data-pick], [data-nav], [data-clear]', function() {

                        var $target = $( this ),
                            targetData = $target.data(),
                            targetDisabled = $target.hasClass( CLASSES.navDisabled ) || $target.hasClass( CLASSES.disabled ),

                            // * For IE, non-focusable elements can be active elements as well
                            //   (http://stackoverflow.com/a/2684561).
                            activeElement = document.activeElement
                            activeElement = activeElement && ( activeElement.type || activeElement.href )

                        // If it’s disabled or nothing inside is actively focused, re-focus the element.
                        if ( targetDisabled || !$.contains( P.$root[0], activeElement ) ) {
                            ELEMENT.focus()
                        }

                        // If something is superficially changed, update the `highlight` based on the `nav`.
                        if ( targetData.nav && !targetDisabled ) {
                            P.set( 'highlight', P.component.item.highlight, { nav: targetData.nav } )
                        }

                        // If something is picked, set `select` then close with focus.
                        else if ( PickerConstructor._.isInteger( targetData.pick ) && !targetDisabled ) {
                            P.set( 'select', targetData.pick ).close( true )
                        }

                        // If a “clear” button is pressed, empty the values and close with focus.
                        else if ( targetData.clear ) {
                            P.clear().close( true )
                        }
                    }) //P.$root


                // If there’s a format for the hidden input element, create the element
                // using the name of the original input plus suffix. Otherwise set it to undefined.
                // If the element has a value, use either the `data-value` or `value`.
                if ( SETTINGS.formatSubmit ) {
                    P._hidden = $( '<input type=hidden name="' + ELEMENT.name + ( SETTINGS.hiddenSuffix || '_submit' ) + '"' + ( $ELEMENT.data( 'value' ) ? ' value="' + PickerConstructor._.trigger( P.component.formats.toString, P.component, [ SETTINGS.formatSubmit, P.component.item.select ] ) + '"' : '' ) + '>' )[ 0 ]
                }


                // Add the class and bind the events on the element.
                $ELEMENT.addClass( CLASSES.input ).

                    // On focus/click, open the picker and adjust the root “focused” state.
                    on( 'focus.P' + STATE.id + ' click.P' + STATE.id, focusToOpen ).

                    // If the value changes, update the hidden input with the correct format.
                    on( 'change.P' + STATE.id, function() {
                        if ( P._hidden ) {
                            P._hidden.value = ELEMENT.value ? PickerConstructor._.trigger( P.component.formats.toString, P.component, [ SETTINGS.formatSubmit, P.component.item.select ] ) : ''
                        }
                    }).

                    // Handle keyboard event based on the picker being opened or not.
                    on( 'keydown.P' + STATE.id, function( event ) {

                        var keycode = event.keyCode,

                            // Check if one of the delete keys was pressed.
                            isKeycodeDelete = /^(8|46)$/.test( keycode )

                        // For some reason IE clears the input value on “escape”.
                        if ( keycode == 27 ) {
                            P.close()
                            return false
                        }

                        // Check if `space` or `delete` was pressed or the picker is closed with a key movement.
                        if ( keycode == 32 || isKeycodeDelete || !STATE.open && P.component.key[ keycode ] ) {

                            // Prevent it from moving the page and bubbling to doc.
                            event.preventDefault()
                            event.stopPropagation()

                            // If `delete` was pressed, clear the values and close the picker.
                            // Otherwise open the picker.
                            if ( isKeycodeDelete ) { P.clear().close() }
                            else { P.open() }
                        }
                    }).

                    // If there’s a `data-value`, update the value of the element.
                    val( $ELEMENT.data( 'value' ) ? PickerConstructor._.trigger( P.component.formats.toString, P.component, [ SETTINGS.format, P.component.item.select ] ) : ELEMENT.value ).

                    // Insert the hidden input after the element.
                    after( P._hidden ).

                    // Store the picker data by component name.
                    data( NAME, P )


                // Insert the root as specified in the settings.
                if ( SETTINGS.container ) $( SETTINGS.container ).append( P.$root )
                else $ELEMENT.after( P.$root )


                // Bind the default component and settings events.
                P.on({
                    start: P.component.onStart,
                    render: P.component.onRender,
                    stop: P.component.onStop,
                    open: P.component.onOpen,
                    close: P.component.onClose,
                    set: P.component.onSet
                }).on({
                    start: SETTINGS.onStart,
                    render: SETTINGS.onRender,
                    stop: SETTINGS.onStop,
                    open: SETTINGS.onOpen,
                    close: SETTINGS.onClose,
                    set: SETTINGS.onSet
                })


                // If the element has autofocus, open the picker.
                if ( ELEMENT.autofocus ) {
                    P.open()
                }


                // Trigger queued the “start” and “render” events.
                return P.trigger( 'start' ).trigger( 'render' )
            }, //start


            /**
             * Render a new picker
             */
            render: function( entireComponent ) {

                // Insert a new component holder in the root or box.
                if ( entireComponent ) P.$root.html( createWrappedComponent() )
                else P.$root.find( '.' + CLASSES.box ).html( P.component.nodes( STATE.open ) )

                // Trigger the queued “render” events.
                return P.trigger( 'render' )
            }, //render


            /**
             * Destroy everything
             */
            stop: function() {

                // If it’s already stopped, do nothing.
                if ( !STATE.start ) return P

                // Then close the picker.
                P.close()

                // Remove the hidden field.
                if ( P._hidden ) {
                    P._hidden.parentNode.removeChild( P._hidden )
                }

                // Remove the root.
                P.$root.remove()

                // Remove the input class, unbind the events, and remove the stored data.
                $ELEMENT.removeClass( CLASSES.input ).off( '.P' + STATE.id ).removeData( NAME )

                // Restore the element state
                ELEMENT.type = STATE.type
                ELEMENT.readOnly = false

                // Trigger the queued “stop” events.
                P.trigger( 'stop' )

                // Reset the picker states.
                STATE.methods = {}
                STATE.start = false

                return P
            }, //stop


            /*
             * Open up the picker
             */
            open: function( dontGiveFocus ) {

                // If it’s already open, do nothing.
                if ( STATE.open ) return P

                // Add the “active” class.
                $ELEMENT.addClass( CLASSES.active )

                // Add the “opened” class to the picker root.
                P.$root.addClass( CLASSES.opened )

                // If we have to give focus, bind the element and doc events.
                if ( dontGiveFocus !== false ) {

                    // Set it as open.
                    STATE.open = true

                    // Pass focus to the element’s jQuery object.
                    $ELEMENT.focus()

                    // Bind the document events.
                    $document.on( 'click.P' + STATE.id + ' focusin.P' + STATE.id, function( event ) {

                        // If the target of the event is not the element, close the picker picker.
                        // * Don’t worry about clicks or focusins on the root because those don’t bubble up.
                        //   Also, for Firefox, a click on an `option` element bubbles up directly
                        //   to the doc. So make sure the target wasn't the doc.
                        if ( event.target != ELEMENT && event.target != document ) P.close()

                    }).on( 'keydown.P' + STATE.id, function( event ) {

                        var
                            // Get the keycode.
                            keycode = event.keyCode,

                            // Translate that to a selection change.
                            keycodeToMove = P.component.key[ keycode ],

                            // Grab the target.
                            target = event.target


                        // On escape, close the picker and give focus.
                        if ( keycode == 27 ) {
                            P.close( true )
                        }


                        // Check if there is a key movement or “enter” keypress on the element.
                        else if ( target == ELEMENT && ( keycodeToMove || keycode == 13 ) ) {

                            // Prevent the default action to stop page movement.
                            event.preventDefault()

                            // Trigger the key movement action.
                            if ( keycodeToMove ) {
                                PickerConstructor._.trigger( P.component.key.go, P, [ keycodeToMove ] )
                            }

                            // On “enter”, if the highlighted item isn’t disabled, set the value and close.
                            else if ( !P.$root.find( '.' + CLASSES.highlighted ).hasClass( CLASSES.disabled ) ) {
                                P.set( 'select', P.component.item.highlight ).close()
                            }
                        }


                        // If the target is within the root and “enter” is pressed,
                        // prevent the default action and trigger a click on the target instead.
                        else if ( $.contains( P.$root[0], target ) && keycode == 13 ) {
                            event.preventDefault()
                            target.click()
                        }
                    })
                }

                // Trigger the queued “open” events.
                return P.trigger( 'open' )
            }, //open


            /**
             * Close the picker
             */
            close: function( giveFocus ) {

                // If we need to give focus, do it before changing states.
                if ( giveFocus ) {
                    // ....ah yes! It would’ve been incomplete without a crazy workaround for IE :|
                    // The focus is triggered *after* the close has completed - causing it
                    // to open again. So unbind and rebind the event at the next tick.
                    $ELEMENT.off( 'focus.P' + STATE.id ).focus()
                    setTimeout( function() {
                        $ELEMENT.on( 'focus.P' + STATE.id, focusToOpen )
                    }, 0 )
                }

                // Remove the “active” class.
                $ELEMENT.removeClass( CLASSES.active )

                // Remove the “opened” and “focused” class from the picker root.
                P.$root.removeClass( CLASSES.opened + ' ' + CLASSES.focused )

                // If it’s open, update the state.
                if ( STATE.open ) {

                    // Set it as closed.
                    STATE.open = false

                    // Unbind the document events.
                    $document.off( '.P' + STATE.id )
                }

                // Trigger the queued “close” events.
                return P.trigger( 'close' )
            }, //close


            /**
             * Clear the values
             */
            clear: function() {
                return P.set( 'clear' )
            }, //clear


            /**
             * Set something
             */
            set: function( thing, value, options ) {

                var thingItem, thingValue,
                    thingIsObject = PickerConstructor._.isObject( thing ),
                    thingObject = thingIsObject ? thing : {}

                if ( thing ) {

                    // If the thing isn’t an object, make it one.
                    if ( !thingIsObject ) {
                        thingObject[ thing ] = value
                    }

                    // Go through the things of items to set.
                    for ( thingItem in thingObject ) {

                        // Grab the value of the thing.
                        thingValue = thingObject[ thingItem ]

                        // First, if the item exists and there’s a value, set it.
                        if ( P.component.item[ thingItem ] ) {
                            P.component.set( thingItem, thingValue, options || {} )
                        }

                        // Then, check to update the element value and broadcast a change.
                        if ( thingItem == 'select' || thingItem == 'clear' ) {
                            $ELEMENT.val( thingItem == 'clear' ? '' :
                                PickerConstructor._.trigger( P.component.formats.toString, P.component, [ SETTINGS.format, P.component.get( thingItem ) ] )
                            ).trigger( 'change' )
                        }
                    }

                    // Render a new picker.
                    P.render()
                }

                // Trigger queued “set” events and pass the `thingObject`.
                return P.trigger( 'set', thingObject )
            }, //set


            /**
             * Get something
             */
            get: function( thing, format ) {

                // Make sure there’s something to get.
                thing = thing || 'value'

                // If a picker state exists, return that.
                if ( STATE[ thing ] != null ) {
                    return STATE[ thing ]
                }

                // Return the value, if that.
                if ( thing == 'value' ) {
                    return ELEMENT.value
                }

                // Check if a component item exists, return that.
                if ( P.component.item[ thing ] ) {
                    if ( typeof format == 'string' ) {
                        return PickerConstructor._.trigger( P.component.formats.toString, P.component, [ format, P.component.get( thing ) ] )
                    }
                    return P.component.get( thing )
                }
            }, //get



            /**
             * Bind events on the things.
             */
            on: function( thing, method ) {

                var thingName, thingMethod,
                    thingIsObject = PickerConstructor._.isObject( thing ),
                    thingObject = thingIsObject ? thing : {}

                if ( thing ) {

                    // If the thing isn’t an object, make it one.
                    if ( !thingIsObject ) {
                        thingObject[ thing ] = method
                    }

                    // Go through the things to bind to.
                    for ( thingName in thingObject ) {

                        // Grab the method of the thing.
                        thingMethod = thingObject[ thingName ]

                        // Make sure the thing methods collection exists.
                        STATE.methods[ thingName ] = STATE.methods[ thingName ] || []

                        // Add the method to the relative method collection.
                        STATE.methods[ thingName ].push( thingMethod )
                    }
                }

                return P
            }, //on


            /**
             * Fire off method events.
             */
            trigger: function( name, data ) {
                var methodList = STATE.methods[ name ]
                if ( methodList ) {
                    methodList.map( function( method ) {
                        PickerConstructor._.trigger( method, P, [ data ] )
                    })
                }
                return P
            } //trigger
        } //PickerInstance.prototype


    /**
     * Wrap the picker holder components together.
     */
    function createWrappedComponent() {

        // Create a picker wrapper holder
        return PickerConstructor._.node( 'div',

            // Create a picker wrapper node
            PickerConstructor._.node( 'div',

                // Create a picker frame
                PickerConstructor._.node( 'div',

                    // Create a picker box node
                    PickerConstructor._.node( 'div',

                        // Create the components nodes.
                        P.component.nodes( STATE.open ),

                        // The picker box class
                        CLASSES.box
                    ),

                    // Picker wrap class
                    CLASSES.wrap
                ),

                // Picker frame class
                CLASSES.frame
            ),

            // Picker holder class
            CLASSES.holder
        ) //endreturn
    } //createWrappedComponent


    // Separated for IE
    function focusToOpen( event ) {

        // Stop the event from propagating to the doc.
        event.stopPropagation()

        // If it’s a focus event, add the “focused” class to the root.
        if ( event.type == 'focus' ) P.$root.addClass( CLASSES.focused )

        // And then finally open the picker.
        P.open()
    }


    // Return a new picker instance.
    return new PickerInstance()
} //PickerConstructor



/**
 * The default classes and prefix to use for the HTML classes.
 */
PickerConstructor.klasses = function( prefix ) {
    prefix = prefix || 'picker'
    return {

        picker: prefix,
        opened: prefix + '--opened',
        focused: prefix + '--focused',

        input: prefix + '__input',
        active: prefix + '__input--active',

        holder: prefix + '__holder',

        frame: prefix + '__frame',
        wrap: prefix + '__wrap',

        box: prefix + '__box'
    }
} //PickerConstructor.klasses



/**
 * PickerConstructor helper methods.
 */
PickerConstructor._ = {

    /**
     * Create a group of nodes. Expects:
     * `
        {
            min:    {Integer},
            max:    {Integer},
            i:      {Integer},
            node:   {String},
            item:   {Function}
        }
     * `
     */
    group: function( groupObject ) {

        var
            // Scope for the looped object
            loopObjectScope,

            // Create the nodes list
            nodesList = '',

            // The counter starts from the `min`
            counter = PickerConstructor._.trigger( groupObject.min, groupObject )


        // Loop from the `min` to `max`, incrementing by `i`
        for ( ; counter <= PickerConstructor._.trigger( groupObject.max, groupObject, [ counter ] ); counter += groupObject.i ) {

            // Trigger the `item` function within scope of the object
            loopObjectScope = PickerConstructor._.trigger( groupObject.item, groupObject, [ counter ] )

            // Splice the subgroup and create nodes out of the sub nodes
            nodesList += PickerConstructor._.node(
                groupObject.node,
                loopObjectScope[ 0 ],   // the node
                loopObjectScope[ 1 ],   // the classes
                loopObjectScope[ 2 ]    // the attributes
            )
        }

        // Return the list of nodes
        return nodesList
    }, //group


    /**
     * Create a dom node string
     */
    node: function( wrapper, item, klass, attribute ) {

        // If the item is false-y, just return an empty string
        if ( !item ) return ''

        // If the item is an array, do a join
        item = $.isArray( item ) ? item.join( '' ) : item

        // Check for the class
        klass = klass ? ' class="' + klass + '"' : ''

        // Check for any attributes
        attribute = attribute ? ' ' + attribute : ''

        // Return the wrapped item
        return '<' + wrapper + klass + attribute + '>' + item + '</' + wrapper + '>'
    }, //node


    /**
     * Lead numbers below 10 with a zero.
     */
    lead: function( number ) {
        return ( number < 10 ? '0': '' ) + number
    },


    /**
     * Trigger a function otherwise return the value.
     */
    trigger: function( callback, scope, args ) {
        return typeof callback == 'function' ? callback.apply( scope, args || [] ) : callback
    },


    /**
     * If the second character is a digit, length is 2 otherwise 1.
     */
    digits: function( string ) {
        return ( /\d/ ).test( string[ 1 ] ) ? 2 : 1
    },


    /**
     * Tell if something is an object.
     */
    isObject: function( value ) {
        return {}.toString.call( value ).indexOf( 'Object' ) > -1
    },


    /**
     * Tell if something is a date object.
     */
    isDate: function( value ) {
        return {}.toString.call( value ).indexOf( 'Date' ) > -1 && this.isInteger( value.getDate() )
    },


    /**
     * Tell if something is an integer.
     */
    isInteger: function( value ) {
        return {}.toString.call( value ).indexOf( 'Number' ) > -1 && value % 1 === 0
    }
} //PickerConstructor._



/**
 * Extend the picker with a component and defaults.
 */
PickerConstructor.extend = function( name, Component ) {

    // Extend jQuery.
    $.fn[ name ] = function( options, action ) {

        // Grab the component data.
        var componentData = this.data( name )

        // If the picker is requested, return the data object.
        if ( options == 'picker' ) {
            return componentData
        }

        // If the component data exists and `options` is a string, carry out the action.
        if ( componentData && typeof options == 'string' ) {
            PickerConstructor._.trigger( componentData[ options ], componentData, [ action ] )
            return this
        }

        // Otherwise go through each matched element and if the component
        // doesn’t exist, create a new picker using `this` element
        // and merging the defaults and options with a deep copy.
        return this.each( function() {
            var $this = $( this )
            if ( !$this.data( name ) ) {
                new PickerConstructor( this, name, Component, options )
            }
        })
    }

    // Set the defaults.
    $.fn[ name ].defaults = Component.defaults
} //PickerConstructor.extend



// Expose the picker constructor.
return PickerConstructor


}));





/*!
 * Date picker for pickadate.js v3.2.2
 * http://amsul.github.io/pickadate.js/date.htm
 */

/*jshint
   debug: true,
   devel: true,
   browser: true,
   asi: true,
   unused: true,
   boss: true
 */

(function ( factory ) {

    // Register as an anonymous module.
    if ( typeof define === 'function' && define.amd )
        define( 'picker.date',['picker'], factory )

    // Or using browser globals.
    else factory( Picker )

}(function( Picker ) {


/**
 * Globals and constants
 */
var DAYS_IN_WEEK = 7,
    WEEKS_IN_CALENDAR = 6



/**
 * The date picker constructor
 */
function DatePicker( picker, settings ) {

    var calendar = this,
        elementValue = picker.$node[ 0 ].value,
        elementDataValue = picker.$node.data( 'value' ),
        valueString = elementDataValue || elementValue,
        formatString = elementDataValue ? settings.formatSubmit : settings.format

    calendar.settings = settings

    // The queue of methods that will be used to build item objects.
    calendar.queue = {
        min: 'measure create',
        max: 'measure create',
        now: 'now create',
        select: 'parse create validate',
        highlight: 'navigate create validate',
        view: 'create validate viewset',
        disable: 'flipItem',
        enable: 'flipItem'
    }

    // The component's item object.
    calendar.item = {}

    calendar.item.disable = ( settings.disable || [] ).slice( 0 )
    calendar.item.enable = -(function( collectionDisabled ) {
        return collectionDisabled[ 0 ] === true ? collectionDisabled.shift() : -1
    })( calendar.item.disable )

    calendar.
        set( 'min', settings.min ).
        set( 'max', settings.max ).
        set( 'now' ).

        // Setting the `select` also sets the `highlight` and `view`.
        set( 'select',

            // Use the value provided or default to selecting “today”.
            valueString || calendar.item.now,
            {
                // Use the appropriate format.
                format: formatString,

                // Set user-provided month data as true when there is a
                // “mm” or “m” used in the relative format string.
                data: (function( formatArray ) {
                    return valueString && ( formatArray.indexOf( 'mm' ) > -1 || formatArray.indexOf( 'm' ) > -1 )
                })( calendar.formats.toArray( formatString ) )
            }
        )


    // The keycode to movement mapping.
    calendar.key = {
        40: 7, // Down
        38: -7, // Up
        39: 1, // Right
        37: -1, // Left
        go: function( timeChange ) {
            calendar.set( 'highlight', [ calendar.item.highlight.year, calendar.item.highlight.month, calendar.item.highlight.date + timeChange ], { interval: timeChange } )
            this.render()
        }
    }


    // Bind some picker events.
    picker.
        on( 'render', function() {
            picker.$root.find( '.' + settings.klass.selectMonth ).on( 'change', function() {
                picker.set( 'highlight', [ picker.get( 'view' ).year, this.value, picker.get( 'highlight' ).date ] )
                picker.$root.find( '.' + settings.klass.selectMonth ).focus()
            })
            picker.$root.find( '.' + settings.klass.selectYear ).on( 'change', function() {
                picker.set( 'highlight', [ this.value, picker.get( 'view' ).month, picker.get( 'highlight' ).date ] )
                picker.$root.find( '.' + settings.klass.selectYear ).focus()
            })
        }).
        on( 'open', function() {
            picker.$root.find( 'button, select' ).attr( 'disabled', false )
        }).
        on( 'close', function() {
            picker.$root.find( 'button, select' ).attr( 'disabled', true )
        })

} //DatePicker


/**
 * Set a datepicker item object.
 */
DatePicker.prototype.set = function( type, value, options ) {

    var calendar = this

    // Go through the queue of methods, and invoke the function. Update this
    // as the time unit, and set the final resultant as this item type.
    // * In the case of `enable`, keep the queue but set `disable` instead.
    //   And in the case of `flip`, keep the queue but set `enable` instead.
    calendar.item[ ( type == 'enable' ? 'disable' : type == 'flip' ? 'enable' : type ) ] = calendar.queue[ type ].split( ' ' ).map( function( method ) {
        return value = calendar[ method ]( type, value, options )
    }).pop()

    // Check if we need to cascade through more updates.
    if ( type == 'select' ) {
        calendar.set( 'highlight', calendar.item.select, options )
    }
    else if ( type == 'highlight' ) {
        calendar.set( 'view', calendar.item.highlight, options )
    }
    else if ( ( type == 'flip' || type == 'min' || type == 'max' || type == 'disable' || type == 'enable' ) && calendar.item.select && calendar.item.highlight ) {
        calendar.
            set( 'select', calendar.item.select, options ).
            set( 'highlight', calendar.item.highlight, options )
    }

    return calendar
} //DatePicker.prototype.set


/**
 * Get a datepicker item object.
 */
DatePicker.prototype.get = function( type ) {
    return this.item[ type ]
} //DatePicker.prototype.get


/**
 * Create a picker date object.
 */
DatePicker.prototype.create = function( type, value, options ) {

    var isInfiniteValue,
        calendar = this

    // If there’s no value, use the type as the value.
    value = value === undefined ? type : value


    // If it’s infinity, update the value.
    if ( value == -Infinity || value == Infinity ) {
        isInfiniteValue = value
    }

    // If it’s an object, use the native date object.
    else if ( Picker._.isObject( value ) && Picker._.isInteger( value.pick ) ) {
        value = value.obj
    }

    // If it’s an array, convert it into a date and make sure
    // that it’s a valid date – otherwise default to today.
    else if ( $.isArray( value ) ) {
        value = new Date( value[ 0 ], value[ 1 ], value[ 2 ] )
        value = Picker._.isDate( value ) ? value : calendar.create().obj
    }

    // If it’s a number or date object, make a normalized date.
    else if ( Picker._.isInteger( value ) || Picker._.isDate( value ) ) {
        value = calendar.normalize( new Date( value ), options )
    }

    // If it’s a literal true or any other case, set it to now.
    else /*if ( value === true )*/ {
        value = calendar.now( type, value, options )
    }

    // Return the compiled object.
    return {
        year: isInfiniteValue || value.getFullYear(),
        month: isInfiniteValue || value.getMonth(),
        date: isInfiniteValue || value.getDate(),
        day: isInfiniteValue || value.getDay(),
        obj: isInfiniteValue || value,
        pick: isInfiniteValue || value.getTime()
    }
} //DatePicker.prototype.create


/**
 * Get the date today.
 */
DatePicker.prototype.now = function( type, value, options ) {
    value = new Date()
    if ( options && options.rel ) {
        value.setDate( value.getDate() + options.rel )
    }
    return this.normalize( value, options )
} //DatePicker.prototype.now


/**
 * Navigate to next/prev month.
 */
DatePicker.prototype.navigate = function( type, value, options ) {

    if ( Picker._.isObject( value ) ) {

        var targetDateObject = new Date( value.year, value.month + ( options && options.nav ? options.nav : 0 ), 1 ),
            year = targetDateObject.getFullYear(),
            month = targetDateObject.getMonth(),
            date = value.date

        // Make sure the date is valid and if the month we’re going to doesn’t have enough
        // days, keep decreasing the date until we reach the month’s last date.
        while ( Picker._.isDate( targetDateObject ) && new Date( year, month, date ).getMonth() !== month ) {
            date -= 1
        }

        value = [ year, month, date ]
    }

    return value
} //DatePicker.prototype.navigate


/**
 * Normalize a date by setting the hours to midnight.
 */
DatePicker.prototype.normalize = function( value/*, options*/ ) {
    value.setHours( 0, 0, 0, 0 )
    return value
}


/**
 * Measure the range of dates.
 */
DatePicker.prototype.measure = function( type, value/*, options*/ ) {

    var calendar = this

    // If it's anything false-y, remove the limits.
    if ( !value ) {
        value = type == 'min' ? -Infinity : Infinity
    }

    // If it's an integer, get a date relative to today.
    else if ( Picker._.isInteger( value ) ) {
        value = calendar.now( type, value, { rel: value } )
    }

    return value
} ///DatePicker.prototype.measure


/**
 * Create a viewset object based on navigation.
 */
DatePicker.prototype.viewset = function( type, dateObject/*, options*/ ) {
    return this.create([ dateObject.year, dateObject.month, 1 ])
}


/**
 * Validate a date as enabled and shift if needed.
 */
DatePicker.prototype.validate = function( type, dateObject, options ) {

    var calendar = this,

        // Keep a reference to the original date.
        originalDateObject = dateObject,

        // Make sure we have an interval.
        interval = options && options.interval ? options.interval : 1,

        // Check if the calendar enabled dates are inverted.
        isInverted = calendar.item.enable === -1,

        // Check if we have any enabled dates after/before now.
        hasEnabledBeforeTarget, hasEnabledAfterTarget,

        // The min & max limits.
        minLimitObject = calendar.item.min,
        maxLimitObject = calendar.item.max,

        // Check if we’ve reached the limit during shifting.
        reachedMin, reachedMax,

        // Check if the calendar is inverted and at least one weekday is enabled.
        hasEnabledWeekdays = isInverted && calendar.item.disable.filter( function( value ) {

            // If there’s a date, check where it is relative to the target.
            if ( $.isArray( value ) ) {
                var dateTime = calendar.create( value ).pick
                if ( dateTime < dateObject.pick ) hasEnabledBeforeTarget = true
                else if ( dateTime > dateObject.pick ) hasEnabledAfterTarget = true
            }

            // Return only integers for enabled weekdays.
            return Picker._.isInteger( value )
        }).length



    // Cases to validate for:
    // [1] Not inverted and date disabled.
    // [2] Inverted and some dates enabled.
    // [3] Out of range.
    //
    // Cases to **not** validate for:
    // • Navigating months.
    // • Not inverted and date enabled.
    // • Inverted and all dates disabled.
    // • ..and anything else.
    if ( !options.nav ) if (
        /* 1 */ ( !isInverted && calendar.disabled( dateObject ) ) ||
        /* 2 */ ( isInverted && calendar.disabled( dateObject ) && ( hasEnabledWeekdays || hasEnabledBeforeTarget || hasEnabledAfterTarget ) ) ||
        /* 3 */ ( dateObject.pick <= minLimitObject.pick || dateObject.pick >= maxLimitObject.pick )
    ) {


        // When inverted, flip the direction if there aren’t any enabled weekdays
        // and there are no enabled dates in the direction of the interval.
        if ( isInverted && !hasEnabledWeekdays && ( ( !hasEnabledAfterTarget && interval > 0 ) || ( !hasEnabledBeforeTarget && interval < 0 ) ) ) {
            interval *= -1
        }


        // Keep looping until we reach an enabled date.
        while ( calendar.disabled( dateObject ) ) {


            // If we’ve looped into the next/prev month, return to the original date and flatten the interval.
            if ( Math.abs( interval ) > 1 && ( dateObject.month < originalDateObject.month || dateObject.month > originalDateObject.month ) ) {
                dateObject = originalDateObject
                interval = Math.abs( interval ) / interval
            }


            // If we’ve reached the min/max limit, reverse the direction and flatten the interval.
            if ( dateObject.pick <= minLimitObject.pick ) {
                reachedMin = true
                interval = 1
            }
            else if ( dateObject.pick >= maxLimitObject.pick ) {
                reachedMax = true
                interval = -1
            }


            // If we’ve reached both limits, just break out of the loop.
            if ( reachedMin && reachedMax ) {
                break
            }


            // Finally, create the shifted date using the interval and keep looping.
            dateObject = calendar.create([ dateObject.year, dateObject.month, dateObject.date + interval ])
        }

    } //endif


    // Return the date object settled on.
    return dateObject
} //DatePicker.prototype.validate


/**
 * Check if an object is disabled.
 */
DatePicker.prototype.disabled = function( dateObject ) {

    var calendar = this,

        // Filter through the disabled dates to check if this is one.
        isDisabledDate = calendar.item.disable.filter( function( dateToDisable ) {

            // If the date is a number, match the weekday with 0index and `firstDay` check.
            if ( Picker._.isInteger( dateToDisable ) ) {
                return dateObject.day === ( calendar.settings.firstDay ? dateToDisable : dateToDisable - 1 ) % 7
            }

            // If it's an array, create the object and match the exact date.
            if ( $.isArray( dateToDisable ) ) {
                return dateObject.pick === calendar.create( dateToDisable ).pick
            }
        }).length


    // It’s disabled beyond the min/max limits. If within the limits, check the
    // calendar “enabled” flag is flipped and respectively flip the condition.
    return dateObject.pick < calendar.item.min.pick ||
        dateObject.pick > calendar.item.max.pick ||
        calendar.item.enable === -1 ? !isDisabledDate : isDisabledDate
} //DatePicker.prototype.disabled


/**
 * Parse a string into a usable type.
 */
DatePicker.prototype.parse = function( type, value, options ) {

    var calendar = this,
        parsingObject = {}

    if ( !value || Picker._.isInteger( value ) || $.isArray( value ) || Picker._.isDate( value ) || Picker._.isObject( value ) && Picker._.isInteger( value.pick ) ) {
        return value
    }

    // We need a `.format` to parse the value.
    if ( !( options && options.format ) ) {
        // should probably default to the default format.
        throw "Need a formatting option to parse this.."
    }

    // Convert the format into an array and then map through it.
    calendar.formats.toArray( options.format ).map( function( label ) {

        var
            // Grab the formatting label.
            formattingLabel = calendar.formats[ label ],

            // The format length is from the formatting label function or the
            // label length without the escaping exclamation (!) mark.
            formatLength = formattingLabel ? Picker._.trigger( formattingLabel, calendar, [ value, parsingObject ] ) : label.replace( /^!/, '' ).length

        // If there's a format label, split the value up to the format length.
        // Then add it to the parsing object with appropriate label.
        if ( formattingLabel ) {
            parsingObject[ label ] = value.substr( 0, formatLength )
        }

        // Update the value as the substring from format length to end.
        value = value.substr( formatLength )
    })

    // If it’s parsing a user provided month value, compensate for month 0index.
    return [ parsingObject.yyyy || parsingObject.yy, +( parsingObject.mm || parsingObject.m ) - ( options.data ?  1 : 0 ), parsingObject.dd || parsingObject.d ]
} //DatePicker.prototype.parse


/**
 * Various formats to display the object in.
 */
DatePicker.prototype.formats = (function() {

    // Return the length of the first word in a collection.
    function getWordLengthFromCollection( string, collection, dateObject ) {

        // Grab the first word from the string.
        var word = string.match( /\w+/ )[ 0 ]

        // If there's no month index, add it to the date object
        if ( !dateObject.mm && !dateObject.m ) {
            dateObject.m = collection.indexOf( word )
        }

        // Return the length of the word.
        return word.length
    }

    // Get the length of the first word in a string.
    function getFirstWordLength( string ) {
        return string.match( /\w+/ )[ 0 ].length
    }

    return {

        d: function( string, dateObject ) {

            // If there's string, then get the digits length.
            // Otherwise return the selected date.
            return string ? Picker._.digits( string ) : dateObject.date
        },
        dd: function( string, dateObject ) {

            // If there's a string, then the length is always 2.
            // Otherwise return the selected date with a leading zero.
            return string ? 2 : Picker._.lead( dateObject.date )
        },
        ddd: function( string, dateObject ) {

            // If there's a string, then get the length of the first word.
            // Otherwise return the short selected weekday.
            return string ? getFirstWordLength( string ) : this.settings.weekdaysShort[ dateObject.day ]
        },
        dddd: function( string, dateObject ) {

            // If there's a string, then get the length of the first word.
            // Otherwise return the full selected weekday.
            return string ? getFirstWordLength( string ) : this.settings.weekdaysFull[ dateObject.day ]
        },
        m: function( string, dateObject ) {

            // If there's a string, then get the length of the digits
            // Otherwise return the selected month with 0index compensation.
            return string ? Picker._.digits( string ) : dateObject.month + 1
        },
        mm: function( string, dateObject ) {

            // If there's a string, then the length is always 2.
            // Otherwise return the selected month with 0index and leading zero.
            return string ? 2 : Picker._.lead( dateObject.month + 1 )
        },
        mmm: function( string, dateObject ) {

            var collection = this.settings.monthsShort

            // If there's a string, get length of the relevant month from the short
            // months collection. Otherwise return the selected month from that collection.
            return string ? getWordLengthFromCollection( string, collection, dateObject ) : collection[ dateObject.month ]
        },
        mmmm: function( string, dateObject ) {

            var collection = this.settings.monthsFull

            // If there's a string, get length of the relevant month from the full
            // months collection. Otherwise return the selected month from that collection.
            return string ? getWordLengthFromCollection( string, collection, dateObject ) : collection[ dateObject.month ]
        },
        yy: function( string, dateObject ) {

            // If there's a string, then the length is always 2.
            // Otherwise return the selected year by slicing out the first 2 digits.
            return string ? 2 : ( '' + dateObject.year ).slice( 2 )
        },
        yyyy: function( string, dateObject ) {

            // If there's a string, then the length is always 4.
            // Otherwise return the selected year.
            return string ? 4 : dateObject.year
        },

        // Create an array by splitting the formatting string passed.
        toArray: function( formatString ) { return formatString.split( /(d{1,4}|m{1,4}|y{4}|yy|!.)/g ) },

        // Format an object into a string using the formatting options.
        toString: function ( formatString, itemObject ) {
            var calendar = this
            return calendar.formats.toArray( formatString ).map( function( label ) {
                return Picker._.trigger( calendar.formats[ label ], calendar, [ 0, itemObject ] ) || label.replace( /^!/, '' )
            }).join( '' )
        }
    }
})() //DatePicker.prototype.formats


/**
 * Flip an item as enabled or disabled.
 */
DatePicker.prototype.flipItem = function( type, value/*, options*/ ) {

    var calendar = this,
        collection = calendar.item.disable,
        isInverted = calendar.item.enable === -1

    // Flip the enabled and disabled dates.
    if ( value == 'flip' ) {
        calendar.item.enable = isInverted ? 1 : -1
    }

    // Check if we have to add/remove from collection.
    else if ( !isInverted && type == 'enable' || isInverted && type == 'disable' ) {
        collection = calendar.removeDisabled( collection, value )
    }
    else if ( !isInverted && type == 'disable' || isInverted && type == 'enable' ) {
        collection = calendar.addDisabled( collection, value )
    }

    return collection
} //DatePicker.prototype.flipItem


/**
 * Add an item to the disabled collection.
 */
DatePicker.prototype.addDisabled = function( collection, item ) {
    var calendar = this
    item.map( function( timeUnit ) {
        if ( !calendar.filterDisabled( collection, timeUnit ).length ) {
            collection.push( timeUnit )
        }
    })
    return collection
} //DatePicker.prototype.addDisabled


/**
 * Remove an item from the disabled collection.
 */
DatePicker.prototype.removeDisabled = function( collection, item ) {
    var calendar = this
    item.map( function( timeUnit ) {
        collection = calendar.filterDisabled( collection, timeUnit, 1 )
    })
    return collection
} //DatePicker.prototype.removeDisabled


/**
 * Filter through the disabled collection to find a time unit.
 */
DatePicker.prototype.filterDisabled = function( collection, timeUnit, isRemoving ) {
    var timeIsArray = $.isArray( timeUnit )
    return collection.filter( function( disabledTimeUnit ) {
        var isMatch = !timeIsArray && timeUnit === disabledTimeUnit ||
            timeIsArray && $.isArray( disabledTimeUnit ) && timeUnit.toString() === disabledTimeUnit.toString()
        return isRemoving ? !isMatch : isMatch
    })
} //DatePicker.prototype.filterDisabled


/**
 * Create a string for the nodes in the picker.
 */
DatePicker.prototype.nodes = function( isOpen ) {

    var
        calendar = this,
        settings = calendar.settings,
        nowObject = calendar.item.now,
        selectedObject = calendar.item.select,
        highlightedObject = calendar.item.highlight,
        viewsetObject = calendar.item.view,
        disabledCollection = calendar.item.disable,
        minLimitObject = calendar.item.min,
        maxLimitObject = calendar.item.max,


        // Create the calendar table head using a copy of weekday labels collection.
        // * We do a copy so we don't mutate the original array.
        tableHead = (function( collection ) {

            // If the first day should be Monday, move Sunday to the end.
            if ( settings.firstDay ) {
                collection.push( collection.shift() )
            }

            // Create and return the table head group.
            return Picker._.node(
                'thead',
                Picker._.group({
                    min: 0,
                    max: DAYS_IN_WEEK - 1,
                    i: 1,
                    node: 'th',
                    item: function( counter ) {
                        return [
                            collection[ counter ],
                            settings.klass.weekdays
                        ]
                    }
                })
            ) //endreturn
        })( ( settings.showWeekdaysFull ? settings.weekdaysFull : settings.weekdaysShort ).slice( 0 ) ), //tableHead


        // Create the nav for next/prev month.
        createMonthNav = function( next ) {

            // Otherwise, return the created month tag.
            return Picker._.node(
                'div',
                ' ',
                settings.klass[ 'nav' + ( next ? 'Next' : 'Prev' ) ] + (

                    // If the focused month is outside the range, disabled the button.
                    ( next && viewsetObject.year >= maxLimitObject.year && viewsetObject.month >= maxLimitObject.month ) ||
                    ( !next && viewsetObject.year <= minLimitObject.year && viewsetObject.month <= minLimitObject.month ) ?
                    ' ' + settings.klass.navDisabled : ''
                ),
                'data-nav=' + ( next || -1 )
            ) //endreturn
        }, //createMonthNav


        // Create the month label.
        createMonthLabel = function( monthsCollection ) {

            // If there are months to select, add a dropdown menu.
            if ( settings.selectMonths ) {

                return Picker._.node( 'select', Picker._.group({
                    min: 0,
                    max: 11,
                    i: 1,
                    node: 'option',
                    item: function( loopedMonth ) {

                        return [

                            // The looped month and no classes.
                            monthsCollection[ loopedMonth ], 0,

                            // Set the value and selected index.
                            'value=' + loopedMonth +
                            ( viewsetObject.month == loopedMonth ? ' selected' : '' ) +
                            (
                                (
                                    ( viewsetObject.year == minLimitObject.year && loopedMonth < minLimitObject.month ) ||
                                    ( viewsetObject.year == maxLimitObject.year && loopedMonth > maxLimitObject.month )
                                ) ?
                                ' disabled' : ''
                            )
                        ]
                    }
                }), settings.klass.selectMonth, isOpen ? '' : 'disabled' )
            }

            // If there's a need for a month selector
            return Picker._.node( 'div', monthsCollection[ viewsetObject.month ], settings.klass.month )
        }, //createMonthLabel


        // Create the year label.
        createYearLabel = function() {

            var focusedYear = viewsetObject.year,

            // If years selector is set to a literal "true", set it to 5. Otherwise
            // divide in half to get half before and half after focused year.
            numberYears = settings.selectYears === true ? 5 : ~~( settings.selectYears / 2 )

            // If there are years to select, add a dropdown menu.
            if ( numberYears ) {

                var
                    minYear = minLimitObject.year,
                    maxYear = maxLimitObject.year,
                    lowestYear = focusedYear - numberYears,
                    highestYear = focusedYear + numberYears

                // If the min year is greater than the lowest year, increase the highest year
                // by the difference and set the lowest year to the min year.
                if ( minYear > lowestYear ) {
                    highestYear += minYear - lowestYear
                    lowestYear = minYear
                }

                // If the max year is less than the highest year, decrease the lowest year
                // by the lower of the two: available and needed years. Then set the
                // highest year to the max year.
                if ( maxYear < highestYear ) {

                    var availableYears = lowestYear - minYear,
                        neededYears = highestYear - maxYear

                    lowestYear -= availableYears > neededYears ? neededYears : availableYears
                    highestYear = maxYear
                }

                return Picker._.node( 'select', Picker._.group({
                    min: lowestYear,
                    max: highestYear,
                    i: 1,
                    node: 'option',
                    item: function( loopedYear ) {
                        return [

                            // The looped year and no classes.
                            loopedYear, 0,

                            // Set the value and selected index.
                            'value=' + loopedYear + ( focusedYear == loopedYear ? ' selected' : '' )
                        ]
                    }
                }), settings.klass.selectYear, isOpen ? '' : 'disabled' )
            }

            // Otherwise just return the year focused
            return Picker._.node( 'div', focusedYear, settings.klass.year )
        } //createYearLabel


    // Create and return the entire calendar.
    return Picker._.node(
        'div',
        createMonthNav() + createMonthNav( 1 ) +
        createMonthLabel( settings.showMonthsShort ? settings.monthsShort : settings.monthsFull ) +
        createYearLabel(),
        settings.klass.header
    ) + Picker._.node(
        'table',
        tableHead +
        Picker._.node(
            'tbody',
            Picker._.group({
                min: 0,
                max: WEEKS_IN_CALENDAR - 1,
                i: 1,
                node: 'tr',
                item: function( rowCounter ) {

                    // If Monday is the first day and the month starts on Sunday, shift the date back a week.
                    var shiftDateBy = settings.firstDay && calendar.create([ viewsetObject.year, viewsetObject.month, 1 ]).day === 0 ? -7 : 0

                    return [
                        Picker._.group({
                            min: DAYS_IN_WEEK * rowCounter - viewsetObject.day + shiftDateBy + 1, // Add 1 for weekday 0index
                            max: function() {
                                return this.min + DAYS_IN_WEEK - 1
                            },
                            i: 1,
                            node: 'td',
                            item: function( targetDate ) {

                                // Convert the time date from a relative date to a target date.
                                targetDate = calendar.create([ viewsetObject.year, viewsetObject.month, targetDate + ( settings.firstDay ? 1 : 0 ) ])

                                return [
                                    Picker._.node(
                                        'div',
                                        targetDate.date,
                                        (function( klasses ) {

                                            // Add the `infocus` or `outfocus` classes based on month in view.
                                            klasses.push( viewsetObject.month == targetDate.month ? settings.klass.infocus : settings.klass.outfocus )

                                            // Add the `today` class if needed.
                                            if ( nowObject.pick == targetDate.pick ) {
                                                klasses.push( settings.klass.now )
                                            }

                                            // Add the `selected` class if something's selected and the time matches.
                                            if ( selectedObject && selectedObject.pick == targetDate.pick ) {
                                                klasses.push( settings.klass.selected )
                                            }

                                            // Add the `highlighted` class if something's highlighted and the time matches.
                                            if ( highlightedObject && highlightedObject.pick == targetDate.pick ) {
                                                klasses.push( settings.klass.highlighted )
                                            }

                                            // Add the `disabled` class if something's disabled and the object matches.
                                            if ( disabledCollection && calendar.disabled( targetDate ) || targetDate.pick < minLimitObject.pick || targetDate.pick > maxLimitObject.pick ) {
                                                klasses.push( settings.klass.disabled )
                                            }

                                            return klasses.join( ' ' )
                                        })([ settings.klass.day ]),
                                        'data-pick=' + targetDate.pick
                                    )
                                ] //endreturn
                            }
                        })
                    ] //endreturn
                }
            })
        ),
        settings.klass.table
    ) +

    Picker._.node(
        'div',
        Picker._.node( 'button', settings.today, settings.klass.buttonToday, 'data-pick=' + nowObject.pick + ( isOpen ? '' : ' disabled' ) ) +
        Picker._.node( 'button', settings.clear, settings.klass.buttonClear, 'data-clear=1' + ( isOpen ? '' : ' disabled' ) ),
        settings.klass.footer
    ) //endreturn
} //DatePicker.prototype.nodes




/**
 * The date picker defaults.
 */
DatePicker.defaults = (function( prefix ) {

    return {

        // Months and weekdays
        monthsFull: [ 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December' ],
        monthsShort: [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ],
        weekdaysFull: [ 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ],
        weekdaysShort: [ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ],

        // Today and clear
        today: 'Today',
        clear: 'Clear',

        // The format to show on the `input` element
        format: 'd mmmm, yyyy',

        // Classes
        klass: {

            table: prefix + 'table',

            header: prefix + 'header',

            navPrev: prefix + 'nav--prev',
            navNext: prefix + 'nav--next',
            navDisabled: prefix + 'nav--disabled',

            month: prefix + 'month',
            year: prefix + 'year',

            selectMonth: prefix + 'select--month',
            selectYear: prefix + 'select--year',

            weekdays: prefix + 'weekday',

            day: prefix + 'day',
            disabled: prefix + 'day--disabled',
            selected: prefix + 'day--selected',
            highlighted: prefix + 'day--highlighted',
            now: prefix + 'day--today',
            infocus: prefix + 'day--infocus',
            outfocus: prefix + 'day--outfocus',

            footer: prefix + 'footer',

            buttonClear: prefix + 'button--clear',
            buttonToday: prefix + 'button--today'
        }
    }
})( Picker.klasses().picker + '__' )





/**
 * Extend the picker to add the date picker.
 */
Picker.extend( 'pickadate', DatePicker )


}));





/*!
 * Time picker for pickadate.js v3.2.2
 * http://amsul.github.io/pickadate.js/time.htm
 */

/*jshint
   debug: true,
   devel: true,
   browser: true,
   asi: true,
   unused: true,
   boss: true
 */

(function ( factory ) {

    // Register as an anonymous module.
    if ( typeof define === 'function' && define.amd )
        define( 'picker.time',['picker'], factory )

    // Or using browser globals.
    else factory( Picker )

}(function( Picker ) {


/**
 * Globals and constants
 */
var HOURS_IN_DAY = 24,
    MINUTES_IN_HOUR = 60,
    HOURS_TO_NOON = 12,
    MINUTES_IN_DAY = HOURS_IN_DAY * MINUTES_IN_HOUR



/**
 * The time picker constructor
 */
function TimePicker( picker, settings ) {

    var clock = this,
        elementDataValue = picker.$node.data( 'value' )

    clock.settings = settings

    // The queue of methods that will be used to build item objects.
    clock.queue = {
        interval: 'i',
        min: 'measure create',
        max: 'measure create',
        now: 'now create',
        select: 'parse create validate',
        highlight: 'create validate',
        view: 'create validate',
        disable: 'flipItem',
        enable: 'flipItem'
    }

    // The component's item object.
    clock.item = {}

    clock.item.interval = settings.interval || 30
    clock.item.disable = ( settings.disable || [] ).slice( 0 )
    clock.item.enable = -(function( collectionDisabled ) {
        return collectionDisabled[ 0 ] === true ? collectionDisabled.shift() : -1
    })( clock.item.disable )

    clock.
        set( 'min', settings.min ).
        set( 'max', settings.max ).
        set( 'now' ).

        // Setting the `select` also sets the `highlight` and `view`.
        set( 'select',

            // If there's a `value` or `data-value`, use that with formatting.
            // Otherwise default to the minimum selectable time.
            elementDataValue || picker.$node[ 0 ].value || clock.item.min,

            // Use the relevant format.
            { format: elementDataValue ? settings.formatSubmit : settings.format }
        )

    // The keycode to movement mapping.
    clock.key = {
        40: 1, // Down
        38: -1, // Up
        39: 1, // Right
        37: -1, // Left
        go: function( timeChange ) {
            clock.set( 'highlight', clock.item.highlight.pick + timeChange * clock.item.interval, { interval: timeChange * clock.item.interval } )
            this.render()
        }
    }


    // Bind some picker events.
    picker.
        on( 'render', function() {
            var $pickerHolder = picker.$root.children(),
                $viewset = $pickerHolder.find( '.' + settings.klass.viewset )
            if ( $viewset.length ) {
                $pickerHolder[ 0 ].scrollTop = ~~( $viewset.position().top - ( $viewset[ 0 ].clientHeight * 2 ) )
            }
            else {
                console.warn( 'Nothing to viewset with', clock.item.view )
            }
        }).
        on( 'open', function() {
            picker.$root.find( 'button' ).attr( 'disable', false )
        }).
        on( 'close', function() {
            picker.$root.find( 'button' ).attr( 'disable', true )
        })

} //TimePicker


/**
 * Set a timepicker item object.
 */
TimePicker.prototype.set = function( type, value, options ) {

    var clock = this

    // Go through the queue of methods, and invoke the function. Update this
    // as the time unit, and set the final resultant as this item type.
    // * In the case of `enable`, keep the queue but set `disable` instead.
    //   And in the case of `flip`, keep the queue but set `enable` instead.
    clock.item[ ( type == 'enable' ? 'disable' : type == 'flip' ? 'enable' : type ) ] = clock.queue[ type ].split( ' ' ).map( function( method ) {
        return value = clock[ method ]( type, value, options )
    }).pop()

    // Check if we need to cascade through more updates.
    if ( type == 'select' ) {
        clock.set( 'highlight', clock.item.select, options )
    }
    else if ( type == 'highlight' ) {
        clock.set( 'view', clock.item.highlight, options )
    }
    else if ( type == 'interval' ) {
        clock.
            set( 'min', clock.item.min, options ).
            set( 'max', clock.item.max, options )
    }
    else if ( ( type == 'flip' || type == 'min' || type == 'max' || type == 'disable' || type == 'enable' ) && clock.item.select && clock.item.highlight ) {
        if ( type == 'min' ) {
            clock.set( 'max', clock.item.max, options )
        }
        clock.
            set( 'select', clock.item.select, options ).
            set( 'highlight', clock.item.highlight, options )
    }

    return clock
} //TimePicker.prototype.set


/**
 * Get a timepicker item object.
 */
TimePicker.prototype.get = function( type ) {
    return this.item[ type ]
} //TimePicker.prototype.get


/**
 * Create a picker time object.
 */
TimePicker.prototype.create = function( type, value, options ) {

    var clock = this

    // If there's no value, use the type as the value.
    value = value === undefined ? type : value

    // If it's an object, use the "pick" value.
    if ( Picker._.isObject( value ) && Picker._.isInteger( value.pick ) ) {
        value = value.pick
    }

    // If it's an array, convert it into minutes.
    else if ( $.isArray( value ) ) {
        value = +value[ 0 ] * MINUTES_IN_HOUR + (+value[ 1 ])
    }

    // If no valid value is passed, set it to "now".
    else if ( !Picker._.isInteger( value ) ) {
        value = clock.now( type, value, options )
    }

    // If we're setting the max, make sure it's greater than the min.
    if ( type == 'max' && value < clock.item.min.pick ) {
        value += MINUTES_IN_DAY
    }

    // Normalize it into a "reachable" interval.
    value = clock.normalize( value, options )

    // Return the compiled object.
    return {

        // Divide to get hours from minutes.
        hour: ~~( HOURS_IN_DAY + value / MINUTES_IN_HOUR ) % HOURS_IN_DAY,

        // The remainder is the minutes.
        mins: ( MINUTES_IN_HOUR + value % MINUTES_IN_HOUR ) % MINUTES_IN_HOUR,

        // The time in total minutes.
        time: ( MINUTES_IN_DAY + value ) % MINUTES_IN_DAY,

        // Reference to the "relative" value to pick.
        pick: value
    }
} //TimePicker.prototype.create


/**
 * Get the time relative to now.
 */
TimePicker.prototype.now = function( type, value/*, options*/ ) {

    var date = new Date(),
        dateMinutes = date.getHours() * MINUTES_IN_HOUR + date.getMinutes()

    // If the value is a number, adjust by that many intervals because
    // the time has passed. In the case of “midnight” and a negative `min`,
    // increase the value by 2. Otherwise increase it by 1.
    if ( Picker._.isInteger( value ) ) {
        value += type == 'min' && value < 0 && dateMinutes === 0 ? 2 : 1
    }

    // If the value isn’t a number, default to 1 passed interval.
    else {
        value = 1
    }

    // Calculate the final relative time.
    return value * this.item.interval + dateMinutes
} //TimePicker.prototype.now


/**
 * Normalize minutes or an object to be "reachable" based on the interval.
 */
TimePicker.prototype.normalize = function( value/*, options*/ ) {
    // If it's a negative value, add one interval to keep it as "passed".
    return value - ( ( value < 0 ? this.item.interval : 0 ) + value % this.item.interval )
} //TimePicker.prototype.normalize


/**
 * Measure the range of minutes.
 */
TimePicker.prototype.measure = function( type, value, options ) {

    var clock = this

    // If it's anything false-y, set it to the default.
    if ( !value ) {
        value = type == 'min' ? [ 0, 0 ] : [ HOURS_IN_DAY - 1, MINUTES_IN_HOUR - 1 ]
    }

    // If it's a literal true, or an integer, make it relative to now.
    else if ( value === true || Picker._.isInteger( value ) ) {
        value = clock.now( type, value, options )
    }

    // If it's an object already, just normalize it.
    else if ( Picker._.isObject( value ) && Picker._.isInteger( value.pick ) ) {
        value = clock.normalize( value.pick, options )
    }

    return value
} ///TimePicker.prototype.measure


/**
 * Validate an object as enabled.
 */
TimePicker.prototype.validate = function( type, timeObject, options ) {

    var clock = this,
        interval = options && options.interval ? options.interval : clock.item.interval

    // Check if the object is disabled.
    if ( clock.disabled( timeObject ) ) {

        // Shift with the interval until we reach an enabled time.
        timeObject = clock.shift( timeObject, interval )
    }

    // Scope the object into range.
    timeObject = clock.scope( timeObject )

    // Do a second check to see if we landed on a disabled min/max.
    // In that case, shift using the opposite interval as before.
    if ( clock.disabled( timeObject ) ) {
        timeObject = clock.shift( timeObject, interval * -1 )
    }

    // Return the final object.
    return timeObject
} //TimePicker.prototype.validate


/**
 * Check if an object is disabled.
 */
TimePicker.prototype.disabled = function( timeObject ) {

    var
        clock = this,

        // Filter through the disabled times to check if this is one.
        isDisabledTime = clock.item.disable.filter( function( timeToDisable ) {

            // If the time is a number, match the hours.
            if ( Picker._.isInteger( timeToDisable ) ) {
                return timeObject.hour == timeToDisable
            }

            // If it's an array, create the object and match the times.
            if ( $.isArray( timeToDisable ) ) {
                return timeObject.pick == clock.create( timeToDisable ).pick
            }
        }).length

    // If the clock is "enabled" flag is flipped, flip the condition.
    return clock.item.enable === -1 ? !isDisabledTime : isDisabledTime
} //TimePicker.prototype.disabled


/**
 * Shift an object by an interval until we reach an enabled object.
 */
TimePicker.prototype.shift = function( timeObject, interval ) {

    var
        clock = this

    // Keep looping as long as the time is disabled.
    while ( clock.disabled( timeObject ) ) {

        // Increase/decrease the time by the interval and keep looping.
        timeObject = clock.create( timeObject.pick += interval || clock.item.interval )

        // If we've looped beyond the limits, break out of the loop.
        if ( timeObject.pick <= clock.item.min.pick || timeObject.pick >= clock.item.max.pick ) {
            break
        }
    }

    // Return the final object.
    return timeObject
} //TimePicker.prototype.shift


/**
 * Scope an object to be within range of min and max.
 */
TimePicker.prototype.scope = function( timeObject ) {
    var minLimit = this.item.min.pick,
        maxLimit = this.item.max.pick
    return this.create( timeObject.pick > maxLimit ? maxLimit : timeObject.pick < minLimit ? minLimit : timeObject )
} //TimePicker.prototype.scope


/**
 * Parse a string into a usable type.
 */
TimePicker.prototype.parse = function( type, value, options ) {

    var
        clock = this,
        parsingObject = {}

    if ( !value || Picker._.isInteger( value ) || $.isArray( value ) || Picker._.isDate( value ) || Picker._.isObject( value ) && Picker._.isInteger( value.pick ) ) {
        return value
    }

    // We need a `.format` to parse the value.
    if ( !( options && options.format ) ) {
        throw "Need a formatting option to parse this.."
    }

    // Convert the format into an array and then map through it.
    clock.formats.toArray( options.format ).map( function( label ) {

        var
            // Grab the formatting label.
            formattingLabel = clock.formats[ label ],

            // The format length is from the formatting label function or the
            // label length without the escaping exclamation (!) mark.
            formatLength = formattingLabel ? Picker._.trigger( formattingLabel, clock, [ value, parsingObject ] ) : label.replace( /^!/, '' ).length

        // If there's a format label, split the value up to the format length.
        // Then add it to the parsing object with appropriate label.
        if ( formattingLabel ) {
            parsingObject[ label ] = value.substr( 0, formatLength )
        }

        // Update the time value as the substring from format length to end.
        value = value.substr( formatLength )
    })

    return +parsingObject.i + MINUTES_IN_HOUR * (

        +( parsingObject.H || parsingObject.HH ) ||

        ( +( parsingObject.h || parsingObject.hh ) % 12 + ( /^p/i.test( parsingObject.A || parsingObject.a ) ? 12 : 0 ) )
    )
} //TimePicker.prototype.parse


/**
 * Various formats to display the object in.
 */
TimePicker.prototype.formats = {

    h: function( string, timeObject ) {

        // If there's string, then get the digits length.
        // Otherwise return the selected hour in "standard" format.
        return string ? Picker._.digits( string ) : timeObject.hour % HOURS_TO_NOON || HOURS_TO_NOON
    },
    hh: function( string, timeObject ) {

        // If there's a string, then the length is always 2.
        // Otherwise return the selected hour in "standard" format with a leading zero.
        return string ? 2 : Picker._.lead( timeObject.hour % HOURS_TO_NOON || HOURS_TO_NOON )
    },
    H: function( string, timeObject ) {

        // If there's string, then get the digits length.
        // Otherwise return the selected hour in "military" format as a string.
        return string ? Picker._.digits( string ) : '' + ( timeObject.hour % 24 )
    },
    HH: function( string, timeObject ) {

        // If there's string, then get the digits length.
        // Otherwise return the selected hour in "military" format with a leading zero.
        return string ? Picker._.digits( string ) : Picker._.lead( timeObject.hour % 24 )
    },
    i: function( string, timeObject ) {

        // If there's a string, then the length is always 2.
        // Otherwise return the selected minutes.
        return string ? 2 : Picker._.lead( timeObject.mins )
    },
    a: function( string, timeObject ) {

        // If there's a string, then the length is always 4.
        // Otherwise check if it's more than "noon" and return either am/pm.
        return string ? 4 : MINUTES_IN_DAY / 2 > timeObject.time % MINUTES_IN_DAY ? 'a.m.' : 'p.m.'
    },
    A: function( string, timeObject ) {

        // If there's a string, then the length is always 2.
        // Otherwise check if it's more than "noon" and return either am/pm.
        return string ? 2 : MINUTES_IN_DAY / 2 > timeObject.time % MINUTES_IN_DAY ? 'AM' : 'PM'
    },

    // Create an array by splitting the formatting string passed.
    toArray: function( formatString ) { return formatString.split( /(h{1,2}|H{1,2}|i|a|A|!.)/g ) },

    // Format an object into a string using the formatting options.
    toString: function ( formatString, itemObject ) {
        var clock = this
        return clock.formats.toArray( formatString ).map( function( label ) {
            return Picker._.trigger( clock.formats[ label ], clock, [ 0, itemObject ] ) || label.replace( /^!/, '' )
        }).join( '' )
    }
} //TimePicker.prototype.formats


/**
 * Flip an item as enabled or disabled.
 */
TimePicker.prototype.flipItem = function( type, value/*, options*/ ) {

    var clock = this,
        collection = clock.item.disable,
        isFlipped = clock.item.enable === -1

    // Flip the enabled and disabled times.
    if ( value == 'flip' ) {
        clock.item.enable = isFlipped ? 1 : -1
    }

    // Check if we have to add/remove from collection.
    else if ( !isFlipped && type == 'enable' || isFlipped && type == 'disable' ) {
        collection = clock.removeDisabled( collection, value )
    }
    else if ( !isFlipped && type == 'disable' || isFlipped && type == 'enable' ) {
        collection = clock.addDisabled( collection, value )
    }

    return collection
} //TimePicker.prototype.flipItem


/**
 * Add an item to the disabled collection.
 */
TimePicker.prototype.addDisabled = function( collection, item ) {
    var clock = this
    item.map( function( timeUnit ) {
        if ( !clock.filterDisabled( collection, timeUnit ).length ) {
            collection.push( timeUnit )
        }
    })
    return collection
} //TimePicker.prototype.addDisabled


/**
 * Remove an item from the disabled collection.
 */
TimePicker.prototype.removeDisabled = function( collection, item ) {
    var clock = this
    item.map( function( timeUnit ) {
        collection = clock.filterDisabled( collection, timeUnit, 1 )
    })
    return collection
} //TimePicker.prototype.removeDisabled


/**
 * Filter through the disabled collection to find a time unit.
 */
TimePicker.prototype.filterDisabled = function( collection, timeUnit, isRemoving ) {
    var timeIsArray = $.isArray( timeUnit )
    return collection.filter( function( disabledTimeUnit ) {
        var isMatch = !timeIsArray && timeUnit === disabledTimeUnit ||
            timeIsArray && $.isArray( disabledTimeUnit ) && timeUnit.toString() === disabledTimeUnit.toString()
        return isRemoving ? !isMatch : isMatch
    })
} //TimePicker.prototype.filterDisabled


/**
 * The division to use for the range intervals.
 */
TimePicker.prototype.i = function( type, value/*, options*/ ) {
    return Picker._.isInteger( value ) && value > 0 ? value : this.item.interval
}


/**
 * Create a string for the nodes in the picker.
 */
TimePicker.prototype.nodes = function( isOpen ) {

    var
        clock = this,
        settings = clock.settings,
        selectedObject = clock.item.select,
        highlightedObject = clock.item.highlight,
        viewsetObject = clock.item.view,
        disabledCollection = clock.item.disable

    return Picker._.node( 'ul', Picker._.group({
        min: clock.item.min.pick,
        max: clock.item.max.pick,
        i: clock.item.interval,
        node: 'li',
        item: function( loopedTime ) {
            loopedTime = clock.create( loopedTime )
            return [
                Picker._.trigger( clock.formats.toString, clock, [ Picker._.trigger( settings.formatLabel, clock, [ loopedTime ] ) || settings.format, loopedTime ] ),
                (function( klasses, timeMinutes ) {

                    if ( selectedObject && selectedObject.pick == timeMinutes ) {
                        klasses.push( settings.klass.selected )
                    }

                    if ( highlightedObject && highlightedObject.pick == timeMinutes ) {
                        klasses.push( settings.klass.highlighted )
                    }

                    if ( viewsetObject && viewsetObject.pick == timeMinutes ) {
                        klasses.push( settings.klass.viewset )
                    }

                    if ( disabledCollection && clock.disabled( loopedTime ) ) {
                        klasses.push( settings.klass.disabled )
                    }

                    return klasses.join( ' ' )
                })( [ settings.klass.listItem ], loopedTime.pick ),
                'data-pick=' + loopedTime.pick
            ]
        }
    }) + Picker._.node( 'li', Picker._.node( 'button', settings.clear, settings.klass.buttonClear, 'data-clear=1' + ( isOpen ? '' : ' disable' ) ) ), settings.klass.list )
} //TimePicker.prototype.nodes







/* ==========================================================================
   Extend the picker to add the component with the defaults.
   ========================================================================== */

TimePicker.defaults = (function( prefix ) {

    return {

        // Clear
        clear: 'Clear',

        // The format to show on the `input` element
        format: 'h:i A',

        // The interval between each time
        interval: 30,

        // Classes
        klass: {

            picker: prefix + ' ' + prefix + '--time',
            holder: prefix + '__holder',

            list: prefix + '__list',
            listItem: prefix + '__list-item',

            disabled: prefix + '__list-item--disabled',
            selected: prefix + '__list-item--selected',
            highlighted: prefix + '__list-item--highlighted',
            viewset: prefix + '__list-item--viewset',
            now: prefix + '__list-item--now',

            buttonClear: prefix + '__button--clear'
        }
    }
})( Picker.klasses().picker )





/**
 * Extend the picker to add the date picker.
 */
Picker.extend( 'pickatime', TimePicker )


}));




// plone integration for pickadate.
//
// Author: Rok Garbas
// Contact: rok@garbas.si
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('mockup-patterns-pickadate',[
  'jquery',
  'mockup-patterns-base',
  'picker',
  'picker.date',
  'picker.time'
], function($, Base) {
  

  var PickADate = Base.extend({
    name: 'pickadate',
    defaults: {
      separator: ' ',
      date: {
        selectYears: true,
        selectMonths: true
      },
      time: {
      },
      classWrapperName: 'pattern-pickadate-wrapper',
      classSeparatorName: 'pattern-pickadate-separator',
      classDateName: 'pattern-pickadate-date',
      classDateWrapperName: 'pattern-pickadate-date-wrapper',
      classTimeName: 'pattern-pickadate-time',
      classTimeWrapperName: 'pattern-pickadate-time-wrapper',
      classClearName: 'pattern-pickadate-clear',
      placeholderDate: 'Enter date...',
      placeholderTime: 'Enter time...'
    },
    isFalse: function(value) {
      if (typeof(value) === 'string' && value === 'false') {
        return false;
      }
      return value;
    },
    init: function() {
      var self = this,
          value = self.$el.val().split(' '),
          dateValue = value[0] || '',
          timeValue = value[1] || '';

      self.options.date = self.isFalse(self.options.date);
      self.options.time = self.isFalse(self.options.time);

      if (self.options.date === false) {
        timeValue = value[0];
      }

      self.$el.hide();

      self.$wrapper = $('<div/>')
            .addClass(self.options.classWrapperName)
            .insertAfter(self.$el);

      if (self.options.date !== false) {
        self.options.date.formatSubmit = 'yyyy-mm-dd';
        self.$date = $('<input type="text"/>')
              .attr('placeholder', self.options.placeholderDate)
              .attr('data-value', dateValue)
              .addClass(self.options.classDateName)
              .appendTo($('<div/>')
                  .addClass(self.options.classDateWrapperName)
                  .appendTo(self.$wrapper))
              .pickadate($.extend(true, {}, self.options.date, {
                onSet: function(e) {
                  if (e.select !== undefined) {
                    self.$date.attr('data-value', e.select);
                    if (self.options.time === false ||
                        self.$time.attr('data-value') !== '') {
                      self.updateValue.call(self);
                    }
                  }
                  if (e.hasOwnProperty('clear')) {
                    self.$el.removeAttr('value');
                    self.$date.attr('data-value', '');
                  }
                }
              }));
      }

      if (self.options.date !== false && self.options.time !== false) {
        self.$separator = $('<span/>')
              .addClass(self.options.classSeparatorName)
              .html(self.options.separator === ' ' ? '&nbsp;'
                                                   : self.options.separator)
              .appendTo(self.$wrapper);
      }

      if (self.options.time !== false) {
        self.options.time.formatSubmit = 'HH:i';
        self.$time = $('<input type="text"/>')
              .attr('placeholder', self.options.placeholderTime)
              .attr('data-value', timeValue)
              .addClass(self.options.classTimeName)
              .appendTo($('<div/>')
                  .addClass(self.options.classTimeWrapperName)
                  .appendTo(self.$wrapper))
              .pickatime($.extend(true, {}, self.options.time, {
                onSet: function(e) {
                  if (e.select !== undefined) {
                    self.$time.attr('data-value', e.select);
                    if (self.options.date === false ||
                        self.$date.attr('data-value') !== '') {
                      self.updateValue.call(self);
                    }
                  }
                  if (e.hasOwnProperty('clear')) {
                    self.$el.removeAttr('value');
                    self.$time.attr('data-value', '');
                  }
                }
              }));

        // XXX: bug in pickatime
        // work around pickadate bug loading 00:xx as value
        if (typeof(timeValue) === 'string' && timeValue.substring(0,2) === '00') {
          self.$time.pickatime('picker').set('select', timeValue.split(':'));
          self.$time.attr('data-value', timeValue);
        }
      }

      self.$clear = $('<div/>')
            .addClass(self.options.classClearName)
            .appendTo(self.$wrapper);

    },
    updateValue: function() {
      var self = this,
          value = '';

      if (self.options.date !== false) {
        var date = self.$date.data('pickadate').component,
            dateValue = self.$date.data('pickadate').get('select'),
            formatDate = date.formats.toString;
        value += formatDate.apply(date, ['yyyy-mm-dd', dateValue]);
      }

      if (self.options.date !== false && self.options.time !== false) {
        value += ' ';
      }

      if (self.options.time !== false) {
        var time = self.$time.data('pickatime').component,
            timeValue = self.$time.data('pickatime').get('select'),
            formatTime = time.formats.toString;
        value += formatTime.apply(time, ['HH:i', timeValue]);
      }

      self.$el.attr('value', value);

      self.trigger('updated');
    }
  });

  return PickADate;

});

// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/views/properties',[
  'jquery',
  'underscore',
  'backbone',
  'js/ui/views/popover',
  'mockup-patterns-pickadate',
  'mockup-patterns-select2'
], function($, _, Backbone, PopoverView, PickADate, Select2) {
  

  var PropertiesView = PopoverView.extend({
    className: 'popover properties',
    title: _.template('Modify properties on items'),
    content: _.template(
      '<label>Publication Date</label>' +
      '<input name="effective" />' +
      '<label>Expiration Date</label>' +
      '<input name="expiration" />' +
      '<label>Copyright</label>' +
      '<textarea name="copyright"></textarea>' +
      '<label>Creators<label>' +
      '<input name="creators" style="width: 300px" />' +
      '<label>Contributors<label>' +
      '<input name="contributors" style="width: 300px" />' +
      '<label>Exclude from nav</label>' +
      '<label class="checkbox">' +
        '<input type="radio" name="exclude-from-nav" value="yes" />' +
        'Yes' +
      '</label>' +
      '<label class="checkbox">' +
        '<input type="radio" name="exclude-from-nav" value="no" />' +
        'No' +
      '</label>' +
      '<button class="btn btn-block btn-primary">Apply</button>'
    ),
    events: {
      'click button': 'applyButtonClicked'
    },
    initialize: function(){
      this.app = this.options.app;
      PopoverView.prototype.initialize.call(this);
    },
    render: function(){
      PopoverView.prototype.render.call(this);
      this.$effective = this.$('[name="effective"]');
      this.$expiration = this.$('[name="expiration"]');
      this.$copyright = this.$('[name="copyright"]');
      this.$creators = this.$('[name="creators"]');
      this.$contributors = this.$('[name="contributors"]');
      this.$exclude = this.$('[name="exclude-from-nav"]');

      this.creatorsSelect2 = new Select2(this.$creators, {
        multiple: true,
        vocabularyUrl: this.app.options.usersVocabularyUrl
      });
      this.contributorsSelect2 = new Select2(this.$contributors, {
        multiple: true,
        vocabularyUrl: this.app.options.usersVocabularyUrl
      });
      this.effectivePickADate = new PickADate(this.$effective);
      this.expirationPickADate = new PickADate(this.$expiration);
      return this;
    },
    applyButtonClicked: function(e){
      var data = {
        effectiveDate: this.effectivePickADate.$date.attr('value'),
        effectiveTime: this.effectivePickADate.$time.attr('value'),
        expirationDate: this.expirationPickADate.$date.attr('value'),
        expirationTime: this.expirationPickADate.$time.attr('value'),
        copyright: this.$copyright.val(),
        contributors: JSON.stringify(this.$contributors.select2('data')),
        creators: JSON.stringify(this.$creators.select2('data'))
      };
      if(this.$('[name="exclude-from-nav"]:checked').length > 0){
        data.exclude_from_nav = this.$('[name="exclude-from-nav"]:checked').val();
      }
      this.app.defaultButtonClickEvent(this.triggerView, data);
      this.hide();
    },
    toggle: function(button, e){
      PopoverView.prototype.toggle.apply(this, [button, e]);
      var self = this;
      if(!this.opened){
        return;
      }
      this.$effective.attr('value', '');
      this.$expiration.attr('value', '');
      this.$copyright.html('');
      this.$creators.select2('data', []);
      this.$contributors.select2('data', []);
      this.$exclude.each(function(){
        this.checked = false;
      });
    }
  });

  return PropertiesView;
});

// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/views/workflow',[
  'jquery',
  'underscore',
  'backbone',
  'js/ui/views/popover'
], function($, _, Backbone, PopoverView) {
  

  var WorkflowView = PopoverView.extend({
    className: 'popover workflow',
    title: _.template('Modify dates on items'),
    content: _.template(
      '<form>' +
        '<fieldset>' +
          '<label>Comments</label>' +
          '<textarea rows="4"></textarea>' +
          '<span class="help-block">Select the transition to be used for ' +
            'modifying the items state.</span>' +
          '<label>Change State</label>' +
          '<span class="help-block">Select the transition to be used for ' +
            'modifying the items state.</span>' +
          '<select name="transition">' +
          '</select>' +
          '<label>' +
            '<input type="checkbox" name="recurse" />' +
            'Include contained items?</label>' +
          '<span class="help-block">' +
            'If checked, this will attempt to modify the status of all ' +
            'content in any selected folders and their subfolders.' +
          '</span>' +
        '</fieldset>' +
      '</form>' +
      '<button class="btn btn-block btn-primary">Apply</button>'
    ),
    events: {
      'click button': 'applyButtonClicked'
    },
    initialize: function(){
      this.app = this.options.app;
      PopoverView.prototype.initialize.call(this);
    },
    render: function(){
      PopoverView.prototype.render.call(this);
      this.$comments = this.$('textarea');
      this.$transition = this.$('select');
      return this;
    },
    applyButtonClicked: function(e){
      var data = {
        comments: this.$comments.val(),
        transition: this.$transition.val()
      };
      if(this.$('[name="recurse"]')[0].checked){
        data.recurse = 'yes';
      }
      this.app.defaultButtonClickEvent(this.triggerView, data);
      this.hide();
    },
    toggle: function(button, e){
      PopoverView.prototype.toggle.apply(this, [button, e]);
      var self = this;
      if(!self.opened){
        return;
      }
      self.$comments.val('');
      self.$transition.empty();
      $.ajax({
        url: self.triggerView.url,
        type: 'GET',
        data: {
          selection: JSON.stringify(self.app.getSelectedUids()),
          transitions: true
        },
        success: function(data){
          _.each(data.transitions, function(transition){
            self.$transition.append(
              '<option value="' + transition.id + '">' + transition.title +
                '</option>');
          });
        },
        error: function(data){
          // XXX error handling...
          window.alert('error getting transition data');
        }
      });
    }
  });

  return WorkflowView;
});





// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/views/delete',[
  'jquery',
  'underscore',
  'backbone',
  'js/ui/views/popover'
], function($, _, Backbone, PopoverView) {
  

  var DeleteView = PopoverView.extend({
    className: 'popover delete',
    title: _.template('Delete selected items'),
    content: _.template(
      '<label>Are you certain you want to delete the selected items</label>' +
      '<button class="btn btn-block btn-danger">Yes</button>'
    ),
    events: {
      'click button': 'applyButtonClicked'
    },
    initialize: function(){
      this.app = this.options.app;
      PopoverView.prototype.initialize.call(this);
    },
    render: function(){
      PopoverView.prototype.render.call(this);
      return this;
    },
    applyButtonClicked: function(e){
      var self = this;
      this.app.defaultButtonClickEvent(this.triggerView, {}, function(data){
        self.app.selectedCollection.reset();
      });
      this.hide();
    }
  });

  return DeleteView;
});






// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/views/rename',[
  'jquery',
  'underscore',
  'backbone',
  'js/ui/views/popover'
], function($, _, Backbone, PopoverView) {
  

  var PropertiesView = PopoverView.extend({
    className: 'popover rename',
    title: _.template('Rename items'),
    content: _.template(
      '<div class="itemstoremove"></div>' +
      '<button class="btn btn-block btn-primary">Apply</button>'
    ),
    itemTemplate: _.template(
      '<div class="item">' +
        '<input name="UID" type="hidden" value="<%- UID %>" />' +
        '<label>Title</label>' +
        '<input name="newtitle" value="<%= Title %>" />' +
        '<label>Short name</label>' +
        '<input name="newid" value="<%= id %>" />' +
      '</div>'),
    events: {
      'click button': 'applyButtonClicked'
    },
    initialize: function(){
      this.app = this.options.app;
      PopoverView.prototype.initialize.call(this);
    },
    render: function(){
      PopoverView.prototype.render.call(this);
      this.$items = this.$('.itemstoremove');
      return this;
    },
    applyButtonClicked: function(e){
      var torename = [];
      this.$items.find('.item').each(function(){
        var $item = $(this);
        torename.push({
          UID: $item.find('[name="UID"]').val(),
          newid: $item.find('[name="newid"]').val(),
          newtitle: $item.find('[name="newtitle"]').val()
        });
      });
      var self = this;
      this.app.defaultButtonClickEvent(this.triggerView, {
        torename: JSON.stringify(torename)
      });
      this.hide();
    },
    toggle: function(button, e){
      PopoverView.prototype.toggle.apply(this, [button, e]);
      var self = this;
      if(!self.opened){
        return;
      }
      self.$items.empty();
      self.app.selectedCollection.each(function(item){
        self.$items.append(self.itemTemplate(item.toJSON()));
      });
    }
  });

  return PropertiesView;
});






// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/views/sort',[
  'jquery',
  'underscore',
  'js/ui/views/popover'
], function($, _, PopoverView) {
  

  var SortView = PopoverView.extend({
    className: 'popover sort',
    title: _.template('Sort items in this folder'),
    content: _.template(
      '<label>What to sort on</label>' +
      '<select name="sort_on">' +
        '<% _.each(sortProperties, function(title, property){ %>' +
          '<option value="<%- property %>"><%- title %></option>' +
        '<% }); %>' +
      '</select>' +
      '<label>Reverse <input type="checkbox" name="reversed" /></label>' +
      '<button class="btn btn-block btn-primary">Sort</button>'
    ),
    events: {
      'click button': 'sortButtonClicked'
    },
    initialize: function(){
      this.app = this.options.app;
      PopoverView.prototype.initialize.call(this);
      this.options.sortProperties = this.app.options.sort.properties;
    },
    render: function(){
      PopoverView.prototype.render.call(this);
      this.$sortOn = this.$('[name="sort_on"]');
      this.$reversed = this.$('[name="reversed"]');
      return this;
    },
    sortButtonClicked: function(){
      var data = {
        sort_on: this.$sortOn.val(),
        reversed: false
      };
      if(this.$reversed[0].checked){
        data.reversed = true;
      }
      this.app.defaultButtonClickEvent(this.triggerView, data);
      this.hide();
    }
  });

  return SortView;
});

define('text!js/patterns/structure/templates/selection_button.xml',[],function () { return '<%= title %> \r<span class="badge<% if (length > 0) { %> badge-success<% } %>">\r  <%= length %>\r</span>\r';});

// Author: Ryan Foster
// Contact: ryan@rynamic.com
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/views/selectionbutton',[
  'jquery',
  'backbone',
  'underscore',
  'js/ui/views/button',
  'text!js/patterns/structure/templates/selection_button.xml'
  ],
  function($, Backbone, _, ButtonView, tpl_button) {
  

  var SelectionButton = ButtonView.extend({
    collection: null,
    template: tpl_button,
    initialize: function() {
      ButtonView.prototype.initialize.call(this);

      if (this.collection !== null) {
        this.collection.on('add remove reset', function() {
          this.render();
          if (this.collection.length === 0) {
            this.$el.removeClass('active');
          }
        }, this);
      }
    },
    serializedModel: function() {
      var obj = {icon: '', title: this.options.title, length: 0};
      if (this.collection !== null) {
        obj.length = this.collection.length;
      }
      return obj;
    }
  });

  return SelectionButton;
});

define('text!js/patterns/structure/templates/paging.xml',[],function () { return '<div class="pagination pagination-small pagination-centered">\n\n  <ul>\n    <li class="<% if (currentPage === 1) { %>disabled<% } %>">\n      <a href="#" class="serverfirst">\n        &laquo;\n      </a>\n    </li>\n    <li class="<% if (currentPage === 1) { %>disabled<% } %>">\n      <a href="#" class="serverprevious">\n        &lt;\n      </a>\n    </li>\n    <% _.each(pages, function(p){ %>\n    <li class="<% if (currentPage == p) { %>active<% } %>">\n      <a href="#" class="page"><%= p %></a>\n    </li>\n    <% }); %>\n    <li class="<% if (currentPage === lastPage) { %>disabled<% } %>">\n      <a href="#" class="servernext">\n        &gt;\n      </a>\n    </li>\n    <li class="<% if (currentPage === lastPage) { %>disabled<% } %>">\n      <a href="#" class="serverlast">\n        &raquo;\n      </a>\n    </li>\n  </ul>\n\n  <ul>\n    <li class="disabled"><a href="#">Show:</a></li>\n    <li class="serverhowmany <% if(perPage == 15){ %>disabled<% } %>">\n      <a href="#" class="">15</a>\n    </li>\n    <li class="serverhowmany <% if(perPage == 30){ %>disabled<% } %>">\n      <a href="#" class="">30</a>\n    </li>\n    <li class="serverhowmany <% if(perPage == 50){ %>disabled<% } %>">\n      <a href="#" class="">50</a>\n    </li>\n  </ul>\n\n  <ul>\n    <li class="disabled">\n      <a href="#">\n        Page: <span class="current"><%= currentPage %></span>\n        of\n        <span class="total"><%= totalPages %></span>\n              shown\n      </a>\n    </li>\n  </ul>\n\n</div>\n';});

// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/views/paging',[
  'jquery',
  'underscore',
  'backbone',
  'text!js/patterns/structure/templates/paging.xml'
], function($, _, Backbone, PagingTemplate) {
  


  var PagingView = Backbone.View.extend({
    events: {
      'click a.servernext': 'nextResultPage',
      'click a.serverprevious': 'previousResultPage',
      'click a.serverlast': 'gotoLast',
      'click a.page': 'gotoPage',
      'click a.serverfirst': 'gotoFirst',
      'click a.serverpage': 'gotoPage',
      'click .serverhowmany a': 'changeCount'
    },

    tagName: 'aside',
    template: _.template(PagingTemplate),
    maxPages: 7,
    initialize: function () {
      this.app = this.options.app;
      this.collection = this.app.collection;
      this.collection.on('reset', this.render, this);
      this.collection.on('sync', this.render, this);

      this.$el.appendTo('#pagination');

    },
    render: function () {
      var data = this.collection.info();
      data.pages = this.getPages(data);
      var html = this.template(data);
      this.$el.html(html);
      return this;
    },
    getPages: function(data){
      var perPage = data.perPage;
      var totalPages = data.totalPages;
      if(!totalPages){
        return [];
      }
      var currentPage = data.currentPage;
      var left = 1;
      var right = totalPages;
      if(totalPages > this.maxPages){
        left = Math.max(1, Math.floor(currentPage - (this.maxPages / 2)));
        right = Math.min(left + this.maxPages, totalPages);
        if((right - left) < this.maxPages){
          left = left - Math.floor(this.maxPages / 2);
        }
      }
      var pages = [];
      for(var i=left; i<=right; i=i+1){
        pages.push(i);
      }

      /* add before and after */
      if(pages[0] > 1){
        if(pages[0] > 2){
          pages = ['...'].concat(pages);
        }
        pages = [1].concat(pages);
      }
      if(pages[pages.length - 1] < (totalPages - 1)){
        if(pages[pages.length - 2] < totalPages - 2){
          pages.push('...');
        }
        pages.push(totalPages);
      }
      return pages;
    },
    nextResultPage: function (e) {
      e.preventDefault();
      this.collection.requestNextPage();
    },
    previousResultPage: function (e) {
      e.preventDefault();
      this.collection.requestPreviousPage();
    },
    gotoFirst: function (e) {
      e.preventDefault();
      this.collection.goTo(this.collection.information.firstPage);
    },
    gotoLast: function (e) {
      e.preventDefault();
      this.collection.goTo(this.collection.information.totalPages);
    },
    gotoPage: function (e) {
      e.preventDefault();
      var page = $(e.target).text();
      this.collection.goTo(page);
    },
    changeCount: function (e) {
      e.preventDefault();
      var per = $(e.target).text();
      this.collection.howManyPer(per);
    }
  });

  return PagingView;
});

// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/views/addmenu',[
  'jquery',
  'underscore',
  'backbone',
  'js/ui/views/buttongroup',
  'js/ui/views/button',
  'mockup-patterns-modal',
  'mockup-utils',
  'bootstrap-dropdown'
], function($, _, Backbone, ButtonGroup, ButtonView, Modal, utils) {
  

  var AddMenu = ButtonGroup.extend({
    title: 'Add',
    className: 'btn-group addnew',
    events: {
    },
    initialize: function(){
      var self = this;
      ButtonGroup.prototype.initialize.call(self);
      self.app.on('context-info-loaded', function(data){
        self.$items.empty();
        _.each(data.addButtons, function(item){
          var view = new ButtonView({
            id: item.id,
            title: item.title,
            url: item.action
          });
          view.render();
          var wrap = $('<li/>');
          view.$el.removeClass('btn'); // in this sort of btn group, can not have btn class

          wrap.append(view.el);
          self.$items.append(wrap);
          view.$el.click(function(e){
            self.buttonClicked.apply(self, [e, view]);
            return false;
          });
        });
      });
    },
    buttonClicked: function(e, button){
      var self = this;
      e.preventDefault();

      $.ajax({
        url: button.url,
        type: 'POST',
        data: {
          '_authenticator': $('[name="_authenticator"]').val(),
        },
        success: function(response){
          var modal = new Modal(self.$el, {
            html: utils.parseBodyTag(response),
            content: '#content',
            width: '80%',
            backdropOptions: {
              closeOnClick: false
            },
            automaticallyAddButtonActions: false,
            actionOptions: {
              displayInModal: false,
              reloadWindowOnClose: false
            },
            actions: {
              'input#form-buttons-save, .formControls input[name="form.button.save"]': {
                onSuccess: function(modal, response, state, xhr, form){
                  self.app.collection.pager();
                  if(self.$items.is(':visible')){
                    self.$dropdown.dropdown('toggle');
                  }
                  modal.$loading.hide();
                },
              },
              'input#form-buttons-cancel, .formControls input[name="form.button.cancel"]': {
                modalFunction: 'hide'
              }
            },
          });
          modal.show();
        },
        error: function(){
          // XXX handle error
        }
      });
    },
    render: function(){
      var self = this;
      self.$el.empty();

      self.$el.append(
        '<a class="btn dropdown-toggle btn-success" data-toggle="dropdown" href="#">' +
          self.title +
          '<span class="caret"></span>' +
        '</a>' +
        '<ul class="dropdown-menu">' +
        '</ul>' +
      '</div>');

      self.$items = self.$('.dropdown-menu');
      self.$dropdown = self.$('.dropdown-toggle');
      self.$dropdown.dropdown();
      return this;
    }
  });

  return AddMenu;
});

// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/views/columns',[
  'jquery',
  'underscore',
  'backbone',
  'js/ui/views/popover',
  'mockup-patterns-dragdrop'
], function($, _, Backbone, PopoverView, DragDrop) {
  

  var ColumnsView = PopoverView.extend({
    className: 'popover columns',
    title: _.template('Columns'),
    content: _.template(
      '<label>Select columns to show, drag and drop to reorder</label>' +
      '<ul>' +
      '</ul>' +
      '<button class="btn btn-block btn-success">Save</button>'
    ),
    itemTemplate: _.template(
      '<li>' +
        '<label>' +
          '<input type="checkbox" value="<%- id %>"/>' +
          '<%- title %>' +
        '</label>' +
      '</li>'),
    events: {
      'click button': 'applyButtonClicked'
    },
    initialize: function(){
      this.app = this.options.app;
      PopoverView.prototype.initialize.call(this);
    },
    render: function(){
      var self = this;
      PopoverView.prototype.render.call(this);
      self.$container = self.$('ul');
      _.each(self.app.activeColumns, function(id){
        var $el = $(self.itemTemplate({
          title: self.app.availableColumns[id],
          id: id
        }));
        $el.find('input')[0].checked = true;
        self.$container.append($el);
      });
      _.each(_.omit(self.app.availableColumns, self.app.activeColumns), function(name, id){
        var $el = $(self.itemTemplate({
          title: name,
          id: id
        }));
        self.$container.append($el);
      });

      var dd = new DragDrop(self.$container, {
        selector: 'li'
      });

      return this;
    },
    applyButtonClicked: function(){
      var self = this;
      this.hide();
      self.app.activeColumns = [];
      self.$('input:checked').each(function(){
        self.app.activeColumns.push($(this).val());
      });
      self.app.setCookieSetting('activeColumns', this.app.activeColumns);
      self.app.tableView.render();
    }
  });

  return ColumnsView;
});






// querystring pattern.
//
// Author: Rok Garbas
// Contact: rok@garbas.si
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//

define('mockup-patterns-querystring',[
  'jquery',
  'mockup-patterns-base',
  'mockup-patterns-select2',
  'mockup-patterns-pickadate'
], function($, Base, Select2, PickADate, undefined) {
  

  var Criteria = function() { this.init.apply(this, arguments); };
  Criteria.prototype = {
    defaults: {
      indexWidth: '20em',
      placeholder: 'Select criteria',
      remove: '<span class="icon icon-remove"></span>',
      results: ' items matching your search.',
      days: 'days',
      betweendt: 'to',
      classBetweenDtName: 'querystring-criteria-betweendt',
      classWrapperName: 'querystring-criteria-wrapper',
      classIndexName: 'querystring-criteria-index',
      classOperatorName: 'querystring-criteria-operator',
      classValueName: 'querystring-criteria-value',
      classRemoveName: 'querystring-criteria-remove',
      classResultsName: 'querystring-criteria-results',
      classClearName: 'querystring-criteria-clear'
    },
    init: function($el, options, indexes, index, operator, value) {
      var self = this;

      self.options = $.extend(true, {}, self.defaults, options);
      self.indexes = indexes;
      self.indexGroups = {};

      // create wrapper criteria and append it to DOM
      self.$wrapper = $('<div/>')
              .addClass(self.options.classWrapperName)
              .appendTo($el);

      // Remove button
      self.$remove = $('<div>'+self.options.remove+'</div>')
              .addClass(self.options.classRemoveName)
              .appendTo(self.$wrapper)
              .on('click', function(e) {
                self.remove();
              });

      // Index selection
      self.$index = $('<select><option></option></select>')
          .attr('placeholder', self.options.placeholder);

      // list of indexes
      $.each(self.indexes, function(value, options) {
        if (options.enabled) {
          if (!self.indexGroups[options.group]) {
            self.indexGroups[options.group] = $('<optgroup/>')
                .attr('label', options.group)
                .appendTo(self.$index);
          }
          self.indexGroups[options.group].append(
            $('<option/>')
                .attr('value', value)
                .html(options.title));
        }
      });

      // attach index select to DOM
      self.$wrapper.append(
          $('<div/>')
              .addClass(self.options.classIndexName)
              .append(self.$index));

      // add blink (select2)
      self.$index
        .patternSelect2({
            width: self.options.indexWidth,
            placeholder: self.options.placeholder
        })
        .on("change", function(e) {
          self.removeValue();
          self.createOperator(e.val);
          self.createClear();
          self.trigger('index-changed');
        });

      if (index !== undefined) {
        self.$index.select2('val', index);
        self.createOperator(index, operator, value);
        self.createClear();
      }

      self.trigger('create-criteria');
    },
    createOperator: function(index, operator, value) {
      var self = this;

      self.removeOperator();
      self.$operator = $('<select/>');

      if (self.indexes[index]) {
        $.each(self.indexes[index].operators, function(value, options) {
          $('<option/>')
              .attr('value', value)
              .html(options.title)
              .appendTo(self.$operator);
        });
      }

      // attach operators select to DOM
      self.$wrapper.append(
          $('<div/>')
              .addClass(self.options.classOperatorName)
              .append(self.$operator));

      // add blink (select2)
      self.$operator
        .patternSelect2({ width: '10em' })
        .on("change", function(e) {
          self.createValue(index);
          self.createClear();
          self.trigger('operator-changed');
        });

      if (operator === undefined) {
        operator = self.$operator.select2('val');
      }

      self.$operator.select2('val', operator);
      self.createValue(index, value);

      self.trigger('create-operator');
    },
    createValue: function(index, value) {
      var self = this,
          widget = self.indexes[index].operators[self.$operator.val()].widget,
          $wrapper = $('<div/>')
            .addClass(self.options.classValueName)
            .appendTo(self.$wrapper);

      self.removeValue();

      if (widget === 'StringWidget') {
        self.$value = $('<input type="text"/>')
                .addClass(self.options.classValueName + '-' + widget)
                .val(value)
                .appendTo($wrapper)
                .change(function(){
                  self.trigger('value-changed');
                });

      } else if (widget === 'DateWidget') {
        self.$value = $('<input type="text"/>')
                .addClass(self.options.classValueName + '-' + widget)
                .appendTo($wrapper)
                .patternPickadate({
                  time: false,
                  date: { format: "dd/mm/yyyy" }
                })
                .change(function(){
                  self.trigger('value-changed');
                });

      } else if (widget === 'DateRangeWidget') {
        var startwrap = $('<span/>').appendTo($wrapper);
        var startdt = $('<input type="text"/>')
                        .addClass(self.options.classValueName + '-' + widget)
                        .addClass(self.options.classValueName + '-' + widget + '-start')
                        .appendTo(startwrap)
                        .patternPickadate({
                          time: false,
                          date: { format: "dd/mm/yyyy" }
                        });
        $wrapper.append(
          $('<span/>')
            .html(self.options.betweendt)
            .addClass(self.options.classBetweenDtName)
        );
        var endwrap = $('<span/>').appendTo($wrapper);
        var enddt = $('<input type="text"/>')
                        .addClass(self.options.classValueName + '-' + widget)
                        .addClass(self.options.classValueName + '-' + widget + '-end')
                        .appendTo(endwrap)
                        .patternPickadate({
                          time: false,
                          date: { format: "dd/mm/yyyy" }
                        });
        $wrapper.find('.picker__input').change(function() {
          self.trigger('value-changed');
        });
        self.$value = [startdt, enddt];

      } else if (widget === 'RelativeDateWidget') {
        self.$value = $('<input type="text"/>')
                .after($('<span/>').html(self.options.days))
                .addClass(self.options.classValueName + '-' + widget)
                .appendTo($wrapper)
                .change(function(){
                  self.trigger('value-changed');
                });

      } else if (widget === 'ReferenceWidget') {
        self.$value = $('<input type="text"/>')
                .addClass(self.options.classValueName + '-' + widget)
                .appendTo($wrapper)
                .change(function(){
                  self.trigger('value-changed');
                });

      } else if (widget === 'RelativePathWidget') {
        self.$value = $('<input type="text"/>')
                .addClass(self.options.classValueName + '-' + widget)
                .appendTo($wrapper)
                .val(value)
                .change(function(){
                  self.trigger('value-changed');
                });

      } else if (widget === 'MultipleSelectionWidget') {
        self.$value = $('<select/>').attr('multiple', true)
                .addClass(self.options.classValueName + '-' + widget)
                .appendTo($wrapper)
                .change(function(){
                  self.trigger('value-changed');
                });
        if (self.indexes[index]) {
          $.each(self.indexes[index].values, function(value, options) {
            $('<option/>')
                .attr('value', value)
                .html(options.title)
                .appendTo(self.$value);
          });
        }
        self.$value.patternSelect2({ width: '250px' });
      }

      if(value !== undefined && typeof self.$value !== 'undefined') {
        self.$value.select2('val', value);
      }

      self.trigger('create-value');

    },
    createClear: function() {
      var self = this;
      self.removeClear();
      self.$clear = $('<div/>')
        .addClass(self.options.classClearName)
        .appendTo(self.$wrapper);
    },
    remove: function() {
      var self = this;
      self.trigger('remove');
      self.$remove.remove();
      self.$index.parent().remove();
      self.removeOperator();
      self.removeValue();
      self.removeClear();
      self.$wrapper.remove();
    },
    removeClear: function() {
      var self = this;
      self.trigger('remove-clear');
      if (self.$clear) {
        self.$clear.remove();
      }
    },
    removeOperator: function() {
      var self = this;
      self.trigger('remove-operator');
      if (self.$operator) {
        self.$operator.parent().remove();
      }
    },
    removeValue: function() {
      var self = this;
      self.trigger('remove-value');
      if(self.$value) {
        if($.isArray(self.$value)) { // date ranges have 2 values
          self.$value[0].parents('.querystring-criteria-value').remove();
        }
        else {
          self.$value.parents('.querystring-criteria-value').remove();
        }
      }
    },
    // builds the parameters to go into the http querystring for requesting
    // results from the query builder
    buildQueryPart: function() {
      var self = this;

      // index
      var ival = self.$index.select2('val');
      if(ival === "") { // no index selected, no query
        return "";
      }
      var istr = 'query.i:records='+ival;

      // operator
      if(typeof self.$operator === "undefined") { // no operator, no query
        return "";
      }
      var oval = self.$operator.val(),
          ostr = 'query.o:records='+oval;

      // value(s)
      var vstrbase = 'query.v:records=',
          vstrlistbase = 'query.v:records:list=',
          vstr = [];
      if(typeof self.$value === "undefined") {
        vstr.push(vstrbase);
      }
      else if($.isArray(self.$value)) { // handles only datepickers from the 'between' operator right now
        $.each(self.$value, function(i, v) {
          vstr.push(vstrlistbase + $(this).parent().find('.picker__input').val());
        });
      }
      else {
        vstr.push(vstrbase + self.$value.val());
      }

      return istr + '&' + ostr + '&' + vstr.join('&');
    },
    getJSONListStr: function() {
      var self = this;

      // index
      var ival = self.$index.select2('val');
      if(ival === "") { // no index selected, no query
        return "";
      }

      // operator
      if(typeof self.$operator === "undefined") { // no operator, no query
        return "";
      }
      var oval = self.$operator.val();

      // value(s)
      var varr = [];
      if($.isArray(self.$value)) { // handles only datepickers from the 'between' operator right now
        $.each(self.$value, function(i, v) {
          varr.push($(this).parent().find('.picker__input').val());
        });
      }
      else if(typeof self.$value !== "undefined") {
        varr.push(self.$value.val());
      }
      var vval;
      if(varr.length > 1) {
        vval = '["'+varr.join('","')+'"]';
      }
      else if(varr.length === 1) {
        vval = JSON.stringify(varr[0]);
      }
      else {
        vval = '""';
      }

      return '{"i":"'+ival+'", "o":"'+oval+'", "v":'+vval+'}';
    },
    trigger: function(name) {
      this.$wrapper.trigger(name + '-criteria.querystring.patterns', [ this ]);
    },
    on: function(name, callback) {
      this.$wrapper.on(name + '-criteria.querystring.patterns', callback);
    }
  };

  var QueryString = Base.extend({
    name: 'querystring',
    defaults: {
      indexes: [],
      classWrapperName: 'querystring-wrapper',
      criteria: {},
      indexOptionsUrl: null,
      previewURL: 'portal_factory/@@querybuilder_html_results', // base url to use to request preview information from
      previewCountURL: 'portal_factory/@@querybuildernumberofresults',
      sorttxt: 'Sort On',
      reversetxt: 'Reversed Order',
      previewTitle: 'Preview',
      previewDescription: 'Preview of at most 10 items',
      classSortLabelName: 'querystring-sort-label',
      classSortReverseName: 'querystring-sortreverse',
      classSortReverseLabelName: 'querystring-sortreverse-label',
      classPreviewCountWrapperName: 'querystring-previewcount-wrapper',
      classPreviewResultsWrapperName: 'querystring-previewresults-wrapper',
      classPreviewWrapperName: 'querystring-preview-wrapper',
      classPreviewName: 'querystring-preview',
      classPreviewTitleName: 'querystring-preview-title',
      classPreviewDescriptionName: 'querystring-preview-description',
      classSortWrapperName: 'querystring-sort-wrapper',
      showPreviews: true
    },
    init: function() {
      var self = this;

      // hide input element
      self.$el.hide();

      // create wrapper for out criteria
      self.$wrapper = $('<div/>');
      self.$el.after(self.$wrapper);

      // initialization can be detailed if by ajax
      self.initialized = false;

      if(self.options.indexOptionsUrl){
        $.ajax({
          url: self.options.indexOptionsUrl,
          success: function(data){
            self.options.indexes = data.indexes;
            self.options.sortable_indexes = data.sortable_indexes;
            self._init();
          },
          error: function(xhr){
            // XXX handle this...
          }
        });
      }else{
        self._init();
      }
    },
    _init: function(){
      var self = this;
      self.$criteriaWrapper = $('<div/>')
        .addClass(self.options.classWrapperName)
        .appendTo(self.$wrapper);

      self.$sortWrapper = $('<div/>')
        .addClass(self.options.classSortWrapperName)
        .appendTo(self.$wrapper);

      if(self.options.showPreviews === 'false'){
        self.options.showPreviews = false;
      }
      if(self.options.showPreviews){
        self.$previewWrapper = $('<div/>')
          .addClass(self.options.classPreviewWrapperName)
          .appendTo(self.$wrapper);

        // preview title and description
        $('<div/>')
          .addClass(self.options.classPreviewTitleName)
          .html(self.options.previewTitle)
          .appendTo(self.$previewWrapper);
        $('<div/>')
          .addClass(self.options.classPreviewDescriptionName)
          .html(self.options.previewDescription)
          .appendTo(self.$previewWrapper);
      }

      self.criterias = [];

      // create populated criterias
      if (self.$el.val()) {
        $.each(JSON.parse(self.$el.val()), function(i, item) {
          self.createCriteria(item.i, item.o, item.v);
        });
      }

      // add empty criteria which enables users to create new cr
      self.createCriteria();

      // add sort/order fields
      self.createSort();

      // add criteria preview pane to see results from criteria query
      if(self.options.showPreviews){
        self.refreshPreviewEvent();
      }
      self.$el.trigger('initialized');
      self.initialized = true;
    },
    createCriteria: function(index, operator, value) {
      var self = this,
          criteria = new Criteria(self.$criteriaWrapper, self.options.criteria,
            self.options.indexes, index, operator, value);

      criteria.on('remove', function(e) {
        if (self.criterias[self.criterias.length-1] === criteria) {
          self.createCriteria();
        }
      });

      criteria.on('index-changed', function(e) {
        if (self.criterias[self.criterias.length-1] === criteria) {
          self.createCriteria();
        }
      });

      var doupdates = function() {
        self.refreshPreviewEvent();
        self.updateValue();
      };

      criteria.on('remove', function(e, criteria){
        if(self.criterias.indexOf(criteria) !== -1){
          self.criterias.splice(self.criterias.indexOf(criteria), 1);
        }
        doupdates(e, criteria);
      });
      criteria.on('remove-clear', doupdates);
      criteria.on('remove-operator', doupdates);
      criteria.on('remove-value', doupdates);
      criteria.on('index-changed', doupdates);
      criteria.on('operator-changed', doupdates);
      criteria.on('create-criteria', doupdates);
      criteria.on('create-operator', doupdates);
      criteria.on('create-value', doupdates);
      criteria.on('value-changed', doupdates);

      self.criterias.push(criteria);
    },
    createSort: function() {
      var self = this;

      // elements that may exist already on the page
      // XXX do this in a way so it'll work with other forms will work
      // as long as they provide sort_on and sort_reversed fields in z3c form
      var existingSortOn = $('[id$="-sort_on"]').filter('[id^="formfield-"]');
      var existingSortOrder = $('[id$="-sort_reversed"]').filter('[id^="formfield-"]');

      $('<span/>')
        .addClass(self.options.classSortLabelName)
        .html(self.options.sorttxt)
        .appendTo(self.$sortWrapper);
      self.$sortOn = $('<select/>')
        .attr('name', 'sort_on')
        .appendTo(self.$sortWrapper)
        .change(function(){
          self.refreshPreviewEvent.call(self);
          $('[id$="sort_on"]', existingSortOn).val($(this).val());
        });

      self.$sortOn.append($('<option value="">No sorting</option>')); // default no sorting
      for(var key in self.options.sortable_indexes) {
        self.$sortOn.append(
          $('<option/>')
            .attr('value', key)
            .html(self.options.indexes[key].title));
      }
      self.$sortOn.patternSelect2({width: 150});

      self.$sortOrder = $("<input type='checkbox' />")
                          .attr('name', 'sort_reversed:boolean')
                          .change(function(){
                            self.refreshPreviewEvent.call(self);
                            if($(this).attr('checked') === "checked") {
                              $('.option input[type="checkbox"]', existingSortOrder)
                                .attr('checked', 'checked');
                            }
                            else {
                              $('.option input[type="checkbox"]', existingSortOrder)
                                .removeAttr('checked');
                            }
                          });


      $('<span/>')
        .addClass(self.options.classSortReverseName)
        .appendTo(self.$sortWrapper)
        .append(self.$sortOrder)
        .append(
          $('<span/>')
            .html(self.options.reversetxt)
            .addClass(self.options.classSortReverseLabelName)
        );

      // if the form already contains the sort fields, hide them! Their values
      // will be synced back and forth between the querystring's form elements
      if(existingSortOn.length >= 1 && existingSortOrder.length >= 1) {
        var reversed = $('.option input[type="checkbox"]', existingSortOrder).attr('checked') === "checked";
        var sort_on = $('[id$="-sort_on"]', existingSortOn).val();
        if(reversed) {
          self.$sortOrder.attr('checked', 'checked');
        }
        self.$sortOn.select2('val', sort_on);
        $(existingSortOn).hide();
        $(existingSortOrder).hide();
      }
    },
    refreshPreviewEvent: function() {
      var self = this;

      if(!self.options.showPreviews){
        return; // cut out of this if there are no previews available
      }

      /* TEMPORARY */
      //if(typeof self._tmpcnt === "undefined") { self._tmpcnt = 0; }
      //self._tmpcnt++;
      /* /TEMPORARY */

      if(typeof self._preview_xhr !== "undefined") {
        self._preview_xhr.abort();
      }
      /*
      if(typeof self._count_xhr !== "undefined") {
        self._count_xhr.abort();
      }
      */
      if(typeof self.$previewPane !== "undefined") {
        self.$previewPane.remove();
      }

      var query = [], querypart;
      $.each(self.criterias, function(i, criteria) {
        querypart = criteria.buildQueryPart();
        if(querypart !== "") {
          query.push(criteria.buildQueryPart());
        }
      });

      self.$previewPane = $('<div/>')
        .addClass(self.options.classPreviewName)
        .appendTo(self.$previewWrapper);

      if(query.length <= 0) {
        $('<div/>')
          .addClass(self.options.classPreviewCountWrapperName)
          .html("No results to preview")
          .prependTo(self.$previewPane);
        return; // no query means nothing to send out requests for
      }

      query.push('sort_on='+self.$sortOn.val());
      var sortorder = self.$sortOrder.attr('checked');
      if(sortorder === "checked") {
        query.push('sort_order=reverse');
      }

      /* TEMPORARY */
      //self.$previewPane.html(
      //    'refreshed ' + self._tmpcnt + ' times<br />'
      //    + (query.length > 1 ? query.join('<br />&') : query));
      /* /TEMPORARY */

      /*
      self._count_xhr = $.get(self.options.previewCountURL + '?' + query.join('&'))
          .done(function(data, stat){
            $('<div/>')
              .addClass(self.options.classPreviewCountWrapperName)
              .html(data)
              .prependTo(self.$previewPane);
          });
      */
      self._preview_xhr = $.get(self.options.previewURL + '?' + query.join('&'))
          .done(function(data, stat){
            $('<div/>')
              .addClass(self.options.classPreviewResultsWrapperName)
              .html(data)
              .appendTo(self.$previewPane);
          });
    },
    updateValue: function() {
      // updating the original input with json data in the form:
      // [
      //    {i:'index', o:'operator', v:'value'}
      // ]

      var self = this;

      var criteriastrs = [];
      $.each(self.criterias, function(i, criteria) {
        var jsonstr = criteria.getJSONListStr();
        if(jsonstr !== "") {
          criteriastrs.push(jsonstr);
        }
      });
      var existing = self.$el.val();
      var val = '['+criteriastrs.join(',')+']';
      self.$el.val(val);
      self.$el.trigger('change');
    }
  });

  return QueryString;

});

// Author: Ryan Foster
// Contact: ryan@rynamic.com
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/views/textfilter',[
  'jquery',
  'backbone',
  'underscore',
  'js/ui/views/base',
  'js/ui/views/button',
  'js/ui/views/popover',
  'mockup-patterns-querystring'
], function($, Backbone, _, BaseView, ButtonView, PopoverView, QueryString) {
  

  var TextFilterView = BaseView.extend({
    tagName: 'form',
    className: 'navbar-search pull-right form-search',
    template: _.template(
      '<div class="input-append">' +
        '<input type="text" class="search-query" placeholder="Filter">' +
      '</div>'),
    popoverContent: _.template(
      '<input class="pat-querystring" />'
    ),
    events: {
      'keyup .search-query': 'filter'
    },
    term: null,
    timeoutId: null,
    keyupDelay: 300,
    initialize: function(){
      this.app = this.options.app;
    },
    render: function(){
      this.$el.html(this.template({}));
      this.button = new ButtonView({
        title: 'Query'
      });
      this.popover = new PopoverView({
        triggerView: this.button,
        title: _.template('Query'),
        content: this.popoverContent,
        placement: 'left'
      });
      this.$('div.input-append').append(this.button.render().el);
      this.$el.append(this.popover.render().el);
      this.popover.$el.addClass('query');
      this.$queryString = this.popover.$('input.pat-querystring');
      this.queryString = new QueryString(
        this.$queryString, {
        indexOptionsUrl: this.app.options.indexOptionsUrl,
        showPreviews: false
      });
      var self = this;
      self.queryString.$el.on('change', function(){
        if(self.timeoutId){
          clearTimeout(self.timeoutId);
        }
        self.timeoutId = setTimeout(function(){
          var criterias = $.parseJSON(self.$queryString.val());
          self.app.additionalCriterias = criterias;
          self.app.collection.pager();
        }, this.keyupDelay);
      });
      self.queryString.$el.on('initialized', function(){
        self.queryString.$sortOn.on('change', function(){
          self.app.sort_on = self.queryString.$sortOn.val();
          self.app.collection.pager();
        });
        self.queryString.$sortOrder.change(function(){
          if(self.queryString.$sortOrder[0].checked){
            self.app.sort_order = 'reverse';
          }else{
            self.app.sort_order = 'ascending';
          }
          self.app.collection.pager();
        });
      });
      return this;
    },
    filter: function(event) {
      var self = this;
      if(self.timeoutId){
        clearTimeout(self.timeoutId);
      }
      self.timeoutId = setTimeout(function(){
        self.term = $(event.currentTarget).val();
        self.app.collection.pager();
      }, this.keyupDelay);
    }
  });

  return TextFilterView;
});

// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/models/result',['backbone'], function(Backbone) {
  

  var Result = Backbone.Model.extend({
    defaults: function(){
      return {
        is_folderish: false,
        review_state: ''
      };
    },
    uid: function(){
      return this.attributes.UID;
    }
  });

  return Result;
});

/*globals Backbone:true, _:true, jQuery:true*/
Backbone.Paginator = (function ( Backbone, _, $ ) {
  


  var bbVer = _.map(Backbone.VERSION.split('.'), function(digit) {
    return parseInt(digit, 10);
  });

  var Paginator = {};
  Paginator.version = "<%= pkg.version %>";

  // @name: clientPager
  //
  // @tagline: Paginator for client-side data
  //
  // @description:
  // This paginator is responsible for providing pagination
  // and sort capabilities for a single payload of data
  // we wish to paginate by the UI for easier browsering.
  //
  Paginator.clientPager = Backbone.Collection.extend({

    // DEFAULTS FOR SORTING & FILTERING
    useDiacriticsPlugin: true, // use diacritics plugin if available
    useLevenshteinPlugin: true, // use levenshtein plugin if available
    sortColumn: "",
    sortDirection: "desc",
    lastSortColumn: "",
    fieldFilterRules: [],
    lastFieldFilterRules: [],
    filterFields: "",
    filterExpression: "",
    lastFilterExpression: "",

    //DEFAULT PAGINATOR UI VALUES
    defaults_ui: {
      firstPage: 0,
      currentPage: 1,
      perPage: 5,
      totalPages: 10,
      pagesInRange: 4
    },

    // Default values used when sorting and/or filtering.
    initialize: function(){
      //LISTEN FOR ADD & REMOVE EVENTS THEN REMOVE MODELS FROM ORGINAL MODELS
      this.on('add', this.addModel, this);
      this.on('remove', this.removeModel, this);

      // SET DEFAULT VALUES (ALLOWS YOU TO POPULATE PAGINATOR MAUNALLY)
      this.setDefaults();
    },


    setDefaults: function() {
      // SET DEFAULT UI SETTINGS
      var options = _.defaults(this.paginator_ui, this.defaults_ui);

      //UPDATE GLOBAL UI SETTINGS
      _.defaults(this, options);
    },

    addModel: function(model) {
      this.origModels.push(model);
    },

    removeModel: function(model) {
      var index = _.indexOf(this.origModels, model);

      this.origModels.splice(index, 1);
    },

    sync: function ( method, model, options ) {
      var self = this;

      // SET DEFAULT VALUES
      this.setDefaults();

      // Some values could be functions, let's make sure
      // to change their scope too and run them
      var queryAttributes = {};
      _.each(_.result(self, "server_api"), function(value, key){
        if( _.isFunction(value) ) {
          value = _.bind(value, self);
          value = value();
        }
        queryAttributes[key] = value;
      });

      var queryOptions = _.clone(self.paginator_core);
      _.each(queryOptions, function(value, key){
        if( _.isFunction(value) ) {
          value = _.bind(value, self);
          value = value();
        }
        queryOptions[key] = value;
      });

      // Create default values if no others are specified
      queryOptions = _.defaults(queryOptions, {
        timeout: 25000,
        cache: false,
        type: 'GET',
        dataType: 'jsonp'
      });

      queryOptions = _.extend(queryOptions, {
        data: decodeURIComponent($.param(queryAttributes)),
        processData: false,
        url: _.result(queryOptions, 'url')
      }, options);

      var promiseSuccessFormat = !(bbVer[0] === 0 &&
                                   bbVer[1] === 9 &&
                                   bbVer[2] === 10);

      var success = queryOptions.success;
      queryOptions.success = function ( resp, status, xhr ) {
        if ( success ) {
          // This is to keep compatibility with Backbone 0.9.10
          if (promiseSuccessFormat) {
            success( resp, status, xhr );
          } else {
            success( model, resp, queryOptions );
          }
        }
        if ( model && model.trigger ) {
          model.trigger( 'sync', model, resp, queryOptions );
        }
      };

      var error = queryOptions.error;
      queryOptions.error = function ( xhr ) {
        if ( error ) {
          error( model, xhr, queryOptions );
        }
        if ( model && model.trigger ) {
          model.trigger( 'error', model, xhr, queryOptions );
        }
      };

      var xhr = queryOptions.xhr = Backbone.ajax( queryOptions );
      if ( model && model.trigger ) {
        model.trigger('request', model, xhr, queryOptions);
      }
      return xhr;
    },

    nextPage: function (options) {
      if(this.currentPage < this.information.totalPages) {
        this.currentPage = ++this.currentPage;
        this.pager(options);
      }
    },

    previousPage: function (options) {
      if(this.currentPage > 1) {
        this.currentPage = --this.currentPage;
        this.pager(options);
      }
    },

    goTo: function ( page, options ) {
      if(page !== undefined){
        this.currentPage = parseInt(page, 10);
        this.pager(options);
      }
    },

    howManyPer: function ( perPage ) {
      if(perPage !== undefined){
        var lastPerPage = this.perPage;
        this.perPage = parseInt(perPage, 10);
        this.currentPage = Math.ceil( ( lastPerPage * ( this.currentPage - 1 ) + 1 ) / perPage);
        this.pager();
      }
    },


    // setSort is used to sort the current model. After
    // passing 'column', which is the model's field you want
    // to filter and 'direction', which is the direction
    // desired for the ordering ('asc' or 'desc'), pager()
    // and info() will be called automatically.
    setSort: function ( column, direction ) {
      if(column !== undefined && direction !== undefined){
        this.lastSortColumn = this.sortColumn;
        this.sortColumn = column;
        this.sortDirection = direction;
        this.pager();
        this.info();
      }
    },

    // setFieldFilter is used to filter each value of each model
    // according to `rules` that you pass as argument.
    // Example: You have a collection of books with 'release year' and 'author'.
    // You can filter only the books that were released between 1999 and 2003
    // And then you can add another `rule` that will filter those books only to
    // authors who's name start with 'A'.
    setFieldFilter: function ( fieldFilterRules ) {
      if( !_.isEmpty( fieldFilterRules ) ) {
        this.lastFieldFilterRules = this.fieldFilterRules;
        this.fieldFilterRules = fieldFilterRules;
        this.pager();
        this.info();
        // if all the filters are removed, we should save the last filter
        // and then let the list reset to it's original state.
      } else {
        this.lastFieldFilterRules = this.fieldFilterRules;
        this.fieldFilterRules = '';
        this.pager();
        this.info();
      }
    },

    // doFakeFieldFilter can be used to get the number of models that will remain
    // after calling setFieldFilter with a filter rule(s)
    doFakeFieldFilter: function ( rules ) {
      if( !_.isEmpty( rules ) ) {
        var testModels = this.origModels;
        if (testModels === undefined) {
          testModels = this.models;
        }

        testModels = this._fieldFilter(testModels, rules);

        // To comply with current behavior, also filter by any previously defined setFilter rules.
        if ( this.filterExpression !== "" ) {
          testModels = this._filter(testModels, this.filterFields, this.filterExpression);
        }

        // Return size
        return testModels.length;
      }

    },

    // setFilter is used to filter the current model. After
    // passing 'fields', which can be a string referring to
    // the model's field, an array of strings representing
    // each of the model's fields or an object with the name
    // of the model's field(s) and comparing options (see docs)
    // you wish to filter by and
    // 'filter', which is the word or words you wish to
    // filter by, pager() and info() will be called automatically.
    setFilter: function ( fields, filter ) {
      if( fields !== undefined && filter !== undefined ){
        this.filterFields = fields;
        this.lastFilterExpression = this.filterExpression;
        this.filterExpression = filter;
        this.pager();
        this.info();
      }
    },

    // doFakeFilter can be used to get the number of models that will
    // remain after calling setFilter with a `fields` and `filter` args.
    doFakeFilter: function ( fields, filter ) {
      if( fields !== undefined && filter !== undefined ){
        var testModels = this.origModels;
        if (testModels === undefined) {
          testModels = this.models;
        }

        // To comply with current behavior, first filter by any previously defined setFieldFilter rules.
        if ( !_.isEmpty( this.fieldFilterRules ) ) {
          testModels = this._fieldFilter(testModels, this.fieldFilterRules);
        }

        testModels = this._filter(testModels, fields, filter);

        // Return size
        return testModels.length;
      }
    },


    // pager is used to sort, filter and show the data
    // you expect the library to display.
    pager: function (options) {
      var self = this,
      disp = this.perPage,
      start = (self.currentPage - 1) * disp,
      stop = start + disp;
      // Saving the original models collection is important
      // as we could need to sort or filter, and we don't want
      // to loose the data we fetched from the server.
      if (self.origModels === undefined) {
        self.origModels = self.models;
      }

      self.models = self.origModels.slice();

      // Check if sorting was set using setSort.
      if ( this.sortColumn !== "" ) {
        self.models = self._sort(self.models, this.sortColumn, this.sortDirection);
      }

      // Check if field-filtering was set using setFieldFilter
      if ( !_.isEmpty( this.fieldFilterRules ) ) {
        self.models = self._fieldFilter(self.models, this.fieldFilterRules);
      }

      // Check if filtering was set using setFilter.
      if ( this.filterExpression !== "" ) {
        self.models = self._filter(self.models, this.filterFields, this.filterExpression);
      }

      // If the sorting or the filtering was changed go to the first page
      if ( this.lastSortColumn !== this.sortColumn || this.lastFilterExpression !== this.filterExpression || !_.isEqual(this.fieldFilterRules, this.lastFieldFilterRules) ) {
        start = 0;
        stop = start + disp;
        self.currentPage = 1;

        this.lastSortColumn = this.sortColumn;
        this.lastFieldFilterRules = this.fieldFilterRules;
        this.lastFilterExpression = this.filterExpression;
      }

      // We need to save the sorted and filtered models collection
      // because we'll use that sorted and filtered collection in info().
      self.sortedAndFilteredModels = self.models.slice();
      self.info();
      self.reset(self.models.slice(start, stop));

      // This is somewhat of a hack to get all the nextPage, prevPage, and goTo methods
      // to work with a success callback (as in the requestPager). Realistically there is no failure case here,
      // but maybe we could catch exception and trigger a failure callback?
      _.result(options, 'success');
    },

    // The actual place where the collection is sorted.
    // Check setSort for arguments explicacion.
    _sort: function ( models, sort, direction ) {
      models = models.sort(function (a, b) {
        var ac = a.get(sort),
        bc = b.get(sort);

        if ( _.isUndefined(ac) || _.isUndefined(bc) || ac === null || bc === null ) {
          return 0;
        } else {
          /* Make sure that both ac and bc are lowercase strings.
           * .toString() first so we don't have to worry if ac or bc
           * have other String-only methods.
           */
          ac = ac.toString().toLowerCase();
          bc = bc.toString().toLowerCase();
        }

        if (direction === 'desc') {

          // We need to know if there aren't any non-number characters
          // and that there are numbers-only characters and maybe a dot
          // if we have a float.
          // Oh, also a '-' for negative numbers!
          if((!ac.match(/[^\-\d\.]/) && ac.match(/-?[\d\.]+/)) &&
               (!bc.match(/[^\-\d\.]/) && bc.match(/-?[\d\.]+/))){

            if( (ac - 0) < (bc - 0) ) {
              return 1;
            }
            if( (ac - 0) > (bc - 0) ) {
              return -1;
            }
          } else {
            if (ac < bc) {
              return 1;
            }
            if (ac > bc) {
              return -1;
            }
          }

        } else {

          //Same as the regexp check in the 'if' part.
          if((!ac.match(/[^\-\d\.]/) && ac.match(/-?[\d\.]+/)) &&
             (!bc.match(/[^\-\d\.]/) && bc.match(/-?[\d\.]+/))){
            if( (ac - 0) < (bc - 0) ) {
              return -1;
            }
            if( (ac - 0) > (bc - 0) ) {
              return 1;
            }
          } else {
            if (ac < bc) {
              return -1;
            }
            if (ac > bc) {
              return 1;
            }
          }

        }

        if (a.cid && b.cid){
          var aId = a.cid,
          bId = b.cid;

          if (aId < bId) {
            return -1;
          }
          if (aId > bId) {
            return 1;
          }
        }

        return 0;
      });

      return models;
    },

    // The actual place where the collection is field-filtered.
    // Check setFieldFilter for arguments explicacion.
    _fieldFilter: function( models, rules ) {

      // Check if there are any rules
      if ( _.isEmpty(rules) ) {
        return models;
      }

      var filteredModels = [];

      // Iterate over each rule
      _.each(models, function(model){

        var should_push = true;

        // Apply each rule to each model in the collection
        _.each(rules, function(rule){

          // Don't go inside the switch if we're already sure that the model won't be included in the results
          if( !should_push ){
            return false;
          }

          should_push = false;

          // The field's value will be passed to a custom function, which should
          // return true (if model should be included) or false (model should be ignored)
          if(rule.type === "function"){
            var f = _.wrap(rule.value, function(func){
              return func( model.get(rule.field) );
            });
            if( f() ){
              should_push = true;
            }

            // The field's value is required to be non-empty
          }else if(rule.type === "required"){
            if( !_.isEmpty( model.get(rule.field).toString() ) ) {
              should_push = true;
            }

            // The field's value is required to be greater tan N (numbers only)
          }else if(rule.type === "min"){
            if( !_.isNaN( Number( model.get(rule.field) ) ) &&
               !_.isNaN( Number( rule.value ) ) &&
                 Number( model.get(rule.field) ) >= Number( rule.value ) ) {
              should_push = true;
            }

            // The field's value is required to be smaller tan N (numbers only)
          }else if(rule.type === "max"){
            if( !_.isNaN( Number( model.get(rule.field) ) ) &&
               !_.isNaN( Number( rule.value ) ) &&
                 Number( model.get(rule.field) ) <= Number( rule.value ) ) {
              should_push = true;
            }

            // The field's value is required to be between N and M (numbers only)
          }else if(rule.type === "range"){
            if( !_.isNaN( Number( model.get(rule.field) ) ) &&
               _.isObject( rule.value ) &&
                 !_.isNaN( Number( rule.value.min ) ) &&
                   !_.isNaN( Number( rule.value.max ) ) &&
                     Number( model.get(rule.field) ) >= Number( rule.value.min ) &&
                       Number( model.get(rule.field) ) <= Number( rule.value.max ) ) {
              should_push = true;
            }

            // The field's value is required to be more than N chars long
          }else if(rule.type === "minLength"){
            if( model.get(rule.field).toString().length >= rule.value ) {
              should_push = true;
            }

            // The field's value is required to be no more than N chars long
          }else if(rule.type === "maxLength"){
            if( model.get(rule.field).toString().length <= rule.value ) {
              should_push = true;
            }

            // The field's value is required to be more than N chars long and no more than M chars long
          }else if(rule.type === "rangeLength"){
            if( _.isObject( rule.value ) &&
               !_.isNaN( Number( rule.value.min ) ) &&
                 !_.isNaN( Number( rule.value.max ) ) &&
                   model.get(rule.field).toString().length >= rule.value.min &&
                     model.get(rule.field).toString().length <= rule.value.max ) {
              should_push = true;
            }

            // The field's value is required to be equal to one of the values in rules.value
          }else if(rule.type === "oneOf"){
            if( _.isArray( rule.value ) &&
               _.include( rule.value, model.get(rule.field) ) ) {
              should_push = true;
            }

            // The field's value is required to be equal to the value in rules.value
          }else if(rule.type === "equalTo"){
            if( rule.value === model.get(rule.field) ) {
              should_push = true;
            }

          }else if(rule.type === "containsAllOf"){
            if( _.isArray( rule.value ) &&
                _.isArray(model.get(rule.field)) &&
                _.intersection( rule.value, model.get(rule.field)).length === rule.value.length) {
              should_push = true;
            }

              // The field's value is required to match the regular expression
          }else if(rule.type === "pattern"){
            if( model.get(rule.field).toString().match(rule.value) ) {
              should_push = true;
            }

            //Unknown type
          }else{
            should_push = false;
          }

        });

        if( should_push ){
          filteredModels.push(model);
        }

      });

      return filteredModels;
    },

    // The actual place where the collection is filtered.
    // Check setFilter for arguments explicacion.
    _filter: function ( models, fields, filter ) {

      //  For example, if you had a data model containing cars like { color: '', description: '', hp: '' },
      //  your fields was set to ['color', 'description', 'hp'] and your filter was set
      //  to "Black Mustang 300", the word "Black" will match all the cars that have black color, then
      //  "Mustang" in the description and then the HP in the 'hp' field.
      //  NOTE: "Black Musta 300" will return the same as "Black Mustang 300"

      // We accept fields to be a string, an array or an object
      // but if string or array is passed we need to convert it
      // to an object.

      var self = this;

      var obj_fields = {};

      if( _.isString( fields ) ) {
        obj_fields[fields] = {cmp_method: 'regexp'};
      }else if( _.isArray( fields ) ) {
        _.each(fields, function(field){
          obj_fields[field] = {cmp_method: 'regexp'};
        });
      }else{
        _.each(fields, function( cmp_opts, field ) {
          obj_fields[field] = _.defaults(cmp_opts, { cmp_method: 'regexp' });
        });
      }

      fields = obj_fields;

      //Remove diacritic characters if diacritic plugin is loaded
      if( _.has(Backbone.Paginator, 'removeDiacritics') && self.useDiacriticsPlugin ){
        filter = Backbone.Paginator.removeDiacritics(filter);
      }

      // 'filter' can be only a string.
      // If 'filter' is string we need to convert it to
      // a regular expression.
      // For example, if 'filter' is 'black dog' we need
      // to find every single word, remove duplicated ones (if any)
      // and transform the result to '(black|dog)'
      if( filter === '' || !_.isString(filter) ) {
        return models;
      } else {
        var words = _.map(filter.match(/\w+/ig), function(element) { return element.toLowerCase(); });
        var pattern = "(" + _.uniq(words).join("|") + ")";
        var regexp = new RegExp(pattern, "igm");
      }

      var filteredModels = [];

      // We need to iterate over each model
      _.each( models, function( model ) {

        var matchesPerModel = [];

        // and over each field of each model
        _.each( fields, function( cmp_opts, field ) {

          var value = model.get( field );

          if( value ) {

            // The regular expression we created earlier let's us detect if a
            // given string contains each and all of the words in the regular expression
            // or not, but in both cases match() will return an array containing all
            // the words it matched.
            var matchesPerField = [];

            if( _.has(Backbone.Paginator, 'removeDiacritics') && self.useDiacriticsPlugin ){
              value = Backbone.Paginator.removeDiacritics(value.toString());
            }else{
              value = value.toString();
            }

            // Levenshtein cmp
            if( cmp_opts.cmp_method === 'levenshtein' && _.has(Backbone.Paginator, 'levenshtein') && self.useLevenshteinPlugin ) {
              var distance = Backbone.Paginator.levenshtein(value, filter);

              _.defaults(cmp_opts, { max_distance: 0 });

              if( distance <= cmp_opts.max_distance ) {
                matchesPerField = _.uniq(words);
              }

              // Default (RegExp) cmp
            }else{
              matchesPerField = value.match( regexp );
            }

            matchesPerField = _.map(matchesPerField, function(match) {
              return match.toString().toLowerCase();
            });

            _.each(matchesPerField, function(match){
              matchesPerModel.push(match);
            });

          }

        });

        // We just need to check if the returned array contains all the words in our
        // regex, and if it does, it means that we have a match, so we should save it.
        matchesPerModel = _.uniq( _.without(matchesPerModel, "") );

        if(  _.isEmpty( _.difference(words, matchesPerModel) ) ) {
          filteredModels.push(model);
        }

      });

      return filteredModels;
    },

    // You shouldn't need to call info() as this method is used to
    // calculate internal data as first/prev/next/last page...
    info: function () {
      var self = this,
      info = {},
      totalRecords = (self.sortedAndFilteredModels) ? self.sortedAndFilteredModels.length : self.length,
      totalPages = Math.ceil(totalRecords / self.perPage);

      info = {
        totalUnfilteredRecords: self.origModels.length,
        totalRecords: totalRecords,
        currentPage: self.currentPage,
        perPage: this.perPage,
        totalPages: totalPages,
        lastPage: totalPages,
        previous: false,
        next: false,
        startRecord: totalRecords === 0 ? 0 : (self.currentPage - 1) * this.perPage + 1,
        endRecord: Math.min(totalRecords, self.currentPage * this.perPage)
      };

      if (self.currentPage > 1) {
        info.previous = self.currentPage - 1;
      }

      if (self.currentPage < info.totalPages) {
        info.next = self.currentPage + 1;
      }

      info.pageSet = self.setPagination(info);

      self.information = info;
      return info;
    },


    // setPagination also is an internal function that shouldn't be called directly.
    // It will create an array containing the pages right before and right after the
    // actual page.
    setPagination: function ( info ) {

      var pages = [], i = 0, l = 0;

      // How many adjacent pages should be shown on each side?
      var ADJACENTx2 = this.pagesInRange * 2,
      LASTPAGE = Math.ceil(info.totalRecords / info.perPage);

      if (LASTPAGE > 1) {

        // not enough pages to bother breaking it up
        if (LASTPAGE <= (1 + ADJACENTx2)) {
          for (i = 1, l = LASTPAGE; i <= l; i++) {
            pages.push(i);
          }
        }

        // enough pages to hide some
        else {

          //close to beginning; only hide later pages
          if (info.currentPage <=  (this.pagesInRange + 1)) {
            for (i = 1, l = 2 + ADJACENTx2; i < l; i++) {
              pages.push(i);
            }
          }

          // in middle; hide some front and some back
          else if (LASTPAGE - this.pagesInRange > info.currentPage && info.currentPage > this.pagesInRange) {
            for (i = info.currentPage - this.pagesInRange; i <= info.currentPage + this.pagesInRange; i++) {
              pages.push(i);
            }
          }

          // close to end; only hide early pages
          else {
            for (i = LASTPAGE - ADJACENTx2; i <= LASTPAGE; i++) {
              pages.push(i);
            }
          }
        }

      }

      return pages;

    },

    bootstrap: function(options) {
      _.extend(this, options);
      this.goTo(1);
      this.info();
      return this;
    }

  });

  // function aliasing
  Paginator.clientPager.prototype.prevPage = Paginator.clientPager.prototype.previousPage;

  // Helper function to generate rejected Deferred
  var reject = function () {
    var response = new $.Deferred();
    response.reject();
    return response.promise();
  };

  // @name: requestPager
  //
  // Paginator for server-side data being requested from a backend/API
  //
  // @description:
  // This paginator is responsible for providing pagination
  // and sort capabilities for requests to a server-side
  // data service (e.g an API)
  //
  Paginator.requestPager = Backbone.Collection.extend({

    sync: function ( method, model, options ) {

      var self = this;

      self.setDefaults();

      // Some values could be functions, let's make sure
      // to change their scope too and run them
      var queryAttributes = {};
      _.each(_.result(self, "server_api"), function(value, key){
        if( _.isFunction(value) ) {
          value = _.bind(value, self);
          value = value();
        }
        queryAttributes[key] = value;
      });

      var queryOptions = _.clone(self.paginator_core);
      _.each(queryOptions, function(value, key){
        if( _.isFunction(value) ) {
          value = _.bind(value, self);
          value = value();
        }
        queryOptions[key] = value;
      });

      // Create default values if no others are specified
      queryOptions = _.defaults(queryOptions, {
        timeout: 25000,
        cache: false,
        type: 'GET',
        dataType: 'jsonp'
      });

      // Allows the passing in of {data: {foo: 'bar'}} at request time to overwrite server_api defaults
      if( options.data ){
        options.data = decodeURIComponent($.param(_.extend(queryAttributes,options.data)));
      }else{
        options.data = decodeURIComponent($.param(queryAttributes));
      }

      queryOptions = _.extend(queryOptions, {
        data: decodeURIComponent($.param(queryAttributes)),
        processData: false,
        url: _.result(queryOptions, 'url')
      }, options);

      var promiseSuccessFormat = !(bbVer[0] === 0 &&
                                   bbVer[1] === 9 &&
                                   bbVer[2] === 10);

      var success = queryOptions.success;
      queryOptions.success = function ( resp, status, xhr ) {

        if ( success ) {
          // This is to keep compatibility with Backbone 0.9.10
          if (promiseSuccessFormat) {
            success( resp, status, xhr );
          } else {
            success( model, resp, queryOptions );
          }
        }
        if (bbVer[0] < 1 && model && model.trigger ) {
          model.trigger( 'sync', model, resp, queryOptions );
        }
      };

      var error = queryOptions.error;
      queryOptions.error = function ( xhr ) {
        if ( error ) {
          error( xhr );
        }
        if ( model && model.trigger ) {
          model.trigger( 'error', model, xhr, queryOptions );
        }
      };

      var xhr = queryOptions.xhr = Backbone.ajax( queryOptions );
      if ( model && model.trigger ) {
        model.trigger('request', model, xhr, queryOptions);
      }
      return xhr;
    },

    setDefaults: function() {
      var self = this;

      // Create default values if no others are specified
      _.defaults(self.paginator_ui, {
        firstPage: 0,
        currentPage: 1,
        perPage: 5,
        totalPages: 10,
        pagesInRange: 4
      });

      // Change scope of 'paginator_ui' object values
      _.each(self.paginator_ui, function(value, key) {
        if (_.isUndefined(self[key])) {
          self[key] = self.paginator_ui[key];
        }
      });
    },

    requestNextPage: function ( options ) {
      if ( this.currentPage !== undefined ) {
        this.currentPage += 1;
        return this.pager( options );
      } else {
        return reject();
      }
    },

    requestPreviousPage: function ( options ) {
      if ( this.currentPage !== undefined ) {
        this.currentPage -= 1;
        return this.pager( options );
      } else {
        return reject();
      }
    },

    updateOrder: function ( column, options ) {
      if (column !== undefined) {
        this.sortField = column;
        return this.pager( options );
      } else {
        return reject();
      }
    },

    goTo: function ( page, options ) {
      if ( page !== undefined ) {
        this.currentPage = parseInt(page, 10);
        return this.pager( options );
      } else {
        return reject();
      }
    },

    howManyPer: function ( count, options ) {
      if ( count !== undefined ) {
        this.currentPage = this.firstPage;
        this.perPage = count;
        return this.pager( options );
      } else {
        return reject();
      }
    },

    info: function () {

      var info = {
        // If parse() method is implemented and totalRecords is set to the length
        // of the records returned, make it available. Else, default it to 0
        totalRecords: this.totalRecords || 0,

        currentPage: this.currentPage,
        firstPage: this.firstPage,
        totalPages: Math.ceil(this.totalRecords / this.perPage),
        lastPage: this.totalPages, // should use totalPages in template
        perPage: this.perPage,
        previous:false,
        next:false
      };

      if (this.currentPage > 1) {
        info.previous = this.currentPage - 1;
      }

      if (this.currentPage < info.totalPages) {
        info.next = this.currentPage + 1;
      }

      // left around for backwards compatibility
      info.hasNext = info.next;
      info.hasPrevious = info.next;

      info.pageSet = this.setPagination(info);

      this.information = info;
      return info;
    },

    setPagination: function ( info ) {

      var pages = [], i = 0, l = 0;

      // How many adjacent pages should be shown on each side?
      var ADJACENTx2 = this.pagesInRange * 2,
      LASTPAGE = Math.ceil(info.totalRecords / info.perPage);

      if (LASTPAGE > 1) {

        // not enough pages to bother breaking it up
        if (LASTPAGE <= (1 + ADJACENTx2)) {
          for (i = 1, l = LASTPAGE; i <= l; i++) {
            pages.push(i);
          }
        }

        // enough pages to hide some
        else {

          //close to beginning; only hide later pages
          if (info.currentPage <=  (this.pagesInRange + 1)) {
            for (i = 1, l = 2 + ADJACENTx2; i < l; i++) {
              pages.push(i);
            }
          }

          // in middle; hide some front and some back
          else if (LASTPAGE - this.pagesInRange > info.currentPage && info.currentPage > this.pagesInRange) {
            for (i = info.currentPage - this.pagesInRange; i <= info.currentPage + this.pagesInRange; i++) {
              pages.push(i);
            }
          }

          // close to end; only hide early pages
          else {
            for (i = LASTPAGE - ADJACENTx2; i <= LASTPAGE; i++) {
              pages.push(i);
            }
          }
        }

      }

      return pages;

    },

    // fetches the latest results from the server
    pager: function ( options ) {
      if ( !_.isObject(options) ) {
        options = {};
      }
      return this.fetch( options );
    },

    url: function(){
      // Expose url parameter enclosed in this.paginator_core.url to properly
      // extend Collection and allow Collection CRUD
      if(this.paginator_core !== undefined && this.paginator_core.url !== undefined){
        return this.paginator_core.url;
      } else {
        return null;
      }
    },

    bootstrap: function(options) {
      _.extend(this, options);
      this.setDefaults();
      this.info();
      return this;
    }
  });

  // function aliasing
  Paginator.requestPager.prototype.nextPage = Paginator.requestPager.prototype.requestNextPage;
  Paginator.requestPager.prototype.prevPage = Paginator.requestPager.prototype.requestPreviousPage;

  return Paginator;

}( Backbone, _, jQuery ));

define("backbone-paginator", function(){});

// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/collections/result',[
  'underscore',
  'backbone',
  'js/patterns/structure/models/result',
  'backbone-paginator'
], function(_, Backbone, Result) {


  var ResultCollection = Backbone.Paginator.requestPager.extend({
    model: Result,
    queryHelper: null, // need to set
    paginator_core: {
      // the type of the request (GET by default)
      type: 'GET',
      // the type of reply (jsonp by default)
      dataType: 'json',
      url: function(){
        return this.url;
      }
    },
    queryParser: null, // needs to be passed in
    paginator_ui: {
      // the lowest page index your API allows to be accessed
      firstPage: 1,
      // which page should the paginator start from
      // (also, the actual page the paginator is on)
      currentPage: 1,
      // how many items per page should be shown
      perPage: 15
    },
    server_api: {
      query: function(){
        return this.queryParser();
      },
      batch: function(){
        this.queryHelper.options.batchSize = this.perPage;
        return JSON.stringify(this.queryHelper.getBatch(this.currentPage));
      },
      attributes: function(){
        return JSON.stringify(this.queryHelper.options.attributes);
      }
    },
    parse: function (response) {
      this.totalRecords = response.total;
      var results = response.results;
      // XXX manually set sort order here since backbone will otherwise
      // do arbitrary sorting?
      _.each(results, function(item, idx){
        item._sort = idx;
      });
      return results;
    },
    comparator: '_sort'
  });

  return ResultCollection;
});

// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/collections/selected',[
  'backbone',
  'js/patterns/structure/models/result'
], function(Backbone, Result) {


  var SelectedCollection = Backbone.Collection.extend({
    model: Result,
    removeResult: function(model){
      return this.removeByUID(model.uid());
    },
    removeByUID: function(uid){
      var found = this.getByUID(uid);
      if(found){
        this.remove(found);
      }
      return found;
    },
    getByUID: function(uid){
      return this.findWhere({UID: uid});
    }
  });

  return SelectedCollection;
});


// Uses AMD or browser globals to create a jQuery plugin.
(function (factory) {
  if (typeof define === 'function' && define.amd) {
      // AMD. Register as an anonymous module.
      define('dropzone',['jquery'], factory);
  } else {
      // Browser globals
      factory(jQuery);
  }
} (function (jQuery) {
    var module = { exports: { } }; // Fake component


/**
 * Expose `Emitter`.
 */

module.exports = Emitter;

/**
 * Initialize a new `Emitter`.
 *
 * @api public
 */

function Emitter(obj) {
  if (obj) return mixin(obj);
};

/**
 * Mixin the emitter properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

function mixin(obj) {
  for (var key in Emitter.prototype) {
    obj[key] = Emitter.prototype[key];
  }
  return obj;
}

/**
 * Listen on the given `event` with `fn`.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.on = function(event, fn){
  this._callbacks = this._callbacks || {};
  (this._callbacks[event] = this._callbacks[event] || [])
    .push(fn);
  return this;
};

/**
 * Adds an `event` listener that will be invoked a single
 * time then automatically removed.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.once = function(event, fn){
  var self = this;
  this._callbacks = this._callbacks || {};

  function on() {
    self.off(event, on);
    fn.apply(this, arguments);
  }

  fn._off = on;
  this.on(event, on);
  return this;
};

/**
 * Remove the given callback for `event` or all
 * registered callbacks.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.off =
Emitter.prototype.removeListener =
Emitter.prototype.removeAllListeners = function(event, fn){
  this._callbacks = this._callbacks || {};
  var callbacks = this._callbacks[event];
  if (!callbacks) return this;

  // remove all handlers
  if (1 == arguments.length) {
    delete this._callbacks[event];
    return this;
  }

  // remove specific handler
  var i = callbacks.indexOf(fn._off || fn);
  if (~i) callbacks.splice(i, 1);
  return this;
};

/**
 * Emit `event` with the given args.
 *
 * @param {String} event
 * @param {Mixed} ...
 * @return {Emitter}
 */

Emitter.prototype.emit = function(event){
  this._callbacks = this._callbacks || {};
  var args = [].slice.call(arguments, 1)
    , callbacks = this._callbacks[event];

  if (callbacks) {
    callbacks = callbacks.slice(0);
    for (var i = 0, len = callbacks.length; i < len; ++i) {
      callbacks[i].apply(this, args);
    }
  }

  return this;
};

/**
 * Return array of callbacks for `event`.
 *
 * @param {String} event
 * @return {Array}
 * @api public
 */

Emitter.prototype.listeners = function(event){
  this._callbacks = this._callbacks || {};
  return this._callbacks[event] || [];
};

/**
 * Check if this emitter has `event` handlers.
 *
 * @param {String} event
 * @return {Boolean}
 * @api public
 */

Emitter.prototype.hasListeners = function(event){
  return !! this.listeners(event).length;
};

/*
#
# More info at [www.dropzonejs.com](http://www.dropzonejs.com)
# 
# Copyright (c) 2012, Matias Meno  
# 
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
# 
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
# 
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.
#
*/


(function() {
  var Dropzone, Em, camelize, contentLoaded, noop, without,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    __slice = [].slice;

  Em = typeof Emitter !== "undefined" && Emitter !== null ? Emitter : require("emitter");

  noop = function() {};

  Dropzone = (function(_super) {
    var extend;

    __extends(Dropzone, _super);

    /*
    This is a list of all available events you can register on a dropzone object.
    
    You can register an event handler like this:
    
        dropzone.on("dragEnter", function() { });
    */


    Dropzone.prototype.events = ["drop", "dragstart", "dragend", "dragenter", "dragover", "dragleave", "selectedfiles", "addedfile", "removedfile", "thumbnail", "error", "processing", "processingmultiple", "uploadprogress", "totaluploadprogress", "sending", "sendingmultiple", "success", "successmultiple", "canceled", "canceledmultiple", "complete", "completemultiple", "reset"];

    Dropzone.prototype.defaultOptions = {
      url: null,
      method: "post",
      withCredentials: false,
      parallelUploads: 2,
      uploadMultiple: false,
      maxFilesize: 256,
      paramName: "file",
      createImageThumbnails: true,
      maxThumbnailFilesize: 10,
      thumbnailWidth: 100,
      thumbnailHeight: 100,
      params: {},
      clickable: true,
      ignoreHiddenFiles: true,
      acceptedFiles: null,
      acceptedMimeTypes: null,
      autoProcessQueue: true,
      addRemoveLinks: false,
      previewsContainer: null,
      dictDefaultMessage: "Drop files here to upload",
      dictFallbackMessage: "Your browser does not support drag'n'drop file uploads.",
      dictFallbackText: "Please use the fallback form below to upload your files like in the olden days.",
      dictFileTooBig: "File is too big ({{filesize}}MB). Max filesize: {{maxFilesize}}MB.",
      dictInvalidFileType: "You can't upload files of this type.",
      dictResponseError: "Server responded with {{statusCode}} code.",
      dictCancelUpload: "Cancel upload",
      dictCancelUploadConfirmation: "Are you sure you want to cancel this upload?",
      dictRemoveFile: "Remove file",
      accept: function(file, done) {
        return done();
      },
      init: function() {
        return noop;
      },
      forceFallback: false,
      fallback: function() {
        var child, messageElement, span, _i, _len, _ref;
        this.element.className = "" + this.element.className + " dz-browser-not-supported";
        _ref = this.element.getElementsByTagName("div");
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          child = _ref[_i];
          if (/(^| )dz-message($| )/.test(child.className)) {
            messageElement = child;
            child.className = "dz-message";
            continue;
          }
        }
        if (!messageElement) {
          messageElement = Dropzone.createElement("<div class=\"dz-message\"><span></span></div>");
          this.element.appendChild(messageElement);
        }
        span = messageElement.getElementsByTagName("span")[0];
        if (span) {
          span.textContent = this.options.dictFallbackMessage;
        }
        return this.element.appendChild(this.getFallbackForm());
      },
      resize: function(file) {
        var info, srcRatio, trgRatio;
        info = {
          srcX: 0,
          srcY: 0,
          srcWidth: file.width,
          srcHeight: file.height
        };
        srcRatio = file.width / file.height;
        trgRatio = this.options.thumbnailWidth / this.options.thumbnailHeight;
        if (file.height < this.options.thumbnailHeight || file.width < this.options.thumbnailWidth) {
          info.trgHeight = info.srcHeight;
          info.trgWidth = info.srcWidth;
        } else {
          if (srcRatio > trgRatio) {
            info.srcHeight = file.height;
            info.srcWidth = info.srcHeight * trgRatio;
          } else {
            info.srcWidth = file.width;
            info.srcHeight = info.srcWidth / trgRatio;
          }
        }
        info.srcX = (file.width - info.srcWidth) / 2;
        info.srcY = (file.height - info.srcHeight) / 2;
        return info;
      },
      /*
      Those functions register themselves to the events on init and handle all
      the user interface specific stuff. Overwriting them won't break the upload
      but can break the way it's displayed.
      You can overwrite them if you don't like the default behavior. If you just
      want to add an additional event handler, register it on the dropzone object
      and don't overwrite those options.
      */

      drop: function(e) {
        return this.element.classList.remove("dz-drag-hover");
      },
      dragstart: noop,
      dragend: function(e) {
        return this.element.classList.remove("dz-drag-hover");
      },
      dragenter: function(e) {
        return this.element.classList.add("dz-drag-hover");
      },
      dragover: function(e) {
        return this.element.classList.add("dz-drag-hover");
      },
      dragleave: function(e) {
        return this.element.classList.remove("dz-drag-hover");
      },
      selectedfiles: function(files) {
        if (this.element === this.previewsContainer) {
          return this.element.classList.add("dz-started");
        }
      },
      reset: function() {
        return this.element.classList.remove("dz-started");
      },
      addedfile: function(file) {
        var _this = this;
        file.previewElement = Dropzone.createElement(this.options.previewTemplate);
        file.previewTemplate = file.previewElement;
        this.previewsContainer.appendChild(file.previewElement);
        file.previewElement.querySelector("[data-dz-name]").textContent = file.name;
        file.previewElement.querySelector("[data-dz-size]").innerHTML = this.filesize(file.size);
        if (this.options.addRemoveLinks) {
          file._removeLink = Dropzone.createElement("<a class=\"dz-remove\" href=\"javascript:undefined;\">" + this.options.dictRemoveFile + "</a>");
          file._removeLink.addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (file.status === Dropzone.UPLOADING) {
              if (window.confirm(_this.options.dictCancelUploadConfirmation)) {
                return _this.removeFile(file);
              }
            } else {
              return _this.removeFile(file);
            }
          });
          return file.previewElement.appendChild(file._removeLink);
        }
      },
      removedfile: function(file) {
        var _ref;
        return (_ref = file.previewElement) != null ? _ref.parentNode.removeChild(file.previewElement) : void 0;
      },
      thumbnail: function(file, dataUrl) {
        var thumbnailElement;
        file.previewElement.classList.remove("dz-file-preview");
        file.previewElement.classList.add("dz-image-preview");
        thumbnailElement = file.previewElement.querySelector("[data-dz-thumbnail]");
        thumbnailElement.alt = file.name;
        return thumbnailElement.src = dataUrl;
      },
      error: function(file, message) {
        file.previewElement.classList.add("dz-error");
        return file.previewElement.querySelector("[data-dz-errormessage]").textContent = message;
      },
      processing: function(file) {
        file.previewElement.classList.add("dz-processing");
        if (file._removeLink) {
          return file._removeLink.textContent = this.options.dictCancelUpload;
        }
      },
      processingmultiple: noop,
      uploadprogress: function(file, progress, bytesSent) {
        return file.previewElement.querySelector("[data-dz-uploadprogress]").style.width = "" + progress + "%";
      },
      totaluploadprogress: noop,
      sending: noop,
      sendingmultiple: noop,
      success: function(file) {
        return file.previewElement.classList.add("dz-success");
      },
      successmultiple: noop,
      canceled: function(file) {
        return this.emit("error", file, "Upload canceled.");
      },
      canceledmultiple: noop,
      complete: function(file) {
        if (file._removeLink) {
          return file._removeLink.textContent = this.options.dictRemoveFile;
        }
      },
      completemultiple: noop,
      previewTemplate: "<div class=\"dz-preview dz-file-preview\">\n  <div class=\"dz-details\">\n    <div class=\"dz-filename\"><span data-dz-name></span></div>\n    <div class=\"dz-size\" data-dz-size></div>\n    <img data-dz-thumbnail />\n  </div>\n  <div class=\"dz-progress\"><span class=\"dz-upload\" data-dz-uploadprogress></span></div>\n  <div class=\"dz-success-mark\"><span>✔</span></div>\n  <div class=\"dz-error-mark\"><span>✘</span></div>\n  <div class=\"dz-error-message\"><span data-dz-errormessage></span></div>\n</div>"
    };

    extend = function() {
      var key, object, objects, target, val, _i, _len;
      target = arguments[0], objects = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      for (_i = 0, _len = objects.length; _i < _len; _i++) {
        object = objects[_i];
        for (key in object) {
          val = object[key];
          target[key] = val;
        }
      }
      return target;
    };

    function Dropzone(element, options) {
      var elementOptions, fallback, _ref;
      this.element = element;
      this.version = Dropzone.version;
      this.defaultOptions.previewTemplate = this.defaultOptions.previewTemplate.replace(/\n*/g, "");
      this.clickableElements = [];
      this.listeners = [];
      this.files = [];
      if (typeof this.element === "string") {
        this.element = document.querySelector(this.element);
      }
      if (!(this.element && (this.element.nodeType != null))) {
        throw new Error("Invalid dropzone element.");
      }
      if (this.element.dropzone) {
        throw new Error("Dropzone already attached.");
      }
      Dropzone.instances.push(this);
      element.dropzone = this;
      elementOptions = (_ref = Dropzone.optionsForElement(this.element)) != null ? _ref : {};
      this.options = extend({}, this.defaultOptions, elementOptions, options != null ? options : {});
      if (this.options.url == null) {
        this.options.url = this.element.action;
      }
      if (!this.options.url) {
        throw new Error("No URL provided.");
      }
      if (this.options.acceptedFiles && this.options.acceptedMimeTypes) {
        throw new Error("You can't provide both 'acceptedFiles' and 'acceptedMimeTypes'. 'acceptedMimeTypes' is deprecated.");
      }
      if (this.options.acceptedMimeTypes) {
        this.options.acceptedFiles = this.options.acceptedMimeTypes;
        delete this.options.acceptedMimeTypes;
      }
      this.options.method = this.options.method.toUpperCase();
      if (this.options.forceFallback || !Dropzone.isBrowserSupported()) {
        return this.options.fallback.call(this);
      }
      if ((fallback = this.getExistingFallback()) && fallback.parentNode) {
        fallback.parentNode.removeChild(fallback);
      }
      if (this.options.previewsContainer) {
        this.previewsContainer = Dropzone.getElement(this.options.previewsContainer, "previewsContainer");
      } else {
        this.previewsContainer = this.element;
      }
      if (this.options.clickable) {
        if (this.options.clickable === true) {
          this.clickableElements = [this.element];
        } else {
          this.clickableElements = Dropzone.getElements(this.options.clickable, "clickable");
        }
      }
      this.init();
    }

    Dropzone.prototype.getAcceptedFiles = function() {
      var file, _i, _len, _ref, _results;
      _ref = this.files;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        file = _ref[_i];
        if (file.accepted) {
          _results.push(file);
        }
      }
      return _results;
    };

    Dropzone.prototype.getRejectedFiles = function() {
      var file, _i, _len, _ref, _results;
      _ref = this.files;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        file = _ref[_i];
        if (!file.accepted) {
          _results.push(file);
        }
      }
      return _results;
    };

    Dropzone.prototype.getQueuedFiles = function() {
      var file, _i, _len, _ref, _results;
      _ref = this.files;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        file = _ref[_i];
        if (file.status === Dropzone.QUEUED) {
          _results.push(file);
        }
      }
      return _results;
    };

    Dropzone.prototype.getUploadingFiles = function() {
      var file, _i, _len, _ref, _results;
      _ref = this.files;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        file = _ref[_i];
        if (file.status === Dropzone.UPLOADING) {
          _results.push(file);
        }
      }
      return _results;
    };

    Dropzone.prototype.init = function() {
      var eventName, noPropagation, setupHiddenFileInput, _i, _len, _ref, _ref1,
        _this = this;
      if (this.element.tagName === "form") {
        this.element.setAttribute("enctype", "multipart/form-data");
      }
      if (this.element.classList.contains("dropzone") && !this.element.querySelector(".dz-message")) {
        this.element.appendChild(Dropzone.createElement("<div class=\"dz-default dz-message\"><span>" + this.options.dictDefaultMessage + "</span></div>"));
      }
      if (this.clickableElements.length) {
        setupHiddenFileInput = function() {
          if (_this.hiddenFileInput) {
            document.body.removeChild(_this.hiddenFileInput);
          }
          _this.hiddenFileInput = document.createElement("input");
          _this.hiddenFileInput.setAttribute("type", "file");
          if (_this.options.uploadMultiple) {
            _this.hiddenFileInput.setAttribute("multiple", "multiple");
          }
          if (_this.options.acceptedFiles != null) {
            _this.hiddenFileInput.setAttribute("accept", _this.options.acceptedFiles);
          }
          _this.hiddenFileInput.style.visibility = "hidden";
          _this.hiddenFileInput.style.position = "absolute";
          _this.hiddenFileInput.style.top = "0";
          _this.hiddenFileInput.style.left = "0";
          _this.hiddenFileInput.style.height = "0";
          _this.hiddenFileInput.style.width = "0";
          document.body.appendChild(_this.hiddenFileInput);
          return _this.hiddenFileInput.addEventListener("change", function() {
            var files;
            files = _this.hiddenFileInput.files;
            if (files.length) {
              _this.emit("selectedfiles", files);
              _this.handleFiles(files);
            }
            return setupHiddenFileInput();
          });
        };
        setupHiddenFileInput();
      }
      this.URL = (_ref = window.URL) != null ? _ref : window.webkitURL;
      _ref1 = this.events;
      for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
        eventName = _ref1[_i];
        this.on(eventName, this.options[eventName]);
      }
      this.on("uploadprogress", function() {
        return _this.updateTotalUploadProgress();
      });
      this.on("removedfile", function() {
        return _this.updateTotalUploadProgress();
      });
      this.on("canceled", function(file) {
        return _this.emit("complete", file);
      });
      noPropagation = function(e) {
        e.stopPropagation();
        if (e.preventDefault) {
          return e.preventDefault();
        } else {
          return e.returnValue = false;
        }
      };
      this.listeners = [
        {
          element: this.element,
          events: {
            "dragstart": function(e) {
              return _this.emit("dragstart", e);
            },
            "dragenter": function(e) {
              noPropagation(e);
              return _this.emit("dragenter", e);
            },
            "dragover": function(e) {
              noPropagation(e);
              return _this.emit("dragover", e);
            },
            "dragleave": function(e) {
              return _this.emit("dragleave", e);
            },
            "drop": function(e) {
              noPropagation(e);
              _this.drop(e);
              return _this.emit("drop", e);
            },
            "dragend": function(e) {
              return _this.emit("dragend", e);
            }
          }
        }
      ];
      this.clickableElements.forEach(function(clickableElement) {
        return _this.listeners.push({
          element: clickableElement,
          events: {
            "click": function(evt) {
              if ((clickableElement !== _this.element) || (evt.target === _this.element || Dropzone.elementInside(evt.target, _this.element.querySelector(".dz-message")))) {
                return _this.hiddenFileInput.click();
              }
            }
          }
        });
      });
      this.enable();
      return this.options.init.call(this);
    };

    Dropzone.prototype.destroy = function() {
      var _ref;
      this.disable();
      this.removeAllFiles(true);
      if ((_ref = this.hiddenFileInput) != null ? _ref.parentNode : void 0) {
        this.hiddenFileInput.parentNode.removeChild(this.hiddenFileInput);
        this.hiddenFileInput = null;
      }
      return delete this.element.dropzone;
    };

    Dropzone.prototype.updateTotalUploadProgress = function() {
      var acceptedFiles, file, totalBytes, totalBytesSent, totalUploadProgress, _i, _len, _ref;
      totalBytesSent = 0;
      totalBytes = 0;
      acceptedFiles = this.getAcceptedFiles();
      if (acceptedFiles.length) {
        _ref = this.getAcceptedFiles();
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          file = _ref[_i];
          totalBytesSent += file.upload.bytesSent;
          totalBytes += file.upload.total;
        }
        totalUploadProgress = 100 * totalBytesSent / totalBytes;
      } else {
        totalUploadProgress = 100;
      }
      return this.emit("totaluploadprogress", totalUploadProgress, totalBytes, totalBytesSent);
    };

    Dropzone.prototype.getFallbackForm = function() {
      var existingFallback, fields, fieldsString, form;
      if (existingFallback = this.getExistingFallback()) {
        return existingFallback;
      }
      fieldsString = "<div class=\"dz-fallback\">";
      if (this.options.dictFallbackText) {
        fieldsString += "<p>" + this.options.dictFallbackText + "</p>";
      }
      fieldsString += "<input type=\"file\" name=\"" + this.options.paramName + (this.options.uploadMultiple ? "[]" : "") + "\" " + (this.options.uploadMultiple ? 'multiple="multiple"' : void 0) + " /><button type=\"submit\">Upload!</button></div>";
      fields = Dropzone.createElement(fieldsString);
      if (this.element.tagName !== "FORM") {
        form = Dropzone.createElement("<form action=\"" + this.options.url + "\" enctype=\"multipart/form-data\" method=\"" + this.options.method + "\"></form>");
        form.appendChild(fields);
      } else {
        this.element.setAttribute("enctype", "multipart/form-data");
        this.element.setAttribute("method", this.options.method);
      }
      return form != null ? form : fields;
    };

    Dropzone.prototype.getExistingFallback = function() {
      var fallback, getFallback, tagName, _i, _len, _ref;
      getFallback = function(elements) {
        var el, _i, _len;
        for (_i = 0, _len = elements.length; _i < _len; _i++) {
          el = elements[_i];
          if (/(^| )fallback($| )/.test(el.className)) {
            return el;
          }
        }
      };
      _ref = ["div", "form"];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        tagName = _ref[_i];
        if (fallback = getFallback(this.element.getElementsByTagName(tagName))) {
          return fallback;
        }
      }
    };

    Dropzone.prototype.setupEventListeners = function() {
      var elementListeners, event, listener, _i, _len, _ref, _results;
      _ref = this.listeners;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        elementListeners = _ref[_i];
        _results.push((function() {
          var _ref1, _results1;
          _ref1 = elementListeners.events;
          _results1 = [];
          for (event in _ref1) {
            listener = _ref1[event];
            _results1.push(elementListeners.element.addEventListener(event, listener, false));
          }
          return _results1;
        })());
      }
      return _results;
    };

    Dropzone.prototype.removeEventListeners = function() {
      var elementListeners, event, listener, _i, _len, _ref, _results;
      _ref = this.listeners;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        elementListeners = _ref[_i];
        _results.push((function() {
          var _ref1, _results1;
          _ref1 = elementListeners.events;
          _results1 = [];
          for (event in _ref1) {
            listener = _ref1[event];
            _results1.push(elementListeners.element.removeEventListener(event, listener, false));
          }
          return _results1;
        })());
      }
      return _results;
    };

    Dropzone.prototype.disable = function() {
      var file, _i, _len, _ref, _results;
      this.clickableElements.forEach(function(element) {
        return element.classList.remove("dz-clickable");
      });
      this.removeEventListeners();
      _ref = this.files;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        file = _ref[_i];
        _results.push(this.cancelUpload(file));
      }
      return _results;
    };

    Dropzone.prototype.enable = function() {
      this.clickableElements.forEach(function(element) {
        return element.classList.add("dz-clickable");
      });
      return this.setupEventListeners();
    };

    Dropzone.prototype.filesize = function(size) {
      var string;
      if (size >= 100000000000) {
        size = size / 100000000000;
        string = "TB";
      } else if (size >= 100000000) {
        size = size / 100000000;
        string = "GB";
      } else if (size >= 100000) {
        size = size / 100000;
        string = "MB";
      } else if (size >= 100) {
        size = size / 100;
        string = "KB";
      } else {
        size = size * 10;
        string = "b";
      }
      return "<strong>" + (Math.round(size) / 10) + "</strong> " + string;
    };

    Dropzone.prototype.drop = function(e) {
      var files, items;
      if (!e.dataTransfer) {
        return;
      }
      files = e.dataTransfer.files;
      this.emit("selectedfiles", files);
      if (files.length) {
        items = e.dataTransfer.items;
        if (items && items.length && ((items[0].webkitGetAsEntry != null) || (items[0].getAsEntry != null))) {
          this.handleItems(items);
        } else {
          this.handleFiles(files);
        }
      }
    };

    Dropzone.prototype.handleFiles = function(files) {
      var file, _i, _len, _results;
      _results = [];
      for (_i = 0, _len = files.length; _i < _len; _i++) {
        file = files[_i];
        _results.push(this.addFile(file));
      }
      return _results;
    };

    Dropzone.prototype.handleItems = function(items) {
      var entry, item, _i, _len;
      for (_i = 0, _len = items.length; _i < _len; _i++) {
        item = items[_i];
        if (item.webkitGetAsEntry != null) {
          entry = item.webkitGetAsEntry();
          if (entry.isFile) {
            this.addFile(item.getAsFile());
          } else if (entry.isDirectory) {
            this.addDirectory(entry, entry.name);
          }
        } else {
          this.addFile(item.getAsFile());
        }
      }
    };

    Dropzone.prototype.accept = function(file, done) {
      if (file.size > this.options.maxFilesize * 1024 * 1024) {
        return done(this.options.dictFileTooBig.replace("{{filesize}}", Math.round(file.size / 1024 / 10.24) / 100).replace("{{maxFilesize}}", this.options.maxFilesize));
      } else if (!Dropzone.isValidFile(file, this.options.acceptedFiles)) {
        return done(this.options.dictInvalidFileType);
      } else {
        return this.options.accept.call(this, file, done);
      }
    };

    Dropzone.prototype.addFile = function(file) {
      var _this = this;
      file.upload = {
        progress: 0,
        total: file.size,
        bytesSent: 0
      };
      this.files.push(file);
      file.status = Dropzone.ADDED;
      this.emit("addedfile", file);
      if (this.options.createImageThumbnails && file.type.match(/image.*/) && file.size <= this.options.maxThumbnailFilesize * 1024 * 1024) {
        this.createThumbnail(file);
      }
      return this.accept(file, function(error) {
        if (error) {
          file.accepted = false;
          return _this._errorProcessing([file], error);
        } else {
          file.accepted = true;
          return _this.enqueueFile(file);
        }
      });
    };

    Dropzone.prototype.enqueueFiles = function(files) {
      var file, _i, _len;
      for (_i = 0, _len = files.length; _i < _len; _i++) {
        file = files[_i];
        this.enqueueFile(file);
      }
      return null;
    };

    Dropzone.prototype.enqueueFile = function(file) {
      var _this = this;
      if (file.status === Dropzone.ADDED) {
        file.status = Dropzone.QUEUED;
        if (this.options.autoProcessQueue) {
          return setTimeout((function() {
            return _this.processQueue();
          }), 1);
        }
      } else {
        throw new Error("This file can't be queued because it has already been processed or was rejected.");
      }
    };

    Dropzone.prototype.addDirectory = function(entry, path) {
      var dirReader, entriesReader,
        _this = this;
      dirReader = entry.createReader();
      entriesReader = function(entries) {
        var _i, _len;
        for (_i = 0, _len = entries.length; _i < _len; _i++) {
          entry = entries[_i];
          if (entry.isFile) {
            entry.file(function(file) {
              if (_this.options.ignoreHiddenFiles && file.name.substring(0, 1) === '.') {
                return;
              }
              file.fullPath = "" + path + "/" + file.name;
              return _this.addFile(file);
            });
          } else if (entry.isDirectory) {
            _this.addDirectory(entry, "" + path + "/" + entry.name);
          }
        }
      };
      return dirReader.readEntries(entriesReader, function(error) {
        return typeof console !== "undefined" && console !== null ? typeof console.log === "function" ? console.log(error) : void 0 : void 0;
      });
    };

    Dropzone.prototype.removeFile = function(file) {
      if (file.status === Dropzone.UPLOADING) {
        this.cancelUpload(file);
      }
      this.files = without(this.files, file);
      this.emit("removedfile", file);
      if (this.files.length === 0) {
        return this.emit("reset");
      }
    };

    Dropzone.prototype.removeAllFiles = function(cancelIfNecessary) {
      var file, _i, _len, _ref;
      if (cancelIfNecessary == null) {
        cancelIfNecessary = false;
      }
      _ref = this.files.slice();
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        file = _ref[_i];
        if (file.status !== Dropzone.UPLOADING || cancelIfNecessary) {
          this.removeFile(file);
        }
      }
      return null;
    };

    Dropzone.prototype.createThumbnail = function(file) {
      var fileReader,
        _this = this;
      fileReader = new FileReader;
      fileReader.onload = function() {
        var img;
        img = new Image;
        img.onload = function() {
          var canvas, ctx, resizeInfo, thumbnail, _ref, _ref1, _ref2, _ref3;
          file.width = img.width;
          file.height = img.height;
          resizeInfo = _this.options.resize.call(_this, file);
          if (resizeInfo.trgWidth == null) {
            resizeInfo.trgWidth = _this.options.thumbnailWidth;
          }
          if (resizeInfo.trgHeight == null) {
            resizeInfo.trgHeight = _this.options.thumbnailHeight;
          }
          canvas = document.createElement("canvas");
          ctx = canvas.getContext("2d");
          canvas.width = resizeInfo.trgWidth;
          canvas.height = resizeInfo.trgHeight;
          ctx.drawImage(img, (_ref = resizeInfo.srcX) != null ? _ref : 0, (_ref1 = resizeInfo.srcY) != null ? _ref1 : 0, resizeInfo.srcWidth, resizeInfo.srcHeight, (_ref2 = resizeInfo.trgX) != null ? _ref2 : 0, (_ref3 = resizeInfo.trgY) != null ? _ref3 : 0, resizeInfo.trgWidth, resizeInfo.trgHeight);
          thumbnail = canvas.toDataURL("image/png");
          return _this.emit("thumbnail", file, thumbnail);
        };
        return img.src = fileReader.result;
      };
      return fileReader.readAsDataURL(file);
    };

    Dropzone.prototype.processQueue = function() {
      var i, parallelUploads, processingLength, queuedFiles;
      parallelUploads = this.options.parallelUploads;
      processingLength = this.getUploadingFiles().length;
      i = processingLength;
      queuedFiles = this.getQueuedFiles();
      if (!(queuedFiles.length > 0)) {
        return;
      }
      if (this.options.uploadMultiple) {
        return this.processFiles(queuedFiles.slice(0, parallelUploads));
      } else {
        while (i < parallelUploads) {
          if (!queuedFiles.length) {
            return;
          }
          this.processFile(queuedFiles.shift());
          i++;
        }
      }
    };

    Dropzone.prototype.processFile = function(file) {
      return this.processFiles([file]);
    };

    Dropzone.prototype.processFiles = function(files) {
      var file, _i, _len;
      for (_i = 0, _len = files.length; _i < _len; _i++) {
        file = files[_i];
        file.processing = true;
        file.status = Dropzone.UPLOADING;
        this.emit("processing", file);
      }
      if (this.options.uploadMultiple) {
        this.emit("processingmultiple", files);
      }
      return this.uploadFiles(files);
    };

    Dropzone.prototype._getFilesWithXhr = function(xhr) {
      var file, files;
      return files = (function() {
        var _i, _len, _ref, _results;
        _ref = this.files;
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          file = _ref[_i];
          if (file.xhr === xhr) {
            _results.push(file);
          }
        }
        return _results;
      }).call(this);
    };

    Dropzone.prototype.cancelUpload = function(file) {
      var groupedFile, groupedFiles, _i, _j, _len, _len1, _ref;
      if (file.status === Dropzone.UPLOADING) {
        groupedFiles = this._getFilesWithXhr(file.xhr);
        for (_i = 0, _len = groupedFiles.length; _i < _len; _i++) {
          groupedFile = groupedFiles[_i];
          groupedFile.status = Dropzone.CANCELED;
        }
        file.xhr.abort();
        for (_j = 0, _len1 = groupedFiles.length; _j < _len1; _j++) {
          groupedFile = groupedFiles[_j];
          this.emit("canceled", groupedFile);
        }
        if (this.options.uploadMultiple) {
          this.emit("canceledmultiple", groupedFiles);
        }
      } else if ((_ref = file.status) === Dropzone.ADDED || _ref === Dropzone.QUEUED) {
        file.status = Dropzone.CANCELED;
        this.emit("canceled", file);
        if (this.options.uploadMultiple) {
          this.emit("canceledmultiple", [file]);
        }
      }
      if (this.options.autoProcessQueue) {
        return this.processQueue();
      }
    };

    Dropzone.prototype.uploadFile = function(file) {
      return this.uploadFiles([file]);
    };

    Dropzone.prototype.uploadFiles = function(files) {
      var file, formData, handleError, header, headers, input, inputName, inputType, key, name, progressObj, response, updateProgress, value, xhr, _i, _j, _k, _l, _len, _len1, _len2, _len3, _ref, _ref1, _ref2, _ref3,
        _this = this;
      xhr = new XMLHttpRequest();
      for (_i = 0, _len = files.length; _i < _len; _i++) {
        file = files[_i];
        file.xhr = xhr;
      }
      xhr.open(this.options.method, this.options.url, true);
      xhr.withCredentials = !!this.options.withCredentials;
      response = null;
      handleError = function() {
        var _j, _len1, _results;
        _results = [];
        for (_j = 0, _len1 = files.length; _j < _len1; _j++) {
          file = files[_j];
          _results.push(_this._errorProcessing(files, response || _this.options.dictResponseError.replace("{{statusCode}}", xhr.status), xhr));
        }
        return _results;
      };
      updateProgress = function(e) {
        var allFilesFinished, progress, _j, _k, _l, _len1, _len2, _len3, _results;
        if (e != null) {
          progress = 100 * e.loaded / e.total;
          for (_j = 0, _len1 = files.length; _j < _len1; _j++) {
            file = files[_j];
            file.upload = {
              progress: progress,
              total: e.total,
              bytesSent: e.loaded
            };
          }
        } else {
          allFilesFinished = true;
          progress = 100;
          for (_k = 0, _len2 = files.length; _k < _len2; _k++) {
            file = files[_k];
            if (!(file.upload.progress === 100 && file.upload.bytesSent === file.upload.total)) {
              allFilesFinished = false;
            }
            file.upload.progress = progress;
            file.upload.bytesSent = file.upload.total;
          }
          if (allFilesFinished) {
            return;
          }
        }
        _results = [];
        for (_l = 0, _len3 = files.length; _l < _len3; _l++) {
          file = files[_l];
          _results.push(_this.emit("uploadprogress", file, progress, file.upload.bytesSent));
        }
        return _results;
      };
      xhr.onload = function(e) {
        var _ref;
        if (files[0].status === Dropzone.CANCELED) {
          return;
        }
        if (xhr.readyState !== 4) {
          return;
        }
        response = xhr.responseText;
        if (xhr.getResponseHeader("content-type") && ~xhr.getResponseHeader("content-type").indexOf("application/json")) {
          try {
            response = JSON.parse(response);
          } catch (_error) {
            e = _error;
            response = "Invalid JSON response from server.";
          }
        }
        updateProgress();
        if (!((200 <= (_ref = xhr.status) && _ref < 300))) {
          return handleError();
        } else {
          return _this._finished(files, response, e);
        }
      };
      xhr.onerror = function() {
        if (files[0].status === Dropzone.CANCELED) {
          return;
        }
        return handleError();
      };
      progressObj = (_ref = xhr.upload) != null ? _ref : xhr;
      progressObj.onprogress = updateProgress;
      headers = {
        "Accept": "application/json",
        "Cache-Control": "no-cache",
        "X-Requested-With": "XMLHttpRequest"
      };
      if (this.options.headers) {
        extend(headers, this.options.headers);
      }
      for (header in headers) {
        name = headers[header];
        xhr.setRequestHeader(header, name);
      }
      formData = new FormData();
      if (this.options.params) {
        _ref1 = this.options.params;
        for (key in _ref1) {
          value = _ref1[key];
          formData.append(key, value);
        }
      }
      for (_j = 0, _len1 = files.length; _j < _len1; _j++) {
        file = files[_j];
        this.emit("sending", file, xhr, formData);
      }
      if (this.options.uploadMultiple) {
        this.emit("sendingmultiple", files, xhr, formData);
      }
      if (this.element.tagName === "FORM") {
        _ref2 = this.element.querySelectorAll("input, textarea, select, button");
        for (_k = 0, _len2 = _ref2.length; _k < _len2; _k++) {
          input = _ref2[_k];
          inputName = input.getAttribute("name");
          inputType = input.getAttribute("type");
          if (!inputType || ((_ref3 = inputType.toLowerCase()) !== "checkbox" && _ref3 !== "radio") || input.checked) {
            formData.append(inputName, input.value);
          }
        }
      }
      for (_l = 0, _len3 = files.length; _l < _len3; _l++) {
        file = files[_l];
        formData.append("" + this.options.paramName + (this.options.uploadMultiple ? "[]" : ""), file, file.name);
      }
      return xhr.send(formData);
    };

    Dropzone.prototype._finished = function(files, responseText, e) {
      var file, _i, _len;
      for (_i = 0, _len = files.length; _i < _len; _i++) {
        file = files[_i];
        file.status = Dropzone.SUCCESS;
        this.emit("success", file, responseText, e);
        this.emit("complete", file);
      }
      if (this.options.uploadMultiple) {
        this.emit("successmultiple", files, responseText, e);
        this.emit("completemultiple", files);
      }
      if (this.options.autoProcessQueue) {
        return this.processQueue();
      }
    };

    Dropzone.prototype._errorProcessing = function(files, message, xhr) {
      var file, _i, _len;
      for (_i = 0, _len = files.length; _i < _len; _i++) {
        file = files[_i];
        file.status = Dropzone.ERROR;
        this.emit("error", file, message, xhr);
        this.emit("complete", file);
      }
      if (this.options.uploadMultiple) {
        this.emit("errormultiple", files, message, xhr);
        this.emit("completemultiple", files);
      }
      if (this.options.autoProcessQueue) {
        return this.processQueue();
      }
    };

    return Dropzone;

  })(Em);

  Dropzone.version = "3.6.1";

  Dropzone.options = {};

  Dropzone.optionsForElement = function(element) {
    if (element.id) {
      return Dropzone.options[camelize(element.id)];
    } else {
      return void 0;
    }
  };

  Dropzone.instances = [];

  Dropzone.forElement = function(element) {
    if (typeof element === "string") {
      element = document.querySelector(element);
    }
    if ((element != null ? element.dropzone : void 0) == null) {
      throw new Error("No Dropzone found for given element. This is probably because you're trying to access it before Dropzone had the time to initialize. Use the `init` option to setup any additional observers on your Dropzone.");
    }
    return element.dropzone;
  };

  Dropzone.autoDiscover = true;

  Dropzone.discover = function() {
    var checkElements, dropzone, dropzones, _i, _len, _results;
    if (!Dropzone.autoDiscover) {
      return;
    }
    if (document.querySelectorAll) {
      dropzones = document.querySelectorAll(".dropzone");
    } else {
      dropzones = [];
      checkElements = function(elements) {
        var el, _i, _len, _results;
        _results = [];
        for (_i = 0, _len = elements.length; _i < _len; _i++) {
          el = elements[_i];
          if (/(^| )dropzone($| )/.test(el.className)) {
            _results.push(dropzones.push(el));
          } else {
            _results.push(void 0);
          }
        }
        return _results;
      };
      checkElements(document.getElementsByTagName("div"));
      checkElements(document.getElementsByTagName("form"));
    }
    _results = [];
    for (_i = 0, _len = dropzones.length; _i < _len; _i++) {
      dropzone = dropzones[_i];
      if (Dropzone.optionsForElement(dropzone) !== false) {
        _results.push(new Dropzone(dropzone));
      } else {
        _results.push(void 0);
      }
    }
    return _results;
  };

  Dropzone.blacklistedBrowsers = [/opera.*Macintosh.*version\/12/i];

  Dropzone.isBrowserSupported = function() {
    var capableBrowser, regex, _i, _len, _ref;
    capableBrowser = true;
    if (window.File && window.FileReader && window.FileList && window.Blob && window.FormData && document.querySelector) {
      if (!("classList" in document.createElement("a"))) {
        capableBrowser = false;
      } else {
        _ref = Dropzone.blacklistedBrowsers;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          regex = _ref[_i];
          if (regex.test(navigator.userAgent)) {
            capableBrowser = false;
            continue;
          }
        }
      }
    } else {
      capableBrowser = false;
    }
    return capableBrowser;
  };

  without = function(list, rejectedItem) {
    var item, _i, _len, _results;
    _results = [];
    for (_i = 0, _len = list.length; _i < _len; _i++) {
      item = list[_i];
      if (item !== rejectedItem) {
        _results.push(item);
      }
    }
    return _results;
  };

  camelize = function(str) {
    return str.replace(/[\-_](\w)/g, function(match) {
      return match[1].toUpperCase();
    });
  };

  Dropzone.createElement = function(string) {
    var div;
    div = document.createElement("div");
    div.innerHTML = string;
    return div.childNodes[0];
  };

  Dropzone.elementInside = function(element, container) {
    if (element === container) {
      return true;
    }
    while (element = element.parentNode) {
      if (element === container) {
        return true;
      }
    }
    return false;
  };

  Dropzone.getElement = function(el, name) {
    var element;
    if (typeof el === "string") {
      element = document.querySelector(el);
    } else if (el.nodeType != null) {
      element = el;
    }
    if (element == null) {
      throw new Error("Invalid `" + name + "` option provided. Please provide a CSS selector or a plain HTML element.");
    }
    return element;
  };

  Dropzone.getElements = function(els, name) {
    var e, el, elements, _i, _j, _len, _len1, _ref;
    if (els instanceof Array) {
      elements = [];
      try {
        for (_i = 0, _len = els.length; _i < _len; _i++) {
          el = els[_i];
          elements.push(this.getElement(el, name));
        }
      } catch (_error) {
        e = _error;
        elements = null;
      }
    } else if (typeof els === "string") {
      elements = [];
      _ref = document.querySelectorAll(els);
      for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
        el = _ref[_j];
        elements.push(el);
      }
    } else if (els.nodeType != null) {
      elements = [els];
    }
    if (!((elements != null) && elements.length)) {
      throw new Error("Invalid `" + name + "` option provided. Please provide a CSS selector, a plain HTML element or a list of those.");
    }
    return elements;
  };

  Dropzone.isValidFile = function(file, acceptedFiles) {
    var baseMimeType, mimeType, validType, _i, _len;
    if (!acceptedFiles) {
      return true;
    }
    acceptedFiles = acceptedFiles.split(",");
    mimeType = file.type;
    baseMimeType = mimeType.replace(/\/.*$/, "");
    for (_i = 0, _len = acceptedFiles.length; _i < _len; _i++) {
      validType = acceptedFiles[_i];
      validType = validType.trim();
      if (validType.charAt(0) === ".") {
        if (file.name.indexOf(validType, file.name.length - validType.length) !== -1) {
          return true;
        }
      } else if (/\/\*$/.test(validType)) {
        if (baseMimeType === validType.replace(/\/.*$/, "")) {
          return true;
        }
      } else {
        if (mimeType === validType) {
          return true;
        }
      }
    }
    return false;
  };

  if (typeof jQuery !== "undefined" && jQuery !== null) {
    jQuery.fn.dropzone = function(options) {
      return this.each(function() {
        return new Dropzone(this, options);
      });
    };
  }

  if (typeof module !== "undefined" && module !== null) {
    module.exports = Dropzone;
  } else {
    window.Dropzone = Dropzone;
  }

  Dropzone.ADDED = "added";

  Dropzone.QUEUED = "queued";

  Dropzone.ACCEPTED = Dropzone.QUEUED;

  Dropzone.UPLOADING = "uploading";

  Dropzone.PROCESSING = Dropzone.UPLOADING;

  Dropzone.CANCELED = "canceled";

  Dropzone.ERROR = "error";

  Dropzone.SUCCESS = "success";

  /*
  # contentloaded.js
  #
  # Author: Diego Perini (diego.perini at gmail.com)
  # Summary: cross-browser wrapper for DOMContentLoaded
  # Updated: 20101020
  # License: MIT
  # Version: 1.2
  #
  # URL:
  # http://javascript.nwbox.com/ContentLoaded/
  # http://javascript.nwbox.com/ContentLoaded/MIT-LICENSE
  */


  contentLoaded = function(win, fn) {
    var add, doc, done, init, poll, pre, rem, root, top;
    done = false;
    top = true;
    doc = win.document;
    root = doc.documentElement;
    add = (doc.addEventListener ? "addEventListener" : "attachEvent");
    rem = (doc.addEventListener ? "removeEventListener" : "detachEvent");
    pre = (doc.addEventListener ? "" : "on");
    init = function(e) {
      if (e.type === "readystatechange" && doc.readyState !== "complete") {
        return;
      }
      (e.type === "load" ? win : doc)[rem](pre + e.type, init, false);
      if (!done && (done = true)) {
        return fn.call(win, e.type || e);
      }
    };
    poll = function() {
      var e;
      try {
        root.doScroll("left");
      } catch (_error) {
        e = _error;
        setTimeout(poll, 50);
        return;
      }
      return init("poll");
    };
    if (doc.readyState !== "complete") {
      if (doc.createEventObject && root.doScroll) {
        try {
          top = !win.frameElement;
        } catch (_error) {}
        if (top) {
          poll();
        }
      }
      doc[add](pre + "DOMContentLoaded", init, false);
      doc[add](pre + "readystatechange", init, false);
      return win[add](pre + "load", init, false);
    }
  };

  contentLoaded(window, Dropzone.discover);

}).call(this);

    return module.exports;
}));

// Pattern which adds support for file upload with
// drag and drop support.
//
// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('mockup-patterns-dropzone',[
  'jquery',
  'mockup-patterns-base',
  'dropzone'
], function($, Base, Dropzone) {
  

  /* we do not want this plugin to auto discover */
  Dropzone.autoDiscover = false;

  var DropzonePattern = Base.extend({
    name: "dropzone",
    defaults: {
      url: null, // XXX MUST provide url to submit to OR be in a form
      className: 'dropzone',
      paramName: "file",
      uploadMultiple: false,
      clickable: false,
      wrap: false,
      wrapperTemplate: '<div class="dropzone-container"/>',
      resultTemplate: '<div class="dz-notice">' +
          '<p>Drop files here...</p></div><div class="dropzone-previews"/>',
      autoCleanResults: false,
      previewsContainer: '.dropzone-previews'
    },
    init: function() {
      var self = this;
      if(typeof(self.options.clickable) === "string"){
        if(self.options.clickable === 'true'){
          self.options.clickable = true;
        } else {
          self.options.clickable = false;
        }
      }
      if(!self.options.url && self.$el[0].tagName === 'FORM'){
        var url = self.$el.attr('action');
        if(!url){
          // form without action, defaults to current url
          url = window.location.href;
        }
        self.options.url = url;
      }
      var $el = self.$el;
      if(self.options.wrap){
        var wrapFunc = $el.wrap;
        if(self.options.wrap === 'inner'){
          $el.wrapInner(self.options.wrapperTemplate);
          $el = $el.children().eq(0);
        } else {
          $el.wrap(self.options.wrapperTemplate);
          $el = $el.parent();
        }
      }
      $el.append('<div class="dz-notice"><p>Drop files here...</p></div>');
      if(self.options.previewsContainer === '.dropzone-previews'){
        $el.append('<div class="dropzone-previews"/>');
      }

      var autoClean = self.options.autoCleanResults;
      $el.addClass(self.options.className);

      // clean up options
      var options = $.extend({}, self.options);
      delete options.wrap;
      delete options.wrapperTemplate;
      delete options.resultTemplate;
      delete options.autoCleanResults;

      if(self.options.previewsContainer){
        /*
         * if they have a select but it's not an id, let's make an id selector
         * so we can target the correct container. dropzone is weird here...
         */
        var $preview = $el.find(self.options.previewsContainer);
        if($preview.length > 0){
          options.previewsContainer = $preview[0];
        }
      }

      self.dropzone = new Dropzone($el[0], options);
      self.$dropzone = $el;

      if(autoClean){
        self.dropzone.on('complete', function(file){
          setTimeout(function(){
            $(file.previewElement).fadeOut();
          }, 3000);
        });
      }
    }
  });

  return DropzonePattern;

});



/*!
 * jQuery Cookie Plugin v1.3.1
 * https://github.com/carhartl/jquery-cookie
 *
 * Copyright 2013 Klaus Hartl
 * Released under the MIT license
 */
(function ($, document, undefined) {

	var pluses = /\+/g;

	function raw(s) {
		return s;
	}

	function decoded(s) {
		return unRfc2068(decodeURIComponent(s.replace(pluses, ' ')));
	}

	function unRfc2068(value) {
		if (value.indexOf('"') === 0) {
			// This is a quoted cookie as according to RFC2068, unescape
			value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
		}
		return value;
	}

	function fromJSON(value) {
		return config.json ? JSON.parse(value) : value;
	}

	var config = $.cookie = function (key, value, options) {

		// write
		if (value !== undefined) {
			options = $.extend({}, config.defaults, options);

			if (value === null) {
				options.expires = -1;
			}

			if (typeof options.expires === 'number') {
				var days = options.expires, t = options.expires = new Date();
				t.setDate(t.getDate() + days);
			}

			value = config.json ? JSON.stringify(value) : String(value);

			return (document.cookie = [
				encodeURIComponent(key), '=', config.raw ? value : encodeURIComponent(value),
				options.expires ? '; expires=' + options.expires.toUTCString() : '', // use expires attribute, max-age is not supported by IE
				options.path    ? '; path=' + options.path : '',
				options.domain  ? '; domain=' + options.domain : '',
				options.secure  ? '; secure' : ''
			].join(''));
		}

		// read
		var decode = config.raw ? raw : decoded;
		var cookies = document.cookie.split('; ');
		var result = key ? null : {};
		for (var i = 0, l = cookies.length; i < l; i++) {
			var parts = cookies[i].split('=');
			var name = decode(parts.shift());
			var cookie = decode(parts.join('='));

			if (key && key === name) {
				result = fromJSON(cookie);
				break;
			}

			if (!key) {
				result[name] = fromJSON(cookie);
			}
		}

		return result;
	};

	config.defaults = {};

	$.removeCookie = function (key, options) {
		if ($.cookie(key) !== null) {
			$.cookie(key, null, options);
			return true;
		}
		return false;
	};

})(jQuery, document);

define("jquery.cookie", ["jquery"], function(){});

// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('js/patterns/structure/views/app',[
  'jquery',
  'underscore',
  'backbone',
  'js/ui/views/toolbar',
  'js/ui/views/buttongroup',
  'js/ui/views/button',
  'js/ui/views/base',
  'js/patterns/structure/views/table',
  'js/patterns/structure/views/selectionwell',
  'js/patterns/structure/views/tags',
  'js/patterns/structure/views/properties',
  'js/patterns/structure/views/workflow',
  'js/patterns/structure/views/delete',
  'js/patterns/structure/views/rename',
  'js/patterns/structure/views/sort',
  'js/patterns/structure/views/selectionbutton',
  'js/patterns/structure/views/paging',
  'js/patterns/structure/views/addmenu',
  'js/patterns/structure/views/columns',
  'js/patterns/structure/views/textfilter',
  'js/patterns/structure/collections/result',
  'js/patterns/structure/collections/selected',
  'mockup-patterns-dropzone',
  'jquery.cookie'
], function($, _, Backbone, Toolbar, ButtonGroup, ButtonView, BaseView,
            TableView, SelectionWellView, TagsView, PropertiesView,
            WorkflowView, DeleteView, RenameView, SortView, SelectionButtonView,
            PagingView, AddMenu, ColumnsView, TextFilterView, ResultCollection,
            SelectedCollection, DropZone) {
  

  var DISABLE_EVENT = 'DISABLE';

  var AppView = BaseView.extend({
    tagName: 'div',
    /* we setup binding here and specifically for every button so there is a
     * way to override default click event behavior.
     * Otherwise, if we bound all buttons to the same event, there is no way
     * to override the event or stop bubbling it. */
    buttonClickEvents: {
      'cut': 'cutCopyClickEvent',
      'copy': 'cutCopyClickEvent',
      'paste': 'pasteEvent',
      'tags': DISABLE_EVENT, //disable
      'properties': DISABLE_EVENT,
      'workflow': DISABLE_EVENT,
      'delete': DISABLE_EVENT,
      'rename': DISABLE_EVENT,
      'sort': DISABLE_EVENT
    },
    buttonViewMapping: {
      'secondary.tags': TagsView,
      'secondary.properties': PropertiesView,
      'secondary.workflow': WorkflowView,
      'primary.delete': DeleteView,
      'secondary.rename': RenameView
    },
    status: '',
    statusType: 'warning',
    pasteOperation: null,
    sort_on: 'getObjPositionInParent',
    sort_order: 'ascending',
    additionalCriterias: [],
    pasteSelection: null,
    cookieSettingPrefix: '_fc_',
    initialize: function(){
      var self = this;
      BaseView.prototype.initialize.call(self);
      self.setAllCookieSettings();

      self.collection = new ResultCollection([], {
        url: self.options.collectionUrl
      });
      self.collection.queryParser = function(){
        var term = null;
        if(self.toolbar){
          term = self.toolbar.get('filter').term;
        }
        var sort_on = self.sort_on;
        if(!sort_on){
          sort_on = 'getObjPositionInParent';
        }
        return JSON.stringify({
          criteria: self.queryHelper.getCriterias(term, {
            additionalCriterias: self.additionalCriterias
          }),
          sort_on: sort_on,
          sort_order: self.sort_order
        });
      };

      self.queryHelper = self.options.queryHelper;
      self.selectedCollection = new SelectedCollection();
      self.collection.queryHelper = self.queryHelper;
      self.tableView = new TableView({app: self});
      self.pagingView = new PagingView({app: self});
      self.pasteAllowed = self.options.pasteAllowed;

      /* initialize buttons */
      self.setupButtons();

      self.wellView = new SelectionWellView({
        collection: self.selectedCollection,
        triggerView: self.toolbar.get('selected'),
        app: self
      });

      self.buttonViews = {};
      _.map(self.buttonViewMapping, function(ViewClass, key, list){
        var name = key.split('.');
        var group = name[0];
        var buttonName = name[1];
        self.buttonViews[key] = new ViewClass({
          triggerView: self.buttons[group].get(buttonName),
          app: self
        });
      });

      self.toolbar.get('selected').disable();
      self.buttons.primary.disable();
      self.buttons.secondary.disable();

      self.selectedCollection.on('add remove reset', function(modal, collection) {
        if (collection.length) {
          self.toolbar.get('selected').enable();
          self.buttons.primary.enable();
          self.buttons.secondary.enable();
          if(!self.pasteAllowed){
            self.buttons.primary.get('paste').disable();
          }
        } else {
          this.toolbar.get('selected').disable();
          self.buttons.primary.disable();
          self.buttons.secondary.disable();
        }
      }, self);

      self.collection.on('sync', function(){
        // need to reload models inside selectedCollection so they get any
        // updated metadata
        if(self.selectedCollection.models.length > 0){
          var uids = [];
          self.selectedCollection.each(function(item){
            uids.push(item.attributes.UID);
          });
          self.queryHelper.search(
            'UID', 'plone.app.querystring.operation.list.contains',
            uids,
            function(data){
              _.each(data.results, function(attributes){
                var item = self.selectedCollection.getByUID(attributes.UID);
                item.attributes = attributes;
              });
            },
            false);
        }

        if(self.contextInfoUrl){
          $.ajax({
            url: self.getAjaxUrl(self.contextInfoUrl),
            dataType: 'json',
            success: function(data){
              self.trigger('context-info-loaded', data);
            },
            error: function(){
              // XXX handle error?
            }
          });
        }
      });

      /* detect key events */
      $(document).bind('keyup keydown', function(e){
        self.keyEvent = e;
      });

    },
    inQueryMode: function(){
      if(this.additionalCriterias.length > 0){
        return true;
      }
      if(this.sort_on && this.sort_on !== 'getObjPositionInParent'){
        return true;
      }
      if(this.sort_order !== 'ascending'){
        return true;
      }
      return false;
    },
    getSelectedUids: function(collection){
      var self = this;
      if(collection === undefined){
        collection = self.selectedCollection;
      }
      var uids = [];
      collection.each(function(item){
        uids.push(item.uid());
      });
      return uids;
    },
    getAjaxUrl: function(url){
      return url.replace('{path}', this.options.queryHelper.getCurrentPath());
    },
    defaultButtonClickEvent: function(button){
      var self = this;
      var data = null, callback = null;

      if(button.url){
        // handle ajax now

        if(arguments.length > 1){
          var arg1 = arguments[1];
          if(!arg1.preventDefault){
            data = arg1;
          }
        }
        if(arguments.length > 2){
          var arg2 = arguments[2];
          if(typeof(arg2) === 'function'){
            callback = arg2;
          }
        }
        if(data === null){
          data = {};
        }
        if(data.selection === undefined){
          // if selection is overridden by another mechanism
          data.selection = JSON.stringify(self.getSelectedUids());
        }
        data._authenticator = $('input[name="_authenticator"]').val();
        if(data.folder === undefined){
          data.folder = self.options.queryHelper.getCurrentPath();
        }

        var url = self.getAjaxUrl(button.url);
        $.ajax({
          url: url,
          type: 'POST',
          data: data,
          success: function(data){
            self.ajaxSuccessResponse.apply(self, [data, callback]);
          },
          error: function(response){
            self.ajaxErrorResponse.apply(self, [response]);
          }
        }, self);
      }
    },
    ajaxSuccessResponse: function(data, callback){
      var self = this;
      if(data.status === 'success'){
        self.collection.reset();
      }
      if(data.msg){
        // give status message somewhere...
        self.setStatus(data.msg);
      }
      if(callback !== null && callback !== undefined){
        callback(data);
      }
      self.collection.pager();
    },
    ajaxErrorResponse: function(response){
      var self = this;
      if(response.status === 404){
        window.alert('operation url "' + url + '" is not valid');
      }
    },
    pasteEvent: function(button, e, data){
      var self = this;
      if(data === undefined){
        data = {};
      }
      data = $.extend(true, {}, {
        selection: JSON.stringify(self.getSelectedUids(self.pasteSelection)),
        pasteOperation: self.pasteOperation
      }, data);
      self.defaultButtonClickEvent(button, data);
    },
    cutCopyClickEvent: function(button){
      var self = this;
      var txt;
      if(button.id === 'cut'){
        txt = 'cut ';
        self.pasteOperation = 'cut';
      }else{
        txt = 'copied ';
        self.pasteOperation = 'copy';
      }

      // clone selected items
      self.pasteSelection = new Backbone.Collection();
      self.selectedCollection.each(function(item){
        self.pasteSelection.add(item);
      });
      txt += 'selection';
      self.setStatus(txt);
      self.pasteAllowed = true;
      self.buttons.primary.get('paste').enable();
    },
    setupButtons: function(){
      var self = this;
      self.buttons = {};
      var items = [];

      var columnsBtn = new ButtonView({
        id: 'columns',
        tooltip: 'Configure displayed columns',
        icon: 'columns'
      });

      self.columnsView = new ColumnsView({
        app: self,
        triggerView: columnsBtn
      });
      items.push(columnsBtn);

      items.push(new SelectionButtonView({
        title: 'Selected',
        id: 'selected',
        collection: this.selectedCollection
      }));

      if(self.options.contextInfoUrl){
        // only add menu if set
        items.push(new AddMenu({
          contextInfoUrl: self.options.contextInfoUrl,
          app: self
        }));
      }
      if(self.options.sort){
        var sortButton = new ButtonView({
          id: 'sort',
          title: 'Sort',
          tooltip: 'Sort folder contents',
          url: self.options.sort.url
        });
        self.sortView = new SortView({
          triggerView: sortButton,
          app: self
        });
        items.push(sortButton);
      }

      _.each(_.pairs(this.options.buttonGroups), function(group){
        var buttons = [];
        _.each(group[1], function(button){
          button = new ButtonView(button);
          buttons.push(button);
          // bind click events now...
          var ev = self.buttonClickEvents[button.id];
          if(ev !== DISABLE_EVENT){
            if(ev === undefined){
              ev = 'defaultButtonClickEvent'; // default click event
            }
            button.on('button:click', self[ev], self);
          }
        });
        self.buttons[group[0]] = new ButtonGroup({
          items: buttons,
          id: group[0],
          app: self
        });
        items.push(self.buttons[group[0]]);
      });
      items.push(new TextFilterView({
        id: 'filter',
        app: this
      }));
      this.toolbar = new Toolbar({
        items: items
      });
    },
    moveItem: function(id, delta, subset_ids){
      var self = this;
      $.ajax({
        url: this.getAjaxUrl(this.options.moveUrl),
        type: 'POST',
        data: {
          delta: delta,
          id: id,
          _authenticator: $('[name="_authenticator"]').val(),
          subset_ids: JSON.stringify(subset_ids)
        },
        dataType: 'json',
        success: function(data){
          if(data.msg){
            self.setStatus(data.msg);
          }else if(data.status !== "success"){
            // XXX handle error here with something?
            self.setStatus('error moving item');
          }
          self.collection.pager(); // reload it all
        },
        error: function(data){
          self.setStatus('error moving item');
        }
      });
    },
    setStatus: function(txt, type){
      this.status = txt;
      if(type === undefined){
        type = 'warning';
      }
      this.statusType = type;
      this.$('td.status').addClass(type).html(txt);
    },
    render: function(){
      var self = this;

      self.$el.append(self.toolbar.render().el);
      self.$el.append(self.wellView.render().el);
      self.$el.append(self.columnsView.render().el);
      if(self.sortView){
        self.$el.append(self.sortView.render().el);
      }

      _.each(self.buttonViews, function(view){
        self.$el.append(view.render().el);
      });

      self.$el.append(self.tableView.render().el);
      self.$el.append(self.pagingView.render().el);

      /* dropzone support */
      if(self.options.uploadUrl){
        /* add upload button to toolbar */
        var uploadBtn = new ButtonView({
          title: 'Upload',
          context: 'success',
          icon: 'upload'
        });
        self.toolbar.$el.append(uploadBtn.render().el);
        uploadBtn.on('button:click', function(){
          // update because the url can change depending on the folder we're in.
          self.dropzone.options.url = self.getAjaxUrl(self.options.uploadUrl);
          self.dropzone.hiddenFileInput.click();
        });
        self.dropzone = new DropZone(self.$el, {
          className: 'structure-dropzone',
          //clickable: false,
          clickable: $('<div/>')[0],
          url: self.getAjaxUrl(self.options.uploadUrl),
          autoCleanResults: true,
          success: function(e, data){
            self.collection.pager();
          }
        }).dropzone;
        self.dropzone.on('sending', function(){
          self.$el.addClass('dropping');
        });
        self.dropzone.on('complete', function(){
          self.$el.removeClass('dropping');
        });
        self.dropzone.on('drop', function(){
          // because this can change depending on the folder we're in
          self.dropzone.options.url = self.getAjaxUrl(self.options.uploadUrl);
        });
        /* allow multiple to upload at once */
        $(self.dropzone.hiddenFileInput).attr('multiple', 'true');
      }

      // Backdrop class
      if (self.options.backdropSelector !== null) {
        $(self.options.backdropSelector).addClass('ui-backdrop-element');
      } else {
        self.$el.addClass('ui-backdrop-element');
      }

      return self;
    },
    getCookieSetting: function(name, _default){
      if(_default === undefined){
        _default = null;
      }
      var val;
      try{
        val = $.cookie(this.cookieSettingPrefix + name);
        val = $.parseJSON(val).value;
      }catch(e){
        /* error parsing json, load default here now */
        return _default;
      }
      if(val === undefined || val === null){
        return _default;
      }
      return val;
    },
    setCookieSetting: function(name, val){
      $.cookie(this.cookieSettingPrefix + name,
               JSON.stringify({'value': val})
      );
    },
    setAllCookieSettings: function(){
      this.activeColumns = this.getCookieSetting('activeColumns', this.activeColumns);
    }
  });

  return AppView;
});

// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// Description:
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


define('mockup-patterns-structure',[
  'jquery',
  'mockup-patterns-base',
  'mockup-patterns-queryhelper',
  'js/patterns/structure/views/app',
  'text!js/patterns/structure/templates/paging.xml',
  'text!js/patterns/structure/templates/selection_button.xml',
  'text!js/patterns/structure/templates/selection_item.xml',
  'text!js/patterns/structure/templates/tablerow.xml',
  'text!js/patterns/structure/templates/table.xml',
  'text!js/ui/templates/popover.xml'
], function($, Base, QueryHelper, AppView) {
  

  var Structure = Base.extend({
    name: 'structure',
    defaults: {
      vocabularyUrl: null,
      tagsVocabularyUrl: null,
      usersVocabularyUrl: null,
      indexOptionsUrl: null, // for querystring widget
      contextInfoUrl: null, // for add new dropdown and other info
      setDefaultPageUrl: null,
      backdropSelector: '.modal', // Element upon which to apply backdrops used for popovers
      attributes: ['UID', 'Title', 'Type', 'path', 'review_state',
                   'ModificationDate', 'EffectiveDate', 'CreationDate',
                   'is_folderish', 'Subject', 'getURL', 'id', 'exclude_from_nav',
                   'getObjSize', 'last_comment_date', 'total_comments'],
      activeColumns: [
        'ModificationDate',
        'EffectiveDate',
        'review_state'
      ],
      availableColumns: {
        'ModificationDate': 'Last modified',
        'EffectiveDate': 'Published',
        'CreationDate': 'Created',
        'review_state': 'Review state',
        'Subject': 'Tags',
        'Type': 'Type',
        'is_folderish': 'Folder',
        'exclude_from_nav': 'Excluded from nav',
        'getObjSize': 'Object Size',
        'last_comment_date': 'Last comment date',
        'total_comments': 'Total comments'
      },
      sort: {
        properties: {
          'id': 'ID',
          'sortable_title': 'Title',
          'modified': 'Last Modified',
          'created': 'Created on',
          'effective': 'Publication Date',
          'Type': 'Type'
        },
        url: '/sort'
      },
      basePath: '/',
      uploadUrl: null,
      moveUrl: null,
      /*
       * all these base buttons are required
       */
      buttonGroups: {
        primary: [{
          title: 'Cut',
          url: '/cut'
        },{
          title: 'Copy',
          url: '/copy'
        },{
          title: 'Paste',
          url: '/paste'
        },{
          title: 'Delete',
          url: '/delete',
          context: 'danger'
        }],
        secondary: [{
          title: 'Workflow',
          url: '/workflow'
        },{
          title: 'Tags',
          url: '/tags'
        },{
          title: 'Properties',
          url: '/properties'
        },{
          title: 'Rename',
          url: '/rename'
        }]
      }
    },
    init: function() {
      var self = this;
      self.browsing = true; // so all queries will be correct with QueryHelper
      self.options.collectionUrl = self.options.vocabularyUrl;
      self.options.queryHelper = new QueryHelper(self.$el,
        $.extend(true, {}, self.options, {basePattern: self}));

      delete self.options.attributes; // not compatible with backbone

      self.view = new AppView(self.options);
      self.$el.append(self.view.render().$el);
    }
  });

  return Structure;

});



// Author: Nathan Van Gheem
// Contact: nathan@vangheem.us
// Version: 1.0
//
// License:
//
// Copyright (C) 2010 Plone Foundation
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//


if (window.jQuery) {
  define( "jquery", [], function () {
    
    return window.jQuery;
  } );
}

define('mockup-bundles-structure',[
  'jquery',
  'mockup-registry',
  'mockup-patterns-base',
  'mockup-patterns-modal',
  'mockup-patterns-structure'
], function($, registry, Base, Modal, Structure) {
  

  $(document).ready(function(){
    var $structure = $('.pat-structure');
    if($structure.length === 1){
      var $container = $structure.parents('#content');
      if($container.length === 0){
        // uh oh, no content id, let's go up a few levels and use that as parent
        $container = $structure.parent().parent();
      }
      var $modal = $container.patternModal({
        position: 'middle top',
        width: '95%',
        title: 'Folder Contents',
        backdropOptions: {
          closeOnEsc: false,
          closeOnClick: false
        }
      });
      var modal = $modal.data('pattern-modal');
      modal.show();
      modal.$modal.find('a.close').on('destroy.modal.patterns', function(){
        var $base = $('base');
        var url;
        if($base.length === 0){
          url = window.location.href.replace('@@folder_contents', '').replace('folder_contents', '');
        }else{
          url = $base.attr('href');
        }
        window.location = url;
      });
    }
  });

  return {};
});

require(["mockup-bundles-structure"]);
}());