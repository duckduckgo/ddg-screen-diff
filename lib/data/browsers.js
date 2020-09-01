// all major desktop browsers that we care about
var DESKTOP = ["chrome", "firefox", "safari", "edge", "ie11"],
  // latest mobile browser versions
  MOBILE = [
    "iphone11ProMax",
    "iphone11Pro",
    "iphone11",
    "iphoneSE",
    "GalaxyS20",
    "GalaxyA11",
    "Pixel4XL",
    "Pixel4",
  ],
  // legacy
  LEGACY_DESKTOP = ["ie10", "ie9", "ie8"],
  LEGACY_MOBILE = [
    "iphoneXR",
    "iphone8Plus",
    "iphone8",
    "GalaxyS9Plus",
    "GalaxyS8",
    "Pixel3",
  ],
  // misc
  OTHER = ["headless-chromium"];

/**
 * Takes a short name for a browser and returns an object with info
 * to be passed to a third party service
 *
 * @param {object} browserShortName
 * @returns {object} browserInfo
 *   - {string} browser - e.g. "internet explorer"
 *   - {string} browser_version - e.g. "8.0"
 *   - {string} os - e.g. "windows"
 *   - {string} os_version - e.g. "7"
 */
exports.getBrowserInfo = function (browserShortName) {
  var browserInfo;

  switch (browserShortName) {
    // desktop
    case "firefox":
      browserInfo = { browser: "firefox", os: "windows", os_version: "10" };
      break;
    case "chrome":
      browserInfo = { browser: "chrome", os: "windows", os_version: "10" };
      break;
    case "edge":
      browserInfo = { browser: "edge", os: "windows", os_version: "10" };
      break;
    case "safari":
      browserInfo = {
        browser: "safari",
        os: "os x",
        os_version: "catalina",
      };
      break;
    case "ie11":
      browserInfo = {
        browser: "internet explorer",
        browser_version: "11.0",
        os: "windows",
        os_version: "10",
      };
      break;
    case "ie10":
      browserInfo = {
        browser: "internet explorer",
        browser_version: "10.0",
        os: "windows",
        os_version: "8",
      };
      break;
    case "ie9":
      browserInfo = {
        browser: "internet explorer",
        browser_version: "9.0",
        os: "windows",
        os_version: "7",
      };
      break;
    case "ie8":
      browserInfo = {
        browser: "internet explorer",
        browser_version: "8.0",
        os: "windows",
        os_version: "7",
      };
      break;

    // mobile -- iOS
    case "iphone11ProMax":
      browserInfo = {
        browser: "iPhone",
        os_version: "13",
        device: "iPhone 11 Pro Max",
        real_mobile: false,
      };
      break;
    case "iphone11Pro":
      browserInfo = {
        browser: "iPhone",
        os_version: "13",
        device: "iPhone 11 Pro",
        real_mobile: false,
      };
      break;
    case "iphone11":
      browserInfo = {
        browser: "iPhone",
        os_version: "14",
        device: "iPhone 11",
        real_mobile: false,
      };
      break;
    case "iphone8Plus":
      browserInfo = {
        browser: "iPhone",
        os_version: "12",
        device: "iPhone 8 Plus",
        real_mobile: false,
      };
      break;
    case "iphoneXR":
      browserInfo = {
        browser: "iPhone",
        os_version: "12",
        device: "iPhone XR",
        real_mobile: false,
      };
      break;
    case "iphoneSE":
      browserInfo = {
        browser: "iPhone",
        os_version: "13",
        device: "iPhone SE 2020",
        real_mobile: false,
      };
      break;
    case "iphone8":
      browserInfo = {
        browser: "iPhone",
        os_version: "13",
        device: "iPhone 8",
        real_mobile: false,
      };
      break;

    // mobile -- Android
    case "GalaxyS20":
      browserInfo = {
        browser: "android",
        device: "Samsung Galaxy S20",
        os_version: "10.0",
        real_mobile: false,
      };
      break;
    case "GalaxyA11":
      browserInfo = {
        browser: "android",
        device: "Samsung Galaxy A11",
        os_version: "10.0",
        real_mobile: false,
      };
      break;
    case "GalaxyS9Plus":
      browserInfo = {
        browser: "android",
        device: "Samsung Galaxy S9 Plus",
        os_version: "9.0",
        real_mobile: false,
      };
      break;
    case "GalaxyS8":
      browserInfo = {
        browser: "android",
        device: "Samsung Galaxy S8",
        os_version: "7.0",
        real_mobile: false,
      };
      break;
    case "Pixel4XL":
      browserInfo = {
        browser: "android",
        device: "Google Pixel 4 XL",
        os_version: "11.0",
        real_mobile: false,
      };
      break;
    case "Pixel4":
      browserInfo = {
        browser: "android",
        device: "Google Pixel 4",
        os_version: "10.0",
        real_mobile: false,
      };
      break;
    case "Pixel3":
      browserInfo = {
        browser: "android",
        device: "Google Pixel 3",
        os_version: "9.0",
        real_mobile: false,
      };
      break;

    default:
      browserInfo = { browser: browserShortName };
  }

  return browserInfo;
};

exports.getAvailableBrowsers = function () {
  var browsers = DESKTOP.concat(LEGACY_DESKTOP)
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
  return (
    MOBILE.indexOf(browserName) > -1 || LEGACY_MOBILE.indexOf(browserName) > -1
  );
};
