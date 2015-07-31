var yargs = require("yargs"),
    path = require("path"),
    browserUtils = require("./browserutils"),
    sizeUtils = require("./sizeutils"),
    ops,

    AVAILABLE_BROWSERS = browserUtils.getAvailableBrowsers(),
    DESKTOP_BROWSERS = browserUtils.getDesktopBrowsers(),
    MOBILE_BROWSERS = browserUtils.getMobileBrowsers(),

    AVAILABLE_SIZES = sizeUtils.getAvailableSizes(),

    SCREENSHOT_OPS = {
        "b": {
            alias: "browsers",
            describe: "one or more of the following:\n"
                + AVAILABLE_BROWSERS.join(", ") + ", desktop, mobile, all\n\n"
                + "'all' aliases to desktop and mobile\n"
                + "'desktop' aliases to " + DESKTOP_BROWSERS.join(", ") + "\n"
                + "'mobile' aliases to " + MOBILE_BROWSERS.join(", ")+ "\n",
            type: "array",
            default: "phantomjs"
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
        }
    },

    HOST_MESSAGE = "If no hosts are given, a screenshot from localhost is displayed.\n"
        + "If  1 host   is given, compare the host with localhost\n"
        + "If  2 hosts are given, compare the two hosts\n"
        + "If >2 hosts are given, show screenshots for all the hosts",

    COMMANDS = ["search", "path", "ia", "group"],

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
            return require("./package").version;
        })
        .command("search", "Create a screenshot against a search query", function (yargs) {
            addDefaults(yargs);
            argv = yargs.options(SCREENSHOT_OPS)
                .usage("Usage: " + BIN_NAME + " search <query> [<host|env> ...] [options]\n\n" + HOST_MESSAGE)
                .demand(2, "Please specify a search query.")
                .argv;
        })
        .command("path", "Create a screenshot against an arbitrary path", function (yargs) {
            addDefaults(yargs);
            argv = yargs.options(SCREENSHOT_OPS)
                .usage("Usage: " + BIN_NAME + " path <path> [<host|env> ...] [options]\n\n" + HOST_MESSAGE)
                .demand(2, "Please specify a path to search against.")
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
                .demand(2, "Please specify a group name.")
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
