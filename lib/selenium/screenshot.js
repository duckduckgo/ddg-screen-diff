var memwatch = require('memwatch-next');
var webdriver = require("selenium-webdriver"),
    Promise = require("bluebird"),
    chromeDriver = require("selenium-webdriver/chrome"),
    execSync = require("child_process").execSync,
    browserData = require("../data/browsers"),
    actions = require("./actions"),
    config = require("../config"),
    BBPromise = require("bluebird"),
    until = webdriver.until,
    fs = Promise.promisifyAll(require("fs")),

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
function getDriver(task, cachedDrivers) {
    var browserShortName = task.browser;

    // we cache drivers we've previously built on this run to make things speedier
    if (cachedDrivers[browserShortName]) {
        return cachedDrivers[browserShortName];
    }

    var builder = new webdriver.Builder(),
        browserInfo = browserData.getBrowserInfo(browserShortName),
        capabilities = {
            "browserstack.user": process.env.DDG_BROWSERSTACK_USERNAME,
            "browserstack.key": process.env.DDG_BROWSERSTACK_KEY
        };

    if (browserInfo.browser !== "headless-chromium" &&
            browserInfo.browser !== "headless-chromium-ext") {
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
    } else {
        var options = new chromeDriver.Options();

        if (task.diffExtension) {
            options.addExtensions(task.diffExtension);
        }

        options.setChromeBinaryPath(CHROMIUM_PATH);
        options.addArguments(
            'headless',
            'disable-gpu'
        );

        builder
            .forBrowser("chrome")
            .setChromeOptions(options);
    }

    cachedDrivers[browserShortName] = builder.build();
    cachedDrivers[browserShortName].manage().timeouts().pageLoadTimeout(15000);
    return cachedDrivers[browserShortName];
}

/**
 * Generator function for screenshot promises
 *
 * The function returned will be called when the task is about to be run
 *
 * @param {object} task - a list of the task properties is in taskbuilder.js
 * @param {object} cachedDrivers
 * @return {function}
 */
function getScreenshotPromise(task, cachedDrivers, workerId) {
    var url = task.url,
        driver = getDriver(task, cachedDrivers);

    console.log("worker " + workerId + " started task " + task.index + " for " +  url);

    // set screen size for task
    if (task.size) {
        driver.manage().window().setSize(task.size.width, task.size.height);
    }

    return new Promise(function(resolve, reject) {
        return driver.get(url)
        .then(function() {
            return driver.takeScreenshot();
        })
        .then(function(screenshotBase64) {
            if (screenshotBase64.length < 10000) {
                task.error = "Non-reachable or SSL error";
                return null;
            } else {
                return screenshotBase64;
            }
        }).then(resolve, reject);
    });
}

exports.runTasks = function (getTask, id) {
    var cachedDrivers = {};
    var taskCount = 0;

    var promise = new Promise(function(resolve, reject) {
        function work() {
            var t = getTask();
            taskCount++;
            if (t) {
                return doScreenshot(t, id).then(work);
            } else {
                for (var key in cachedDrivers) {
                    if (cachedDrivers.hasOwnProperty(key)) {
                        cachedDrivers[key].quit();
                        delete cachedDrivers[key];
                    }
                }
                resolve();
            }
        }
        work();
    });
    
    function refreshDriver(task) {
        if (taskCount % 2 === 0) {
            cachedDrivers[task.browser].quit();
            delete cachedDrivers[task.browser];
            getDriver(task, cachedDrivers);
        }
    }

    function doScreenshot(task, workerId) {
        refreshDriver(task);
        return getScreenshotPromise(task, cachedDrivers, workerId).then(function(screenshotBase64) {
            if (screenshotBase64) {
                return fs.writeFileAsync(task.imgPath, screenshotBase64, "base64");
            } 
        }, function(err) {
            console.warn("error taking screenshot: " + err.message);
            console.warn("Timed out for: " + task.url + " task id " + id);
            task.error = "Timed Out!";
        });
    }
    return promise;
}

