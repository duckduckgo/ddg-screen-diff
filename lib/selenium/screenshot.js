var webdriver = require("selenium-webdriver"),
  chromeDriver = require("selenium-webdriver/chrome"),
  execSync = require("child_process").execSync,
  browserData = require("../data/browsers"),
  actions = require("./actions"),
  config = require("../config"),
  BBPromise = require("bluebird"),
  until = webdriver.until,
  CHROMIUM_PATH;

try {
  CHROMIUM_PATH = execSync("which chromium-browser", {
    encoding: "utf8",
  }).trim();
} catch (e) {
  throw new Error(
    "Couldn't find the chromium-browser binary, do you have Chromium installed?"
  );
}

/**
 * Helper method, waits until everything on the page has loaded
 *
 * @param {WebDriver} driver
 * @return {Condition}
 */
function untilPageHasLoaded(driver) {
  var loadingStarted = Date.now();

  return new until.Condition("for page to finish loading", function (driver) {
    // checking if the page is loaded
    // on SERP, we make an extra check to make sure that the deep call
    // has also finished
    return driver
      .executeScript(function () {
        if (
          window.DDG &&
          window.DDG.page &&
          window.DDG.page.pageType === "serp"
        ) {
          return (
            window.DDG.deep &&
            window.DDG.deep.finished &&
            window.DDG.duckbar &&
            window.DDG.duckbar.isDone &&
            document.readyState === "complete"
          );
        } else {
          return document.readyState === "complete";
        }
      })
      .then(function (loaded) {
        return loaded;
      });
  });
}

/**
 * Try 5 times to load url before taking a screenshot
 *
 * @param {string} url
 * @param {WebDriver} driver
 * @param {Deferred} deferred - optional, used for retries
 * @returns {Promise}
 */
function tryAndLoadUrl(url, driver, deferred) {
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
  driver.get(url);

  // wait until page load
  driver.wait(untilPageHasLoaded(driver), 5000).then(
    function success() {
      deferred.fulfill();
    },
    function timeout(err) {
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

      console.warn(
        "error loading the page, trying again in 5s" +
          "(tries left: " +
          deferred.triesLeft +
          ")"
      );
      console.warn("reason: " + err.message);

      setTimeout(function () {
        tryAndLoadUrl(url, driver, deferred);
      }, 5000);
    }
  );

  return deferred.promise;
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
function getDriver(task, cachedDrivers, sizeName) {
  var isMobile = sizeName && sizeName === "xs",
    browserShortName = isMobile ? `${task.browser}-mobile` : task.browser,
    mobileUserAgent =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_1 like Mac OS X) AppleWebKit/603.1.30 (KHTML, like Gecko) Version/10.0 Mobile/14E304 Safari/602.1";

  // we cache drivers we've previously built on this run to make things speedier
  if (cachedDrivers[browserShortName]) {
    return cachedDrivers[browserShortName];
  }

  var builder = new webdriver.Builder(),
    browserInfo = browserData.getBrowserInfo(browserShortName),
    capabilities = {
      "browserstack.user": process.env.DDG_BROWSERSTACK_USERNAME,
      "browserstack.key": process.env.DDG_BROWSERSTACK_KEY,
    };

  if (
    browserInfo.browser !== "headless-chromium" &&
    browserInfo.browser !== "headless-chromium-mobile"
  ) {
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

    options.setChromeBinaryPath(CHROMIUM_PATH);
    options.addArguments("headless", "disable-gpu");

    // If it's a mobile device, add the mobile user agent
    if (isMobile) {
      options.addArguments(`user-agent=${mobileUserAgent}`);
    }

    builder.forBrowser("chrome").setChromeOptions(options);
  }

  cachedDrivers[browserShortName] = builder.build();

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
function getScreenshotPromise(task, cachedDrivers) {
  return function () {
    var deferred = webdriver.promise.defer(),
      url = "http://" + task.host + "/" + task.path,
      driver = getDriver(task, cachedDrivers, task.sizeName);

    console.log(
      "taking screenshot for",
      url,
      "on",
      task.browser,
      task.size
        ? "at " +
            task.size.width +
            "x" +
            task.size.height +
            " (" +
            task.sizeName +
            ")"
        : ""
    );

    // set screen size for task
    if (task.size) {
      driver.manage().window().setSize(task.size.width, task.size.height);
    }

    tryAndLoadUrl(url, driver).then(function () {
      // run any actions that we've defined
      if (task.actions) {
        actions.run(driver, task.actions);

        // give a chance for anything necessary to load
        // as a result of the actions
        driver.wait(untilPageHasLoaded(driver));
      }

      // take screenshot and return the base64 data
      driver.takeScreenshot().then(function (screenshotBase64) {
        deferred.fulfill(screenshotBase64);
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
exports.runTasks = function (tasks) {
  // the APIs for bluebird (what we're using in the main module)
  // and google's promise library (what selenium uses)
  // are different, so to maintain a consistent API we wrap any output
  // in a bluebird promise
  return new BBPromise(function (resolve, reject) {
    var flow = new webdriver.promise.ControlFlow(),
      completedTasks = [],
      cachedDrivers = {};

    flow.on("uncaughtException", reject);

    tasks.forEach(function (task) {
      var isMobile = task.sizeName && task.sizeName === "xs",
        browserShortName = isMobile ? `${task.browser}-mobile` : task.browser;

      flow.execute(getScreenshotPromise(task, cachedDrivers)).then(
        function (screenshotBase64) {
          task.base64Data = screenshotBase64;
          completedTasks.push(task);

          if (task.lastForBrowser) {
            cachedDrivers[browserShortName].quit();
          }
        },
        function fail(err) {
          console.warn("error taking screenshot: " + err.message);
        }
      );
    });

    flow.execute(function () {
      resolve(completedTasks);
    });
  });
};
