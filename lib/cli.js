var yargs = require("yargs"),
    path = require("path"),
    browserData = require("./data/browsers"),
    sizeData = require("./data/sizes"),
    ops,

    AVAILABLE_BROWSERS = browserData.getAvailableBrowsers(),
    DESKTOP_BROWSERS = browserData.getDesktopBrowsers(),
    MOBILE_BROWSERS = browserData.getMobileBrowsers(),

    AVAILABLE_SIZES = sizeData.getAvailableSizes(),

    SCREENSHOT_OPS = {
        "b": {
            alias: "browsers",
            describe: "one or more of the following:\n"
                + AVAILABLE_BROWSERS.join(", ") + ", desktop, mobile, all\n\n"
                + "'all' aliases to desktop and mobile\n"
                + "'desktop' aliases to " + DESKTOP_BROWSERS.join(", ") + "\n"
                + "'mobile' aliases to " + MOBILE_BROWSERS.join(", ")+ "\n",
            type: "array",
            default: "headless-chromium"
        },
        "s": {
            alias: "sizes",
            describe: "one or more of the following:\n"
                + AVAILABLE_SIZES.join(", ") + "\n",
            type: "array",
            default: "m"
        },
        "l": {
            alias: "landscape",
            describe: "take screenshot in landscape mode (mobile only)",
            type: "boolean"
        },
        "m": {
            alias: "max-parallel-tasks",
            describe: "maximum number of screenshot tasks to be run in parallel",
            type: "number",
            default: 2
        },
        "d": {
            alias: "diff",
            describe: "run an image diff between two hosts\n"
                + "if 1 host   is given, compare the host with localhost\n"
                + "if 2 hosts are given, compare the two hosts",
            type: "boolean"
        },
        "a": {
            alias: "action",
            describe: "the name of an action to run before taking the screenshot; actions are defined in an a JSON file, the location of which is in your config",
            type: "string"
        },
        "qs": {
            describe: "append arbitrary query string component (settings etc) to be added to the ones that the tool builds",
            type: "string"
        }
    },

    HOST_MESSAGE = "If no hosts are given, a screenshot from localhost is displayed.",

    COMMANDS = ["search", "path", "url", "ia", "group"],

    // yargs gives a bin name with the full path before it
    // so extract the basename manually
    BIN_NAME = path.basename(yargs.$0);

function addDefaults(yargs) {
    yargs
        .wrap(Math.min(100, yargs.terminalWidth()))
        .help("help")
        .alias("h", "help")
}

exports.check = function () {
    addDefaults(yargs);

    argv = yargs
        .usage("Usage: " + BIN_NAME + " [--version] [--help] <command> ... [options]")
        .demand(1, "Please specify a command.")
        .version(function () {
            return require("../package").version;
        })
        .command("search", "Create a screenshot against a search query", function (yargs) {
            addDefaults(yargs);
            argv = yargs.options(SCREENSHOT_OPS)
                .usage("Usage: " + BIN_NAME + " search <query> [<host|env> ...] [options]\n\n" + HOST_MESSAGE)
                .demand(2, "Please specify a search query.")
                .argv;
        })
        .command("path", "Create a screenshot against an arbitrary path (with an assumed hostname)", function (yargs) {
            addDefaults(yargs);
            argv = yargs.options(SCREENSHOT_OPS)
                .usage("Usage: " + BIN_NAME + " path <path> [<host|env> ...] [options]\n\n" + HOST_MESSAGE)
                .demand(2, "Please specify a path to search against.")
                .argv;
        })
        .command("url", "Create a screenshot against a specific URL", function (yargs) {
            addDefaults(yargs);
            argv = yargs.options(SCREENSHOT_OPS)
                .usage("Usage: " + BIN_NAME + " url <full url> [options]\n\n" + HOST_MESSAGE)
                .demand(2, "Please specify a URL.")
                .option("diff-ext", {
                    describe: "compare against the same URL using an extension",
                    type: "string"
                })
                .argv;
        })
        .command("ia", "Create a screenshot against an IA", function (yargs) {
            addDefaults(yargs);
            argv = yargs.options(SCREENSHOT_OPS)
                .usage("Usage: " + BIN_NAME + " ia <ia name> [--query <query>] [<host|env> ...] [options]\n\n" + HOST_MESSAGE)
                .option("q", {
                    alias: "query",
                    describe: "use a custom query instead of the example query from the metadata",
                    type: "string"
                })
                .demand(2, "Please specify an IA name.")
                .argv;
        })
        .command("group", "Create a screenshot against a pre-defined group", function (yargs) {
            addDefaults(yargs);
            argv = yargs.options(SCREENSHOT_OPS)
                .usage("Usage: " + BIN_NAME + " group <group name> [<host|env> ...] [options]\n\n" + HOST_MESSAGE)
                .demand(2, "Please specify a group name or the name of a group-building script.")
                .argv;
        })
        .argv;

    ops = {};

    // first positional argument is always the subcommand
    ops.command = argv._.shift();

    // second positional argument is value for the first one
    ops.commandValue = argv._.shift();

    // hosts is an optional array of all the other string arguments
    ops.hosts = argv._.concat();

    // get other options
    ops.browsers = argv.b;
    ops.sizes = argv.s;
    ops.query = argv.q;
    ops.landscape = argv.l;
    ops.maxParallelTasks = argv.m;
    ops.diff = argv.d;
    ops.action = argv.a;
    ops.qs = argv.qs;
    ops.diffExtension = argv['diff-ext'];

    if (COMMANDS.indexOf(ops.command) === -1) {
        yargs.showHelp();
        console.error("Please specify a valid command. Should be one of: " + COMMANDS.join(", "));
        process.exit(1);
    }

    if (ops.browsers) {
        var indexOfDesktop = ops.browsers.indexOf("desktop"),
            indexOfMobile = ops.browsers.indexOf("mobile"),
            indexOfAll = ops.browsers.indexOf("all");

        // expand all aliases to the relevant list

        if (indexOfAll > -1) {
            ops.browsers.splice(indexOfAll, 1);
            ops.browsers = ops.browsers
                .concat(DESKTOP_BROWSERS)
                .concat(MOBILE_BROWSERS);
        }

        if (indexOfDesktop > -1) {
            ops.browsers.splice(indexOfDesktop, 1);
            ops.browsers = ops.browsers.concat(DESKTOP_BROWSERS);
        }

        if (indexOfMobile > -1) {
            ops.browsers.splice(indexOfMobile, 1);
            ops.browsers = ops.browsers.concat(MOBILE_BROWSERS);
        }

        // check we haven't been passed any unsupported browsers
        checkValuesAreValid(ops.browsers, AVAILABLE_BROWSERS, "browser");

        // remove any duplicates
        ops.browsers = removeDuplicates(ops.browsers);
    }

    if (ops.sizes) {
        // check we haven't been passed any unsupported sizes
        checkValuesAreValid(ops.sizes, AVAILABLE_SIZES, "size");

        ops.sizes = removeDuplicates(ops.sizes);
    }
};

function checkValuesAreValid(arrayToCheck, validArray, argName) {
    arrayToCheck.forEach(function (el) {
        if (validArray.indexOf(el) === -1) {
            console.error("Invalid " + argName + ": " + el + ". Should be one of: " + validArray.join(", "));
            process.exit(1);
        }
    });
}

function removeDuplicates(array) {
    return array.filter(function (el, i, arr) { return arr.indexOf(el) === i; });
}

exports.getOps = function () {
    return ops;
};
