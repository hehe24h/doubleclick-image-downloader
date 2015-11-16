const ensureFullURL = href => {
    const link = document.createElement("a");
    link.href = href; // link will turn it into full URL
    return link.href;
};

const sendURL = url => self.port.emit("image", {
	"url": url
});

const onDblClick = event => {
	if (!shiftRequired || shiftRequired && event.shiftKey) {
		if (event.target.nodeName == "IMG" && event.target.width > minimumImageSize && event.target.height > minimumImageSize) {
			sendURL(event.target.src);
		} else {
			const img = recurseForImage(event.target);
			if (img && img.width > minimumImageSize && img.height > minimumImageSize) {
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

const offset = () => {
	const rect = currentImg.getBoundingClientRect();
	dl.style.top = Math.max(0, Math.round(rect.y) - buttonSize) + "px";
	dl.style.left = Math.max(0, Math.round(rect.x)) + "px";
};

function buttonManager() {
	this.state = false;
	this.assess = event => {
		const state = singleClickEnabled && (!shiftRequired || shiftRequired && event.shiftKey) && event.target.nodeName == "IMG" && event.target.width > minimumImageSize && event.target.height > minimumImageSize;
		if (this.state != state) {
			this.state = state;
			if (state) {
				currentImg = event.target;
				offset();
				document.body.appendChild(dl);
				document.addEventListener("scroll", offset);
			} else {
				document.body.removeChild(dl);
				currentImg = null;
				document.removeEventListener("scroll", offset);
			}
		}
	};
};

const onMouseOver = event => {
	if (event.target == img) {
		img.src = self.options.buttonOnUrl;
	} else {
		img.src = self.options.buttonOffUrl;
		if (event.target != currentImg) manager.assess(event);
	}
};

const setButtonSize = size => {
	buttonSize = size;
	const value = size + "px"
	dl.style.width = value;
	dl.style.height = value;
	img.style.width = value;
	img.style.height = value;
};

let buttonSize = 0;
let currentImg = null;
let singleClickEnabled = self.options.singleClickEnabled;
let shiftRequired = self.options.requireShift;
let minimumImageSize = self.options.minimumImageSize;

const dl = document.createElement("div");
dl.id = "singleclick-image-downloader";
dl.addEventListener("click", event => sendURL(currentImg.src));
const img = document.createElement("img");
img.src = self.options.buttonOffUrl;
dl.appendChild(img);
setButtonSize(self.options.buttonSize);

const manager = new buttonManager();

document.addEventListener("dblclick", onDblClick);
document.addEventListener("mouseover", onMouseOver);

self.port.on("setSingleClickEnabled", value => {
	singleClickEnabled = value;
});
self.port.on("setRequireShift", value => {
	shiftRequired = value;
});
self.port.on("setButtonSize", setButtonSize);
self.port.on("setMinimumImageSize", value => {
	minimumImageSize = value;
});