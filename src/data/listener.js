function ensureFullURL(href) {
    let link = document.createElement("a");
    link.href = href; // link will turn it into full URL
    return link.href;
}

function sendURL(url) {
	self.port.emit("image", {
		"url": decodeURIComponent(url),
		"shift": shiftdown
	});
}

function detectShiftDown(event) {
	switch(event.keyCode) {
		case 16: shiftdown = true; break;
		case 18: altdown = true;
	}
}

function detectShiftUp(event) {
	switch(event.keyCode) {
		case 16: shiftdown = false; break;
		case 18: altdown = false;
	}
}

function recurseForImage(element) {
	for (var i = 0;i < element.childNodes.length;i++) {
		let child = element.childNodes[i];
		if (child.nodeName == "IMG") {
			return child;
		} else {
			let result = recurseForImage(child);
			if (result) {
				return result;
			}
		}
	}
	return false;
}

let shiftdown = false;
let altdown = false;
let hybridworkaround = true;

self.port.on("hybridWorkaroundSet", function(value) {
	hybridworkaround = value;
});

document.addEventListener("dblclick", function(event) {
	if (event.target.nodeName == "IMG") {
		sendURL(event.target.src);
	} else {
		if (event.target.nodeName == "A") {
			let img = recurseForImage(event.target);
			if (img) {
				sendURL(img.src);
			}
		}
	}
});

document.addEventListener("click", function(event) {
	if (event.target.nodeName == "A" && hybridworkaround && altdown) {
		event.preventDefault();
	}
});

document.addEventListener("keydown", detectShiftDown);
document.addEventListener("keyup", detectShiftUp);