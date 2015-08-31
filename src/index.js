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

const {validatePref} = require("./lib/validate-prefs-1.0.2.js");

Cu.import("resource://gre/modules/DownloadIntegration.jsm");
Cu.import("resource://gre/modules/Downloads.jsm");

const debug = (...args) => {
	if (prefs.prefs.debug) console.debug(...args);
};

const excludedDomainsRegex = (() => {
	const domainword = "[a-z0-9\\-]+";
	const domain = "(?:%domain%\\.)+%domain%".replace(/%domain%/g, domainword);
	return new RegExp("^(?:%domain%(?:,%domain%)*)?$".replace(/%domain%/g, domain), "i");
})();
const mimeRegex = /^image\/(svg+xml|png|p?jpeg|gif|bmp)$/;
const illegalCharsRegex = /[^\w\-\s\.,%;]+/ig;
const whiteSpaceRegex = /^\s*$/;
const dispositionRegex = /filename="([^"]+)"/i;
const fileNameRegex = /(.+)\.([^\.]+)?$/i;
const workers = [];

function File() {
	this.name = "";
	this.extension = "";
	this.setName = name => {
		const parsedFileName = fileNameRegex.exec(name);
		if (parsedFileName) {
			debug("setting filename", parsedFileName[1], "extension", parsedFileName[2]);
			this.name = parsedFileName[1];
			this.extension = parsedFileName[2];
		} else {
			debug("setting filename", name, "no extension");
			this.name = name;
		}
	};
	this.getDottedExtension = () => this.extension? "." + this.extension: "";
	this.getFullName = () => this.name + this.getDottedExtension();
	this.getSuffixedName = suffix => this.name + "_" + suffix + this.getDottedExtension();
}

const nameFromUrl = parsedUrl => {
	const parts = parsedUrl.pathname.split("/");
	return parts[parts.length - (parsedUrl.pathname.charAt(parsedUrl.pathname.length - 1) == "/"? 2: 1)];
};
const rename = (filename, tab) => {
	const out = prefs.prefs["fileNamePattern"].replace(/%counter%/g, storage.storage.counter).replace(/%original%/g, filename).replace(/%title%/g, tab.title);
	if (prefs.prefs["fileNamePattern"].indexOf("%counter%") != -1) storage.storage.counter++;
	return out;
};
const onNotifyClick = data => tabs.open("file:///" + data);
const onImage = (obj, worker) => sendHead(obj.url, worker.tab);
const onDetach = worker => workers.splice(workers.indexOf(worker), 1);
const onAttach = worker => {
	if (worker.tab) {
		worker.port.on("image", obj => onImage(obj, worker));
		workers.push(worker);
		worker.on("detach", onDetach);
	}
};
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
		
		const disposition = response.headers["Content-Disposition"];
		if (disposition) {
			const result = dispositionRegex.exec(disposition);
			if (result) {
				file.setName(result[1]);
			}
		} else {
			const urlName = decodeURIComponent(nameFromUrl(parsedUrl));
			file.setName(urlName);
			if (!file.extension) {
				const contentType = response.headers["Content-Type"];
				if (contentType) {
					const mime = mimeRegex.exec(contentType);
					if (mime) {
						file.extension = mime[1].toLowerCase().replace(/p?jpeg/, "jpg").replace("svg+xml", "svg");
					}
				}
			}
		}
		
		if (prefs.prefs["enableRename"]) file.name = rename(file.name, tab);
		file.name = file.name.replace(illegalCharsRegex, "-").replace(/\s+/g, " ");
		file.extension = file.extension.replace(illegalCharsRegex, "-").replace(/\s+/g, " ").substring(0, 3);
		
		const downloadRoot = prefs.prefs.downloadRoot;
		if (downloadRoot && fileIO.exists(downloadRoot) && !fileIO.isFile(downloadRoot)) {
			download(parsedUrl, tab, downloadRoot, file);
		} else {
			DownloadIntegration.getPreferredDownloadsDirectory().then(folder => {
				download(parsedUrl, tab, folder, file);
			}).then(null, onError);
		}
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
			target = fileIO.join(folder, file.getSuffixedName(counter++));
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
	if (valid) excludedDomains = whiteSpaceRegex.test(value)? []: value.split(",");
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

prefs.on("singleClickMode", pref => {
	const value = prefs.prefs[pref];
	workers.forEach(worker => worker.port.emit("setSingleClickEnabled", value));
});

prefs.on("singleClickButtonSize", pref => {
	prefs.prefs[pref] = Math.max(8, Math.min(prefs.prefs[pref], 64));
	workers.forEach(worker => worker.port.emit("setButtonSize", prefs.prefs[pref]));
});

prefs.on("requireShift", pref => {
	const value = prefs.prefs[pref];
	workers.forEach(worker => worker.port.emit("setRequireShift", value));
});

exports.main = () => require("sdk/page-mod").PageMod({
	include: "*",
	contentScriptFile: [self.data.url("jquery-2.1.4.min.js"), self.data.url("pagemod.js")],
	contentStyleFile: self.data.url("pagemod.css"),
	attachTo: ["existing", "top", "frame"],
	contentScriptWhen: "ready",
	contentScriptOptions: {
		buttonOnUrl: self.data.url("download_on.png"),
		buttonOffUrl: self.data.url("download_off.png"),
		requireShift: prefs.prefs.requireShift,
		singleClickEnabled: prefs.prefs.singleClickMode,
		buttonSize: prefs.prefs.singleClickButtonSize
	},
	onAttach: onAttach
});