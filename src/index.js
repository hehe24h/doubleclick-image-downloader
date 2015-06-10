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

const excludedDomainsRegex = (() => {
	const domainword = "[a-z0-9\\-]+";
	const domain = "(?:%domain%\\.)+%domain%".replace(/%domain%/g, domainword);
	return new RegExp("^(?:%domain%(?:,%domain%)*)?$".replace(/%domain%/g, domain), "i");
})();
const mimeRegex = /^image\/(svg+xml|png|p?jpeg|gif)$/;
const illegalCharsRegex = /[^\w\-\s\.,%;]+/ig;
const whiteSpaceRegex = /^\s*$/;
const dispositionRegex = /filename="([^"]+)\.(.+)"/i;
const fileExtensionRegex = /\.([^\.]+)$/i;

function File() {
	this.name = null;
	this.extension = null;
	this.getFullName = () => {
		if (this.name && this.extension) {
			return this.name + "." + this.extension;
		} else {
			throw "name or extension not set";
		}
	}
}

const nameFromUrl = parsedUrl => {
	const parts = parsedUrl.pathname.split("/");
	return parts[parts.length - (/\/$/.test(parsedUrl.pathname)? 2: 1)];
};
const rename = (filename, tab) => {
	const out = prefs.prefs["fileNamePattern"].replace(/%counter%/g, storage.storage.counter).replace(/%original%/g, filename).replace(/%title%/g, tab.title);
	if (prefs.prefs["fileNamePattern"].indexOf("%counter%") != -1) storage.storage.counter++;
	return out;
};
const onNotifyClick = data => tabs.open("file:///" + data);
const onImage = (obj, worker) => {
	if (!prefs.prefs["requireShift"] || prefs.prefs["requireShift"] && obj.shift) sendHead(obj.url, worker.tab);
};
const onAttach = worker => worker.port.on("image", obj => onImage(obj, worker));
const onError = error => {
	notifications.notify({
		title: "Failed to download image!",
		iconURL: self.data.url("error-64.png")
	});
	throw error;
};

const sendHead = (urlstring, tab) => {
	const parsedUrl = urls.URL(urlstring);
	if (excludedDomains.filter(domain => parsedUrl.host.indexOf(domain) != -1).length == 0) {
		debug("getting headers from", urlstring);
		Request({
			url: urlstring,
			onComplete: response => evalHead(response, parsedUrl, tab)
		}).head();
	}
}

const evalHead = (response, parsedUrl, tab) => {
	if (response.status == 200) {
		const file = new File();
		file.name = nameFromUrl(parsedUrl);
		
		const contentType = response.headers["Content-Type"];
		if (contentType && mimeRegex.test(contentType)) {
			file.extension = mimeRegex.exec(contentType)[1].toLowerCase().replace(/p?jpeg/, "jpg").replace("svg+xml", "svg");
		} else {
			const disposition = response.headers["Content-Disposition"];
			if (disposition && dispositionRegex.test(disposition)) {
				const result = dispositionRegex.exec(disposition);
				file.name = result[1];
				file.extension = result[2];
			} else {
				if (fileExtensionRegex.test(file.name)) {
					file.extension = fileExtensionRegex.exec(file.name)[2];
				} else {
					onError(parsedUrl.toString() + ": image type could not be determined");
				}
			}
		}
		
		if (prefs.prefs["enableRename"]) file.name = rename(file.name, tab);
		if (file.name.indexOf("." + file.extension) != -1) file.name = file.name.replace(new RegExp("\\." + file.extension, "g"), ""); 
		file.name = file.name.replace(illegalCharsRegex, "-").replace(/\s+/g, " ");
		
		DownloadIntegration.getPreferredDownloadsDirectory().then(folder => {
			download(parsedUrl, tab, folder, file);
		}).then(null, onError);
	} else {
		onError(urlstring + ": " + response.status);
	}
};

const download = (parsedUrl, tab, folder, file) => {
	if (prefs.prefs["enableSubfolder"]) {
		folder = fileIO.join(folder, prefs.prefs["folderNamePattern"].replace(/%domain%/g, parsedUrl.host).replace(/%title%/g, tab.title).replace(illegalCharsRegex, "-").replace(/\s+/g, " "));
		fileIO.mkpath(folder);
	}
	let target = fileIO.join(folder, file.getFullName());
	if (fileIO.exists(target)) {
		let counter = 1;
		while(fileIO.exists(target)) {
			target = fileIO.join(folder, file.name + "_" + (counter++) + "." + file.extension);
		}
	}
	
	Downloads.getList(Downloads.ALL).then(list => {
		Downloads.createDownload({
			"source": {
				"url": parsedUrl.toString(),
				"isPrivate": privateBrowsing.isPrivate(tab)
			},
			"target": target
		}).then(dl => {
			dl.whenSucceeded().then(() => {
				if (prefs.prefs["notify"]) notifications.notify({
					title: "Image downloaded succesfully!",
					text: dl.target.path,
					iconURL: "file:///" + dl.target.path.replace(/\\/g, "/"),
					data: folder,
					onClick: onNotifyClick
				});
			}, onError);
			list.add(dl);
			dl.start().then(null, onError);
		}, onError);
	}, onError);
};

let excludedDomains = [];
const excludedDomainsPref = validatePref("excludedDomains", value => excludedDomainsRegex.test(value), (valid, value) => {
	excludedDomains = whiteSpaceRegex.test(value)? []: value.split(",");
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

exports.main = () => require("sdk/page-mod").PageMod({
	include: "*",
	contentScriptFile: self.data.url("listener.js"),
	attachTo: ["existing", "top", "frame"],
	contentScriptWhen: "ready",
	onAttach: onAttach
});