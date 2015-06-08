const {Cu} = require("chrome");
const self = require("sdk/self");
const notifications = require("sdk/notifications");
const privateBrowsing = require("sdk/private-browsing");
const prefs = require("sdk/simple-prefs");
const storage = require("sdk/simple-storage");
const urls = require("sdk/url");
const fileIO = require("sdk/io/file");
const tabs = require("sdk/tabs");
const Request = require("sdk/request").Request;

const {debug} = require("./lib/debug-1.0.0.js");
const {validatePref} = require("./lib/validate-prefs-1.0.1.js");

Cu.import("resource://gre/modules/DownloadIntegration.jsm");
Cu.import("resource://gre/modules/Downloads.jsm");
Cu.import("resource://gre/modules/osfile.jsm");

const excludedDomainsRegex = (() => {
	const domainword = "[a-z0-9\\-]+";
	const domain = "(?:%domain%\\.)+%domain%".replace(/%domain%/g, domainword);
	return new RegExp("^(?:%domain%(?:,%domain%)*)?$".replace(/%domain%/g, domain), "i");
})();
const mimeRegex = /^image\/(svg+xml|png|p?jpeg|gif)$/;
const illegalCharsRegex = /[^\w\-\s\.,%;]+/ig;
const whiteSpaceRegex = /^\s*$/;

const ext = mime => {
	const type = mimeRegex.exec(mime);
	return type? type[1].toLowerCase().replace(/p?jpeg/, "jpg").replace("svg+xml", "svg"): null;
};

const rename = (filename, tab) => {
	const out = prefs.prefs["fileNamePattern"].replace(/%counter%/g, storage.storage.counter).replace(/%original%/g, filename).replace(/%title%/g, tab.title).replace(illegalCharsRegex, "-").replace(/\s+/g, " ");
	if (prefs.prefs["fileNamePattern"].indexOf("%counter%") != -1) storage.storage.counter++;
	return out;
}

const name = (url, tab, extension) => {
	let filename = url.pathname.split("/");
	filename = filename[filename.length - (url.pathname.charAt(url.pathname.length - 1) == "/"? 2: 1)].replace(illegalCharsRegex, "").replace("." + extension, "");
	return prefs.prefs["enableRename"]? rename(filename, tab): filename;
};

const save = (url, tab) => {
	let sdkURL = urls.URL(url);
	if (excludedDomains.filter(domain => sdkURL.host.indexOf(domain) != -1).length == 0) {
		debug("getting headers from", url);
		Request({
			url: url,
			onComplete: response => {
				if (response.status == 200) {
					const ct = response.headers["Content-Type"];
					let extension;
					if (ct) {
						debug("image is", ct);
						extension = ext(ct);
						debug("extension is", extension);
					} else {
						let cd = response.headers["Content-Disposition"];
						if (cd && cd.indexOf("filename") != -1) {
							debug("not implemented");
						} else {
							throw "Image type could not be determined: fatal error";
						}
					}
					
					if (extension) {
						extension = "." + extension;
						let filename = name(sdkURL, tab, extension);
						let folder = prefs.prefs["targetFolder"];
						DownloadIntegration.getPreferredDownloadsDirectory().then(path => {
							download(url, tab, path, filename, extension);
						}).then(null, onError);
					}
				} else {
					onError(url + ": " + response.status);
				}
			}
		}).head();
	}
};

const download = (url, tab, folder, filename, extension) => {
	if (prefs.prefs["enableSubfolder"]) {
		folder = fileIO.join(folder, prefs.prefs["folderNamePattern"].replace(/%domain%/g, urls.URL(tab.url).host).replace(/%title%/g, tab.title).replace(illegalCharsRegex, "-").replace(/\s+/g, " "));
		fileIO.mkpath(folder);
	}
	let target = fileIO.join(folder, filename + extension);
	if (fileIO.exists(target)) {
		let counter = 1;
		while(fileIO.exists(target)) {
			target = fileIO.join(folder, filename + "_" + (counter++) + extension);
		}
	}
	
	Downloads.createDownload({
		"source": {
			"url": url,
			"isPrivate": privateBrowsing.isPrivate(tab)
		},
		"target": target
	}).then(dl => {
		dl.whenSucceeded().then(function() {
			notifications.notify({
				title: "Image downloaded succesfully!",
				text: dl.target.path,
				iconURL: "file:///" + dl.target.path.replace(/\\/g, "/"),
				onClick: function(data) {
					tabs.open("file:///" + folder.replace(/\\/g, "/"));
				}
			});
		}).then(null, onError);
		dl.start().then(null, onError);
	}).then(null, onError);
};

const onError = error => {
	notifications.notify({
		title: "Failed to download image!",
		iconURL: self.data.url("error-64.png")
	});
	console.warn(error);
};

let excludedDomains = [];
const excludedDomainsPref = validatePref("excludedDomains", value => excludedDomainsRegex.test(value), (valid, value) => {
	excludedDomains = value == ""? []: value.split(",");
});

if (!storage.storage.counter) storage.storage.counter = 1;
if (prefs.prefs["resetCounterOnRestart"]) storage.storage.counter = 1;

prefs.on("fileNamePattern", pref => {
	if (whiteSpaceRegex.test(prefs.prefs[pref])) {
		prefs.prefs["enableRename"] = false;
		prefs.prefs[pref] = "";
	} else {
		prefs.prefs["enableRename"] = true;
		prefs.prefs[pref] = prefs.prefs[pref].replace(illegalCharsRegex, "");
	}
});

prefs.on("folderNamePattern", pref => {
	if (whiteSpaceRegex.test(prefs.prefs[pref])) {
		prefs.prefs["enableSubfolder"] = false;
		prefs.prefs[pref] = "";
	} else {
		prefs.prefs["enableSubfolder"] = true;
		prefs.prefs[pref] = prefs.prefs[pref].replace(illegalCharsRegex, "");
	}
});

const onImage = (obj, worker) => {
	if (!prefs.prefs["requireShift"] || prefs.prefs["requireShift"] && obj.shift) save(obj.url, worker.tab);
};
const onAttach = worker => worker.port.on("image", obj => onImage(obj, worker));

exports.main = () => require("sdk/page-mod").PageMod({
	include: "*",
	contentScriptFile: self.data.url("listener.js"),
	attachTo: ["existing", "top", "frame"],
	contentScriptWhen: "ready",
	onAttach: onAttach
});