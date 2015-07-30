const ensureFullURL = href => {
    const link = document.createElement("a");
    link.href = href; // link will turn it into full URL
    return link.href;
};

const sendURL = url => self.port.emit("image", {
	"url": url
});

const detectShiftDown = event => {
	if (event.keyCode == 16) setShiftDown(true);
};

const detectShiftUp = event => {
	if (event.keyCode == 16) setShiftDown(false);
};

const onDblClick = event => {
	if (!shiftRequired || shiftRequired && shiftDown) {
		if (event.target.nodeName == "IMG") {
			sendURL(event.target.src);
		} else {
			const img = recurseForImage(event.target);
			if (img) {
				sendURL(img.src);
			}
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
	offset.top = Math.max(0, offset.top - $(document).scrollTop() - buttonSize);
	offset.left = Math.max(0, offset.left - $(document).scrollLeft());
	$(dl).css(offset);
};

const stateToWord = state => state? "on": "off";

const setSingleClickEnabled = value => document.body.dataset.singleClickImageDownload = stateToWord(value);

const setRequireShift = value => {
	shiftRequired = value;
	document.body.dataset.singleClickImageDownloadShiftRequired = stateToWord(value);
};

const setShiftDown = value => {
	shiftDown = value;
	document.body.dataset.singleClickImageDownloadShiftDown = stateToWord(value);
};

const onMouseOver = event => {
	if (event.target != dl && event.target != img) {
		img.src = self.options.buttonOffUrl;
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
	} else {
		img.src = self.options.buttonOnUrl;
	}
};

const setButtonSize = size => {
	buttonSize = size;
	const value = buttonSize + "px"
	dl.style.width = value;
	dl.style.height = value;
	img.style.width = value;
	img.style.height = value;
};

let buttonSize;
const dl = document.createElement("div");
dl.id = "singleclick-image-downloader";
dl.addEventListener("click", event => sendURL(currentImg.src));
const img = document.createElement("img");
img.src = self.options.buttonOffUrl;
dl.appendChild(img);
document.body.appendChild(dl);
setButtonSize(self.options.buttonSize);

let currentImg = null;
setSingleClickEnabled(self.options.singleClickEnabled);
let shiftDown = false;
let shiftRequired;
setRequireShift(self.options.requireShift);

document.addEventListener("dblclick", onDblClick);
document.addEventListener("keydown", detectShiftDown);
document.addEventListener("keyup", detectShiftUp);
document.addEventListener("mouseover", onMouseOver);

self.port.on("setSingleClickEnabled", setSingleClickEnabled);
self.port.on("setRequireShift", setRequireShift);
self.port.on("setButtonSize", setButtonSize);