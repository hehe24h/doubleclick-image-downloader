"use strict";

const PREFS = require("sdk/simple-prefs");

const watched = {};
const handlers = {};

const resetValid = prefValid => PREFS.prefs[prefValid] = watched[prefValid].valid;
const toValidName = pref => pref + "Valid";
const getValue = name => PREFS.prefs[name];

function watch(pref) {
	this.name = pref;
	this.getValue = () => getValue(this.name);
}

const run = pref => {
	const prefValid = toValidName(pref);
	
	const handle = handlers[pref];
	const valid = handle.validate(getValue(pref));
	if (typeof(valid) !== "boolean") {
		throw "validation method did not return a boolean";
	}
	watched[prefValid].valid = valid;
	if (getValue(prefValid) !== void(0)) PREFS.prefs[prefValid] = valid;
	const x = handle.callback(valid, getValue(pref));
	if (x != void(0)) PREFS.prefs[pref] = x;
}

const validatePref = (pref, validate, callback) => {
	const prefValid = toValidName(pref);
	
	const item = new watch(pref);
	watched[prefValid] = item;
	
	handlers[pref] = {
		validate: validate,
		callback: callback
	};
	
	run(pref);
	if (PREFS.prefs[prefValid] !== void(0)) PREFS.on(prefValid, resetValid);
	PREFS.on(pref, run);
	
	return item;
}

exports.validatePref = validatePref;