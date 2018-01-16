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
    browserData = require("./data/browsers"),
    sizeData = require("./data/sizes"),
    config = require("./config"),
    metadata = require("./metadata"),
    childProcess = Promise.promisifyAll(require("child_process")),
    https = require("https"),

    DDG = "duckduckgo.com",

    GROUPS_DIR = config.groupDir,
    GROUP_BUILDER_DIR = config.groupBuilderDir,
    ACTIONS_DIR = config.actionDir;

/**
 * Build a path based on what command we've been given
 *
 * @param {object} ops
 *   - {string} command
 *   - {string} commandValue
 *   - {string} qs
 *   - {string} query (ia only)
 *   - {string} tabName (ia only)
 */
function getUrl(ops) {
    var path,
        baseUrl = 'https://',
        url;

    if (ops.command === 'url') {
        return ops.commandValue;
    }

    // get base URL first

    // alias prod(uction) to the production hostname
    if (ops.host.match(/prod(uction)?/)) {
        baseUrl += DDG;
    // if hostname contains a dot, assume it's a full one
    // rather than a subdomain
    } else if (ops.host.indexOf(".") > -1) {
        baseUrl += ops.host;
    // if there's a port but no dot assume a duckduckgo subdomain with a port
    } else if (ops.host.indexOf(":") > -1) {
        var parts = ops.host.split(":");

        baseUrl += parts[0] + "." + DDG + ":" + parts[1];
    } else {
        baseUrl += ops.host + "." + DDG;
    }

    // get path based on what command was used

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

    // append arbitrary query string to path
    if (ops.qs) {
        // make sure there's a & if ops.qs doesn't already have it
        if (ops.qs.indexOf("&") !== 0) {
            path += "&";
        }

        path += ops.qs;
    }

    url = baseUrl + '/' + path;

    return url;
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
 *   - {string} qs
 *   - {string} query (ia only)
 *   - {string} tabName (ia only)
 */
function getTask(ops) {
    var task,
        actions;

    if (ops.action) {
        try {
            actions = require(ACTIONS_DIR + "/" + ops.action);
        } catch (e) {
            throw new Error("unable to find action: " + ops.action);
        }
    }

    task = {
        url: getUrl(ops),
        browser: ops.browser,
        shouldDiff: ops.shouldDiff,
        actions: actions
    };

    if (browserData.isMobile(ops.browser)) {
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
    // if we've got one hostname and diff is true, we diff it against our own instance
    if (ops.hosts.length === 0 ||
            (ops.diff && ops.hosts.length === 1)) {
        ops.hosts.unshift(getLocalHostname());
    }

    // at this stage if we're diffing we should have two hosts
    // if not, error out
    if (ops.diff && ops.hosts.length !== 2) {
        throw new Error("Please pass one or two hosts if you want to run a diff");
    }

    // create tasks for each screen size, browser and host passed
    ops.sizes.forEach(function (sizeName) {
        ops.sizeName = sizeName;
        ops.size = sizeData.getSize(sizeName);

        ops.browsers.forEach(function (browser) {
            ops.browser = browser;

            ops.hosts.forEach(function (host) {
                ops.host = host;
                tasks.push(getTask(ops));
            });
        });
    });

    if (ops.diffExtension) {
        var duplicateTasks = [];

        tasks.forEach(function (task) {
            var duplicateTask = Object.assign({}, task);
            duplicateTask.browser += "-ext";
            duplicateTask.diffExtension = ops.diffExtension;

            duplicateTasks.push(task);
            duplicateTasks.push(duplicateTask);
        });

        tasks = duplicateTasks;
    }

    // make sure `lastForBrowser` is set to true where necessary
    addLastForBrowser(tasks);

    return tasks;
}

/**
 * Build tasks for group and create tasks for each one
 *
 * @param {array} groupItems
 * @param {object} ops
 * @returns {Promise} - contains generated tasks
 */
function buildGroup(groupItems, ops) {
    var opsCopy,
        promises;


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
    promises = Promise.mapSeries(groupItems, function (groupItem) {
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

        if (groupItem.qs) {
            opsCopy.qs = groupItem.qs;
        }

        return exports.build(opsCopy)
            .catch(function (err) {
                // we don't want a single error to prevent execution of the entire queue
                // so just notify the user and continue
                console.warn(err.message);

                return [];
            });
    });

    // then, when the tasks are built, we collate them into a single array
    return promises.then(function (taskArrays) {
        var tasks = [];

        taskArrays.forEach(function (taskArray) {
            tasks = tasks.concat(taskArray);
        });

        // make sure `lastForBrowser` is set to true where necessary
        addLastForBrowser(tasks);

        return tasks;
    });
}

function getGroupItems(ops) {
    var groupItems;

    // get the group data from the json file
    try {
        groupItems = require(GROUPS_DIR + "/" + ops.commandValue + ".json");
        return Promise.resolve(groupItems);
    } catch (e) { }

    // if no json file exists, let's try and call a script with that name
    return childProcess.execAsync(GROUP_BUILDER_DIR + "/" + ops.commandValue)
        .then(function (stdout) {
            var groupItems;

            try {
                groupItems = JSON.parse(stdout);
            } catch (e) {
                throw new Error("error parsing group items data: " + e.message);
            }

            return Promise.resolve(groupItems);
        }).catch(function (e) {
            if (e.message.indexOf("not found") > -1) {
                throw new Error("Couldn't find group or group-building script called: " + ops.commandValue);
            } else {
                throw e;
            }
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
        return getGroupItems(ops)
            .then(function (groupItems) {
                return buildGroup(groupItems, ops);
            });
    } else if (ops.command === "ia") {
        promise = metadata.getMetadataForIA(ops.commandValue)
            .then(function (metadata) {
                // if we aren't going for a custom query, use the example one
                ops.query = ops.query || metadata.example_query;
                // we'll need to add the tabname to the query string
                ops.tabName = getTabName(metadata);

                if (!ops.query) {
                    throw new Error("missing query for IA " + ops.commandValue + " - either missing metadata or IA has been disabled?");
                }

                return ops;
            });
    } else {
        promise = Promise.resolve(ops);
    }

    // then, we can grab the tasks
    return promise.then(getTasks);
};
