const ensureFullURL = href => {
    const link = document.createElement("a");
    link.href = href; // link will turn it into full URL
    return link.href;
};

const sendURL = url => {
	self.port.emit("image", {
		"url": url,
		"shift": shiftdown
	});
};

const detectShiftDown = event => {
	if (event.keyCode == 16) shiftdown = true;
};

const detectShiftUp = event => {
	if (event.keyCode == 16) shiftdown = false;
};

const onDblClick = event => {
	if (event.target.nodeName == "IMG") {
		sendURL(event.target.src);
	} else {
		const img = recurseForImage(event.target);
		if (img) {
			sendURL(img.src);
		}
	}
};

const recurseForImage = element => {
	for (let i = 0;i < element.childNodes.length;i++) {
		const child = element.childNodes[i];
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
};

let shiftdown = false;

document.addEventListener("dblclick", onDblClick);
document.addEventListener("keydown", detectShiftDown);
document.addEventListener("keyup", detectShiftUp);