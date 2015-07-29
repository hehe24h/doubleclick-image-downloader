const ensureFullURL = href => {
    const link = document.createElement("a");
    link.href = href; // link will turn it into full URL
    return link.href;
};

const sendURL = url => {
	self.port.emit("image", {
		"url": url,
		"shift": shiftDown
	});
};

const detectShiftDown = event => {
	if (event.keyCode == 16) setShiftDown(true);
};

const detectShiftUp = event => {
	if (event.keyCode == 16) setShiftDown(false);
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

const onscroll = event => {
	if (currentImg) offset();
};

const offset = () => {
	var offset = $(currentImg).offset();
	offset.top = Math.max(0, offset.top - $(document).scrollTop());
	offset.left = Math.max(0, offset.left - $(document).scrollLeft());
	$(dl).css(offset);
};

const stateToWord = state => state? "on": "off";

const setSingleClickEnabled = value => document.body.dataset.singleClickImageDownload = stateToWord(value);

const setRequireShift = value => document.body.dataset.singleClickImageDownloadShiftRequired = stateToWord(value);

const setShiftDown = value => {
	shiftDown = value;
	document.body.dataset.singleClickImageDownloadShiftDown = stateToWord(value);
};

const onMouseOver = event => {
	if (event.target != dl && event.target != img) {
		if (currentImg) {
			dl.classList.remove("visible");
			currentImg = null;
			$(window).off("scroll", onscroll);
		}
		if (event.target.nodeName == "IMG") {
			currentImg = event.target;
			offset();
			dl.classList.add("visible");
			$(window).on("scroll", onscroll);
		}
	}
};

const dl = document.createElement("div");
dl.id = "singleclick-image-downloader";
dl.addEventListener("click", event => sendURL(currentImg.src));
const img = document.createElement("img");
img.src = self.options.buttonUrl;
dl.appendChild(img);
document.body.appendChild(dl);

let currentImg = null;
let shiftDown = false;
setSingleClickEnabled(self.options.singleClickEnabled);
setRequireShift(self.options.requireShift);

document.addEventListener("dblclick", onDblClick);
document.addEventListener("keydown", detectShiftDown);
document.addEventListener("keyup", detectShiftUp);
document.addEventListener("mouseover", onMouseOver);

self.port.on("setSingleClickEnabled", setSingleClickEnabled);
self.port.on("setRequireShift", setRequireShift);