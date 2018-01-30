var webdriver = require("selenium-webdriver"),
    actions = require("./actions"),
    drivers = require("./drivers"),
    BBPromise = require("bluebird"),
    until = webdriver.until,
    fs = BBPromise.promisifyAll(require("fs"));

/**
 * Try 5 times to load url before taking a screenshot
 *
 * @param {string} url
 * @param {WebDriver} driver
 * @param {Deferred} deferred - optional, used for retries
 * @returns {Promise}
 */
function tryAndLoadUrl(url, driver, deferred) {
    // all the extra logic is for DDG servers since we know how they work
    // don't bother with any other URLs
    if (!/duckduckgo.com\//.test(url)) {
        return driver.get(url);
    }

    // first call, so create a Deferred
    if (!deferred) {
        deferred = webdriver.promise.defer();

        deferred.triesLeft = 3;
    }

    if (deferred.triesLeft === 0) {
        console.log("possible error on server - taking screenshot anyway");
        deferred.fulfill();
        return;
    }

    // load URL
    driver.get(url)
    // wait until page load
    driver.wait(function () {
            return driver.executeScript(function () {
                if (window.DDG &&
                        window.DDG.page &&
                        window.DDG.page.pageType === "serp") {
                    return $("#links .result").length > 2 &&
                        window.DDG.duckbar.isDone &&
                        document.readyState === "complete";
                } else {
                    return document.readyState === "complete";
                }
            });
        }, 3000)
        .then(function success() {
            deferred.fulfill();
        }, function timeout(err) {
            // even if we've timed out, we can probably still get a usable
            // screenshot from the page, so we continue
            if (err.message.indexOf("Wait timed out") > -1) {
                console.warn("page possibly didn't load - taking a screenshot anyway");
                deferred.fulfill();
                return;
            }

            // otherwise there's some other error e.g. the JS on the server is
            // rebuilding for some reason - so wait 5s and try again
            deferred.triesLeft--;

            console.warn("error loading the page, trying again in 5s"
                + "(tries left: " + deferred.triesLeft + ")");
            console.warn("reason: " + err.message);

            setTimeout(function () {
                tryAndLoadUrl(url, driver, deferred);
            }, 5000);
        });

    return deferred.promise;
}

/**
 * Generator function for screenshot promises
 *
 * The function returned will be called when the task is about to be run
 *
 * @param {object} task - a list of the task properties is in taskbuilder.js
 * @return {function}
 */
function getScreenshotPromise(task, batchId) {
    return function () {
        var deferred = webdriver.promise.defer(),
            url = task.url,
            driver = drivers.getDriver(task, batchId);

        console.log("taking screenshot for", url,
            "on", task.browser,
            (task.size ? "at " + task.size.width + "x" + task.size.height + " (" + task.sizeName + ")" : ""));

        // set screen size for task
        if (task.size) {
            var width = task.size.width,
                height = task.size.height;

            // using the extension requires Xvfb, which makes screenshots exactly 105px smaller
            // maybe there's some browser chrome that throws the calculation off? not sure
            if (task.diffExtension) {
                height += 105;
            }

            driver.manage().window().setSize(width, height);
        }

        tryAndLoadUrl(url, driver).then(function () {
            // run any actions that we've defined
            if (task.actions) {
                actions.run(driver, task.actions);

                // give a chance for anything necessary to load
                // as a result of the actions
                driver.wait(1000);
            }

            // take screenshot and return the base64 data
            driver.takeScreenshot().then(function (screenshotBase64) {
                if (screenshotBase64.length < 10000) {
                    task.error = "Non-reachable or SSL error";
                    deferred.fulfill(null);

                } else {
                    deferred.fulfill(screenshotBase64);
                }
            });
        });

        return deferred.promise;
    };
}

/**
 * Take a screenshot for each of the tasks and add it to the task object
 *
 * @param {array} tasks - a list of each task's properties is in taskbuilder.js
 * @return {Promise}
 */
exports.runTasks = function (tasks, batchId) {
    // the APIs for bluebird (what we're using in the main module)
    // and google's promise library (what selenium uses)
    // are different, so to maintain a consistent API we wrap any output
    // in a bluebird promise
    return new BBPromise(function (resolve, reject) {
        var flow = new webdriver.promise.ControlFlow(),
            completedTasks = [];

        flow.on("uncaughtException", reject);

        tasks.forEach(function (task, index) {
            flow.execute(getScreenshotPromise(task, batchId)).then(function (screenshotBase64) {
                completedTasks.push(task);

                if (screenshotBase64) {
                    return fs.writeFileAsync(task.imgPath, screenshotBase64, "base64");
                } 
            }, function fail(err) {
                console.warn("error taking screenshot: " + err.message);
                console.warn("Timed out for: " + task.url);
                task.error = "Timed Out!";
                completedTasks.push(task);
            });
        });

        flow.execute(function () {
            drivers.killAllForBatch(batchId);

            resolve(completedTasks);
        });
    });
};
