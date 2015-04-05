const html_filename = document.getElementById("filenamepattern");
const html_resetfile = document.getElementById("clearfilename");
const html_foldername = document.getElementById("foldernamepattern");
const html_resetfolder = document.getElementById("clearfoldername");
const html_reset = document.getElementById("resetcounter");

function notify(type, pattern) {
	self.port.emit(type + "PatternChanged", {
		pattern: pattern
	});
}

html_filename.addEventListener("change", function(event) {
	notify("file", event.target.value);
});

html_resetfile.addEventListener("click", function(event) {
	html_filename.value = "";
	notify("file", "");
});

html_foldername.addEventListener("change", function(event) {
	notify("folder", event.target.value);
});

html_resetfolder.addEventListener("click", function(event) {
	html_foldername.value = "";
	notify("folder", "");
});

html_reset.addEventListener("click", function(event) {
	self.port.emit("counterResetRequested");
});

self.port.on("filePatternChanged", function(data) {
	html_filename.value = data.pattern;
});

self.port.on("folderPatternChanged", function(data) {
	html_foldername.value = data.pattern;
});