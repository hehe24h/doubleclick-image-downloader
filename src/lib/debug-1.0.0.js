"use strict";

const PREFS = require("sdk/simple-prefs").prefs;
const SELF = require("sdk/self");

const PRIMITIVES = ["string", "number", "boolean"];

const isPrimitive = x => PRIMITIVES.indexOf(typeof(x)) != -1;
const subserialize = x => isPrimitive(x)? x: (Array.isArray(x)? "[" + x.length + "]": "{...}");
const subserializeObjectProp = (prop, obj) => prop + "=" + subserialize(obj[prop]);
const serialize = x => Array.isArray(x)? ("[" + x.map(subserialize).join(", ") + "]"): ("{" + Object.getOwnPropertyNames(x).map(prop => subserializeObjectProp(prop, x)).join(", ") + "}");
const toString = x => x.hasOwnProperty("toString")? x.toString(): serialize(x);
const stringify = x => {
	x = typeof(x) === "function"? x(): x;
	return isPrimitive(x)? x: toString(x);
};
const debug = (...args) => (args.length > 0 && PREFS.debug)? console.debug([SELF.name, "debugging:"].concat(args.map(stringify)).join(" ")): void(0);

exports.debug = debug;