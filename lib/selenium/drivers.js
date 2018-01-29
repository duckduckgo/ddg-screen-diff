var webdriver = require("selenium-webdriver"),
    browserData = require("../data/browsers"),
    chromeDriver = require("selenium-webdriver/chrome"),
    execSync = require("child_process").execSync,
    config = require("../config"),
    Xvfb = require("xvfb"),

    cachedDrivers = {},

    CHROMIUM_PATH;

try {
    CHROMIUM_PATH = execSync("which chromium-browser", { encoding: "utf8" }).trim();
} catch (e) {
    throw new Error("Couldn't find the chromium-browser binary, do you have Chromium installed?");
}

/**
 * Creates a driver instance
 *
 * Default to a local headless Chromium, if a different browser name is passed
 * connect to remote service and use one of theirs
 *
 * @param {object} task
 * @param {object} cachedDrivers
 */
function getDriver(task, batchId) {
    var browserShortName = task.browser,
        driver;

    // store drivers per id
    if (!cachedDrivers[batchId]) {
        cachedDrivers[batchId] = {};
    }

    // we cache drivers we've previously built on this run to make things speedier
    if (cachedDrivers[batchId][browserShortName]) {
        driver = cachedDrivers[batchId][browserShortName];
        driver.numTimesUsed++;

        // selenium devs recommend not reusing drivers too long
        // so kill them off once they've been used a number of times
        if (driver.numTimesUsed > 20) {
            deleteDriver(batchId, browserShortName);
        } else {
            return driver;
        }
    }

    driver = buildDriver(task)
    driver.numTimesUsed = 0;
    driver.manage().timeouts().pageLoadTimeout(15000);
    cachedDrivers[batchId][browserShortName] = driver;

    return driver;
}

function killAllForBatch(batchId) {
    Object.keys(cachedDrivers[batchId]).forEach(function (browserShortName) {
        deleteDriver(batchId, browserShortName);
    });
}

function deleteDriver(batchId, browserShortName) {
    var driver = cachedDrivers[batchId][browserShortName];
    driver.quit();
    driver.xvfb && driver.xvfb.stopSync();
    delete cachedDrivers[batchId][browserShortName];
}

function buildDriver(task) {
    var browserShortName = task.browser,
        builder = new webdriver.Builder(),
        browserInfo = browserData.getBrowserInfo(browserShortName),
        capabilities = {
            "browserstack.user": process.env.DDG_BROWSERSTACK_USERNAME,
            "browserstack.key": process.env.DDG_BROWSERSTACK_KEY
        },
        options,
        driver,
        xvfb;

    if (!/headless-chromium/.test(browserInfo.browser)) {
        // copy over any browser-related settings to the capabilities
        // we pass to the third party service
        Object.keys(browserInfo).forEach(function (prop) {
            capabilities[prop] = browserInfo[prop];
        });

        if (task.landscape) {
            capabilities.deviceOrientation = "landscape";
        }

        builder
            .usingServer("http://hub.browserstack.com/wd/hub")
            .withCapabilities(capabilities)
            .forBrowser(browserInfo.browser);
    } else if (browserInfo.browser === "headless-chromium-ext") {
        xvfb = new Xvfb({ reuse: true, xvfb_args: [
            "-screen",
            "0",
            task.size.width + "x" + task.size.height + "x16"
        ]});
        xvfb.startSync();

        options = new chromeDriver.Options();
        options.setChromeBinaryPath(CHROMIUM_PATH);
        options.addArguments("load-extension=" + task.diffExtension);

        builder
            .forBrowser("chrome")
            .setChromeOptions(options);
    } else {
        options = new chromeDriver.Options();

        options.setChromeBinaryPath(CHROMIUM_PATH);
        options.addArguments(
            'headless',
            'disable-gpu'
        );

        builder
            .forBrowser("chrome")
            .setChromeOptions(options);
    }

    driver = builder.build();

    // if we started xvfb for this driver,
    // store it so we can kill it when necessary
    driver.xvfb = xvfb;

    return driver;
}

exports.getDriver = getDriver;
exports.killAllForBatch = killAllForBatch;
