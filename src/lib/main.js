exports.main = function() {
	const {Cu} = require('chrome');
	const pageMod = require("sdk/page-mod");
	const self = require("sdk/self");
	const notifications = require("sdk/notifications");
	const privateBrowsing = require("sdk/private-browsing");
	const {ToggleButton} = require("sdk/ui/button/toggle");
	const panel = require("sdk/panel");
	const prefs = require('sdk/simple-prefs');
	const storage = require("sdk/simple-storage");
	const urls = require("sdk/url");
	const fileIO = require("sdk/io/file");
	const tabs = require("sdk/tabs");
	const Request = require("sdk/request").Request;
	
	Cu.import("resource://gre/modules/DownloadIntegration.jsm");
	Cu.import("resource://gre/modules/Downloads.jsm");
	Cu.import("resource://gre/modules/osfile.jsm");
	
	const excludedDomainsRegex = /^(([a-z0-9]+\.)+([a-z0-9]+)(,([a-z0-9]+\.)+([a-z0-9]+))*)?$/i;
	const mimeRegex = /^image\/(svg+xml|png|p?jpeg|gif)$/;
	const illegalCharsRegex = /[^\w\-\s\.,%;]+/ig;
	const whiteSpaceRegex = /^\s*$/;
	
	function notifyLinkDisabler(worker) {
		worker.port.emit("hybridWorkaroundSet", prefs.prefs["disableLinks"]);
	}
	
	function handleChange(state) {
		if (state.checked) {
			configpanel.show({
				position: config
			});
		}
	}
	
	function ext(mime) {
		let type = mimeRegex.exec(mime);
		return type? type[1].replace(/p?jpeg/i, "jpg").replace("svg+xml", "svg"): null;
	}
	
	function name(url, tab, extension) {
		let filename = decodeURIComponent(url.pathname).split("/");
		filename = filename[filename.length - (url.pathname.charAt(url.pathname.length - 1) == "/"? 2: 1)].replace(illegalCharsRegex, "");
		let index = filename.indexOf(extension);
		while (index != -1) {
			filename = filename.replace(extension, "");
			index = filename.indexOf(extension);
		}
		if (prefs.prefs["enableRename"]) {
			filename = prefs.prefs["fileNamePattern"].replace(/%counter%/g, storage.storage.counter).replace(/%original%/g, filename).replace(/%title%/g, tab.title).replace(illegalCharsRegex, "-").replace(/\s+/g, " ");
			if (prefs.prefs["fileNamePattern"].indexOf("%counter%") != -1) {
				storage.storage.counter++;
			}
		}
		return filename;
	}
	
	function save(url, tab) {
		let excludedDomains = (excludedDomainsValid && prefs.prefs["excludedDomains"].length > 0)? prefs.prefs["excludedDomains"].split(','): [];
		let sdkURL = urls.URL(url);
		if (excludedDomains.indexOf(sdkURL.host) == -1) {
			Request({
				url: url,
				onComplete: function(response) {
					if (response.status == 200) {
						let extension = ext(response.headers["Content-Type"]);
						if (extension) {
							extension = "." + extension;
							let filename = name(sdkURL, tab, extension);
							let folder = prefs.prefs["targetFolder"];
							if (!folder) {
								DownloadIntegration.getPreferredDownloadsDirectory().then(path => {
									download(url, tab, path, filename, extension);
								}).then(null, onError);
							} else {
								try {
									if (!fileIO.exists(folder)) {
										fileIO.mkpath(folder);
									}
									download(url, tab, folder, filename, extension);
								} catch(error) {
									DownloadIntegration.getPreferredDownloadsDirectory().then(path => {
										download(url, tab, path, filename, extension);
									}).then(null, onError);
								}
							}
						}
					} else {
						onError(url + ": " + response.status);
					}
				}
			}).head();
		}
	}
	
	function download(url, tab, folder, filename, extension) {
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
			"target": target,
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
	}
	
	function onError(error) {
		if (prefs.prefs["enableToaster"]) {
			notifications.notify({
				title: "Failed to download image!",
				iconURL: self.data.url("error-64.png")
			});
		}
		console.error(error);
	}
	
	function updateConfigPanel(name) {
		configpanel.port.emit(name + "PatternChanged", {
			pattern: prefs.prefs["enable" + (name == "file"? "Rename": "Subfolder")]? prefs.prefs[name + "NamePattern"]: ""
		});
	}
	
	function validateExcludedDomains() {
		if (excludedDomainsValid == null) {
			excludedDomainsValid = excludedDomainsRegex.test(prefs.prefs["excludedDomains"]);
		}
		return excludedDomainsValid;
	}
	
	if (!storage.storage.counter) {
		storage.storage.counter = 1;
	}
	if (prefs.prefs["resetCounterOnRestart"]) {
		storage.storage.counter = 1;
	}
	
	let excludedDomainsValid = null;
	let workers = [];
	
	prefs.prefs["excludedDomainsValid"] = validateExcludedDomains();
	
	let config = ToggleButton({
		id: "doubleclick-image-downloader-config",
		label: "DID Config",
		icon: self.data.url("icon-64.png"),
		onChange: handleChange
	});
	
	let configpanel = panel.Panel({
		contentURL: self.data.url("config.html"),
		contentScriptFile: self.data.url("config.js"),
		onHide: function() {
			config.state("window", {
				checked: false
			});
		}
	});
	updateConfigPanel("file");
	updateConfigPanel("folder");
	
	configpanel.port.on("counterResetRequested", function(data) {
		storage.storage.counter = 0;
	});
	configpanel.port.on("filePatternChanged", function(data) {
		if (whiteSpaceRegex.test(data.pattern)) {
			prefs.prefs["enableRename"] = false;
		} else {
			prefs.prefs["fileNamePattern"] = data.pattern.replace(illegalCharsRegex, "");
			prefs.prefs["enableRename"] = true;
		}
	});
	configpanel.port.on("folderPatternChanged", function(data) {
		if (whiteSpaceRegex.test(data.pattern)) {
			prefs.prefs["enableSubfolder"] = false;
		} else {
			prefs.prefs["folderNamePattern"] = data.pattern.replace(illegalCharsRegex, "");
			prefs.prefs["enableSubfolder"] = true;
		}
	});
	
	let mod = pageMod.PageMod({
		include: "*",
		contentScriptFile: self.data.url("listener.js"),
		attachTo: ["existing", "top", "frame"],
		onAttach: function(worker) {
			worker.port.on("image", function(obj) {
				if (!prefs.prefs["requireShift"] || prefs.prefs["requireShift"] && obj.shift) {
					save(decodeURIComponent(obj.url), worker.tab);
				}
			});
			notifyLinkDisabler(worker);
			workers.push(worker);
			worker.on("detach", function() {
				workers.splice(workers.indexOf(this), 1);
			});
		}
	});
	
	prefs.on("excludedDomainsValid", function(pref) {
		prefs.prefs[pref] = excludedDomainsValid;
	});
	prefs.on("excludedDomains", function(pref) {
		excludedDomainsValid = null;
		prefs.prefs["excludedDomainsValid"] = validateExcludedDomains();
	});
	
	prefs.on("disableLinks", function(pref) {
		for (var i = 0;i < workers.length;i++) {
			notifyLinkDisabler(workers[i]);
		}
	});
	
	prefs.on("enableRename", function(pref) {
		updateConfigPanel("file");
	});
	
	prefs.on("fileNamePattern", function(pref) {
		if (whiteSpaceRegex.test(prefs.prefs[pref])) {
			prefs.prefs["enableRename"] = false;
			prefs.prefs[pref] = "";
		} else {
			prefs.prefs["enableRename"] = true;
			prefs.prefs[pref] = prefs.prefs[pref].replace(illegalCharsRegex, "");
		}
		updateConfigPanel("file");
	});
	
	prefs.on("enableSubfolder", function(pref) {
		updateConfigPanel("folder");
	});
	
	prefs.on("folderNamePattern", function(pref) {
		if (whiteSpaceRegex.test(prefs.prefs[pref])) {
			prefs.prefs["enableSubfolder"] = false;
			prefs.prefs[pref] = "";
		} else {
			prefs.prefs["enableSubfolder"] = true;
			prefs.prefs[pref] = prefs.prefs[pref].replace(illegalCharsRegex, "");
		}
		updateConfigPanel("folder");
	});
}