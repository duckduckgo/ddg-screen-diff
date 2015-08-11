/**
 * Builds tasks for each screenshot to be taken based on the options passed
 * in from the command line.
 *
 * A task looks like this:
 *
 * {
 *     host: "foo.duckduckgo.com",      // the host the screenshot will be taken against
 *
 *     browser: "ie8",                  // short name of the browser used
 *
 *     size: {                          // viewport size
 *         width: 1280,
 *         height: 800
 *     },
 *
 *     path: "?q=test",                 // path on the server
 *
 *     landscape: false,                // orientation of device (mobile only)
 *
 *     lastForBrowser: true,            // whether this is the last task with this browser
 *                                      // (so we can switch off the driver for that browser and not waste minutes)
 *
 *     shouldDiff: true,                // whether the screenshot should be diffed or not
 *                                      // (all tasks have the same value for this)
 *
 *     actions: [],                     // list of actions to take before capturing the screenshot
 *
 *     base64Data: "...",               // added after the screenshot is taken
 *
 *     imgPath: "..."                   // absolute path to the image; added after screenshot is saved
 * }
 */

var Promise = require("bluebird"),
    os = require("os"),
    browserUtils = require("./browserutils"),
    sizeUtils = require("./sizeutils"),
    config = require("./config"),
    childProcess = Promise.promisifyAll(require("child_process")),
    https = require("https"),

    DDG = "duckduckgo.com",

    GROUPS_DIR = config.groupDir,
    ACTIONS_DIR = config.actionDir;

/**
 * Build a path based on what command we've been given
 *
 * @param {object} ops
 *   - {string} command
 *   - {string} commandValue
 *   - {string} query (ia only)
 *   - {string} tabName (ia only)
 */
function getPath(ops) {
    var path;

    switch (ops.command) {
        case "path":
            path = ops.commandValue;
            break;
        case "search":
            path = "?q=" + ops.commandValue.replace(/\s/g, "+");
            break;
        case "ia":
            path = "?q=" + ops.query.replace(/\s/g, "+") + "&ia=" + ops.tabName;
            break;
    }

    return path;
}

/**
 * Get metadata from the database
 *
 * @param {string} iaName
 * @returns {Promise} - contains JSON object with the metadata
 */
function getMetadata(iaName) {
    return new Promise(function (resolve, reject) {
        https.get("https://duck.co/ia/view/" + iaName + "/json", function (res) {
            var dataJSON = "";
            res.on("data", function (chunk) {
                dataJSON += chunk;
            });
            res.on("end", function () {
                var data = JSON.parse(dataJSON);

                if (data.live) {
                    resolve(data.live);
                } else {
                    reject(new Error("this IA doesn't seem to be live"));
                }
            });
        }).on("error", reject);
    });
}

/**
 * Gets the subdomain part of your local machine's hostname
 * e.g. `andrey` or `ddh2`
 *
 * @returns {string}
 */
function getLocalHostname() {
    return os.hostname().match("[^.]+")[0];
}

/**
 * Gets a task object from given options
 *
 * @param {object} ops
 *   - {string} host
 *   - {boolean} mobile
 *   - {boolean} shouldDiff
 *   - {boolean} landscape
 *   - {object} size
 *   - {string} browser
 *   - {string} command
 *   - {string} commandValue
 *   - {string} action
 *   - {string} query (ia only)
 *   - {string} tabName (ia only)
 */
function getTask(ops) {
    var task,
        host,
        actions;

    if (ops.host.match(/prod(uction)?/)) {
        host = DDG;
    } else {
        host = ops.host + "." + DDG;
    }

    if (ops.action) {
        try {
            actions = require(ACTIONS_DIR + "/" + ops.action);
        } catch (e) {
            throw new Error("unable to find action: " + ops.action);
        }
    }

    task = {
        host: host,
        path: getPath(ops),
        browser: ops.browser,
        shouldDiff: ops.shouldDiff,
        actions: actions
    };

    if (browserUtils.isMobile(ops.browser)) {
        // we can only set orientation on mobile
        task.landscape = ops.landscape;
    } else {
        // we can only set viewport size on desktop
        task.size = ops.size;
        task.sizeName = ops.sizeName;
    }

    return task;
}

/**
 * Try to get tab name from metadata
 * This is passed on to the query string
 *
 * @param {object} metadata
 * @returns {string}
 */
function getTabName(metadata) {
    var tabName;

    if (metadata.is_stackexchange) {
        return "qa";
    }

    switch (metadata.repo) {
        case "fathead":
            tabName = metadata.tab || "about";
            break;
        case "goodies":
            tabName = metadata.tab || "answer";
            break;
        default:
            tabName = metadata.tab || metadata.name;
    }

    return tabName.toLowerCase().replace(" ", "");
}

/**
 * For each browser we've got, we need to make sure that
 * the last task with that browser has lastForBrowser === true
 * so that we know when to shut off browser drivers.
 *
 * The tasks array is edited in place.
 *
 * @param {array} tasks
 */
function addLastForBrowser(tasks) {
    var lastTasksForBrowser = {};

    tasks.forEach(function (task) {
        task.lastForBrowser = false;
        lastTasksForBrowser[task.browser] = task;
    });

    Object.keys(lastTasksForBrowser).forEach(function (browser) {
        lastTasksForBrowser[browser].lastForBrowser = true;
    });
}

/**
 * Generate a list of tasks based on options
 *
 * @param {object} ops
 * @returns {array}
 */
function getTasks(ops) {
    var tasks = [];

    // if we've got no hostnames passed, we screenshot our own instance
    // if we've got one hostname, we diff it against our own instance
    if (ops.hosts.length <= 1) {
        ops.hosts.unshift(getLocalHostname());
    }

    // create tasks for each screen size, browser and host passed
    ops.sizes.forEach(function (sizeName) {
        ops.sizeName = sizeName;
        ops.size = sizeUtils.getSize(sizeName);

        ops.browsers.forEach(function (browser) {
            ops.browser = browser;

            ops.hosts.forEach(function (host) {
                ops.host = host;
                tasks.push(getTask(ops));
            });
        });
    });

    // make sure `lastForBrowser` is set to true where necessary
    addLastForBrowser(tasks);

    return tasks;
}

/**
 * Build tasks for group - get the group list from the folder,
 * and create tasks tasks for each one
 *
 * @param {object} ops
 * @returns {Promise} - contains generated tasks
 */
function buildGroup(ops) {
    var opsCopy,
        promises;

    // get the group data from the json file
    try {
        groupItems = require(GROUPS_DIR + "/" + ops.commandValue + ".json");
    } catch (e) {
        return Promise.reject("Couldn't find group with name " + ops.commandValue);
    }

    // each group item has properties we'd use for a normal command call, ie:
    // - command ("path", "search", "ia" or "group")
    // - commandValue
    // - query (only for command "ia")
    //
    // we also allow these properties to override the ones from the CLI:
    // - browsers
    // - sizes
    // - action
    //
    // for each of the group items we run `exports.build`, as if each command
    // was called from the command line
    //
    // that means we can have nested groups!
    promises = groupItems.map(function (groupItem) {
        opsCopy = JSON.parse(JSON.stringify(ops));

        opsCopy.command = groupItem.command;
        opsCopy.commandValue = groupItem.commandValue;
        opsCopy.query = groupItem.query;

        if (groupItem.browsers && groupItem.browsers.length) {
            opsCopy.browsers = groupItem.browsers;
        }

        if (groupItem.sizes && groupItem.sizes.length) {
            opsCopy.sizes = groupItem.sizes;
        }

        if (groupItem.action) {
            opsCopy.action = groupItem.action;
        }

        return exports.build(opsCopy);
    });

    // then, when the tasks are built, we collate them into a single array
    return Promise.all(promises).then(function (taskArrays) {
        var tasks = [];

        taskArrays.forEach(function (taskArray) {
            tasks = tasks.concat(taskArray);
        });

        // make sure `lastForBrowser` is set to true where necessary
        addLastForBrowser(tasks);

        return tasks;
    });
}

/**
 * Get tasks - basically a promisified wrapper around `getTasks`,
 * grabbing IA metadata first if necessary
 *
 * @param {object} ops
 * @returns {Promise} - contains generated tasks
 */
exports.build = function (ops) {
    var promise,
        groupItems;

    if (ops.command === "group") {
        return buildGroup(ops);
    } else if (ops.command === "ia") {
        promise = getMetadata(ops.commandValue)
            .then(function (metadata) {
                // if we aren't going for a custom query, use the example one
                ops.query = ops.query || metadata.example_query;
                // we'll need to add the tabname to the query string
                ops.tabName = getTabName(metadata);
                return ops;
            });
    } else {
        promise = Promise.resolve(ops);
    }

    // then, we can grab the tasks
    return promise.then(getTasks);
};
