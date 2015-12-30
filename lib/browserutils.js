// all major desktop browsers that we care about
var DESKTOP = ["ie11", "chrome", "firefox", "safari"],
    // latest mobile browser versions
    MOBILE = ["iphone5s", "android5"],
    // legacy
    LEGACY_DESKTOP = ["ie8", "ie9"],
    LEGACY_MOBILE = ["iphone5", "android4.4"],
    // misc
    OTHER = ["phantomjs"];

/**
 * Takes a short name for a browser and returns an object with info
 * to be passed to a third party service
 *
 * @param {object} browserShortName
 * @returns {object} browserData
 *   - {string} browser - e.g. "internet explorer"
 *   - {string} browser_version - e.g. "8.0"
 *   - {string} os - e.g. "windows"
 *   - {string} os_version - e.g. "7"
 */
exports.getBrowserData = function (browserShortName) {
    var browser;

    switch (browserShortName) {
        // desktop
        case "firefox":
            browserData = { browser: "firefox", os: "windows", os_version: "8" };
            break;
        case "chrome":
            browserData = { browser: "chrome", os: "windows", os_version: "8" };
            break;
        case "safari":
            browserData = { browser: "safari", os: "os x", os_version: "snow leopard" };
            break;
        case "ie8":
            browserData = { browser: "internet explorer", browser_version: "8.0", os: "windows", os_version: "7" };
            break;
        case "ie9":
            browserData = { browser: "internet explorer", browser_version: "9.0", os: "windows", os_version: "7" };
            break;
        case "ie11":
            browserData = { browser: "internet explorer", browser_version: "11.0", os: "windows", os_version: "8.1" };
            break;

        // mobile
        case "iphone5s":
            browserData = { browser: "iPhone", device: "iPhone 5S", platform: "MAC", os: "ios", emulator: true };
            break;
        case "iphone5":
            browserData = { browser: "iPhone", device: "iPhone 5", platform: "MAC", os: "ios", emulator: true };
            break;
        case "android5":
            browserData = { browser: "android", device: "Google Nexus 5", platform: "ANDROID", os: "android" };
            break;
        case "android4.4":
            browserData = { browser: "android", device: "Samsung Galaxy S5", platform: "ANDROID", os: "android" };
            break;

        default:
            browserData = { browser: browserShortName };
    }

    return browserData;
};

exports.getAvailableBrowsers = function () {
    var browsers = DESKTOP
        .concat(LEGACY_DESKTOP)
        .concat(MOBILE)
        .concat(LEGACY_MOBILE)
        .concat(OTHER);
    return browsers;
};

exports.getDesktopBrowsers = function () {
    return DESKTOP;
};

exports.getMobileBrowsers = function () {
    return MOBILE;
};

exports.isMobile = function (browserName) {
    return MOBILE.indexOf(browserName) > -1 ||
        LEGACY_MOBILE.indexOf(browserName) > -1;
};
